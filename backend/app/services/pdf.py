"""Génération des PDF (WeasyPrint, PDF/A-3b) et des factures électroniques Factur-X."""

import logging
from datetime import date
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .facturx_xml import build_invoice_xml
from .totals import vat_breakdown

log = logging.getLogger(__name__)

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
ACCENT = "#1e3a8a"

OPERATION_LABELS = {
    "services": "Prestation de services",
    "goods": "Livraison de biens",
    "mixed": "Mixte (biens et services)",
}
MONTHS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _group(value: str) -> str:
    """Sépare les milliers avec une espace insécable fine."""
    ip, _, dec = value.partition(".")
    neg = ip.startswith("-")
    ip = ip.lstrip("-")
    parts = []
    while len(ip) > 3:
        parts.insert(0, ip[-3:])
        ip = ip[:-3]
    parts.insert(0, ip)
    out = " ".join(parts)
    return ("-" if neg else "") + out + ("," + dec if dec else "")


def fmoney(v) -> str:
    return _group(f"{Decimal(v):.2f}") + " €"


def fprice(v) -> str:
    d = Decimal(v)
    s = f"{d:.2f}" if d == d.quantize(Decimal("0.01")) else f"{d.normalize():f}"
    return _group(s) + " €"


def fqty(v) -> str:
    d = Decimal(v)
    s = f"{d:.0f}" if d == d.to_integral() else f"{d.normalize():f}"
    return _group(s)


INVARIABLE_UNITS = {"mois", "h", "j", "kg", "m", "m2", "m²", "forfait"}


def funit(unit: str, quantity) -> str:
    """Accorde l'unité au pluriel (« 2 jours ») ; « unité » n'est pas affichée."""
    unit = (unit or "").strip()
    if not unit or unit == "unité":
        return ""
    if Decimal(quantity) >= 2 and unit.lower() not in INVARIABLE_UNITS and not unit.endswith(("s", "x")):
        return unit + "s"
    return unit


def fdate(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def fdate_long(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def fsiren(v: str) -> str:
    v = v or ""
    return f"{v[:3]} {v[3:6]} {v[6:9]}" if len(v) == 9 else v


def fsiret(v: str) -> str:
    v = v or ""
    return f"{v[:3]} {v[3:6]} {v[6:9]} {v[9:]}" if len(v) == 14 else v


_env = Environment(
    loader=FileSystemLoader(TEMPLATES),
    autoescape=select_autoescape(["html"]),
)
_env.filters.update(
    fmoney=fmoney, fprice=fprice, fqty=fqty, funit=funit, fdate=fdate, siren=fsiren, siret=fsiret
)


def _footer(seller: dict) -> str:
    parts = [seller.get("name", "")]
    if seller.get("legal_form"):
        parts[0] += f" ({seller['legal_form']})"
    if seller.get("siret"):
        parts.append(f"SIRET {fsiret(seller['siret'])}")
    return " · ".join(p for p in parts if p).replace('"', "'").replace("\\", "")


def render_html(
    *,
    kind: str,
    doc,
    seller: dict,
    client: dict,
    origin=None,
    accepted_label: str = "",
) -> str:
    inv = seller.get("invoicing", {})
    labels = {"invoice": "Facture", "credit_note": "Avoir", "quote": "Devis"}
    full_credit = origin is not None and Decimal(doc.total_ttc) >= Decimal(origin.total_ttc)
    ctx = {
        "kind": kind,
        "doc_label": labels[kind],
        "number": doc.number,
        "is_draft": doc.number is None,
        "title": doc.title,
        "notes": doc.notes,
        "issue_date": doc.issue_date,
        "due_date": getattr(doc, "due_date", None),
        "valid_until": getattr(doc, "valid_until", None),
        "service_start": getattr(doc, "service_start", None),
        "service_end": getattr(doc, "service_end", None),
        "operation_label": OPERATION_LABELS.get(doc.operation_category, doc.operation_category),
        "lines": doc.lines,
        "total_ht": doc.total_ht,
        "total_vat": doc.total_vat,
        "total_ttc": doc.total_ttc,
        "vat_groups": vat_breakdown(doc.lines),
        "vat_franchise": doc.vat_franchise,
        "vat_franchise_mention": inv.get("vat_franchise_mention", ""),
        "payment_method_text": inv.get("payment_method_text", "Virement bancaire"),
        "late_penalty_text": inv.get("late_penalty_text", ""),
        "recovery_fee_text": inv.get("recovery_fee_text", ""),
        "discount_text": inv.get("discount_text", ""),
        "footer_extra": inv.get("footer_extra", ""),
        "quote_terms": inv.get("quote_terms", ""),
        "seller": seller,
        "bank": seller.get("bank", {}),
        "client": client,
        "origin_number": origin.number if origin is not None else None,
        "origin_date": origin.issue_date if origin is not None else None,
        "full_credit": full_credit,
        "accepted_label": accepted_label,
        "footer_line": _footer(seller),
        "accent": ACCENT,
    }
    return _env.get_template("pdf/document.html").render(**ctx)


def html_to_pdf(html: str) -> bytes:
    from weasyprint import HTML  # import tardif : la bibliothèque est lourde à charger

    return HTML(string=html, base_url=str(TEMPLATES)).write_pdf(pdf_variant="pdf/a-3b")


def build_quote_pdf(quote, seller: dict, client: dict) -> bytes:
    label = ""
    if quote.accepted_at:
        who = f" par {quote.accepted_by}" if quote.accepted_by else ""
        label = f"ACCEPTÉ LE {quote.accepted_at.strftime('%d/%m/%Y')}{who}".upper()
    html = render_html(kind="quote", doc=quote, seller=seller, client=client, accepted_label=label)
    return html_to_pdf(html)


def build_invoice_pdf(
    invoice, seller: dict, client: dict, quote_number: str | None = None, origin=None
) -> tuple[bytes, bytes | None]:
    """Retourne (pdf, xml). Pour une facture émise, le PDF est un Factur-X (XML embarqué)."""
    html = render_html(kind=invoice.kind, doc=invoice, seller=seller, client=client, origin=origin)
    pdf = html_to_pdf(html)
    if invoice.number is None:
        return pdf, None  # aperçu de brouillon : pas de Factur-X

    xml = build_invoice_xml(invoice, seller, client, quote_number=quote_number, origin=origin)
    return embed_facturx(pdf, xml, invoice, seller), xml


def embed_facturx(pdf: bytes, xml: bytes, invoice, seller: dict) -> bytes:
    from facturx import generate_from_binary

    label = "Avoir" if invoice.kind == "credit_note" else "Facture"
    metadata = {
        "author": seller.get("name", ""),
        "keywords": "Factur-X, facture électronique",
        "title": f"{label} {invoice.number}",
        "subject": f"{label} {invoice.number} - {seller.get('name', '')}",
    }
    return generate_from_binary(
        pdf, xml, flavor="factur-x", level="en16931", check_xsd=True, pdf_metadata=metadata, lang="fr-FR"
    )
