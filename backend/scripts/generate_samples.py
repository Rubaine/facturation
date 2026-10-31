"""Génère des documents d'exemple (facture, avoir, devis) dans un dossier, via l'API en mémoire.

Usage : python scripts/generate_samples.py /tmp/exemples
"""

import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else "exemples")
out.mkdir(parents=True, exist_ok=True)
os.environ.update(DATA_DIR=tempfile.mkdtemp(), ADMIN_PASSWORD="x", SCHEDULER_ENABLED="false", SMTP_HOST="")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

today = date.today()
with TestClient(create_app()) as c:
    c.post("/api/auth/login", json={"password": "x"})
    company = c.post("/api/clients", json={
        "name": "GD PERFORMANCE", "contact_name": "Remy DESABRE", "email": "client@example.com",
        "address_line1": "10 rue du Bourg", "postal_code": "60340", "city": "Saint-Leu-d'Esserent",
        "siret": "10046567300018",
    }).json()
    person = c.post("/api/clients", json={
        "kind": "individual", "name": "Jeanne Martin", "email": "jeanne@example.com",
        "address_line1": "4 place de la Mairie", "postal_code": "75011", "city": "Paris",
    }).json()

    inv = c.post("/api/invoices", json={
        "client_id": company["id"], "issue_date": str(today), "due_date": str(today + timedelta(days=30)),
        "service_start": str(today.replace(day=1)), "service_end": str(today),
        "title": "Hébergement et maintenance", "notes": "Merci pour votre confiance.",
        "lines": [
            {"description": "Hébergement Web", "details": "Serveur mutualisé + nom de domaine", "quantity": "1", "unit": "mois", "unit_price": "5"},
            {"description": "Maintenance", "quantity": "2.5", "unit": "heure", "unit_price": "45"},
        ],
    }).json()
    c.post(f"/api/invoices/{inv['id']}/issue")
    (out / "facture.pdf").write_bytes(c.get(f"/api/invoices/{inv['id']}/pdf").content)

    inv2 = c.post("/api/invoices", json={
        "client_id": person["id"], "issue_date": str(today), "due_date": str(today),
        "title": "Création de site", "lines": [{"description": "Site vitrine", "quantity": "1", "unit_price": "800"}],
    }).json()
    c.post(f"/api/invoices/{inv2['id']}/issue")
    (out / "facture-particulier.pdf").write_bytes(c.get(f"/api/invoices/{inv2['id']}/pdf").content)

    credit = c.post(f"/api/invoices/{inv['id']}/credit-note").json()
    c.post(f"/api/invoices/{credit['id']}/issue")
    (out / "avoir.pdf").write_bytes(c.get(f"/api/invoices/{credit['id']}/pdf").content)

    q = c.post("/api/quotes", json={
        "client_id": company["id"], "issue_date": str(today), "valid_until": str(today + timedelta(days=30)),
        "title": "Refonte du site", "lines": [
            {"description": "Maquettes", "quantity": "2", "unit": "jour", "unit_price": "350"},
            {"description": "Développement", "details": "React + API", "quantity": "5", "unit": "jour", "unit_price": "350"},
        ],
    }).json()
    c.post(f"/api/quotes/{q['id']}/finalize")
    (out / "devis.pdf").write_bytes(c.get(f"/api/quotes/{q['id']}/pdf").content)
print(f"Exemples écrits dans {out}")
