from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, DecimalString

ZERO = Decimal("0")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class AppSetting(Base):
    """Paramètres de l'application (infos entreprise, mentions, modèles de mail...), stockés en JSON."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)


class Counter(Base):
    """Compteur de numérotation. `period` vaut '' (jamais remis à zéro), 'AAAA' ou 'AAAA-MM'."""

    __tablename__ = "counters"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    period: Mapped[str] = mapped_column(String(16), primary_key=True, default="")
    next_value: Mapped[int] = mapped_column(Integer, default=1)


class Client(TimestampMixin, Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), default="company")  # company | individual
    name: Mapped[str] = mapped_column(String(255))
    contact_name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    cc_emails: Mapped[str] = mapped_column(String(500), default="")  # séparées par des virgules
    phone: Mapped[str] = mapped_column(String(64), default="")
    address_line1: Mapped[str] = mapped_column(String(255), default="")
    address_line2: Mapped[str] = mapped_column(String(255), default="")
    postal_code: Mapped[str] = mapped_column(String(16), default="")
    city: Mapped[str] = mapped_column(String(128), default="")
    country: Mapped[str] = mapped_column(String(2), default="FR")
    siren: Mapped[str] = mapped_column(String(9), default="")
    siret: Mapped[str] = mapped_column(String(14), default="")
    vat_number: Mapped[str] = mapped_column(String(32), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Quote(TimestampMixin, Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    # draft | sent | accepted | refused | invoiced
    status: Mapped[str] = mapped_column(String(16), default="draft")
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    issue_date: Mapped[date] = mapped_column(Date)
    valid_until: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    operation_category: Mapped[str] = mapped_column(String(16), default="services")
    lines: Mapped[list] = mapped_column(JSON, default=list)
    total_ht: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    total_vat: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    total_ttc: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    vat_franchise: Mapped[bool] = mapped_column(Boolean, default=True)
    seller_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    client_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    public_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    pdf_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accepted_by: Mapped[str] = mapped_column(String(255), default="")
    refused_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    client: Mapped[Client] = relationship(lazy="joined")


class RecurringInvoice(TimestampMixin, Base):
    __tablename__ = "recurring_invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(255))
    # Titre de la facture générée. Variables : {mois}, {annee}, {mois_precedent}, {annee_mois_precedent}
    title_template: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    operation_category: Mapped[str] = mapped_column(String(16), default="services")
    lines: Mapped[list] = mapped_column(JSON, default=list)
    frequency_months: Mapped[int] = mapped_column(Integer, default=1)
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date)
    next_run_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=0)
    auto_send: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    generated_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")

    client: Mapped[Client] = relationship(lazy="joined")


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("recurring_id", "recurring_run_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="invoice")  # invoice | credit_note
    # draft | issued | paid | cancelled
    status: Mapped[str] = mapped_column(String(16), default="draft")
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    service_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    service_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    operation_category: Mapped[str] = mapped_column(String(16), default="services")
    title: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    lines: Mapped[list] = mapped_column(JSON, default=list)
    total_ht: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    total_vat: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    total_ttc: Mapped[Decimal] = mapped_column(DecimalString, default=ZERO)
    vat_franchise: Mapped[bool] = mapped_column(Boolean, default=True)
    seller_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    client_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id"), nullable=True)
    recurring_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_invoices.id"), nullable=True
    )
    recurring_run_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    credit_note_of_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    pdf_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    xml_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(32), default="")
    reminder_count: Mapped[int] = mapped_column(Integer, default=0)
    last_reminder_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    client: Mapped[Client] = relationship(lazy="joined")
    credit_note_of: Mapped["Invoice | None"] = relationship(remote_side="Invoice.id")


class EmailLog(Base):
    __tablename__ = "email_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_type: Mapped[str] = mapped_column(String(16))  # invoice | quote | test
    doc_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purpose: Mapped[str] = mapped_column(String(32), default="send")  # send | reminder | test
    to: Mapped[str] = mapped_column(String(500))
    subject: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16))  # sent | outbox | error
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
