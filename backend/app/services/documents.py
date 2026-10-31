"""Règles métier des devis, factures et avoirs (émission, PDF, envoi, avoirs, conversion)."""

import logging
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Client, Invoice, Quote
from . import numbering
from .app_settings import AppSettings, load_settings, seller_snapshot
from .mailer import MailError, render_template, send_mail, split_addresses  # noqa: F401
from .pdf import build_invoice_pdf, build_quote_pdf, fdate, fmoney
from .totals import apply_lines

log = logging.getLogger(__name__)

CLIENT_FIELDS = (
    "kind", "name", "contact_name", "email", "phone", "address_line1", "address_line2",
    "postal_code", "city", "country", "siren", "siret", "vat_number",
)


def client_snapshot(client: Client) -> dict:
    return {f: getattr(client, f) for f in CLIENT_FIELDS}


def today() -> date:
    return date.today()


# ---------------------------------------------------------------- stockage
def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "-" for c in name)


def store_file(subdir: str, filename: str, content: bytes) -> str:
    root = get_settings().pdf_dir
    rel = Path(subdir) / _safe(filename)
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return str(rel)


def read_file(rel: str) -> bytes:
    return (get_settings().pdf_dir / rel).read_bytes()


# ---------------------------------------------------------------- factures
def invoice_kind_label(inv: Invoice) -> str:
    return "Avoir" if inv.kind == "credit_note" else "Facture"


def invoice_filename(inv: Invoice) -> str:
    return f"{invoice_kind_label(inv)}-{inv.number or 'brouillon-' + str(inv.id)}.pdf"


def _quote_number(db: Session, inv: Invoice) -> str | None:
    if inv.quote_id:
        q = db.get(Quote, inv.quote_id)
        return q.number if q else None
    return None


def check_client_ready(client: Client) -> None:
    missing = []
    if not client.name:
        missing.append("nom")
    if not (client.address_line1 and client.postal_code and client.city):
        missing.append("adresse complète")
    if missing:
        raise HTTPException(
            400, f"Fiche client incomplète ({', '.join(missing)}) : complète-la avant d'émettre."
        )


def issue_invoice(db: Session, inv: Invoice, settings: AppSettings | None = None) -> Invoice:
    """Émet une facture/un avoir : numéro définitif, figeage des infos, PDF Factur-X archivé."""
    if inv.status != "draft":
        raise HTTPException(400, "Ce document est déjà émis.")
    if not inv.lines:
        raise HTTPException(400, "Le document ne contient aucune ligne.")
    settings = settings or load_settings(db)
    client = db.get(Client, inv.client_id)
    check_client_ready(client)

    seq = inv.kind  # invoice | credit_note
    last_date = db.scalar(
        select(func.max(Invoice.issue_date)).where(
            Invoice.kind == seq, Invoice.number.is_not(None)
        )
    )
    if last_date and inv.issue_date < last_date:
        raise HTTPException(
            400,
            f"La date d'émission ne peut pas être antérieure à celle du dernier document émis "
            f"({fdate(last_date)}) : la numérotation doit rester chronologique.",
        )
    if inv.kind == "invoice" and inv.due_date < inv.issue_date:
        raise HTTPException(400, "L'échéance ne peut pas précéder la date d'émission.")

    # Recalcule les montants avec le régime de TVA actuel
    apply_lines(inv, inv.lines, settings.invoicing.vat_franchise)
    if inv.kind == "credit_note" and inv.credit_note_of_id:
        origin_inv = db.get(Invoice, inv.credit_note_of_id)
        already = sum(
            (c.total_ttc for c in db.scalars(
                select(Invoice).where(
                    Invoice.credit_note_of_id == origin_inv.id, Invoice.number.is_not(None)
                )
            )),
            Decimal("0"),
        )
        if already + inv.total_ttc > origin_inv.total_ttc:
            raise HTTPException(
                400,
                f"Le total des avoirs ({fmoney(already + inv.total_ttc)}) dépasserait le montant de la "
                f"facture {origin_inv.number} ({fmoney(origin_inv.total_ttc)}).",
            )
    inv.seller_snapshot = seller_snapshot(settings)
    inv.client_snapshot = client_snapshot(client)
    inv.number = numbering.take_number(db, settings, seq, inv.issue_date)
    inv.status = "issued"
    inv.issued_at = datetime.now()
    origin = db.get(Invoice, inv.credit_note_of_id) if inv.credit_note_of_id else None

    try:
        pdf, xml = build_invoice_pdf(
            inv, inv.seller_snapshot, inv.client_snapshot, _quote_number(db, inv), origin
        )
        folder = f"{'avoirs' if inv.kind == 'credit_note' else 'factures'}/{inv.issue_date.year}"
        inv.pdf_file = store_file(folder, invoice_filename(inv), pdf)
        inv.xml_file = store_file(folder, invoice_filename(inv).replace(".pdf", ".xml"), xml)
    except Exception:
        db.rollback()  # le numéro n'est pas consommé
        raise

    if inv.kind == "credit_note" and origin is not None:
        db.flush()
        total_credited = sum(
            (c.total_ttc for c in db.scalars(
                select(Invoice).where(
                    Invoice.credit_note_of_id == origin.id, Invoice.number.is_not(None)
                )
            )),
            Decimal("0"),
        )
        if total_credited >= origin.total_ttc:
            origin.status = "cancelled"
    db.commit()
    return inv


def invoice_pdf(db: Session, inv: Invoice) -> bytes:
    if inv.pdf_file:
        return read_file(inv.pdf_file)
    settings = load_settings(db)
    tmp = Invoice(**{c: getattr(inv, c) for c in (
        "number", "kind", "issue_date", "due_date", "service_start", "service_end",
        "operation_category", "title", "notes", "quote_id", "credit_note_of_id",
    )})
    apply_lines(tmp, inv.lines, settings.invoicing.vat_franchise)
    origin = db.get(Invoice, inv.credit_note_of_id) if inv.credit_note_of_id else None
    pdf, _ = build_invoice_pdf(
        tmp, seller_snapshot(settings), client_snapshot(db.get(Client, inv.client_id)), origin=origin
    )
    return pdf


def create_credit_note(db: Session, inv: Invoice) -> Invoice:
    if inv.kind != "invoice" or inv.number is None:
        raise HTTPException(400, "Un avoir ne peut être créé que pour une facture émise.")
    if inv.status == "cancelled":
        raise HTTPException(400, "Cette facture est déjà entièrement annulée par un avoir.")
    credit = Invoice(
        kind="credit_note",
        status="draft",
        client_id=inv.client_id,
        issue_date=max(today(), inv.issue_date),
        due_date=max(today(), inv.issue_date),
        service_start=inv.service_start,
        service_end=inv.service_end,
        operation_category=inv.operation_category,
        title=f"Avoir sur facture {inv.number}",
        notes="",
        credit_note_of_id=inv.id,
    )
    apply_lines(credit, inv.lines, inv.vat_franchise)
    db.add(credit)
    db.commit()
    return credit


# ---------------------------------------------------------------- mails
def _common_vars(settings: AppSettings, client: dict) -> dict:
    return {
        "entreprise": settings.company.name,
        "email_entreprise": settings.company.email,
        "client": client.get("name", ""),
        "client_contact": client.get("contact_name") or client.get("name", ""),
        "iban": settings.bank.iban,
        "bic": settings.bank.bic,
    }


def invoice_email(db: Session, inv: Invoice, purpose: str = "send") -> dict:
    settings = load_settings(db)
    client = inv.client_snapshot or client_snapshot(inv.client)
    key = "reminder" if purpose == "reminder" else inv.kind
    tpl = settings.emails[key]
    origin = db.get(Invoice, inv.credit_note_of_id) if inv.credit_note_of_id else None
    variables = {
        **_common_vars(settings, client),
        "numero": inv.number or numbering.preview_next(db, settings, inv.kind, inv.issue_date),
        "titre": inv.title or invoice_kind_label(inv),
        "montant": fmoney(inv.total_ttc),
        "echeance": fdate(inv.due_date),
        "date": fdate(inv.issue_date),
        "facture_origine": origin.number if origin else "",
    }
    subject = render_template(tpl.subject, variables).replace(" - " + invoice_kind_label(inv), "")
    return {
        "to": inv.client.email,
        "cc": inv.client.cc_emails,
        "subject": subject.strip(" -"),
        "body": render_template(tpl.body, variables),
    }


def send_invoice(db: Session, inv: Invoice, overrides: dict | None = None, purpose: str = "send") -> str:
    if inv.number is None:
        raise HTTPException(400, "Émets la facture avant de l'envoyer.")
    mail = invoice_email(db, inv, purpose)
    for k, v in (overrides or {}).items():
        if v is not None:
            mail[k] = v
    settings = load_settings(db)
    status = send_mail(
        db,
        to=split_addresses(mail["to"]),
        cc=split_addresses(mail["cc"]),
        subject=mail["subject"],
        body=mail["body"],
        attachments=[(invoice_filename(inv), invoice_pdf(db, inv), "application/pdf")],
        sender_name=settings.company.name,
        doc_type="invoice",
        doc_id=inv.id,
        purpose=purpose,
    )
    now = datetime.now()
    if purpose == "reminder":
        inv.reminder_count += 1
        inv.last_reminder_at = now
    else:
        inv.sent_at = now
    db.commit()
    return status


# ---------------------------------------------------------------- devis
def quote_filename(q: Quote) -> str:
    return f"Devis-{q.number or 'brouillon-' + str(q.id)}.pdf"


def finalize_quote(db: Session, q: Quote) -> Quote:
    if q.number is not None:
        return q
    settings = load_settings(db)
    client = db.get(Client, q.client_id)
    apply_lines(q, q.lines, settings.invoicing.vat_franchise)
    q.seller_snapshot = seller_snapshot(settings)
    q.client_snapshot = client_snapshot(client)
    q.number = numbering.take_number(db, settings, "quote", q.issue_date)
    q.public_token = secrets.token_urlsafe(24)
    q.finalized_at = datetime.now()
    try:
        _store_quote_pdf(q)
    except Exception:
        db.rollback()
        raise
    db.commit()
    return q


def _store_quote_pdf(q: Quote) -> None:
    pdf = build_quote_pdf(q, q.seller_snapshot, q.client_snapshot)
    q.pdf_file = store_file(f"devis/{q.issue_date.year}", quote_filename(q), pdf)


def quote_pdf(db: Session, q: Quote) -> bytes:
    if q.pdf_file:
        return read_file(q.pdf_file)
    settings = load_settings(db)
    tmp = Quote(
        number=None, issue_date=q.issue_date, valid_until=q.valid_until, title=q.title,
        notes=q.notes, operation_category=q.operation_category,
    )
    apply_lines(tmp, q.lines, settings.invoicing.vat_franchise)
    return build_quote_pdf(tmp, seller_snapshot(settings), client_snapshot(db.get(Client, q.client_id)))


LINK_PLACEHOLDER = "[lien d'acceptation généré à l'envoi]"


def quote_public_url(q: Quote) -> str:
    return f"{get_settings().public_url.rstrip('/')}/p/devis/{q.public_token}"


def quote_email(db: Session, q: Quote) -> dict:
    settings = load_settings(db)
    client = q.client_snapshot or client_snapshot(q.client)
    tpl = settings.emails["quote"]
    variables = {
        **_common_vars(settings, client),
        "numero": q.number or numbering.preview_next(db, settings, "quote", q.issue_date),
        "titre": q.title or "Devis",
        "montant": fmoney(q.total_ttc),
        "validite": fdate(q.valid_until),
        "date": fdate(q.issue_date),
        "lien": quote_public_url(q) if q.public_token else LINK_PLACEHOLDER,
    }
    return {
        "to": q.client.email,
        "cc": q.client.cc_emails,
        "subject": render_template(tpl.subject, variables).replace(" - Devis", ""),
        "body": render_template(tpl.body, variables),
    }


def send_quote(db: Session, q: Quote, overrides: dict | None = None) -> str:
    finalize_quote(db, q)
    mail = quote_email(db, q)
    for k, v in (overrides or {}).items():
        if v is not None:
            mail[k] = v
    mail["body"] = mail["body"].replace(LINK_PLACEHOLDER, quote_public_url(q))
    settings = load_settings(db)
    status = send_mail(
        db,
        to=split_addresses(mail["to"]),
        cc=split_addresses(mail["cc"]),
        subject=mail["subject"],
        body=mail["body"],
        attachments=[(quote_filename(q), quote_pdf(db, q), "application/pdf")],
        sender_name=settings.company.name,
        doc_type="quote",
        doc_id=q.id,
    )
    q.sent_at = datetime.now()
    if q.status == "draft":
        q.status = "sent"
    db.commit()
    return status


def accept_quote(db: Session, q: Quote, accepted_by: str = "") -> Quote:
    if q.status not in ("draft", "sent"):
        raise HTTPException(400, "Ce devis ne peut plus être accepté.")
    finalize_quote(db, q)
    q.status = "accepted"
    q.accepted_at = datetime.now()
    q.accepted_by = accepted_by.strip()[:255]
    q.refused_at = None
    _store_quote_pdf(q)  # régénère le PDF avec la mention « Accepté »
    db.commit()
    return q


def refuse_quote(db: Session, q: Quote) -> Quote:
    if q.status not in ("draft", "sent", "accepted"):
        raise HTTPException(400, "Ce devis ne peut plus être refusé.")
    q.status = "refused"
    q.refused_at = datetime.now()
    db.commit()
    return q


def quote_to_invoice(db: Session, q: Quote) -> Invoice:
    if q.status == "invoiced":
        existing = db.scalar(select(Invoice).where(Invoice.quote_id == q.id))
        if existing:
            return existing
    if q.number is None:
        finalize_quote(db, q)
    settings = load_settings(db)
    issue = today()
    inv = Invoice(
        kind="invoice",
        status="draft",
        client_id=q.client_id,
        issue_date=issue,
        due_date=issue + timedelta(days=settings.invoicing.payment_terms_days),
        operation_category=q.operation_category,
        title=q.title,
        notes=f"Selon devis n° {q.number}",
        quote_id=q.id,
    )
    apply_lines(inv, q.lines, settings.invoicing.vat_franchise)
    db.add(inv)
    q.status = "invoiced"
    if not q.accepted_at:
        q.accepted_at = datetime.now()
    db.commit()
    return inv
