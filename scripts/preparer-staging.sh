#!/bin/bash
# Prépare une branche pour le STAGING en y ajoutant le banc de test.
# À lancer EN LOCAL (le serveur ne sait pas compiler le front).
#
#   bash scripts/preparer-staging.sh staging/ma-branche
#
# Le banc de test vit sur la branche staging/banc-test et ne doit jamais
# atteindre main ni la prod. Ce script construit, à partir de la branche
# à tester, une branche jetable `deploy/staging` = branche + banc, compile
# le front, la pousse, puis affiche la commande à lancer sur le serveur.
# La branche à tester elle-même n'est pas modifiée.
set -euo pipefail

BRANCHE="${1:-}"
BANC="staging/banc-test"
CIBLE="deploy/staging"

echec() { echo "✖ $*" >&2; exit 1; }

[ -n "$BRANCHE" ] || echec "Usage : bash scripts/preparer-staging.sh <branche>"
cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  echec "Modifications non commitées : à commiter ou remiser d'abord."
fi

DEPART="$(git branch --show-current)"
git fetch --quiet origin
git rev-parse --verify --quiet "origin/$BRANCHE" >/dev/null ||
  echec "origin/$BRANCHE n'existe pas (branche poussée ?)."
git rev-parse --verify --quiet "origin/$BANC" >/dev/null ||
  echec "origin/$BANC n'existe pas."

retour() { git checkout --quiet "$DEPART" 2>/dev/null || true; }
trap retour EXIT

echo "→ $CIBLE = $BRANCHE + $BANC"
git checkout --quiet -B "$CIBLE" "origin/$BRANCHE"

# client/dist est versionné avec des noms hachés : les deux branches s'y
# contredisent forcément. On fusionne sans lui, puis on le recompile.
if ! git merge --quiet --no-edit --no-ff "origin/$BANC" -m "Staging : $BRANCHE + banc de test" 2>/dev/null; then
  CONFLITS="$(git diff --name-only --diff-filter=U | grep -v '^client/dist/' || true)"
  if [ -n "$CONFLITS" ]; then
    git merge --abort
    echec "Conflits hors client/dist, à régler à la main :
$CONFLITS"
  fi
fi

git rm -r -q --cached -f client/dist >/dev/null
rm -rf client/dist
(cd client && npx vite build) >/dev/null
git add -A client/dist
if git rev-parse --verify --quiet MERGE_HEAD >/dev/null; then
  git commit --quiet --no-edit
else
  git commit --quiet -m "Staging : front recompilé avec le banc de test" || true
fi

git push --quiet --force origin "$CIBLE"
echo "✔ $CIBLE poussée ($(git log -1 --format=%h))."
echo
echo "Sur le serveur :"
echo "  cd ~/dlc-kaze-staging && git fetch origin && git show origin/$CIBLE:scripts/deploy-staging.sh > /tmp/deploy-staging.sh && bash /tmp/deploy-staging.sh $CIBLE"
