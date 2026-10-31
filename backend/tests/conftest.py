import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ADMIN_PASSWORD", "secret")
    monkeypatch.setenv("SECRET_KEY", "test")
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("SMTP_HOST", "")
    from app import config, db

    config.get_settings.cache_clear()
    db.reset_engine()
    from app.main import create_app

    with TestClient(create_app()) as c:
        r = c.post("/api/auth/login", json={"password": "secret"})
        assert r.status_code == 200
        yield c
    db.reset_engine()
    config.get_settings.cache_clear()


@pytest.fixture()
def company_client(client):
    r = client.post(
        "/api/clients",
        json={
            "kind": "company",
            "name": "GD PERFORMANCE",
            "contact_name": "Remy DESABRE",
            "email": "client@example.com",
            "address_line1": "10 rue du Bourg",
            "postal_code": "60340",
            "city": "Saint-Leu-d'Esserent",
            "siret": "10046567300018",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


LINES = [{"description": "Hébergement Web", "quantity": "1", "unit": "mois", "unit_price": "5"}]
