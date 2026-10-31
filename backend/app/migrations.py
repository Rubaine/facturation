"""Mise à jour automatique du schéma de la base au démarrage (Alembic)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select

from .db import SessionLocal
from .models import Counter, Invoice

ALEMBIC_DIR = Path(__file__).resolve().parent / "alembic"

# Numéro de la prochaine facture lors de la toute première installation
# (suite de la numérotation Henrri : dernière facture émise = 26-10-13).
INITIAL_INVOICE_NUMBER = 14


def alembic_config() -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    return cfg


def upgrade_db() -> None:
    command.upgrade(alembic_config(), "head")
    _seed()


def _seed() -> None:
    db = SessionLocal()
    try:
        has_counter = db.scalar(select(Counter).limit(1)) is not None
        has_invoice = db.scalar(select(Invoice.id).limit(1)) is not None
        if not has_counter and not has_invoice:
            db.add(Counter(name="invoice", period="", next_value=INITIAL_INVOICE_NUMBER))
            db.commit()
    finally:
        db.close()
