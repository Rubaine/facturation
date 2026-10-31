from datetime import date
from decimal import Decimal

from app.services.numbering import format_number
from app.services.recurring import add_months, billing_period, first_run_date, render_title
from app.services.totals import compute_totals, normalize_lines


def test_format_number():
    assert format_number("{AA}-{MM}-{N}", 14, 2, date(2026, 11, 3)) == "26-11-14"
    assert format_number("{AA}-{MM}-{N}", 3, 2, date(2026, 1, 3)) == "26-01-03"
    assert format_number("F{AAAA}{N}", 7, 4, date(2027, 1, 1)) == "F20270007"


def test_totals_rounding():
    lines = normalize_lines(
        [{"description": "a", "quantity": "3", "unit_price": "33.333"}, {"description": "b", "quantity": "0.5", "unit_price": "10"}],
        vat_franchise=True,
    )
    assert lines[0]["total_ht"] == "100.00"
    assert compute_totals(lines) == (Decimal("105.00"), Decimal("0.00"), Decimal("105.00"))
    with_vat = normalize_lines([{"description": "a", "quantity": "1", "unit_price": "100", "vat_rate": "20"}], False)
    assert compute_totals(with_vat) == (Decimal("100.00"), Decimal("20.00"), Decimal("120.00"))


def test_dates():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 12, 15), 1, 1) == date(2027, 1, 1)
    assert first_run_date(date(2026, 10, 31), 1) == date(2026, 11, 1)
    assert first_run_date(date(2026, 11, 1), 1) == date(2026, 11, 1)
    assert billing_period(date(2026, 11, 1), 3) == (date(2026, 11, 1), date(2027, 1, 31))
    assert render_title("Hébergement {Mois} {annee}", date(2026, 11, 1), 1) == "Hébergement Novembre 2026"
