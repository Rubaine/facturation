from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Client, Invoice, Quote, RecurringInvoice
from ..schemas import ClientIn, ClientOut, ClientStats

router = APIRouter(prefix="/api/clients", tags=["clients"])


def get_client_or_404(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, "Client introuvable")
    return client


@router.get("", response_model=list[ClientOut])
def list_clients(include_archived: bool = False, db: Session = Depends(get_db)):
    q = select(Client).order_by(func.lower(Client.name))
    if not include_archived:
        q = q.where(Client.archived.is_(False))
    return db.scalars(q).all()


@router.post("", response_model=ClientOut, status_code=201)
def create_client(data: ClientIn, db: Session = Depends(get_db)):
    client = Client(**data.model_dump())
    if client.siret and not client.siren:
        client.siren = client.siret[:9]
    db.add(client)
    db.commit()
    return client


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db)):
    return get_client_or_404(db, client_id)


@router.get("/{client_id}/stats", response_model=ClientStats)
def client_stats(client_id: int, db: Session = Depends(get_db)):
    get_client_or_404(db, client_id)
    invoices = db.scalars(
        select(Invoice).where(Invoice.client_id == client_id, Invoice.number.is_not(None))
    ).all()
    invoiced = sum((i.total_ttc if i.kind == "invoice" else -i.total_ttc for i in invoices), Decimal("0"))
    paid = sum((i.total_ttc for i in invoices if i.status == "paid"), Decimal("0"))
    unpaid = sum((i.total_ttc for i in invoices if i.status == "issued" and i.kind == "invoice"), Decimal("0"))
    quote_count = db.scalar(select(func.count(Quote.id)).where(Quote.client_id == client_id)) or 0
    return ClientStats(
        invoiced_total=invoiced,
        paid_total=paid,
        unpaid_total=unpaid,
        invoice_count=sum(1 for i in invoices if i.kind == "invoice"),
        quote_count=quote_count,
    )


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, data: ClientIn, db: Session = Depends(get_db)):
    client = get_client_or_404(db, client_id)
    for k, v in data.model_dump().items():
        setattr(client, k, v)
    if client.siret and not client.siren:
        client.siren = client.siret[:9]
    db.commit()
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = get_client_or_404(db, client_id)
    used = (
        db.scalar(select(func.count(Invoice.id)).where(Invoice.client_id == client_id))
        or db.scalar(select(func.count(Quote.id)).where(Quote.client_id == client_id))
        or db.scalar(select(func.count(RecurringInvoice.id)).where(RecurringInvoice.client_id == client_id))
    )
    if used:
        raise HTTPException(
            400, "Ce client a des documents : il ne peut pas être supprimé, archive-le plutôt."
        )
    db.delete(client)
    db.commit()
