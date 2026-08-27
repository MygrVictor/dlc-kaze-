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
  # shellcheck disable=SC1090
  source "$ACTIVATION"
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
  git pull --ff-only
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
echo "📦 Installation des dépendances…"
npm install --omit=dev --workspaces --include-workspace-root

# ── 7. Migrations ────────────────────────────────────────────
# job_title : champ « poste » du formulaire de rappel.
# qualification : SIRET, RC Circulation, RC Pro, W garage.
echo "🗄️  Migrations…"
npm run db:migrate:vitrine

# ── 8. Build du front ────────────────────────────────────────
# vite est une dépendance de développement : on l'installe le temps
# du build, que `--omit=dev` a écartée à l'étape précédente.
echo "🏗️  Build du front…"
npm install --workspace=client --include=dev
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
