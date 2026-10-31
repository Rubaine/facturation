"""Envoi des mails (SMTP, ex. Gmail avec mot de passe d'application).

Si le SMTP n'est pas configuré, les mails sont enregistrés en .eml dans data/outbox
pour pouvoir tester l'application sans rien envoyer.
"""

import logging
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import EmailLog

log = logging.getLogger(__name__)


class MailError(Exception):
    pass


def split_addresses(value: str | None) -> list[str]:
    if not value:
        return []
    return [a.strip() for a in value.replace(";", ",").split(",") if a.strip()]


def render_template(template: str, variables: dict) -> str:
    """Remplace les {variables} connues et laisse les autres accolades intactes."""
    out = template
    for k, v in variables.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def send_mail(
    db: Session,
    *,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    html: str | None = None,
    inline_images: list[tuple[str, bytes, str]] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
    sender_name: str = "",
    doc_type: str = "test",
    doc_id: int | None = None,
    purpose: str = "send",
) -> str:
    """Envoie un mail. Retourne 'sent' ou 'outbox'. Lève MailError en cas d'échec."""
    settings = get_settings()
    if not to:
        raise MailError("Aucun destinataire : renseigne l'email du client.")

    from_addr = settings.smtp_from or settings.smtp_user or "facturation@localhost"
    msg = EmailMessage()
    msg["From"] = formataddr((sender_name, from_addr)) if sender_name else from_addr
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=from_addr.split("@")[-1])
    msg["Reply-To"] = from_addr
    msg.set_content(body)
    if html:
        # Version HTML (la version texte reste pour les messageries qui n'affichent pas le HTML)
        msg.add_alternative(html, subtype="html")
        html_part = msg.get_payload()[-1]
        for cid, content, subtype in inline_images or []:
            if f"cid:{cid}" in html:
                html_part.add_related(content, maintype="image", subtype=subtype, cid=f"<{cid}>")
    for filename, content, mime in attachments or []:
        maintype, subtype = mime.split("/", 1)
        msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    recipients = list(to) + list(cc or [])
    if settings.smtp_bcc_self and settings.smtp_configured and from_addr not in recipients:
        recipients.append(from_addr)  # copie cachée pour garder une trace dans la boîte d'envoi

    status = "sent"
    error = ""
    try:
        if settings.smtp_configured:
            if settings.smtp_use_ssl:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=30) as s:
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg, from_addr=from_addr, to_addrs=recipients)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as s:
                    s.starttls(context=ssl.create_default_context())
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg, from_addr=from_addr, to_addrs=recipients)
        else:
            status = "outbox"
            settings.outbox_dir.mkdir(parents=True, exist_ok=True)
            name = datetime.now().strftime("%Y%m%d-%H%M%S-%f") + f"-{doc_type}-{doc_id or 0}.eml"
            (settings.outbox_dir / name).write_bytes(bytes(msg))
            log.warning("SMTP non configuré : mail écrit dans %s", settings.outbox_dir / name)
    except Exception as exc:  # noqa: BLE001
        status = "error"
        error = str(exc)
        log.exception("Échec d'envoi du mail")

    db.add(
        EmailLog(
            doc_type=doc_type,
            doc_id=doc_id,
            purpose=purpose,
            to=", ".join(to + (cc or [])),
            subject=subject,
            status=status,
            error=error,
        )
    )
    db.commit()
    if status == "error":
        raise MailError(f"Échec de l'envoi du mail : {error}")
    return status
