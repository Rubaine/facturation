"""Configuration chargée depuis les variables d'environnement (ou un fichier .env)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Dossier où sont stockés la base SQLite, les PDF générés et les sauvegardes.
    data_dir: Path = Path("data")

    # Authentification (application mono-utilisateur).
    admin_password: str = "changeme"
    secret_key: str = "dev-secret-change-me"
    session_days: int = 30
    cookie_secure: bool = False

    # URL publique de l'application (utilisée dans les mails : lien d'acceptation des devis).
    public_url: str = "http://localhost:8000"

    # SMTP (Gmail : smtp.gmail.com, port 465, mot de passe d'application).
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # par défaut = smtp_user
    smtp_use_ssl: bool = True  # SSL direct (465). Mettre False pour STARTTLS (587).
    # Adresse en copie cachée de tous les envois (pour garder une trace dans ta boîte).
    smtp_bcc_self: bool = True

    # Planificateur (factures récurrentes, sauvegardes).
    scheduler_enabled: bool = True
    scheduler_hour: int = 8
    scheduler_minute: int = 0
    timezone: str = "Europe/Paris"
    backup_keep: int = 30

    # Dossier contenant le front compilé (servi par FastAPI en production).
    frontend_dist: Path = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "facturation.sqlite3"

    @property
    def pdf_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def outbox_dir(self) -> Path:
        """Si le SMTP n'est pas configuré, les mails sont écrits ici (.eml) au lieu d'être envoyés."""
        return self.data_dir / "outbox"

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()
