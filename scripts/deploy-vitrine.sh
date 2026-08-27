#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Déploiement o2switch — lot « site vitrine »
#
# Usage (en SSH, depuis n'importe quel dossier) :
#   bash ~/dlc-kaze/scripts/deploy-vitrine.sh
#
# Le script est idempotent : le relancer après un échec reprend
# proprement, les migrations utilisant toutes `IF NOT EXISTS`.
#
# Il enchaîne : activation de Node, mise à jour du code, sauvegarde
# de la base, migrations, build du front, redémarrage Passenger.
# ══════════════════════════════════════════════════════════════

set -euo pipefail

RACINE="${DLC_RACINE:-$HOME/dlc-kaze}"

echo "══════════════════════════════════════════════"
echo " Déploiement DLC-Kaze — lot site vitrine"
echo "══════════════════════════════════════════════"

# ── 1. Vérifier le projet ────────────────────────────────────
if [[ ! -f "$RACINE/package.json" ]]; then
  echo "❌ Projet introuvable dans $RACINE" >&2
  echo "   Indiquez le bon chemin :" >&2
  echo "   DLC_RACINE=/home/USER/dossier bash $0" >&2
  exit 1
fi

cd "$RACINE"
echo "📁 Projet : $RACINE"

# ── 2. Activer Node ──────────────────────────────────────────
# Sur o2switch, Node vit dans un environnement virtuel cPanel qui
# n'est pas chargé par défaut en SSH : sans cette étape, `node` est
# introuvable. On ne l'active que s'il manque, pour rester compatible
# avec un shell déjà configuré.
if ! command -v node > /dev/null 2>&1; then
  ACTIVATION="$(ls -d "$HOME"/nodevenv/*/*/bin/activate 2>/dev/null | head -1 || true)"

  if [[ -z "$ACTIVATION" ]]; then
    echo "❌ Node introuvable et aucun environnement nodevenv détecté." >&2
    echo "   Ouvrez cPanel > Setup Node.js App et copiez la commande" >&2
    echo "   « Enter to the virtual environment », puis relancez ce script." >&2
    exit 1
  fi

  echo "🔧 Activation de Node : $ACTIVATION"
  # Le script d'activation cPanel lit des variables qu'il n'initialise pas
  # toujours (CL_VIRTUAL_ENV). Sous `set -u`, cette simple lecture avorte
  # le déploiement : on relâche le mode strict le temps de la source, puis
  # on le rétablit pour la suite, qui doit rester intransigeante.
  set +u
  # shellcheck disable=SC1090
  source "$ACTIVATION"
  set -u
  cd "$RACINE"
fi

echo "✅ Node $(node -v) · npm $(npm -v)"

# ── 3. Vérifier la configuration ─────────────────────────────
if [[ ! -f "$RACINE/.env" ]]; then
  echo "❌ Fichier .env absent à la racine du projet." >&2
  exit 1
fi

if ! grep -qE '^DATABASE_URL=.+' "$RACINE/.env"; then
  echo "❌ DATABASE_URL absent ou vide dans .env" >&2
  exit 1
fi

# SALES_EMAIL n'est pas bloquant : sans lui, les demandes continuent
# d'arriver à l'admin comme avant.
if ! grep -qE '^SALES_EMAIL=.+' "$RACINE/.env"; then
  echo "⚠️  SALES_EMAIL absent : les demandes clients iront à ADMIN_EMAIL."
  echo "    Ajoutez « SALES_EMAIL=quentin@… » pour les router vers Quentin."
fi

# ── 4. Récupérer le code ─────────────────────────────────────
if [[ -d "$RACINE/.git" ]]; then
  echo "📥 Récupération du code…"

  # npm réécrit parfois package.json sur le serveur pour y inscrire un
  # binaire natif propre à Linux : ces modifications feraient échouer la
  # fusion. On les met de côté le temps du pull, puis on les restaure —
  # les supprimer risquerait de casser une réinstallation ultérieure.
  REMISE=0
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "   Mise de côté des modifications locales…"
    git stash push --quiet --message "deploy-vitrine automatique"
    REMISE=1
  fi

  git pull --ff-only

  if [[ "$REMISE" -eq 1 ]]; then
    echo "   Restauration des modifications locales…"
    # Un conflit ici demande un arbitrage humain : mieux vaut s'arrêter
    # que déployer un package.json à moitié fusionné.
    if ! git stash pop; then
      echo "❌ Conflit lors de la restauration. Résolvez-le puis relancez." >&2
      exit 1
    fi
  fi
else
  echo "⚠️  Pas de dépôt git : code supposé déjà téléversé."
fi

# ── 5. Sauvegarder la base ───────────────────────────────────
# Avant toute migration : une colonne s'ajoute sans risque, mais une
# sauvegarde datée du jour évite d'avoir à le vérifier.
if [[ -x "$RACINE/scripts/backup-db.sh" ]]; then
  echo "💾 Sauvegarde de la base…"
  bash "$RACINE/scripts/backup-db.sh" || {
    echo "⚠️  Sauvegarde impossible (pg_dump absent ?)."
    read -r -p "    Continuer sans sauvegarde ? [o/N] " reponse
    [[ "$reponse" =~ ^[oO]$ ]] || exit 1
  }
fi

# ── 6. Dépendances ───────────────────────────────────────────
# `--include=dev` est indispensable : cPanel exporte NODE_ENV=production,
# ce qui transforme un `npm install` nu en `--omit=dev` et élague les
# outils nécessaires au build du front. On force donc l'installation
# complète, quel que soit l'environnement hérité du shell.
echo "📦 Installation des dépendances…"
npm install --include=dev

# Un élagage mal venu laisse une arborescence incomplète sans que npm ne
# renvoie d'erreur : on vérifie avant d'aller plus loin, car la panne se
# manifesterait sinon au milieu des migrations.
echo "🔍 Vérification des dépendances…"
for MODULE in dotenv pg express; do
  if ! node -e "require.resolve('$MODULE')" > /dev/null 2>&1; then
    echo "❌ Module « $MODULE » introuvable après installation." >&2
    echo "   Tentez une réinstallation propre :" >&2
    echo "     rm -rf node_modules server/node_modules client/node_modules" >&2
    echo "     npm install --include=dev" >&2
    exit 1
  fi
done
echo "✅ Dépendances complètes."

# ── 7. Migrations ────────────────────────────────────────────
# job_title : champ « poste » du formulaire de rappel.
# qualification : SIRET, RC Circulation, RC Pro, W garage.
echo "🗄️  Migrations…"
npm run db:migrate:vitrine

# ── 8. Build du front ────────────────────────────────────────
echo "🏗️  Build du front…"
npm run build

# ── 9. Redémarrer l'application ──────────────────────────────
# Passenger relit l'application lorsque ce fichier est touché.
echo "♻️  Redémarrage…"
mkdir -p "$RACINE/tmp"
touch "$RACINE/tmp/restart.txt"

echo ""
echo "══════════════════════════════════════════════"
echo " ✅ Déploiement terminé"
echo "══════════════════════════════════════════════"
echo ""
echo "À vérifier dans le navigateur :"
echo "  · Page d'accueil : « Découvrez nos solutions » et « Faites-vous rappeler »"
echo "  · Sections « Nos services » et « Qui sommes-nous » (invisibles avant ce lot)"
echo "  · Section « en chiffres » : compteurs et barres animés au défilement"
echo "  · Formulaire convoyeur : SIRET, RC Circulation, W garage"
echo "  · Un envoi de test depuis « Faites-vous rappeler » doit apparaître"
echo "    dans l'espace admin, onglet Demandes."
