#!/bin/sh
# Démarre en root uniquement pour corriger les droits du volume de données
# (Docker crée ./data en root s'il n'existe pas), puis lance l'application
# avec l'utilisateur non privilégié « app » (uid/gid modifiables via PUID/PGID).
set -e

DATA_DIR="${DATA_DIR:-/data}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    if [ "$(stat -c %u "$DATA_DIR")" != "$PUID" ] || [ "$(stat -c %g "$DATA_DIR")" != "$PGID" ]; then
        echo "Correction des droits de $DATA_DIR (uid $PUID, gid $PGID)"
        chown -R "$PUID:$PGID" "$DATA_DIR"
    fi
    exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi

if [ ! -w "$DATA_DIR" ]; then
    echo "ERREUR : $DATA_DIR n'est pas accessible en écriture pour l'uid $(id -u)." >&2
    echo "Corrige avec : sudo chown -R $(id -u):$(id -g) ./data" >&2
    exit 1
fi
exec "$@"
