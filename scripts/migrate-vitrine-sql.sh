#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Applique les migrations SQL du lot « site vitrine ».
#
#   bash scripts/migrate-vitrine-sql.sh
#
# Ne dépend que de psql : les scripts Node équivalents ont besoin de
# `dotenv` et `pg`, absents de l'arborescence npm sur l'hébergement
# mutualisé. psql est lui déjà utilisé par les sauvegardes.
#
# Idempotent : rejouable sans effet de bord.
# ══════════════════════════════════════════════════════════════

set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_SQL="$RACINE/server/src/db/sql/vitrine.sql"

if [[ ! -f "$FICHIER_SQL" ]]; then
  echo "❌ Fichier SQL introuvable : $FICHIER_SQL" >&2
  exit 1
fi

# Même lecture que backup-db.sh : on extrait la seule variable utile
# plutôt que d'exporter tout le fichier.
if [[ -z "${DATABASE_URL:-}" && -f "$RACINE/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$RACINE/.env" | head -1 | cut -d= -f2-)"
  # Une valeur entre guillemets dans le .env ne doit pas être passée
  # telle quelle à psql.
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"
  DATABASE_URL="${DATABASE_URL#\'}"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL introuvable (ni dans l'environnement, ni dans .env)." >&2
  exit 1
fi

if ! command -v psql > /dev/null 2>&1; then
  echo "❌ psql introuvable." >&2
  exit 1
fi

echo "🗄️  Application des migrations du lot vitrine…"

# ON_ERROR_STOP : sans lui, psql poursuit après une erreur et renvoie
# un code de succès, masquant une migration partiellement appliquée.
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "$FICHIER_SQL"

echo ""
echo "✅ Migrations appliquées."
echo "   Les cinq colonnes listées ci-dessus doivent être présentes :"
echo "   job_title, rc_circulation, rc_pro, siret, w_garage"
