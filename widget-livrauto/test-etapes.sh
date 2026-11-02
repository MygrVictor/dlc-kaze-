#!/usr/bin/env bash
# Tests manuels de l'étape 3 (signature des CGV) sur le prototype local.
# Prérequis : node widget-livrauto/server.js lancé sur le port 4100.
U=http://localhost:4100/api/widget
H="Content-Type: application/json"
C='{"first_name":"Paul","last_name":"Dupont","email":"paul@test.fr","phone":"0612345678"}'
champ() { node -pe "JSON.parse(require('fs').readFileSync(0)).$1"; }

ID=$(curl -s -X POST $U/estimation -H "$H" -d '{"partner":"Interencheres","external_id":"89125902","depart":{"street":"44 Boulevard Fifi Turin","postcode":"13010","city":"Marseille","lat":43.28,"lng":5.41},"adresse_arrivee":"10 place Bellecour 69002 Lyon"}' | champ quote_id)
echo "devis: $ID"

echo "1. commande sans signature (attendu: refus)"
curl -s -X POST $U/commande -H "$H" -d "{\"quote_id\":\"$ID\",\"client\":$C}"; echo

echo "2. signature avec une ancienne version des CGV (attendu: refus)"
curl -s -X POST $U/signature -H "$H" -d "{\"quote_id\":\"$ID\",\"client\":$C,\"cgv_version\":\"old\",\"accepte\":true}"; echo

echo "3. signature valide"
S=$(curl -s -X POST $U/signature -H "$H" -d "{\"quote_id\":\"$ID\",\"client\":$C,\"cgv_version\":\"2026-11-v1\",\"accepte\":true}")
echo "$S"
REF=$(echo "$S" | champ signature_ref)

echo "4. commande avec la signature d'une autre personne (attendu: refus)"
curl -s -X POST $U/commande -H "$H" -d "{\"quote_id\":\"$ID\",\"signature_ref\":\"$REF\",\"client\":{\"first_name\":\"X\",\"last_name\":\"Y\",\"email\":\"autre@test.fr\",\"phone\":\"0612345678\"}}"; echo

echo "5. commande signée (attendu: OK)"
curl -s -X POST $U/commande -H "$H" -d "{\"quote_id\":\"$ID\",\"signature_ref\":\"$REF\",\"client\":$C}"; echo

echo "6. même commande rejouée (attendu: refus)"
curl -s -X POST $U/commande -H "$H" -d "{\"quote_id\":\"$ID\",\"signature_ref\":\"$REF\",\"client\":$C}"; echo
