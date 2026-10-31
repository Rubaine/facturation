"""Facturation récurrente : génération, émission et envoi automatiques des factures."""

import calendar
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Invoice, RecurringInvoice
from .app_settings import load_settings
from .documents import issue_invoice, send_invoice, today
from .pdf import MONTHS
from .totals import apply_lines

log = logging.getLogger(__name__)

MAX_CATCH_UP = 24


def add_months(d: date, months: int, day: int | None = None) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = day or d.day
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def first_run_date(start: date, day_of_month: int) -> date:
    """Première échéance >= start tombant sur le jour du mois demandé."""
    candidate = date(start.year, start.month, min(day_of_month, calendar.monthrange(start.year, start.month)[1]))
    if candidate < start:
        candidate = add_months(candidate, 1, day_of_month)
    return candidate


def billing_period(run_date: date, frequency_months: int) -> tuple[date, date]:
    start = date(run_date.year, run_date.month, 1)
    end_month = add_months(start, frequency_months - 1, 1)
    end = date(end_month.year, end_month.month, calendar.monthrange(end_month.year, end_month.month)[1])
    return start, end


def render_title(template: str, run_date: date, frequency_months: int) -> str:
    prev = add_months(run_date, -1, 1)
    start, end = billing_period(run_date, frequency_months)
    variables = {
        "{mois}": MONTHS[run_date.month - 1],
        "{Mois}": MONTHS[run_date.month - 1].capitalize(),
        "{MOIS}": MONTHS[run_date.month - 1].upper(),
        "{annee}": str(run_date.year),
        "{mois_precedent}": MONTHS[prev.month - 1],
        "{Mois_precedent}": MONTHS[prev.month - 1].capitalize(),
        "{annee_mois_precedent}": str(prev.year),
        "{periode}": f"{start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}",
    }
    out = template
    for k, v in variables.items():
        out = out.replace(k, v)
    return out


def generate_invoice(db: Session, rec: RecurringInvoice, run_date: date) -> Invoice:
    """Crée et émet la facture d'une échéance. Idempotent grâce à (recurring_id, run_date)."""
    existing = db.scalar(
        select(Invoice).where(
            Invoice.recurring_id == rec.id, Invoice.recurring_run_date == run_date
        )
    )
    if existing:
        return existing

    settings = load_settings(db)
    issue = max(run_date, today())
    start, end = billing_period(run_date, rec.frequency_months)
    inv = Invoice(
        kind="invoice",
        status="draft",
        client_id=rec.client_id,
        issue_date=issue,
        due_date=issue + timedelta(days=rec.payment_terms_days),
        service_start=start,
        service_end=end,
        operation_category=rec.operation_category,
        title=render_title(rec.title_template or rec.name, run_date, rec.frequency_months),
        notes=rec.notes,
        recurring_id=rec.id,
        recurring_run_date=run_date,
    )
    apply_lines(inv, rec.lines, settings.invoicing.vat_franchise)
    db.add(inv)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return db.scalar(
            select(Invoice).where(
                Invoice.recurring_id == rec.id, Invoice.recurring_run_date == run_date
            )
        )
    issue_invoice(db, inv, settings)
    return inv


def run_one(db: Session, rec: RecurringInvoice, run_date: date) -> Invoice:
    inv = generate_invoice(db, rec, run_date)
    rec.generated_count += 1
    rec.last_generated_at = datetime.now()
    rec.last_error = ""
    db.commit()
    if rec.auto_send and inv.sent_at is None:
        try:
            send_invoice(db, inv)
        except Exception as exc:  # noqa: BLE001 - la facture reste émise, l'envoi pourra être relancé
            rec.last_error = f"Facture {inv.number} émise mais non envoyée : {exc}"
            db.commit()
            log.exception("Envoi automatique échoué pour %s", inv.number)
    return inv


def process_due(db: Session, on: date | None = None) -> list[Invoice]:
    """Traite toutes les échéances arrivées à terme (rattrape les jours manqués)."""
    on = on or today()
    created: list[Invoice] = []
    recs = db.scalars(select(RecurringInvoice).where(RecurringInvoice.active.is_(True))).all()
    for rec in recs:
        for _ in range(MAX_CATCH_UP):
            if rec.next_run_date > on:
                break
            if rec.end_date and rec.next_run_date > rec.end_date:
                rec.active = False
                db.commit()
                break
            try:
                created.append(run_one(db, rec, rec.next_run_date))
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                rec = db.get(RecurringInvoice, rec.id)
                rec.last_error = str(getattr(exc, "detail", exc))
                db.commit()
                log.exception("Échec de la récurrence %s", rec.id)
                break
            rec.next_run_date = add_months(rec.next_run_date, rec.frequency_months, rec.day_of_month)
            db.commit()
    return created
