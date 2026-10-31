"""Tâches planifiées : factures récurrentes et sauvegarde quotidienne de la base."""

import logging
import sqlite3
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import get_settings
from ..db import SessionLocal
from .recurring import process_due

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def run_recurring_job() -> int:
    db = SessionLocal()
    try:
        created = process_due(db)
        if created:
            log.info("Factures récurrentes générées : %s", ", ".join(i.number or "?" for i in created))
        return len(created)
    finally:
        db.close()


def backup_job() -> str:
    """Copie cohérente de la base SQLite (API de sauvegarde) ; conserve les N dernières."""
    settings = get_settings()
    settings.backup_dir.mkdir(parents=True, exist_ok=True)
    target = settings.backup_dir / f"facturation-{datetime.now():%Y%m%d-%H%M%S}.sqlite3"
    src = sqlite3.connect(settings.db_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    backups = sorted(settings.backup_dir.glob("facturation-*.sqlite3"))
    for old in backups[: -settings.backup_keep]:
        old.unlink(missing_ok=True)
    return str(target)


def start_scheduler() -> None:
    global _scheduler
    settings = get_settings()
    if not settings.scheduler_enabled or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone=settings.timezone)
    _scheduler.add_job(
        run_recurring_job,
        CronTrigger(hour=settings.scheduler_hour, minute=settings.scheduler_minute, timezone=settings.timezone),
        id="recurring",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=6 * 3600,
    )
    _scheduler.add_job(
        backup_job,
        CronTrigger(hour=3, minute=30, timezone=settings.timezone),
        id="backup",
        max_instances=1,
        coalesce=True,
    )
    # Rattrapage au démarrage (si le serveur était éteint à l'heure prévue).
    _scheduler.add_job(run_recurring_job, id="recurring-startup", max_instances=1)
    _scheduler.start()
    log.info("Planificateur démarré (factures récurrentes à %02d:%02d)", settings.scheduler_hour, settings.scheduler_minute)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
