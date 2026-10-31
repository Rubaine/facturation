from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, RecurringInvoice
from ..schemas import InvoiceOut, RecurringIn, RecurringOut
from ..services import recurring as svc
from ..services.app_settings import load_settings
from ..services.totals import apply_lines
from .clients import get_client_or_404
from .invoices import to_out as invoice_out

router = APIRouter(prefix="/api/recurring", tags=["récurrences"])


def get_rec_or_404(db: Session, rec_id: int) -> RecurringInvoice:
    rec = db.get(RecurringInvoice, rec_id)
    if rec is None:
        raise HTTPException(404, "Facturation récurrente introuvable")
    return rec


def to_out(rec: RecurringInvoice) -> RecurringOut:
    out = RecurringOut.model_validate(rec)
    out.client_name = rec.client.name
    out.total_ht = sum((Decimal(line["total_ht"]) for line in rec.lines), Decimal("0"))
    return out


@router.get("", response_model=list[RecurringOut])
def list_recurring(db: Session = Depends(get_db)):
    recs = db.scalars(
        select(RecurringInvoice).order_by(RecurringInvoice.active.desc(), RecurringInvoice.next_run_date)
    ).unique().all()
    return [to_out(r) for r in recs]


def _apply(db: Session, rec: RecurringInvoice, data: RecurringIn, reset_schedule: bool) -> None:
    get_client_or_404(db, data.client_id)
    settings = load_settings(db)
    for k, v in data.model_dump(exclude={"lines"}).items():
        setattr(rec, k, v)
    apply_lines(rec, [line.model_dump(mode="json") for line in data.lines], settings.invoicing.vat_franchise)
    if reset_schedule:
        rec.next_run_date = svc.first_run_date(data.start_date, data.day_of_month)


@router.post("", response_model=RecurringOut, status_code=201)
def create_recurring(data: RecurringIn, db: Session = Depends(get_db)):
    rec = RecurringInvoice()
    _apply(db, rec, data, reset_schedule=True)
    db.add(rec)
    db.commit()
    return to_out(rec)


@router.get("/{rec_id}", response_model=RecurringOut)
def get_recurring(rec_id: int, db: Session = Depends(get_db)):
    return to_out(get_rec_or_404(db, rec_id))


@router.put("/{rec_id}", response_model=RecurringOut)
def update_recurring(rec_id: int, data: RecurringIn, db: Session = Depends(get_db)):
    rec = get_rec_or_404(db, rec_id)
    schedule_changed = (
        data.start_date != rec.start_date or data.day_of_month != rec.day_of_month
    )
    _apply(db, rec, data, reset_schedule=False)
    if schedule_changed:
        rec.next_run_date = svc.first_run_date(max(data.start_date, date.today()), data.day_of_month)
    db.commit()
    return to_out(rec)


@router.delete("/{rec_id}", status_code=204)
def delete_recurring(rec_id: int, db: Session = Depends(get_db)):
    rec = get_rec_or_404(db, rec_id)
    for inv in db.scalars(select(Invoice).where(Invoice.recurring_id == rec.id)):
        inv.recurring_id = None  # les factures déjà émises sont conservées
    db.delete(rec)
    db.commit()


@router.get("/{rec_id}/invoices", response_model=list[InvoiceOut])
def recurring_invoices(rec_id: int, db: Session = Depends(get_db)):
    get_rec_or_404(db, rec_id)
    invoices = db.scalars(
        select(Invoice).where(Invoice.recurring_id == rec_id).order_by(Invoice.issue_date.desc())
    ).unique().all()
    return [invoice_out(db, i) for i in invoices]


class PreviewOut(BaseModel):
    dates: list[date]
    next_title: str


@router.get("/{rec_id}/preview", response_model=PreviewOut)
def preview(rec_id: int, db: Session = Depends(get_db)):
    rec = get_rec_or_404(db, rec_id)
    dates = []
    d = rec.next_run_date
    for _ in range(6):
        if rec.end_date and d > rec.end_date:
            break
        dates.append(d)
        d = svc.add_months(d, rec.frequency_months, rec.day_of_month)
    return PreviewOut(
        dates=dates,
        next_title=svc.render_title(rec.title_template or rec.name, rec.next_run_date, rec.frequency_months),
    )


@router.post("/{rec_id}/run-now", response_model=InvoiceOut)
def run_now(rec_id: int, db: Session = Depends(get_db)):
    """Génère tout de suite la facture de la prochaine échéance et avance le calendrier."""
    rec = get_rec_or_404(db, rec_id)
    if not rec.active:
        raise HTTPException(400, "Cette récurrence est en pause.")
    run_date = rec.next_run_date
    inv = svc.run_one(db, rec, run_date)
    rec.next_run_date = svc.add_months(run_date, rec.frequency_months, rec.day_of_month)
    db.commit()
    return invoice_out(db, inv)


@router.post("/process", response_model=list[InvoiceOut])
def process_all(db: Session = Depends(get_db)):
    """Lance manuellement le traitement des échéances du jour (normalement fait chaque matin)."""
    return [invoice_out(db, i) for i in svc.process_due(db)]
