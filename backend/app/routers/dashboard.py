from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, Quote, RecurringInvoice
from ..services.app_settings import load_settings
from ..services.documents import today

router = APIRouter(prefix="/api/dashboard", tags=["tableau de bord"])

ZERO = Decimal("0")


def _stringify(value):
    """Montants en texte (2 décimales), comme dans le reste de l'API."""
    if isinstance(value, Decimal):
        return f"{value.quantize(Decimal('0.01')):.2f}"
    if isinstance(value, dict):
        return {k: _stringify(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_stringify(v) for v in value]
    return value


def _signed(inv: Invoice) -> Decimal:
    return -inv.total_ttc if inv.kind == "credit_note" else inv.total_ttc


@router.get("")
def dashboard(year: int | None = None, db: Session = Depends(get_db)):
    settings = load_settings(db)
    now = today()
    year = year or now.year
    issued = db.scalars(select(Invoice).where(Invoice.number.is_not(None))).unique().all()

    # Chiffre d'affaires facturé (émis, avoirs déduits) et encaissé (date de paiement).
    # En micro-entreprise, le CA à déclarer est le CA encaissé.
    monthly = []
    for m in range(1, 13):
        invoiced = sum(
            (_signed(i) for i in issued if i.issue_date.year == year and i.issue_date.month == m), ZERO
        )
        cashed = sum(
            (i.total_ttc for i in issued if i.paid_at and i.paid_at.year == year and i.paid_at.month == m),
            ZERO,
        )
        monthly.append({"month": m, "invoiced": invoiced, "cashed": cashed})

    invoiced_year = sum((x["invoiced"] for x in monthly), ZERO)
    cashed_year = sum((x["cashed"] for x in monthly), ZERO)
    unpaid = [i for i in issued if i.kind == "invoice" and i.status == "issued"]
    overdue = [i for i in unpaid if i.due_date < now]

    recs = db.scalars(
        select(RecurringInvoice).where(RecurringInvoice.active.is_(True)).order_by(RecurringInvoice.next_run_date)
    ).unique().all()
    pending_quotes = db.scalars(select(Quote).where(Quote.status == "sent")).unique().all()

    def brief(i: Invoice) -> dict:
        return {
            "id": i.id,
            "number": i.number,
            "client_name": (i.client_snapshot or {}).get("name") or i.client.name,
            "total_ttc": i.total_ttc,
            "due_date": i.due_date,
            "title": i.title,
        }

    return _stringify({
        "year": year,
        "years": sorted({i.issue_date.year for i in issued} | {now.year}, reverse=True),
        "invoiced_year": invoiced_year,
        "cashed_year": cashed_year,
        "cashed_month": sum(
            (i.total_ttc for i in issued if i.paid_at and i.paid_at.year == now.year and i.paid_at.month == now.month),
            ZERO,
        ),
        "unpaid_total": sum((i.total_ttc for i in unpaid), ZERO),
        "unpaid_count": len(unpaid),
        "overdue_total": sum((i.total_ttc for i in overdue), ZERO),
        "overdue": [brief(i) for i in sorted(overdue, key=lambda x: x.due_date)],
        "monthly": monthly,
        "recurring_monthly_total": sum(
            (sum((Decimal(line["total_ht"]) for line in r.lines), ZERO) / r.frequency_months for r in recs), ZERO
        ).quantize(Decimal("0.01")),
        "upcoming_recurring": [
            {
                "id": r.id,
                "name": r.name,
                "client_name": r.client.name,
                "next_run_date": r.next_run_date,
                "total_ht": sum((Decimal(line["total_ht"]) for line in r.lines), ZERO),
                "auto_send": r.auto_send,
                "last_error": r.last_error,
            }
            for r in recs[:8]
        ],
        "pending_quotes": [
            {
                "id": q.id,
                "number": q.number,
                "client_name": q.client.name,
                "total_ttc": q.total_ttc,
                "valid_until": q.valid_until,
                "title": q.title,
            }
            for q in pending_quotes
        ],
        "thresholds": {
            "vat_franchise": settings.thresholds.vat_franchise_threshold,
            "micro_ceiling": settings.thresholds.micro_ceiling,
        },
        "today": date.today(),
    })
