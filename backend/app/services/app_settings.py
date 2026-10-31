"""Paramètres modifiables depuis l'interface (stockés en base, clé unique 'app')."""

from decimal import Decimal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..models import AppSetting


class CompanySettings(BaseModel):
    name: str = "Ruben VIEIRA"
    legal_form: str = "EI"
    address_line1: str = "37 Rue de l'Orée du Bois"
    address_line2: str = ""
    postal_code: str = "60580"
    city: str = "Coye-la-Forêt"
    country: str = "FR"
    email: str = "vieira.ruben.fr@gmail.com"
    phone: str = ""
    website: str = ""
    siren: str = "942996745"
    siret: str = "94299674500025"
    ape: str = "62.01Z"
    # N° de TVA intracommunautaire. Même en franchise, il sert d'identifiant fiscal du vendeur
    # dans la facture électronique (règle EN 16931 BR-E-02).
    vat_number: str = "FR88942996745"
    registration: str = ""  # ex. « Dispensé d'immatriculation au RCS et au RM »
    logo_data_url: str = ""  # logo encodé en data URL (optionnel)


class BankSettings(BaseModel):
    bank_name: str = "Revolut Bank UAB"
    iban: str = "FR76 2823 3000 0106 5414 1606 818"
    bic: str = "REVOFRP2"


class InvoicingSettings(BaseModel):
    vat_franchise: bool = True
    vat_franchise_mention: str = "TVA non applicable, art. 293 B du CGI"
    default_vat_rate: Decimal = Decimal("20")
    payment_terms_days: int = 0
    payment_method_text: str = "Virement bancaire"
    late_penalty_text: str = (
        "Pénalités de retard : 3 fois le taux d'intérêt légal, exigibles dès le jour suivant "
        "la date d'échéance."
    )
    recovery_fee_text: str = (
        "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € "
        "(clients professionnels, art. L441-10 et D441-5 du Code de commerce)."
    )
    discount_text: str = "Escompte pour paiement anticipé : néant."
    footer_extra: str = ""
    quote_validity_days: int = 30
    quote_terms: str = (
        "Devis valable jusqu'à la date indiquée. Bon pour accord : date, signature et mention "
        "« Bon pour accord », ou acceptation en ligne."
    )
    default_operation_category: str = "services"
    default_unit: str = "unité"


class NumberingSettings(BaseModel):
    # Variables : {AAAA} année sur 4 chiffres, {AA} sur 2, {MM} mois, {N} numéro.
    invoice_pattern: str = "{AA}-{MM}-{N}"
    invoice_reset: str = "never"  # never | yearly | monthly
    invoice_padding: int = 2
    credit_note_pattern: str = "AV-{AA}-{MM}-{N}"
    credit_note_reset: str = "never"
    credit_note_padding: int = 2
    quote_pattern: str = "D-{AA}-{MM}-{N}"
    quote_reset: str = "never"
    quote_padding: int = 2


class EmailTemplate(BaseModel):
    subject: str
    body: str


SIGNATURE = "\n\nBien cordialement,\n{entreprise}"


def _default_emails() -> dict[str, EmailTemplate]:
    # Les coordonnées bancaires et le récapitulatif (n°, montant, échéance) sont ajoutés
    # automatiquement sous le message : inutile de les écrire ici.
    return {
        "invoice": EmailTemplate(
            subject="Facture {numero} - {titre}",
            body=(
                "Bonjour {client_contact},\n\nVeuillez trouver ci-joint la facture {numero} "
                "d'un montant de {montant}, à régler avant le {echeance}.\n\n"
                "Merci pour votre confiance." + SIGNATURE
            ),
        ),
        "credit_note": EmailTemplate(
            subject="Avoir {numero}",
            body=(
                "Bonjour {client_contact},\n\nVeuillez trouver ci-joint l'avoir {numero} "
                "d'un montant de {montant}, relatif à la facture {facture_origine}." + SIGNATURE
            ),
        ),
        "quote": EmailTemplate(
            subject="Devis {numero} - {titre}",
            body=(
                "Bonjour {client_contact},\n\nVeuillez trouver ci-joint le devis {numero} "
                "d'un montant de {montant}, valable jusqu'au {validite}.\n\n"
                "Vous pouvez le consulter et l'accepter en ligne grâce au lien ci-dessous.\n{lien}\n\n"
                "Je reste à votre disposition pour toute question." + SIGNATURE
            ),
        ),
        "reminder": EmailTemplate(
            subject="Relance : facture {numero} en attente de règlement",
            body=(
                "Bonjour {client_contact},\n\nSauf erreur de ma part, la facture {numero} "
                "d'un montant de {montant}, arrivée à échéance le {echeance}, n'a pas encore été "
                "réglée. Je vous la joins de nouveau.\n\nSi le paiement a déjà été effectué, "
                "merci de ne pas tenir compte de ce message." + SIGNATURE
            ),
        ),
    }


# Anciens modèles par défaut (v1) : remplacés automatiquement s'ils n'ont pas été personnalisés.
_OLD_SIGNATURE = "\n\nBien cordialement,\n{entreprise}\n{email_entreprise}"
_OLD_BANK = "Règlement par virement :\nIBAN : {iban}\nBIC : {bic}"
LEGACY_DEFAULT_BODIES = {
    "invoice": (
        "Bonjour {client_contact},\n\nVeuillez trouver ci-joint la facture {numero} "
        "d'un montant de {montant}, à régler avant le {echeance}.\n\n" + _OLD_BANK + _OLD_SIGNATURE
    ),
    "credit_note": (
        "Bonjour {client_contact},\n\nVeuillez trouver ci-joint l'avoir {numero} "
        "d'un montant de {montant}, relatif à la facture {facture_origine}." + _OLD_SIGNATURE
    ),
    "quote": (
        "Bonjour {client_contact},\n\nVeuillez trouver ci-joint le devis {numero} "
        "d'un montant de {montant}, valable jusqu'au {validite}.\n\n"
        "Vous pouvez le consulter et l'accepter en ligne ici :\n{lien}" + _OLD_SIGNATURE
    ),
    "reminder": (
        "Bonjour {client_contact},\n\nSauf erreur de ma part, la facture {numero} "
        "d'un montant de {montant}, arrivée à échéance le {echeance}, n'a pas encore été "
        "réglée. Je vous la joins de nouveau.\n\nSi le paiement a déjà été effectué, "
        "merci de ne pas tenir compte de ce message.\n\n" + _OLD_BANK + _OLD_SIGNATURE
    ),
}


class ThresholdSettings(BaseModel):
    # Seuils indicatifs affichés sur le tableau de bord (à ajuster si la loi change).
    vat_franchise_threshold: Decimal = Decimal("37500")
    micro_ceiling: Decimal = Decimal("77700")


class AppSettings(BaseModel):
    company: CompanySettings = Field(default_factory=CompanySettings)
    bank: BankSettings = Field(default_factory=BankSettings)
    invoicing: InvoicingSettings = Field(default_factory=InvoicingSettings)
    numbering: NumberingSettings = Field(default_factory=NumberingSettings)
    emails: dict[str, EmailTemplate] = Field(default_factory=_default_emails)
    thresholds: ThresholdSettings = Field(default_factory=ThresholdSettings)


KEY = "app"


def load_settings(db: Session) -> AppSettings:
    row = db.get(AppSetting, KEY)
    if row is None:
        return AppSettings()
    data = AppSettings.model_validate(row.value)
    # Complète les modèles manquants et met à jour les anciens modèles par défaut non personnalisés.
    for k, v in _default_emails().items():
        current = data.emails.get(k)
        if current is None or current.body == LEGACY_DEFAULT_BODIES.get(k):
            data.emails[k] = v
    return data


def save_settings(db: Session, settings: AppSettings) -> AppSettings:
    row = db.get(AppSetting, KEY)
    payload = settings.model_dump(mode="json")
    if row is None:
        db.add(AppSetting(key=KEY, value=payload))
    else:
        row.value = payload
    db.commit()
    return settings


def seller_snapshot(settings: AppSettings) -> dict:
    """Copie figée des infos vendeur, enregistrée sur chaque document émis."""
    return {
        **settings.company.model_dump(mode="json"),
        "bank": settings.bank.model_dump(mode="json"),
        "invoicing": settings.invoicing.model_dump(mode="json"),
    }
