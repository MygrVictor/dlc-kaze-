#!/usr/bin/env bash
# Sauvegarde quotidienne de la base PostgreSQL.
#
# Cron o2switch (tous les jours à 3 h 15) :
#   15 3 * * * /home/ficl7064/dlc-kaze/scripts/backup-db.sh >> /home/ficl7064/logs/backup-db.log 2>&1
#
# Restauration :
#   gunzip -c dlc-kaze-2026-08-21.sql.gz | psql "$DATABASE_URL"

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="${BACKUP_DIR:-$HOME/backups/dlc-kaze}"
RETENTION_JOURS="${BACKUP_RETENTION_DAYS:-14}"

# Charge DATABASE_URL depuis .env sans exporter tout le fichier.
if [[ -z "${DATABASE_URL:-}" && -f "$RACINE/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$RACINE/.env" | head -1 | cut -d= -f2-)"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[$(date '+%F %T')] ERREUR : DATABASE_URL introuvable." >&2
  exit 1
fi

mkdir -p "$DESTINATION"
ARCHIVE="$DESTINATION/dlc-kaze-$(date '+%Y-%m-%d').sql.gz"

echo "[$(date '+%F %T')] Sauvegarde vers $ARCHIVE"

# --clean --if-exists rend le dump rejouable sur une base existante.
pg_dump --no-owner --no-privileges --clean --if-exists "$DATABASE_URL" \
  | gzip -9 > "$ARCHIVE.partiel"

mv "$ARCHIVE.partiel" "$ARCHIVE"

TAILLE="$(du -h "$ARCHIVE" | cut -f1)"
echo "[$(date '+%F %T')] Terminé ($TAILLE)"

# Purge des archives plus anciennes que la rétention.
SUPPRIMES="$(find "$DESTINATION" -name 'dlc-kaze-*.sql.gz' -type f -mtime "+$RETENTION_JOURS" -print -delete | wc -l | tr -d ' ')"
if [[ "$SUPPRIMES" != "0" ]]; then
  echo "[$(date '+%F %T')] $SUPPRIMES archive(s) purgée(s) (> $RETENTION_JOURS jours)"
fi
