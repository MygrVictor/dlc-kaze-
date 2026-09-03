#!/bin/bash
# Déploiement en production sur o2switch (hébergement mutualisé, CloudLinux + Passenger).
#
# Pourquoi ce script existe : sur cPanel, la commande `npm` du PATH est un
# wrapper qui injecte silencieusement `--prefix ~/nodevenv/<app>/<version>/lib`.
# Résultat, `npm install` lancé depuis le dépôt n'installe rien d'utile et
# répond « up to date, audited 1 package » — ce qui a déjà coûté plusieurs
# heures. On appelle donc directement le binaire réel de npm en forçant le
# préfixe sur le dépôt.
#
# Usage :  bash scripts/deploy-o2switch.sh

set -euo pipefail

RACINE="/home/ficl7064/dlc-kaze"
NPM_REEL="/opt/alt/alt-nodejs22/root/usr/lib/node_modules/npm/bin/npm-cli.js"
NODE_ENV_ACTIVATE="/home/ficl7064/nodevenv/dlc-kaze/22/bin/activate"
SAUVEGARDES="/home/ficl7064/backups/dlc-kaze"

etape() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }

# L'environnement virtuel fournit le bon `node` (v22) ; sans lui, le node
# système est trop ancien et l'application refuse de démarrer.
# shellcheck disable=SC1090
source "$NODE_ENV_ACTIVATE"
cd "$RACINE"

etape "Sauvegarde de la base"
mkdir -p "$SAUVEGARDES"
URL_BDD="$(grep '^DATABASE_URL=' "$RACINE/.env" | cut -d= -f2-)"
FICHIER_SQL="$SAUVEGARDES/dlc-kaze-$(date +%F-%H%M).sql.gz"
pg_dump "$URL_BDD" | gzip > "$FICHIER_SQL"
echo "→ $FICHIER_SQL ($(du -h "$FICHIER_SQL" | cut -f1))"

etape "Récupération du code"
git pull --ff-only

etape "Installation des dépendances de production"
# --omit=dev : ni Jest ni Vite ne servent en production, et les installer
# ferait exploser le quota d'inodes du mutualisé.
node "$NPM_REEL" install --omit=dev --prefix "$RACINE"
echo "→ $(ls "$RACINE/node_modules" | wc -l) paquets présents"

etape "Migrations de base de données"
# Chaque migration est idempotente (IF NOT EXISTS), la rejouer est sans risque.
node server/src/db/migrate.js
node server/src/db/migrate-demande-documents.js
node server/src/db/migrate-password-reset.js

etape "Vérification du démarrage"
# On lance l'application quelques secondes : mieux vaut détecter ici un module
# manquant qu'après le redémarrage, quand le site est déjà hors ligne.
timeout 8s node server/src/index.js > /tmp/dlc-demarrage.log 2>&1 || true
if grep -q "Serveur DLC-Kaze démarré" /tmp/dlc-demarrage.log; then
  echo "→ démarrage OK"
else
  echo "✖ échec du démarrage :"
  cat /tmp/dlc-demarrage.log
  exit 1
fi

etape "Redémarrage de Passenger"
# Passenger surveille ce fichier : le toucher suffit à recharger l'application
# sans passer par l'interface cPanel.
mkdir -p "$RACINE/tmp"
touch "$RACINE/tmp/restart.txt"
sleep 5

etape "Contrôle en ligne"
CODE="$(curl -s -o /dev/null -w '%{http_code}' https://www.drivelineconnect.com/api/health)"
if [ "$CODE" = "200" ]; then
  printf "\n\033[1;32m✓ Déploiement terminé — le site répond 200.\033[0m\n"
else
  printf "\n\033[1;31m✖ Le site répond %s. Vérifie ~/logs/dlc-kaze.log\033[0m\n" "$CODE"
  exit 1
fi
