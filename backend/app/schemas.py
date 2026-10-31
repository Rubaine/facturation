from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

OperationCategory = Literal["services", "goods", "mixed"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Lignes ----------
class LineIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    details: str = ""
    quantity: Decimal = Decimal("1")
    unit: str = ""
    unit_price: Decimal = Decimal("0")
    vat_rate: Decimal = Decimal("0")

    @field_validator("quantity")
    @classmethod
    def _qty(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("La quantité doit être positive")
        return v

    @field_validator("unit_price")
    @classmethod
    def _price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Le prix unitaire ne peut pas être négatif")
        return v


class LineOut(BaseModel):
    description: str
    details: str = ""
    quantity: Decimal
    unit: str = ""
    unit_price: Decimal
    vat_rate: Decimal
    total_ht: Decimal


# ---------- Clients ----------
class ClientIn(BaseModel):
    kind: Literal["company", "individual"] = "company"
    name: str = Field(min_length=1, max_length=255)
    contact_name: str = ""
    email: str = ""
    cc_emails: str = ""
    phone: str = ""
    address_line1: str = ""
    address_line2: str = ""
    postal_code: str = ""
    city: str = ""
    country: str = "FR"
    siren: str = ""
    siret: str = ""
    vat_number: str = ""
    notes: str = ""
    archived: bool = False

    @field_validator("siren", "siret")
    @classmethod
    def _digits(cls, v: str) -> str:
        return "".join(c for c in v if c.isdigit())


class ClientOut(ORM, ClientIn):
    id: int
    created_at: datetime


class ClientStats(BaseModel):
    invoiced_total: Decimal
    paid_total: Decimal
    unpaid_total: Decimal
    invoice_count: int
    quote_count: int


# ---------- Devis ----------
class QuoteIn(BaseModel):
    client_id: int
    issue_date: date
    valid_until: date
    title: str = ""
    notes: str = ""
    operation_category: OperationCategory = "services"
    lines: list[LineIn] = Field(min_length=1)


class QuoteOut(ORM):
    id: int
    number: str | None
    status: str
    client_id: int
    client_name: str = ""
    issue_date: date
    valid_until: date
    title: str
    notes: str
    operation_category: str
    lines: list[LineOut]
    total_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    vat_franchise: bool
    public_token: str | None
    finalized_at: datetime | None
    sent_at: datetime | None
    accepted_at: datetime | None
    accepted_by: str
    refused_at: datetime | None
    invoice_id: int | None = None
    is_expired: bool = False
    created_at: datetime


# ---------- Factures ----------
class InvoiceIn(BaseModel):
    client_id: int
    issue_date: date
    due_date: date
    service_start: date | None = None
    service_end: date | None = None
    operation_category: OperationCategory = "services"
    title: str = ""
    notes: str = ""
    lines: list[LineIn] = Field(min_length=1)


class InvoiceOut(ORM):
    id: int
    number: str | None
    kind: str
    status: str
    client_id: int
    client_name: str = ""
    issue_date: date
    due_date: date
    service_start: date | None
    service_end: date | None
    operation_category: str
    title: str
    notes: str
    lines: list[LineOut]
    total_ht: Decimal
    total_vat: Decimal
    total_ttc: Decimal
    vat_franchise: bool
    quote_id: int | None
    quote_number: str | None = None
    recurring_id: int | None
    credit_note_of_id: int | None
    credit_note_of_number: str | None = None
    credit_note_ids: list[int] = []
    issued_at: datetime | None
    sent_at: datetime | None
    paid_at: date | None
    payment_method: str
    reminder_count: int
    last_reminder_at: datetime | None
    is_overdue: bool = False
    created_at: datetime


class MarkPaidIn(BaseModel):
    paid_at: date
    payment_method: str = "virement"


class SendIn(BaseModel):
    to: str | None = None  # par défaut : email du client
    cc: str | None = None
    subject: str | None = None
    body: str | None = None


class EmailPreview(BaseModel):
    to: str
    cc: str
    subject: str
    body: str
    smtp_configured: bool


# ---------- Récurrences ----------
class RecurringIn(BaseModel):
    client_id: int
    name: str = Field(min_length=1, max_length=255)
    title_template: str = ""
    notes: str = ""
    operation_category: OperationCategory = "services"
    lines: list[LineIn] = Field(min_length=1)
    frequency_months: int = Field(default=1, ge=1, le=12)
    day_of_month: int = Field(default=1, ge=1, le=28)
    start_date: date
    end_date: date | None = None
    payment_terms_days: int = Field(default=0, ge=0, le=120)
    auto_send: bool = True
    active: bool = True


class RecurringOut(ORM):
    id: int
    client_id: int
    client_name: str = ""
    name: str
    title_template: str
    notes: str
    operation_category: str
    lines: list[LineOut]
    total_ht: Decimal = Decimal("0")
    frequency_months: int
    day_of_month: int
    start_date: date
    next_run_date: date
    end_date: date | None
    payment_terms_days: int
    auto_send: bool
    active: bool
    last_generated_at: datetime | None
    generated_count: int
    last_error: str
    created_at: datetime


# ---------- Divers ----------
class EmailLogOut(ORM):
    id: int
    doc_type: str
    doc_id: int | None
    purpose: str
    to: str
    subject: str
    status: str
    error: str
    created_at: datetime


class CounterState(BaseModel):
    kind: str
    next_value: int
    preview: str


class CounterUpdate(BaseModel):
    kind: Literal["invoice", "credit_note", "quote"]
    next_value: int = Field(ge=1)
