import io
from datetime import date, timedelta

from facturx import get_facturx_xml_from_pdf, xml_check_xsd
from pypdf import PdfReader

from .conftest import LINES

TODAY = date.today()


def _invoice(client, client_id, **kw):
    payload = {
        "client_id": client_id,
        "issue_date": str(TODAY),
        "due_date": str(TODAY),
        "title": "Hébergement",
        "lines": LINES,
        **kw,
    }
    r = client.post("/api/invoices", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_auth_required(client):
    client.cookies.clear()
    assert client.get("/api/clients").status_code == 401
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401


def test_client_siren_from_siret(client, company_client):
    assert company_client["siren"] == "100465673"


def test_invoice_issue_numbering_and_facturx(client, company_client):
    inv = _invoice(client, company_client["id"])
    assert inv["number"] is None and inv["total_ttc"] == "5.00"

    issued = client.post(f"/api/invoices/{inv['id']}/issue").json()
    yy, mm = f"{TODAY.year % 100:02d}", f"{TODAY.month:02d}"
    assert issued["number"] == f"{yy}-{mm}-14"
    assert issued["status"] == "issued"

    # Un document émis n'est plus modifiable ni supprimable
    assert client.put(f"/api/invoices/{inv['id']}", json={**inv, "lines": LINES}).status_code == 400
    assert client.delete(f"/api/invoices/{inv['id']}").status_code == 400

    pdf = client.get(f"/api/invoices/{inv['id']}/pdf").content
    assert pdf.startswith(b"%PDF")
    filename, xml = get_facturx_xml_from_pdf(io.BytesIO(pdf), check_xsd=False)
    assert filename == "factur-x.xml"
    assert xml_check_xsd(xml, flavor="factur-x", level="en16931")
    assert b"TVA non applicable, art. 293 B du CGI" in xml
    assert b"VATEX-FR-FRANCHISE" in xml
    assert b"<ram:ID>S1</ram:ID>" in xml
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert "TVA non applicable" in text
    assert "942 996 745 00025" in text

    second = _invoice(client, company_client["id"])
    issued2 = client.post(f"/api/invoices/{second['id']}/issue").json()
    assert issued2["number"] == f"{yy}-{mm}-15"


def test_issue_requires_chronology(client, company_client):
    a = _invoice(client, company_client["id"])
    client.post(f"/api/invoices/{a['id']}/issue")
    past = str(TODAY - timedelta(days=3))
    b = _invoice(client, company_client["id"], issue_date=past, due_date=past)
    r = client.post(f"/api/invoices/{b['id']}/issue")
    assert r.status_code == 400 and "chronologique" in r.json()["detail"]


def test_incomplete_client_cannot_be_invoiced(client):
    c = client.post("/api/clients", json={"name": "Sans adresse", "kind": "individual"}).json()
    inv = _invoice(client, c["id"])
    r = client.post(f"/api/invoices/{inv['id']}/issue")
    assert r.status_code == 400


def test_send_paid_and_credit_note(client, company_client, tmp_path):
    inv = _invoice(client, company_client["id"])
    preview = client.get(f"/api/invoices/{inv['id']}/email").json()
    assert preview["to"] == "client@example.com"
    assert "-14" in preview["subject"]

    r = client.post(f"/api/invoices/{inv['id']}/send", json={})
    assert r.status_code == 200, r.text
    sent = r.json()
    assert sent["status"] == "issued" and sent["sent_at"]
    emls = list((tmp_path / "outbox").glob("*.eml"))
    assert len(emls) == 1
    eml = emls[0].read_bytes()
    assert b"application/pdf" in eml and b"client@example.com" in eml

    paid = client.post(f"/api/invoices/{inv['id']}/paid", json={"paid_at": str(TODAY)}).json()
    assert paid["status"] == "paid"
    client.post(f"/api/invoices/{inv['id']}/unpaid")

    credit = client.post(f"/api/invoices/{inv['id']}/credit-note").json()
    assert credit["kind"] == "credit_note" and credit["status"] == "draft"
    issued = client.post(f"/api/invoices/{credit['id']}/issue").json()
    assert issued["number"].startswith("AV-")
    pdf = client.get(f"/api/invoices/{credit['id']}/pdf").content
    _, xml = get_facturx_xml_from_pdf(io.BytesIO(pdf), check_xsd=False)
    assert b"<ram:TypeCode>381</ram:TypeCode>" in xml
    assert xml_check_xsd(xml, flavor="factur-x", level="en16931")
    assert client.get(f"/api/invoices/{inv['id']}").json()["status"] == "cancelled"

    dash = client.get("/api/dashboard").json()
    assert dash["invoiced_year"] == "0.00"


def test_quote_lifecycle(client, company_client, tmp_path):
    payload = {
        "client_id": company_client["id"],
        "issue_date": str(TODAY),
        "valid_until": str(TODAY + timedelta(days=30)),
        "title": "Site vitrine",
        "lines": [
            {"description": "Développement", "quantity": "3", "unit": "jour", "unit_price": "350"},
            {"description": "Mise en ligne", "quantity": "1", "unit_price": "99.90"},
        ],
    }
    q = client.post("/api/quotes", json=payload).json()
    assert q["total_ttc"] == "1149.90" and q["number"] is None
    draft_pdf = client.get(f"/api/quotes/{q['id']}/pdf").content
    assert draft_pdf.startswith(b"%PDF")

    preview = client.get(f"/api/quotes/{q['id']}/email").json()
    assert "lien d'acceptation" in preview["body"]
    sent = client.post(f"/api/quotes/{q['id']}/send", json=preview).json()
    assert sent["status"] == "sent" and sent["number"].startswith("D-")
    token = sent["public_token"]
    eml = next((tmp_path / "outbox").glob("*.eml")).read_text(errors="ignore")
    assert f"/p/devis/{token}" in eml

    # Page publique (sans connexion)
    client.cookies.clear()
    pub = client.get(f"/api/public/quotes/{token}").json()
    assert pub["total"].startswith("1")
    assert client.get(f"/api/public/quotes/{token}/pdf").status_code == 200
    assert client.post(f"/api/public/quotes/{token}/accept", json={"name": "Remy"}).json()["ok"]
    assert client.get("/api/public/quotes/wrongtoken-wrongtoken").status_code == 404
    client.post("/api/auth/login", json={"password": "secret"})

    q2 = client.get(f"/api/quotes/{q['id']}").json()
    assert q2["status"] == "accepted" and q2["accepted_by"] == "Remy"

    inv = client.post(f"/api/quotes/{q['id']}/invoice").json()
    assert inv["quote_id"] == q["id"] and inv["total_ttc"] == "1149.90"
    assert client.get(f"/api/quotes/{q['id']}").json()["status"] == "invoiced"
    issued = client.post(f"/api/invoices/{inv['id']}/issue").json()
    _, xml = get_facturx_xml_from_pdf(io.BytesIO(client.get(f"/api/invoices/{inv['id']}/pdf").content), check_xsd=False)
    assert sent["number"].encode() in xml
    assert issued["quote_number"] == sent["number"]


def test_recurring_generation(client, company_client, tmp_path):
    start = TODAY - timedelta(days=40)
    r = client.post(
        "/api/recurring",
        json={
            "client_id": company_client["id"],
            "name": "Hébergement GD",
            "title_template": "Hébergement - {Mois} {annee}",
            "lines": LINES,
            "day_of_month": 1,
            "start_date": str(start),
            "auto_send": True,
        },
    ).json()
    assert r["next_run_date"] <= str(TODAY)
    created = client.post("/api/recurring/process").json()
    # Rattrapage des échéances passées (2 ou 3 selon le jour du mois)
    assert len(created) >= 1
    assert all(i["status"] == "issued" and i["sent_at"] for i in created)
    assert created[0]["title"].startswith("Hébergement - ")
    assert created[0]["service_start"].endswith("-01")
    rec = client.get(f"/api/recurring/{r['id']}").json()
    assert rec["next_run_date"] > str(TODAY)
    assert rec["generated_count"] == len(created)
    # Idempotent
    assert client.post("/api/recurring/process").json() == []
    assert len(list((tmp_path / "outbox").glob("*.eml"))) == len(created)

    preview = client.get(f"/api/recurring/{r['id']}/preview").json()
    assert len(preview["dates"]) == 6


def test_settings_and_counters(client):
    s = client.get("/api/settings").json()
    assert s["company"]["siret"] == "94299674500025"
    assert s["invoicing"]["vat_franchise"] is True
    s["numbering"]["invoice_pattern"] = "F-{AAAA}-{N}"
    assert client.put("/api/settings", json=s).status_code == 200
    counters = client.put("/api/settings/counters", json={"kind": "invoice", "next_value": 42}).json()
    inv = next(c for c in counters if c["kind"] == "invoice")
    assert inv["preview"] == f"F-{TODAY.year}-42"
    s["numbering"]["invoice_pattern"] = "F-{AAAA}"
    assert client.put("/api/settings", json=s).status_code == 400


def test_partial_credit_notes_capped(client, company_client):
    inv = _invoice(client, company_client["id"], lines=[{"description": "Dev", "quantity": "1", "unit_price": "100"}])
    client.post(f"/api/invoices/{inv['id']}/issue")
    credit = client.post(f"/api/invoices/{inv['id']}/credit-note").json()
    payload = {
        "client_id": credit["client_id"], "issue_date": credit["issue_date"], "due_date": credit["due_date"],
        "title": credit["title"], "lines": [{"description": "Remise", "quantity": "1", "unit_price": "40"}],
    }
    assert client.put(f"/api/invoices/{credit['id']}", json=payload).status_code == 200
    assert client.post(f"/api/invoices/{credit['id']}/issue").status_code == 200
    assert client.get(f"/api/invoices/{inv['id']}").json()["status"] == "issued"  # avoir partiel

    second = client.post(f"/api/invoices/{inv['id']}/credit-note").json()  # reprend 100 € : trop
    r = client.post(f"/api/invoices/{second['id']}/issue")
    assert r.status_code == 400 and "dépasserait" in r.json()["detail"]
    payload["lines"][0]["unit_price"] = "60"
    client.put(f"/api/invoices/{second['id']}", json=payload)
    assert client.post(f"/api/invoices/{second['id']}/issue").status_code == 200
    assert client.get(f"/api/invoices/{inv['id']}").json()["status"] == "cancelled"
