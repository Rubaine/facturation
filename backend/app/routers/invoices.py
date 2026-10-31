from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import EmailLog, Invoice, Quote
from ..schemas import EmailLogOut, EmailPreview, InvoiceIn, InvoiceOut, MarkPaidIn, SendIn
from ..services import documents
from ..services.app_settings import load_settings
from ..services.totals import apply_lines
from .clients import get_client_or_404

router = APIRouter(prefix="/api/invoices", tags=["factures"])


def get_invoice_or_404(db: Session, invoice_id: int) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(404, "Facture introuvable")
    return inv


def to_out(db: Session, inv: Invoice) -> InvoiceOut:
    out = InvoiceOut.model_validate(inv)
    out.client_name = (inv.client_snapshot or {}).get("name") or inv.client.name
    out.is_overdue = inv.kind == "invoice" and inv.status == "issued" and inv.due_date < documents.today()
    if inv.quote_id:
        q = db.get(Quote, inv.quote_id)
        out.quote_number = q.number if q else None
    if inv.credit_note_of_id:
        origin = db.get(Invoice, inv.credit_note_of_id)
        out.credit_note_of_number = origin.number if origin else None
    out.credit_note_ids = list(
        db.scalars(select(Invoice.id).where(Invoice.credit_note_of_id == inv.id)).all()
    )
    return out


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    status: str | None = None,
    client_id: int | None = None,
    kind: str | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
):
    q = select(Invoice).order_by(Invoice.issue_date.desc(), Invoice.id.desc())
    if client_id:
        q = q.where(Invoice.client_id == client_id)
    if kind:
        q = q.where(Invoice.kind == kind)
    if status == "overdue":
        q = q.where(Invoice.status == "issued", Invoice.kind == "invoice", Invoice.due_date < documents.today())
    elif status:
        q = q.where(Invoice.status == status)
    invoices = db.scalars(q).unique().all()
    if year:
        invoices = [i for i in invoices if i.issue_date.year == year]
    return [to_out(db, i) for i in invoices]


@router.post("", response_model=InvoiceOut, status_code=201)
def create_invoice(data: InvoiceIn, db: Session = Depends(get_db)):
    get_client_or_404(db, data.client_id)
    settings = load_settings(db)
    inv = Invoice(**data.model_dump(exclude={"lines"}), kind="invoice", status="draft")
    apply_lines(inv, [line.model_dump(mode="json") for line in data.lines], settings.invoicing.vat_franchise)
    db.add(inv)
    db.commit()
    return to_out(db, inv)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    return to_out(db, get_invoice_or_404(db, invoice_id))


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: int, data: InvoiceIn, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.status != "draft":
        raise HTTPException(400, "Un document émis ne peut plus être modifié (fais un avoir).")
    get_client_or_404(db, data.client_id)
    if inv.kind == "credit_note" and data.client_id != inv.client_id:
        raise HTTPException(400, "Le client d'un avoir doit être celui de la facture d'origine.")
    settings = load_settings(db)
    for k, v in data.model_dump(exclude={"lines"}).items():
        setattr(inv, k, v)
    apply_lines(inv, [line.model_dump(mode="json") for line in data.lines], settings.invoicing.vat_franchise)
    db.commit()
    return to_out(db, inv)


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.status != "draft":
        raise HTTPException(400, "Une facture émise ne peut pas être supprimée (obligation légale) : fais un avoir.")
    if inv.quote_id:
        q = db.get(Quote, inv.quote_id)
        if q and q.status == "invoiced":
            q.status = "accepted"
    db.delete(inv)
    db.commit()


@router.post("/{invoice_id}/issue", response_model=InvoiceOut)
def issue(invoice_id: int, db: Session = Depends(get_db)):
    inv = documents.issue_invoice(db, get_invoice_or_404(db, invoice_id))
    return to_out(db, inv)


@router.get("/{invoice_id}/pdf")
def pdf(invoice_id: int, download: bool = False, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    content = documents.invoice_pdf(db, inv)
    disposition = "attachment" if download else "inline"
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{documents.invoice_filename(inv)}"'},
    )


@router.get("/{invoice_id}/xml")
def xml(invoice_id: int, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if not inv.xml_file:
        raise HTTPException(404, "XML Factur-X disponible uniquement pour un document émis.")
    name = documents.invoice_filename(inv).replace(".pdf", ".xml")
    return Response(
        documents.read_file(inv.xml_file),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{invoice_id}/email", response_model=EmailPreview)
def email_preview(invoice_id: int, purpose: str = "send", db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    mail = documents.invoice_email(db, inv, purpose)
    return EmailPreview(**mail, smtp_configured=get_settings().smtp_configured)


class HtmlPreviewIn(BaseModel):
    subject: str = ""
    body: str = ""


@router.post("/{invoice_id}/email/html")
def email_html_preview(invoice_id: int, data: HtmlPreviewIn, purpose: str = "send", db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    return {"html": documents.invoice_email_html_preview(db, inv, data.subject, data.body, purpose)}


@router.post("/{invoice_id}/send", response_model=InvoiceOut)
def send(invoice_id: int, data: SendIn, purpose: str = "send", db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.status == "draft":
        documents.issue_invoice(db, inv)
    try:
        documents.send_invoice(db, inv, data.model_dump(), purpose="reminder" if purpose == "reminder" else "send")
    except documents.MailError as exc:
        raise HTTPException(502, str(exc)) from exc
    return to_out(db, inv)


@router.post("/{invoice_id}/paid", response_model=InvoiceOut)
def mark_paid(invoice_id: int, data: MarkPaidIn, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.kind != "invoice" or inv.status not in ("issued", "paid"):
        raise HTTPException(400, "Seule une facture émise peut être marquée payée.")
    inv.status = "paid"
    inv.paid_at = data.paid_at
    inv.payment_method = data.payment_method
    db.commit()
    return to_out(db, inv)


@router.post("/{invoice_id}/unpaid", response_model=InvoiceOut)
def mark_unpaid(invoice_id: int, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, invoice_id)
    if inv.status != "paid":
        raise HTTPException(400, "Cette facture n'est pas marquée payée.")
    inv.status = "issued"
    inv.paid_at = None
    inv.payment_method = ""
    db.commit()
    return to_out(db, inv)


@router.post("/{invoice_id}/credit-note", response_model=InvoiceOut, status_code=201)
def credit_note(invoice_id: int, db: Session = Depends(get_db)):
    credit = documents.create_credit_note(db, get_invoice_or_404(db, invoice_id))
    return to_out(db, credit)


@router.post("/{invoice_id}/duplicate", response_model=InvoiceOut, status_code=201)
def duplicate(invoice_id: int, db: Session = Depends(get_db)):
    src = get_invoice_or_404(db, invoice_id)
    if src.kind != "invoice":
        raise HTTPException(400, "Seule une facture peut être dupliquée.")
    settings = load_settings(db)
    today = documents.today()
    delay = max((src.due_date - src.issue_date).days, 0)
    inv = Invoice(
        kind="invoice",
        status="draft",
        client_id=src.client_id,
        issue_date=today,
        due_date=today + timedelta(days=delay),
        operation_category=src.operation_category,
        title=src.title,
        notes=src.notes,
    )
    apply_lines(inv, src.lines, settings.invoicing.vat_franchise)
    db.add(inv)
    db.commit()
    return to_out(db, inv)


@router.get("/{invoice_id}/emails", response_model=list[EmailLogOut])
def email_history(invoice_id: int, db: Session = Depends(get_db)):
    return db.scalars(
        select(EmailLog)
        .where(EmailLog.doc_type == "invoice", EmailLog.doc_id == invoice_id)
        .order_by(EmailLog.created_at.desc())
    ).all()
