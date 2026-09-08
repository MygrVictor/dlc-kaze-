#!/usr/bin/env bash
# Vérifie la route PATCH /api/admin/missions/:id sur l'environnement local.
# Crée une mission jetable, la corrige, contrôle chaque garde-fou, puis
# efface la trace : le test ne doit rien laisser derrière lui.

set -uo pipefail

API="http://localhost:4000/api"
BDD="postgresql://arinfo@localhost:5432/dlc_kaze"

echo "→ Authentification admin"
JETON=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dlc-kaze.fr","password":"admin1234"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")

if [[ -z "$JETON" ]]; then
  echo "  ÉCHEC : pas de jeton. L'API répond-elle sur $API ?"
  exit 1
fi
echo "  jeton obtenu"

CLIENT=$(psql "$BDD" -tAc "SELECT id FROM users WHERE email='demo.client@demo.local'")
# psql fait suivre le RETURNING de son tag de commande (« INSERT 0 1 ») :
# sans head -1, l'identifiant en hérite et devient un UUID invalide.
MISSION=$(psql "$BDD" -tAc "INSERT INTO missions (client_id, departure_address, arrival_address, status, vehicle_plate)
  VALUES ('$CLIENT', 'ADRESSE ERRONEE', '1 Rue de la Paix, 75002 Paris', 'EN_ATTENTE_DE_COTATION', 'TEST-PATCH')
  RETURNING id" | head -1)
echo "→ Mission de test : $MISSION"

appel() {
  curl -s -o /tmp/patch-corps.json -w "%{http_code}" -X PATCH "$API/admin/missions/$1" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JETON" \
    -d "$2"
}

echo ""
echo "→ Correction de l'adresse de départ"
CODE=$(appel "$MISSION" '{"departure_address":"12 Avenue des Champs-Élysées, 75008 Paris","comments":"Adresse corrigée"}')
echo "  HTTP $CODE"
cat /tmp/patch-corps.json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('  adresse :',r.mission?.departure_address);console.log('  message :',r.message)})"

echo ""
echo "→ Refus d'une adresse vide (attendu 400)"
echo "  HTTP $(appel "$MISSION" '{"departure_address":"   "}')"

echo ""
echo "→ Refus d'un champ interdit (attendu 400, status non modifiable)"
echo "  HTTP $(appel "$MISSION" '{"status":"LIVREE"}')"
echo "  statut réel en base : $(psql "$BDD" -tAc "SELECT status FROM missions WHERE id='$MISSION'")"

echo ""
echo "→ Refus sur mission close (attendu 400)"
psql "$BDD" -qc "UPDATE missions SET status='ANNULEE' WHERE id='$MISSION'" >/dev/null
echo "  HTTP $(appel "$MISSION" '{"comments":"tentative"}')"

echo ""
echo "→ Mission inexistante (attendu 404)"
echo "  HTTP $(appel "00000000-0000-0000-0000-000000000000" '{"comments":"x"}')"

psql "$BDD" -qc "DELETE FROM missions WHERE id='$MISSION'" >/dev/null
echo ""
echo "→ Mission de test supprimée."
