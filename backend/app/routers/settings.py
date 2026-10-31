from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import EmailLog
from ..schemas import CounterState, CounterUpdate, EmailLogOut
from ..services import numbering
from ..services.app_settings import AppSettings, load_settings, save_settings
from ..services.documents import today
from ..services.email_html import EmailExtras, render_email
from ..services.mailer import MailError, send_mail

router = APIRouter(prefix="/api/settings", tags=["paramètres"])


@router.get("", response_model=AppSettings)
def get_app_settings(db: Session = Depends(get_db)):
    return load_settings(db)


@router.put("", response_model=AppSettings)
def update_app_settings(data: AppSettings, db: Session = Depends(get_db)):
    for kind in numbering.KINDS:
        if "{N}" not in getattr(data.numbering, f"{kind}_pattern"):
            raise HTTPException(400, "Chaque format de numéro doit contenir {N}.")
    return save_settings(db, data)


@router.get("/counters", response_model=list[CounterState])
def counters(db: Session = Depends(get_db)):
    settings = load_settings(db)
    d = today()
    return [
        CounterState(
            kind=k,
            next_value=numbering.next_value(db, settings, k, d),
            preview=numbering.preview_next(db, settings, k, d),
        )
        for k in numbering.KINDS
    ]


@router.put("/counters", response_model=list[CounterState])
def set_counter(data: CounterUpdate, db: Session = Depends(get_db)):
    settings = load_settings(db)
    numbering.set_next_value(db, settings, data.kind, today(), data.next_value)
    db.commit()
    return counters(db)


class SystemInfo(BaseModel):
    smtp_configured: bool
    smtp_user: str
    public_url: str
    scheduler_enabled: bool
    scheduler_time: str


@router.get("/system", response_model=SystemInfo)
def system_info():
    s = get_settings()
    return SystemInfo(
        smtp_configured=s.smtp_configured,
        smtp_user=s.smtp_from or s.smtp_user,
        public_url=s.public_url,
        scheduler_enabled=s.scheduler_enabled,
        scheduler_time=f"{s.scheduler_hour:02d}:{s.scheduler_minute:02d}",
    )


class TestMailIn(BaseModel):
    to: str


@router.post("/test-email")
def test_email(data: TestMailIn, db: Session = Depends(get_db)):
    try:
        settings = load_settings(db)
        subject = "Test d'envoi - Facturation"
        body = (
            "Bonjour,\n\nCeci est un mail de test envoyé depuis ton application de facturation. "
            "Si tu le lis, l'envoi fonctionne !"
        )
        demo = EmailExtras(
            doc_label="Test",
            card={"label": "Exemple", "number": "N° 26-01-01", "title": "Aperçu du récapitulatif",
                  "amount_label": "Montant", "amount": "123,45 €", "rows": [("Échéance", "31/01/2026", False)]},
        )
        status = send_mail(
            db,
            to=[data.to],
            subject=subject,
            body=body,
            html=render_email(settings, subject, body, demo),
            sender_name=settings.company.name,
            doc_type="test",
            purpose="test",
        )
    except MailError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"status": status}


@router.get("/email-logs", response_model=list[EmailLogOut])
def email_logs(limit: int = 100, db: Session = Depends(get_db)):
    return db.scalars(select(EmailLog).order_by(EmailLog.created_at.desc()).limit(limit)).all()
