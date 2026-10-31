# ---------- Étape 1 : compilation du front React ----------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Étape 2 : API FastAPI + front compilé ----------
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    TZ=Europe/Paris

# Bibliothèques nécessaires à WeasyPrint (génération des PDF) + polices
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
        fonts-inter fonts-dejavu-core tzdata curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /build/dist ./frontend/dist
ENV FRONTEND_DIST=/app/frontend/dist

RUN useradd --create-home --uid 1000 app && mkdir -p /data && chown app:app /data
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

# Un seul worker : le planificateur des factures récurrentes tourne dans le processus.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
