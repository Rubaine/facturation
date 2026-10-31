"""Calcul des montants (lignes, totaux, ventilation TVA)."""

from collections import OrderedDict
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0")


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def normalize_lines(lines: list[dict], vat_franchise: bool) -> list[dict]:
    """Nettoie les lignes et calcule le montant HT de chacune. Les décimaux sont stockés en texte."""
    out = []
    for raw in lines:
        qty = Decimal(str(raw.get("quantity", "1") or "0"))
        price = Decimal(str(raw.get("unit_price", "0") or "0"))
        rate = ZERO if vat_franchise else Decimal(str(raw.get("vat_rate", "20") or "0"))
        out.append(
            {
                "description": str(raw.get("description", "")).strip(),
                "details": str(raw.get("details", "") or "").strip(),
                "quantity": str(qty.normalize() if qty == qty.to_integral() else qty),
                "unit": str(raw.get("unit", "") or "").strip(),
                "unit_price": str(price),
                "vat_rate": str(rate.normalize() if rate == rate.to_integral() else rate),
                "total_ht": str(money(qty * price)),
            }
        )
    return out


def vat_breakdown(lines: list[dict]) -> list[dict]:
    """Ventilation par taux : [{rate, base, vat}]."""
    groups: "OrderedDict[Decimal, Decimal]" = OrderedDict()
    for line in lines:
        rate = Decimal(line["vat_rate"])
        groups[rate] = groups.get(rate, ZERO) + Decimal(line["total_ht"])
    return [
        {"rate": rate, "base": money(base), "vat": money(base * rate / 100)}
        for rate, base in groups.items()
    ]


def compute_totals(lines: list[dict]) -> tuple[Decimal, Decimal, Decimal]:
    ht = money(sum((Decimal(line["total_ht"]) for line in lines), ZERO))
    vat = money(sum((g["vat"] for g in vat_breakdown(lines)), ZERO))
    return ht, vat, money(ht + vat)


def apply_lines(doc, lines: list[dict], vat_franchise: bool) -> None:
    """Remplit lines/total_* d'un document (devis, facture ou modèle récurrent)."""
    norm = normalize_lines(lines, vat_franchise)
    doc.lines = norm
    if hasattr(doc, "total_ht"):
        doc.total_ht, doc.total_vat, doc.total_ttc = compute_totals(norm)
    if hasattr(doc, "vat_franchise"):
        doc.vat_franchise = vat_franchise
