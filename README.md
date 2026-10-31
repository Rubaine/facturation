# Facturation

Plateforme perso de **devis**, **factures** et **facturation récurrente** pour micro-entreprise, avec génération de
**factures électroniques Factur-X** conformes à la norme EN 16931 et aux règles françaises de la réforme.

- **Front** : React + TypeScript + Vite + Tailwind CSS
- **Back** : Python FastAPI + SQLite (SQLAlchemy / Alembic)
- **PDF** : WeasyPrint (PDF/A-3) + XML Factur-X embarqué (bibliothèque `factur-x`)
- **Mails** : SMTP (Gmail avec mot de passe d'application)
- **Tâches automatiques** : APScheduler (factures récurrentes chaque matin, sauvegarde quotidienne de la base)

## Fonctionnalités

| | |
|---|---|
| **Clients** | Pros et particuliers, SIREN/SIRET, emails en copie, archivage, historique et totaux par client |
| **Devis** | Brouillon → finalisé (numéroté) → envoyé par mail → accepté / refusé → transformé en facture en 1 clic. Le client peut **accepter en ligne** via un lien (sans compte) et tu reçois un mail. |
| **Factures** | Brouillon → émise (numéro définitif + PDF Factur-X archivé, non modifiable) → envoyée → payée. Relances, duplication, **avoirs** pour annuler/corriger, téléchargement du XML. |
| **Récurrences** | Modèle par client (mensuel, trimestriel, annuel…), objet dynamique (`Hébergement - {Mois} {annee}`), période facturée, génération + émission + **envoi automatique** le jour J, rattrapage si le serveur était éteint. |
| **Tableau de bord** | CA encaissé / facturé par mois, impayés, retards, devis en attente, progression vers les seuils (franchise TVA, plafond micro). |
| **Paramètres** | Infos entreprise, IBAN, logo, mentions légales, formats de numérotation et compteurs, modèles de mails, test d'envoi. |

### Règles légales intégrées

- Numérotation **continue et chronologique** : le numéro n'est attribué qu'à l'émission, une date d'émission ne peut pas
  être antérieure à celle de la dernière facture, une facture émise ne peut être ni modifiée ni supprimée (→ avoir).
- Mentions obligatoires : « EI », SIRET, « TVA non applicable, art. 293 B du CGI », pénalités de retard, indemnité
  forfaitaire de 40 €, escompte, date d'échéance.
- Nouvelles mentions de la réforme (sept. 2026) : **SIREN du client**, **catégorie d'opération** (prestation de services /
  livraison de biens / mixte), période de facturation.
- Les infos vendeur et client sont **figées** sur chaque document émis (un changement d'adresse ne modifie pas les
  anciennes factures).
- Numérotation de départ : la prochaine facture est **26-MM-14** (suite de Henrri, dernière facture : 26-10-13).
  Format `{AA}-{MM}-{N}` modifiable dans Paramètres → Numérotation.

## Facturation électronique : où on en est

| Date | Obligation pour une micro-entreprise |
|---|---|
| **1er sept. 2026** | Pouvoir **recevoir** des factures électroniques → il faut un compte sur une **plateforme agréée (PA)**. |
| **1er sept. 2027** | **Émettre** les factures B2B en électronique via une PA, et faire l'**e-reporting** des ventes aux particuliers. |

Ce que fait l'application **aujourd'hui** :

- Chaque facture/avoir émis est un **PDF Factur-X** (profil EN 16931) : PDF lisible + XML structuré embarqué. C'est l'un
  des 3 formats officiels de la réforme. Le XML contient la catégorie d'opération (`S1`/`B1`/`M1`), le motif
  d'exonération `VATEX-FR-FRANCHISE`, les identifiants SIREN (schéma 0002/0225), l'IBAN, etc.
- Les documents ont été validés avec les schémas XSD Factur-X, le **schematron EN 16931** et le **schematron
  BR-FR** (règles françaises) : 0 erreur (voir `backend/scripts/validate_facturx.py`).
- Jusqu'en septembre 2027, l'envoi du PDF par mail reste légal.

**Prochaine étape (avant sept. 2027)** : brancher l'application sur l'API d'une plateforme agréée (ex. Super PDP, Tiime,
B2Brouter…) pour que les factures B2B passent par le circuit officiel. L'architecture est prête : le XML est déjà
généré et archivé pour chaque facture (`data/documents/factures/AAAA/*.xml`).

**À faire de ton côté dès maintenant** : ouvrir un compte (gratuit) sur une plateforme agréée pour la **réception**.

## Développement local

Prérequis : Python 3.12+, Node 20+, et les bibliothèques de WeasyPrint (`libpango` — déjà présentes sur la plupart des
Linux ; sur macOS : `brew install pango`).

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ADMIN_PASSWORD=test uvicorn app.main:app --reload --port 8000

# Front (autre terminal) — http://localhost:5173 (proxy /api → :8000)
cd frontend
npm install
npm run dev
```

Sans configuration SMTP, les mails sont écrits dans `backend/data/outbox/*.eml` au lieu d'être envoyés : pratique pour
tester. L'API est documentée sur http://localhost:8000/api/docs.

Tests :

```bash
cd backend && python -m pytest -q          # tests API, numérotation, Factur-X, récurrences
cd frontend && npm run build               # vérification TypeScript + build
```

Valider une facture Factur-X (XSD + schematron EN 16931 + BR-FR) :

```bash
cd backend
pip install saxonche
python scripts/generate_samples.py /tmp/exemples
python scripts/validate_facturx.py /tmp/exemples/*.pdf
```

## Déploiement sur le VPS (Docker)

```bash
git clone https://github.com/Rubaine/facturation.git
cd facturation
cp .env.example .env
nano .env        # ADMIN_PASSWORD, SECRET_KEY (openssl rand -hex 32), PUBLIC_URL, SMTP_PASSWORD
docker compose up -d --build
```

L'application écoute sur `127.0.0.1:8000`. Mets-la derrière ton reverse proxy en HTTPS, par exemple :

**Nginx**

```nginx
server {
    server_name factures.mondomaine.fr;
    client_max_body_size 5m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # + certificat (certbot --nginx -d factures.mondomaine.fr)
}
```

**Caddy**

```
factures.mondomaine.fr {
    reverse_proxy 127.0.0.1:8000
}
```

**Traefik** : retire la section `ports` du `docker-compose.yml`, ajoute le conteneur au réseau de Traefik et les labels
habituels (`traefik.http.routers.facturation.rule=Host(...)`, port de service `8000`).

Mise à jour :

```bash
git pull && docker compose up -d --build
```

Le schéma de la base est mis à jour automatiquement au démarrage (Alembic).

### Gmail : mot de passe d'application

1. Active la validation en 2 étapes sur le compte Google.
2. Va sur https://myaccount.google.com/apppasswords, crée un mot de passe pour « Facturation ».
3. Mets-le dans `.env` (`SMTP_PASSWORD=xxxx xxxx xxxx xxxx`, les espaces sont acceptés) puis
   `docker compose up -d`.
4. Dans l'application : Paramètres → Emails → « Tester ».

Gmail limite l'envoi à ~500 mails/jour, largement suffisant. Chaque mail client t'est envoyé en copie cachée
(`SMTP_BCC_SELF`).

### Sauvegardes

Tout est dans le dossier `data/` :

- `facturation.sqlite3` : la base
- `documents/` : les PDF et XML émis (**à conserver 10 ans**, obligation légale)
- `backups/` : copie quotidienne automatique de la base (3h30, 30 dernières conservées)

Pense à sauvegarder `data/` hors du VPS (rsync, rclone vers un cloud, snapshot…), par exemple :

```bash
rsync -a --delete user@vps:~/facturation/data/ ~/sauvegardes/facturation/
```

## Structure

```
backend/
  app/
    main.py              # application FastAPI (API + front compilé)
    models.py            # tables SQLAlchemy
    routers/             # clients, devis, factures, récurrences, paramètres, tableau de bord
    services/
      documents.py       # émission, avoirs, conversion devis → facture, envois
      facturx_xml.py     # génération du XML CII EN 16931
      pdf.py             # rendu HTML → PDF/A-3 + Factur-X
      recurring.py       # génération des factures récurrentes
      scheduler.py       # tâches quotidiennes
      mailer.py          # SMTP / outbox
      numbering.py       # numérotation
    templates/pdf/       # modèle HTML des documents
    alembic/             # migrations de la base
  scripts/               # génération d'exemples, validation Factur-X
  tests/
frontend/
  src/pages/             # écrans
  src/components/        # composants UI
```
