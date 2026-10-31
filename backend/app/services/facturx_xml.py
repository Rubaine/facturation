"""Génération du XML Factur-X (syntaxe UN/CEFACT CII, profil EN 16931).

Ce XML est embarqué dans le PDF (PDF/A-3) pour former une facture électronique Factur-X,
format accepté par les plateformes agréées dans le cadre de la réforme française.
"""

from datetime import date
from decimal import Decimal

from lxml import etree

from .totals import money, vat_breakdown

NS = {
    "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
    "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
}

# Codes d'unité UN/ECE Recommandation 20
UNIT_CODES = {
    "heure": "HUR",
    "heures": "HUR",
    "h": "HUR",
    "jour": "DAY",
    "jours": "DAY",
    "j": "DAY",
    "mois": "MON",
    "an": "ANN",
    "année": "ANN",
    "semaine": "WEE",
    "forfait": "C62",
    "unité": "C62",
    "unite": "C62",
    "": "C62",
}

# Cadre de facturation (spécifications externes de la réforme) :
# B1 = livraison de biens, S1 = prestation de services, M1 = mixte.
BUSINESS_PROCESS = {"goods": "B1", "services": "S1", "mixed": "M1"}

FRANCHISE_EXEMPTION_CODE = "VATEX-FR-FRANCHISE"


def unit_code(unit: str) -> str:
    return UNIT_CODES.get((unit or "").strip().lower(), "C62")


def _el(parent, tag: str, text: str | None = None, **attrs):
    prefix, name = tag.split(":")
    el = etree.SubElement(parent, f"{{{NS[prefix]}}}{name}", **attrs)
    if text is not None:
        el.text = text
    return el


def _date(parent, tag: str, d: date):
    wrapper = _el(parent, tag)
    _el(wrapper, "udt:DateTimeString", d.strftime("%Y%m%d"), format="102")


def _amount(v: Decimal) -> str:
    return f"{money(v):.2f}"


def _clean(v: str) -> str:
    return " ".join((v or "").split())


def _address(parent, info: dict):
    addr = _el(parent, "ram:PostalTradeAddress")
    if info.get("postal_code"):
        _el(addr, "ram:PostcodeCode", info["postal_code"])
    if info.get("address_line1"):
        _el(addr, "ram:LineOne", _clean(info["address_line1"]))
    if info.get("address_line2"):
        _el(addr, "ram:LineTwo", _clean(info["address_line2"]))
    if info.get("city"):
        _el(addr, "ram:CityName", info["city"])
    _el(addr, "ram:CountryID", (info.get("country") or "FR").upper())


def build_invoice_xml(
    invoice, seller: dict, client: dict, quote_number: str | None = None, origin=None
) -> bytes:
    """`invoice` : objet Invoice émis (numéro attribué). `seller`/`client` : snapshots figés.

    `quote_number` : devis d'origine éventuel. `origin` : facture d'origine pour un avoir.
    """
    franchise = invoice.vat_franchise
    inv_cfg = seller.get("invoicing", {})
    bank = seller.get("bank", {})

    root = etree.Element(f"{{{NS['rsm']}}}CrossIndustryInvoice", nsmap=NS)

    # --- Contexte
    ctx = _el(root, "rsm:ExchangedDocumentContext")
    bp = _el(ctx, "ram:BusinessProcessSpecifiedDocumentContextParameter")
    _el(bp, "ram:ID", BUSINESS_PROCESS.get(invoice.operation_category, "S1"))
    guideline = _el(ctx, "ram:GuidelineSpecifiedDocumentContextParameter")
    _el(guideline, "ram:ID", "urn:cen.eu:en16931:2017")

    # --- En-tête du document
    doc = _el(root, "rsm:ExchangedDocument")
    _el(doc, "ram:ID", invoice.number)
    _el(doc, "ram:TypeCode", "381" if invoice.kind == "credit_note" else "380")
    _date(doc, "ram:IssueDateTime", invoice.issue_date)
    notes: list[tuple[str, str]] = []
    if invoice.title:
        notes.append((invoice.title, ""))
    if invoice.notes:
        notes.append((invoice.notes, ""))
    if franchise:
        notes.append((inv_cfg.get("vat_franchise_mention", ""), "AAI"))
    notes.append((inv_cfg.get("late_penalty_text", ""), "PMD"))
    notes.append((inv_cfg.get("recovery_fee_text", ""), "PMT"))
    notes.append((inv_cfg.get("discount_text", ""), "AAB"))
    for content, subject in notes:
        if not content:
            continue
        note = _el(doc, "ram:IncludedNote")
        _el(note, "ram:Content", content)
        if subject:
            _el(note, "ram:SubjectCode", subject)

    trade = _el(root, "rsm:SupplyChainTradeTransaction")

    # --- Lignes
    for idx, line in enumerate(invoice.lines, start=1):
        item = _el(trade, "ram:IncludedSupplyChainTradeLineItem")
        assoc = _el(item, "ram:AssociatedDocumentLineDocument")
        _el(assoc, "ram:LineID", str(idx))
        product = _el(item, "ram:SpecifiedTradeProduct")
        _el(product, "ram:Name", _clean(line["description"])[:500])
        if line.get("details"):
            _el(product, "ram:Description", line["details"])
        agreement = _el(item, "ram:SpecifiedLineTradeAgreement")
        net = _el(agreement, "ram:NetPriceProductTradePrice")
        _el(net, "ram:ChargeAmount", str(Decimal(line["unit_price"])))
        delivery = _el(item, "ram:SpecifiedLineTradeDelivery")
        _el(delivery, "ram:BilledQuantity", str(Decimal(line["quantity"])), unitCode=unit_code(line.get("unit", "")))
        settlement = _el(item, "ram:SpecifiedLineTradeSettlement")
        tax = _el(settlement, "ram:ApplicableTradeTax")
        _el(tax, "ram:TypeCode", "VAT")
        _el(tax, "ram:CategoryCode", "E" if franchise else ("S" if Decimal(line["vat_rate"]) > 0 else "Z"))
        _el(tax, "ram:RateApplicablePercent", str(Decimal(line["vat_rate"])))
        summ = _el(settlement, "ram:SpecifiedTradeSettlementLineMonetarySummation")
        _el(summ, "ram:LineTotalAmount", _amount(Decimal(line["total_ht"])))

    # --- Accord commercial (parties)
    agreement = _el(trade, "ram:ApplicableHeaderTradeAgreement")
    buyer_ref = client.get("siret") or client.get("siren")
    if buyer_ref:
        _el(agreement, "ram:BuyerReference", buyer_ref)

    seller_party = _el(agreement, "ram:SellerTradeParty")
    _el(seller_party, "ram:Name", seller.get("name", ""))
    if seller.get("legal_form"):
        _el(seller_party, "ram:Description", seller["legal_form"])
    if seller.get("siren"):
        legal = _el(seller_party, "ram:SpecifiedLegalOrganization")
        _el(legal, "ram:ID", seller["siren"], schemeID="0002")
    _address(seller_party, seller)
    if seller.get("siren"):
        uri = _el(seller_party, "ram:URIUniversalCommunication")
        _el(uri, "ram:URIID", seller["siren"], schemeID="0225")
    elif seller.get("email"):
        uri = _el(seller_party, "ram:URIUniversalCommunication")
        _el(uri, "ram:URIID", seller["email"], schemeID="EM")
    if seller.get("vat_number"):
        reg = _el(seller_party, "ram:SpecifiedTaxRegistration")
        _el(reg, "ram:ID", seller["vat_number"].replace(" ", ""), schemeID="VA")
    elif seller.get("siren"):
        # Sans n° de TVA : identifiant fiscal (BT-32), exigé par BR-E-02 en franchise.
        reg = _el(seller_party, "ram:SpecifiedTaxRegistration")
        _el(reg, "ram:ID", seller["siren"], schemeID="FC")

    buyer_party = _el(agreement, "ram:BuyerTradeParty")
    _el(buyer_party, "ram:Name", client.get("name", ""))
    if client.get("siren"):
        legal = _el(buyer_party, "ram:SpecifiedLegalOrganization")
        _el(legal, "ram:ID", client["siren"], schemeID="0002")
    if client.get("contact_name"):
        contact = _el(buyer_party, "ram:DefinedTradeContact")
        _el(contact, "ram:PersonName", client["contact_name"])
    _address(buyer_party, client)
    if client.get("siren"):
        uri = _el(buyer_party, "ram:URIUniversalCommunication")
        _el(uri, "ram:URIID", client["siren"], schemeID="0225")
    elif client.get("email"):
        uri = _el(buyer_party, "ram:URIUniversalCommunication")
        _el(uri, "ram:URIID", client["email"], schemeID="EM")
    if client.get("vat_number"):
        reg = _el(buyer_party, "ram:SpecifiedTaxRegistration")
        _el(reg, "ram:ID", client["vat_number"], schemeID="VA")

    if quote_number:
        order = _el(agreement, "ram:BuyerOrderReferencedDocument")
        _el(order, "ram:IssuerAssignedID", quote_number)

    # --- Livraison
    delivery = _el(trade, "ram:ApplicableHeaderTradeDelivery")
    event = _el(delivery, "ram:ActualDeliverySupplyChainEvent")
    _date(event, "ram:OccurrenceDateTime", invoice.service_end or invoice.issue_date)

    # --- Règlement
    settlement = _el(trade, "ram:ApplicableHeaderTradeSettlement")
    _el(settlement, "ram:PaymentReference", invoice.number)
    _el(settlement, "ram:InvoiceCurrencyCode", "EUR")
    iban = (bank.get("iban") or "").replace(" ", "")
    if iban and invoice.kind != "credit_note":
        means = _el(settlement, "ram:SpecifiedTradeSettlementPaymentMeans")
        _el(means, "ram:TypeCode", "58")  # virement SEPA
        account = _el(means, "ram:PayeePartyCreditorFinancialAccount")
        _el(account, "ram:IBANID", iban)
        if bank.get("bic"):
            inst = _el(means, "ram:PayeeSpecifiedCreditorFinancialInstitution")
            _el(inst, "ram:BICID", bank["bic"].replace(" ", ""))

    for group in vat_breakdown(invoice.lines):
        tax = _el(settlement, "ram:ApplicableTradeTax")
        _el(tax, "ram:CalculatedAmount", _amount(group["vat"]))
        _el(tax, "ram:TypeCode", "VAT")
        if franchise:
            _el(tax, "ram:ExemptionReason", inv_cfg.get("vat_franchise_mention", "TVA non applicable, art. 293 B du CGI"))
        _el(tax, "ram:BasisAmount", _amount(group["base"]))
        category = "E" if franchise else ("S" if group["rate"] > 0 else "Z")
        _el(tax, "ram:CategoryCode", category)
        if franchise:
            _el(tax, "ram:ExemptionReasonCode", FRANCHISE_EXEMPTION_CODE)
        _el(tax, "ram:RateApplicablePercent", str(group["rate"]))

    if invoice.service_start and invoice.service_end:
        period = _el(settlement, "ram:BillingSpecifiedPeriod")
        _date(period, "ram:StartDateTime", invoice.service_start)
        _date(period, "ram:EndDateTime", invoice.service_end)

    terms = _el(settlement, "ram:SpecifiedTradePaymentTerms")
    if invoice.kind != "credit_note":
        _el(terms, "ram:Description", f"Paiement au plus tard le {invoice.due_date.strftime('%d/%m/%Y')}")
    else:
        _el(terms, "ram:Description", "Avoir : aucun paiement à effectuer")
    _date(terms, "ram:DueDateDateTime", invoice.due_date)

    summ = _el(settlement, "ram:SpecifiedTradeSettlementHeaderMonetarySummation")
    _el(summ, "ram:LineTotalAmount", _amount(invoice.total_ht))
    _el(summ, "ram:TaxBasisTotalAmount", _amount(invoice.total_ht))
    _el(summ, "ram:TaxTotalAmount", _amount(invoice.total_vat), currencyID="EUR")
    _el(summ, "ram:GrandTotalAmount", _amount(invoice.total_ttc))
    _el(summ, "ram:DuePayableAmount", _amount(invoice.total_ttc))

    if invoice.kind == "credit_note" and origin is not None and origin.number:
        ref = _el(settlement, "ram:InvoiceReferencedDocument")
        _el(ref, "ram:IssuerAssignedID", origin.number)
        fmt = _el(ref, "ram:FormattedIssueDateTime")
        _el(fmt, "qdt:DateTimeString", origin.issue_date.strftime("%Y%m%d"), format="102")

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)
