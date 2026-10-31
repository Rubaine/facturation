"""Numérotation chronologique et continue des documents.

Un numéro n'est attribué qu'au moment où le document est émis (les brouillons n'en ont pas),
ce qui garantit une suite sans trou comme l'exige la loi.
"""

from datetime import date

from sqlalchemy.orm import Session

from ..models import Counter
from .app_settings import AppSettings

KINDS = ("invoice", "credit_note", "quote")


def _config(settings: AppSettings, kind: str) -> tuple[str, str, int]:
    n = settings.numbering
    return (
        getattr(n, f"{kind}_pattern"),
        getattr(n, f"{kind}_reset"),
        getattr(n, f"{kind}_padding"),
    )


def period_for(reset: str, d: date) -> str:
    if reset == "monthly":
        return f"{d.year:04d}-{d.month:02d}"
    if reset == "yearly":
        return f"{d.year:04d}"
    return ""


def format_number(pattern: str, value: int, padding: int, d: date) -> str:
    return (
        pattern.replace("{AAAA}", f"{d.year:04d}")
        .replace("{AA}", f"{d.year % 100:02d}")
        .replace("{MM}", f"{d.month:02d}")
        .replace("{JJ}", f"{d.day:02d}")
        .replace("{N}", str(value).zfill(max(padding, 1)))
    )


def _get_counter(db: Session, kind: str, period: str) -> Counter:
    counter = db.get(Counter, (kind, period))
    if counter is None:
        counter = Counter(name=kind, period=period, next_value=1)
        db.add(counter)
        db.flush()
    return counter


def preview_next(db: Session, settings: AppSettings, kind: str, d: date) -> str:
    pattern, reset, padding = _config(settings, kind)
    counter = db.get(Counter, (kind, period_for(reset, d)))
    value = counter.next_value if counter else 1
    return format_number(pattern, value, padding, d)


def next_value(db: Session, settings: AppSettings, kind: str, d: date) -> int:
    _, reset, _ = _config(settings, kind)
    counter = db.get(Counter, (kind, period_for(reset, d)))
    return counter.next_value if counter else 1


def set_next_value(db: Session, settings: AppSettings, kind: str, d: date, value: int) -> None:
    _, reset, _ = _config(settings, kind)
    counter = _get_counter(db, kind, period_for(reset, d))
    counter.next_value = max(1, int(value))


def take_number(db: Session, settings: AppSettings, kind: str, d: date) -> str:
    """Réserve le prochain numéro (à appeler dans la transaction qui émet le document)."""
    pattern, reset, padding = _config(settings, kind)
    counter = _get_counter(db, kind, period_for(reset, d))
    value = counter.next_value
    counter.next_value = value + 1
    db.flush()
    return format_number(pattern, value, padding, d)
