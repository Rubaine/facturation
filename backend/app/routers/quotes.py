from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import EmailLog, Invoice, Quote
from ..schemas import EmailLogOut, EmailPreview, InvoiceOut, QuoteIn, QuoteOut, SendIn
from ..services import documents
from ..services.app_settings import load_settings
from ..services.email_html import EmailExtras, render_email
from ..services.mailer import MailError
from ..services.pdf import fdate, fmoney
from ..services.totals import apply_lines
from .clients import get_client_or_404
from .invoices import to_out as invoice_out

router = APIRouter(prefix="/api/quotes", tags=["devis"])
public_router = APIRouter(prefix="/api/public/quotes", tags=["public"])


def get_quote_or_404(db: Session, quote_id: int) -> Quote:
    q = db.get(Quote, quote_id)
    if q is None:
        raise HTTPException(404, "Devis introuvable")
    return q


def to_out(db: Session, q: Quote) -> QuoteOut:
    out = QuoteOut.model_validate(q)
    out.client_name = (q.client_snapshot or {}).get("name") or q.client.name
    out.is_expired = q.status in ("draft", "sent") and q.valid_until < documents.today()
    out.invoice_id = db.scalar(select(Invoice.id).where(Invoice.quote_id == q.id).limit(1))
    return out


@router.get("", response_model=list[QuoteOut])
def list_quotes(status: str | None = None, client_id: int | None = None, db: Session = Depends(get_db)):
    q = select(Quote).order_by(Quote.issue_date.desc(), Quote.id.desc())
    if client_id:
        q = q.where(Quote.client_id == client_id)
    if status:
        q = q.where(Quote.status == status)
    return [to_out(db, x) for x in db.scalars(q).unique().all()]


@router.post("", response_model=QuoteOut, status_code=201)
def create_quote(data: QuoteIn, db: Session = Depends(get_db)):
    get_client_or_404(db, data.client_id)
    settings = load_settings(db)
    q = Quote(**data.model_dump(exclude={"lines"}), status="draft")
    apply_lines(q, [line.model_dump(mode="json") for line in data.lines], settings.invoicing.vat_franchise)
    db.add(q)
    db.commit()
    return to_out(db, q)


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db)):
    return to_out(db, get_quote_or_404(db, quote_id))


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(quote_id: int, data: QuoteIn, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    if q.status != "draft" or q.number is not None:
        raise HTTPException(400, "Un devis finalisé ne peut plus être modifié : duplique-le.")
    get_client_or_404(db, data.client_id)
    settings = load_settings(db)
    for k, v in data.model_dump(exclude={"lines"}).items():
        setattr(q, k, v)
    apply_lines(q, [line.model_dump(mode="json") for line in data.lines], settings.invoicing.vat_franchise)
    db.commit()
    return to_out(db, q)


@router.delete("/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    if q.number is not None:
        raise HTTPException(400, "Un devis numéroté ne peut pas être supprimé (marque-le refusé).")
    db.delete(q)
    db.commit()


@router.post("/{quote_id}/finalize", response_model=QuoteOut)
def finalize(quote_id: int, db: Session = Depends(get_db)):
    return to_out(db, documents.finalize_quote(db, get_quote_or_404(db, quote_id)))


@router.get("/{quote_id}/pdf")
def pdf(quote_id: int, download: bool = False, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    disposition = "attachment" if download else "inline"
    return Response(
        documents.quote_pdf(db, q),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{documents.quote_filename(q)}"'},
    )


@router.get("/{quote_id}/email", response_model=EmailPreview)
def email_preview(quote_id: int, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    mail = documents.quote_email(db, q)
    return EmailPreview(**mail, smtp_configured=get_settings().smtp_configured)


class HtmlPreviewIn(BaseModel):
    subject: str = ""
    body: str = ""


@router.post("/{quote_id}/email/html")
def email_html_preview(quote_id: int, data: HtmlPreviewIn, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    return {"html": documents.quote_email_html_preview(db, q, data.subject, data.body)}


@router.post("/{quote_id}/send", response_model=QuoteOut)
def send(quote_id: int, data: SendIn, db: Session = Depends(get_db)):
    q = get_quote_or_404(db, quote_id)
    if q.status not in ("draft", "sent", "accepted"):
        raise HTTPException(400, "Ce devis ne peut plus être envoyé.")
    try:
        documents.send_quote(db, q, data.model_dump())
    except MailError as exc:
        raise HTTPException(502, str(exc)) from exc
    return to_out(db, q)


class AcceptIn(BaseModel):
    accepted_by: str = ""


@router.post("/{quote_id}/accept", response_model=QuoteOut)
def accept(quote_id: int, data: AcceptIn, db: Session = Depends(get_db)):
    return to_out(db, documents.accept_quote(db, get_quote_or_404(db, quote_id), data.accepted_by))


@router.post("/{quote_id}/refuse", response_model=QuoteOut)
def refuse(quote_id: int, db: Session = Depends(get_db)):
    return to_out(db, documents.refuse_quote(db, get_quote_or_404(db, quote_id)))


@router.post("/{quote_id}/invoice", response_model=InvoiceOut, status_code=201)
def to_invoice(quote_id: int, db: Session = Depends(get_db)):
    inv = documents.quote_to_invoice(db, get_quote_or_404(db, quote_id))
    return invoice_out(db, inv)


@router.post("/{quote_id}/duplicate", response_model=QuoteOut, status_code=201)
def duplicate(quote_id: int, db: Session = Depends(get_db)):
    src = get_quote_or_404(db, quote_id)
    settings = load_settings(db)
    today = documents.today()
    q = Quote(
        status="draft",
        client_id=src.client_id,
        issue_date=today,
        valid_until=today + timedelta(days=settings.invoicing.quote_validity_days),
        title=src.title,
        notes=src.notes,
        operation_category=src.operation_category,
    )
    apply_lines(q, src.lines, settings.invoicing.vat_franchise)
    db.add(q)
    db.commit()
    return to_out(db, q)


@router.get("/{quote_id}/emails", response_model=list[EmailLogOut])
def email_history(quote_id: int, db: Session = Depends(get_db)):
    return db.scalars(
        select(EmailLog)
        .where(EmailLog.doc_type == "quote", EmailLog.doc_id == quote_id)
        .order_by(EmailLog.created_at.desc())
    ).all()


# ------------------------------------------------------------------ public (sans connexion)
def _by_token(db: Session, token: str) -> Quote:
    q = db.scalar(select(Quote).where(Quote.public_token == token))
    if q is None or len(token) < 16:
        raise HTTPException(404, "Devis introuvable")
    return q


@public_router.get("/{token}")
def public_quote(token: str, db: Session = Depends(get_db)):
    q = _by_token(db, token)
    seller = q.seller_snapshot or {}
    client = q.client_snapshot or {}
    return {
        "number": q.number,
        "title": q.title,
        "status": q.status,
        "issue_date": fdate(q.issue_date),
        "valid_until": fdate(q.valid_until),
        "is_expired": q.status in ("draft", "sent") and q.valid_until < documents.today(),
        "total": fmoney(q.total_ttc),
        "seller_name": seller.get("name", ""),
        "seller_email": seller.get("email", ""),
        "client_name": client.get("name", ""),
        "accepted_at": q.accepted_at.strftime("%d/%m/%Y") if q.accepted_at else None,
        "accepted_by": q.accepted_by,
        "lines": [
            {"description": line["description"], "details": line.get("details", ""), "total": fmoney(line["total_ht"])}
            for line in q.lines
        ],
    }


@public_router.get("/{token}/pdf")
def public_quote_pdf(token: str, db: Session = Depends(get_db)):
    q = _by_token(db, token)
    return Response(
        documents.quote_pdf(db, q),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{documents.quote_filename(q)}"'},
    )


class PublicAcceptIn(BaseModel):
    name: str


@public_router.post("/{token}/accept")
def public_accept(token: str, data: PublicAcceptIn, db: Session = Depends(get_db)):
    q = _by_token(db, token)
    if not data.name.strip():
        raise HTTPException(400, "Indique ton nom pour valider le devis.")
    if q.status in ("accepted", "invoiced"):
        return {"ok": True}
    if q.valid_until < documents.today():
        raise HTTPException(400, "Ce devis a expiré. Contacte l'émetteur pour en obtenir un nouveau.")
    documents.accept_quote(db, q, data.name)
    _notify_owner(db, q)
    return {"ok": True}


def _notify_owner(db: Session, q: Quote) -> None:
    """Prévient l'utilisateur par mail qu'un devis vient d'être accepté en ligne."""
    from ..services.mailer import send_mail

    settings = load_settings(db)
    owner = settings.company.email
    if not owner:
        return
    subject = f"Devis {q.number} accepté par {q.client.name}"
    body = (
        f"Bonne nouvelle !\n\nLe devis {q.number} ({q.title or 'sans titre'}) vient d'être accepté en ligne "
        f"par {q.accepted_by} ({q.client.name}).\n\nTu peux maintenant le transformer en facture."
    )
    url = f"{get_settings().public_url.rstrip('/')}/devis/{q.id}"
    extras = EmailExtras(
        doc_label="Devis accepté",
        card={
            "label": "Devis accepté", "number": f"N° {q.number}", "title": q.title,
            "amount_label": "Montant", "amount": fmoney(q.total_ttc),
            "rows": [("Client", q.client.name, False), ("Accepté par", q.accepted_by, False)],
        },
        cta={"label": "Ouvrir le devis", "url": url, "color": None},
    )
    try:
        send_mail(
            db,
            to=[owner],
            subject=subject,
            body=f"{body}\n\n{url}",
            html=render_email(settings, subject, body, extras),
            doc_type="quote",
            doc_id=q.id,
            purpose="notification",
        )
    except MailError:
        pass
