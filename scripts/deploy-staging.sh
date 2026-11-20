#!/bin/bash
# Déploiement sur le STAGING (o2switch, ~/dlc-kaze-staging).
#
# Même déroulé que scripts/deploy-o2switch.sh — sauvegarde, code,
# dépendances, front, migrations, démarrage d'essai, redémarrage, contrôle
# en ligne — avec trois différences :
#
#   1. On choisit la branche à déployer. Le staging sert à essayer des
#      branches `staging/*` avant leur fusion dans `main`.
#   2. Des garde-fous refusent de toucher à la prod : mauvais dossier,
#      `.env` sans STAGING_MODE, ou base de données qui ressemble à
#      celle de la prod.
#   3. Aucun chemin ni URL de prod écrit en dur : tout vient du `.env`
#      du staging.
#
# Usage :
#   bash scripts/deploy-staging.sh                      # branche courante
#   bash scripts/deploy-staging.sh staging/ux-refonte   # autre branche
#
# Premier déploiement d'une branche qui ne contient pas encore ce script :
#   cd ~/dlc-kaze-staging && git fetch origin \
#     && git show origin/main:scripts/deploy-staging.sh > /tmp/deploy-staging.sh \
#     && bash /tmp/deploy-staging.sh staging/ma-branche

set -euo pipefail

# ── Copie de travail du script ───────────────────────────────
# Bash lit son script au fil de l'exécution. Changer de branche peut
# modifier ce fichier, voire le faire disparaître si la branche visée
# ne le contient pas : la suite serait lue de travers, ou plus du tout.
# On s'exécute donc toujours depuis une copie hors du dépôt.
if [ -z "${DEPLOIEMENT_STAGING_COPIE:-}" ]; then
  COPIE="$(mktemp /tmp/deploy-staging.XXXXXX)"
  cp "$0" "$COPIE"
  DEPLOIEMENT_STAGING_COPIE=1 exec bash "$COPIE" "$@"
fi

RACINE="${STAGING_RACINE:-/home/ficl7064/dlc-kaze-staging}"
RACINE_PROD="/home/ficl7064/dlc-kaze"
NPM_REEL="/opt/alt/alt-nodejs22/root/usr/lib/node_modules/npm/bin/npm-cli.js"
# Environnement Node créé par cPanel (« Setup Node.js App ») pour
# l'application de staging. Surchargeable si cPanel l'a nommé autrement.
NODE_ENV_ACTIVATE="${STAGING_NODE_ACTIVATE:-/home/ficl7064/nodevenv/dlc-kaze-staging/22/bin/activate}"
SAUVEGARDES="/home/ficl7064/backups/dlc-kaze-staging"
BRANCHE_DEMANDEE="${1:-}"

etape() { printf "\n\033[1;35m▸ [STAGING] %s\033[0m\n" "$1"; }
echec() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1"; exit 1; }

# Valeur d'une variable du .env, guillemets retirés.
lire_env() {
  grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//'
}

# ── Garde-fous : ce script ne doit jamais toucher la prod ────
etape "Vérifications de sécurité"

[ -d "$RACINE/.git" ] || echec "$RACINE n'est pas un dépôt Git."

RACINE_REELLE="$(cd "$RACINE" && pwd -P)"
PROD_REELLE="$(cd "$RACINE_PROD" 2>/dev/null && pwd -P || echo "")"
if [ -n "$PROD_REELLE" ] && [ "$RACINE_REELLE" = "$PROD_REELLE" ]; then
  echec "Le dossier visé est celui de la PRODUCTION. Abandon."
fi

ENV_STAGING="$RACINE/.env"
[ -f "$ENV_STAGING" ] || echec "Pas de .env dans $RACINE (voir .env.staging.example)."

[ "$(lire_env STAGING_MODE "$ENV_STAGING")" = "true" ] ||
  echec "STAGING_MODE=true absent du .env : ce n'est pas un environnement de staging."

URL_BDD="$(lire_env DATABASE_URL "$ENV_STAGING")"
[ -n "$URL_BDD" ] || echec "DATABASE_URL vide dans le .env du staging."

# Le nom de la base (dernier segment de l'URL, sans paramètres) doit
# désigner le staging, et en aucun cas celle de la prod.
NOM_BDD="$(printf '%s' "$URL_BDD" | sed -E 's#.*/##; s#\?.*##')"
case "$NOM_BDD" in
  *staging*) ;;
  *) echec "La base « $NOM_BDD » ne porte pas « staging » dans son nom. Abandon." ;;
esac
if [ -f "$RACINE_PROD/.env" ]; then
  URL_BDD_PROD="$(lire_env DATABASE_URL "$RACINE_PROD/.env")"
  [ "$URL_BDD" != "$URL_BDD_PROD" ] ||
    echec "Le staging pointe sur la base de PRODUCTION. Abandon."
  [ "$(lire_env JWT_SECRET "$ENV_STAGING")" != "$(lire_env JWT_SECRET "$RACINE_PROD/.env")" ] ||
    echec "Le staging utilise le même JWT_SECRET que la prod. Abandon."
fi

case "$(lire_env KAZE_DISABLED "$ENV_STAGING")" in
  1|true|yes|oui) ;;
  *) echec "KAZE_DISABLED=true absent : le staging pourrait écrire dans Kaze. Abandon." ;;
esac

URL_STAGING="$(lire_env CLIENT_URL "$ENV_STAGING")"
case "$URL_STAGING" in
  https://staging.*) ;;
  *) echec "CLIENT_URL (« $URL_STAGING ») n'est pas une adresse staging.* ." ;;
esac
echo "→ dossier $RACINE, base $NOM_BDD, site $URL_STAGING"

# L'environnement virtuel fournit le bon `node` (v22). `set -u` est levé
# le temps du chargement : le script généré par cPanel lit une variable
# avant de la définir (même défaut que pour la prod).
[ -f "$NODE_ENV_ACTIVATE" ] ||
  echec "Environnement Node introuvable : $NODE_ENV_ACTIVATE
  (définir STAGING_NODE_ACTIVATE avec le chemin affiché dans cPanel > Setup Node.js App)"
set +u
# shellcheck disable=SC1090
source "$NODE_ENV_ACTIVATE"
set -u
cd "$RACINE"

etape "Sauvegarde de la base de staging"
mkdir -p "$SAUVEGARDES"
FICHIER_SQL="$SAUVEGARDES/dlc-kaze-staging-$(date +%F-%H%M).sql.gz"
pg_dump "$URL_BDD" | gzip > "$FICHIER_SQL"
echo "→ $FICHIER_SQL ($(du -h "$FICHIER_SQL" | cut -f1))"

etape "Récupération du code"
# Le staging ne doit porter aucune modification locale : elles seraient
# écrasées par le changement de branche, ou l'empêcheraient.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  echec "Modifications locales dans $RACINE : à annuler ou commiter avant de déployer."
fi

git fetch --prune origin
BRANCHE="${BRANCHE_DEMANDEE:-$(git branch --show-current)}"
[ -n "$BRANCHE" ] || echec "Aucune branche indiquée et HEAD détachée."
git rev-parse --verify --quiet "origin/$BRANCHE" > /dev/null ||
  echec "La branche origin/$BRANCHE n'existe pas."

if [ "$(git branch --show-current)" != "$BRANCHE" ]; then
  git checkout "$BRANCHE" 2>/dev/null || git checkout -b "$BRANCHE" --track "origin/$BRANCHE"
fi

# Une branche de test peut être réécrite (rebase, force-push) : si
# l'avance rapide est impossible, on s'aligne sur GitHub. Sans risque
# ici, puisque l'absence de modifications locales vient d'être vérifiée.
if ! git merge --ff-only "origin/$BRANCHE" 2>/dev/null; then
  echo "→ historique réécrit sur GitHub : alignement sur origin/$BRANCHE"
  git reset --hard "origin/$BRANCHE"
fi
echo "→ $BRANCHE @ $(git log -1 --format='%h %s')"

etape "Installation des dépendances de production"
node "$NPM_REEL" install --omit=dev --prefix "$RACINE"
echo "→ $(ls "$RACINE/node_modules" | wc -l) paquets présents"

etape "Front (client/dist)"
# Même contrôle que la prod : le dist versionné ne doit pas être plus
# ancien que les sources du front (voir deploy-o2switch.sh).
[ -f "$RACINE/client/dist/index.html" ] ||
  echec "client/dist absent — buildez le front en local et poussez-le."
SRC_REV="$(git log -1 --format=%H HEAD -- client/src client/index.html)"
DIST_REV="$(git log -1 --format=%H HEAD -- client/dist)"
[ -n "$DIST_REV" ] || echec "client/dist absent de l'historique Git."
if [ "$(git show -s --format=%ct "$SRC_REV")" -gt "$(git show -s --format=%ct "$DIST_REV")" ]; then
  echec "client/dist est plus ancien que les sources du front.
  Rebuild en local puis commit/push le dist :
    (cd client && npm run build) && git add client/dist && git commit && git push"
fi
echo "→ client/dist présent et à jour"

etape "Migrations de base de données"
# La liste est relue dans le script de prod de la branche déployée : une
# migration ajoutée là s'applique aussi ici, sans liste à tenir en double.
# Les migrations lisent DATABASE_URL dans le .env du dépôt, donc celui du
# staging (vérifié plus haut).
MIGRATIONS="$(grep -E '^node server/src/db/migrate[a-z-]*\.js$' scripts/deploy-o2switch.sh || true)"
[ -n "$MIGRATIONS" ] || echec "Aucune migration trouvée dans scripts/deploy-o2switch.sh."
while IFS= read -r commande; do
  node "${commande#node }"
done <<< "$MIGRATIONS"

etape "Vérification du démarrage"
# PORT=0 : port libre au hasard, pour ne jamais entrer en collision avec
# l'application qui tourne déjà (prod ou staging).
JOURNAL="/tmp/dlc-staging-demarrage.log"
PORT=0 timeout 8s node server/src/index.js > "$JOURNAL" 2>&1 || true
if grep -q "Serveur DLC-Kaze démarré" "$JOURNAL"; then
  echo "→ démarrage OK"
else
  echo "✖ échec du démarrage :"
  cat "$JOURNAL"
  exit 1
fi

etape "Redémarrage de Passenger"
mkdir -p "$RACINE/tmp"
touch "$RACINE/tmp/restart.txt"
sleep 5

etape "Contrôle en ligne"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL_STAGING/api/health")"
if [ "$CODE" = "200" ]; then
  printf "\n\033[1;32m✓ Staging déployé — %s sur %s\033[0m\n" "$BRANCHE" "$URL_STAGING"
else
  printf "\n\033[1;31m✖ Le staging répond %s. Vérifie les journaux de l'application staging.\033[0m\n" "$CODE"
  exit 1
fi
