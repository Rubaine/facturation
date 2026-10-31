"""Mise en forme HTML des mails à partir du texte (modifiable) des modèles."""

import base64
import re
from dataclasses import dataclass, field
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

from .app_settings import AppSettings
from .pdf import ACCENT, fsiret

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html"]))

URL_RE = re.compile(r"(https?://[^\s<]+)")
LOGO_CID = "logo-entreprise"


@dataclass
class EmailExtras:
    """Éléments visuels ajoutés autour du texte du mail."""

    doc_label: str = ""
    card: dict | None = None  # {label, number, title, amount_label, amount, rows: [(k, v, highlight)]}
    payment: dict | None = None  # {bank_name, iban, bic, reference}
    cta: dict | None = None  # {label, url, color}
    attachment_name: str = ""
    preheader: str = ""
    hide_urls: list[str] = field(default_factory=list)  # liens déjà présentés par le bouton


def text_to_html(text: str, hide_urls: list[str] | None = None) -> Markup:
    """Texte brut → paragraphes HTML (échappés), liens cliquables.

    Les lignes contenant uniquement une URL de `hide_urls` sont retirées (le bouton les remplace).
    """
    hidden = set(hide_urls or [])
    lines = [ln for ln in text.strip().split("\n") if ln.strip() not in hidden]
    out = []
    for para in re.split(r"\n\s*\n", "\n".join(lines)):
        if not para.strip():
            continue
        html = str(escape(para.strip()))
        html = URL_RE.sub(lambda m: f'<a href="{m.group(1)}" style="color:{ACCENT};">{m.group(1)}</a>', html)
        out.append(f'<p style="margin:0 0 14px 0;">{html.replace(chr(10), "<br>")}</p>')
    return Markup("".join(out))


def logo_bytes(settings: AppSettings) -> tuple[bytes, str] | None:
    """Décode le logo (data URL) pour l'intégrer en pièce inline (les data URLs sont bloquées par Gmail)."""
    url = settings.company.logo_data_url
    m = re.match(r"data:image/(png|jpe?g|gif);base64,(.+)", url or "", re.S)
    if not m:
        return None
    subtype = "jpeg" if m.group(1).startswith("jp") else m.group(1)
    try:
        return base64.b64decode(m.group(2)), subtype
    except ValueError:
        return None


def render_email(settings: AppSettings, subject: str, body: str, extras: EmailExtras | None = None, inline_logo: bool = True) -> str:
    extras = extras or EmailExtras()
    c = settings.company
    address = ", ".join(p for p in [c.address_line1, f"{c.postal_code} {c.city}".strip()] if p)
    legal = " · ".join(p for p in [c.legal_form, f"SIRET {fsiret(c.siret)}" if c.siret else ""] if p)
    has_logo = logo_bytes(settings) is not None
    return _env.get_template("email/document.html").render(
        subject=subject,
        preheader=extras.preheader,
        accent=ACCENT,
        seller_name=c.name,
        seller_legal=legal,
        seller_address=address,
        seller_email=c.email,
        seller_phone=c.phone,
        logo_cid=LOGO_CID if has_logo and inline_logo else None,
        doc_label=extras.doc_label,
        body_html=text_to_html(body, extras.hide_urls),
        card=extras.card,
        payment=extras.payment,
        cta=extras.cta,
        attachment_name=extras.attachment_name,
    )


def render_preview(settings: AppSettings, subject: str, body: str, extras: EmailExtras | None = None) -> str:
    """Version pour l'aperçu dans l'application : le logo est affiché via data URL."""
    html = render_email(settings, subject, body, extras, inline_logo=True)
    if logo_bytes(settings):
        html = html.replace(f"cid:{LOGO_CID}", settings.company.logo_data_url)
    return html


def payment_text(payment: dict) -> str:
    """Bloc de paiement ajouté à la version texte brut du mail."""
    lines = ["Règlement par virement :"]
    if payment.get("bank_name"):
        lines.append(f"Banque : {payment['bank_name']}")
    lines.append(f"IBAN : {payment['iban']}")
    if payment.get("bic"):
        lines.append(f"BIC : {payment['bic']}")
    lines.append(f"Référence : {payment['reference']}")
    return "\n".join(lines)
