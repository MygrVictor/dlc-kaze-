#!/usr/bin/env bash
# Contrôle rapide de l'environnement local : ports en écoute et réponses HTTP.
# Sépare IPv4 et IPv6, car Vite ne s'attache parfois qu'à [::1] : le navigateur
# qui résout « localhost » en 127.0.0.1 se heurte alors à un refus de connexion,
# sans que rien ne paraisse anormal côté serveur.

echo "=== PROCESSUS ==="
ps -eo pid,command | grep -E "vite|src/index.js" | grep -v grep

echo ""
echo "=== PORTS EN ECOUTE ==="
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN

echo ""
echo "=== API 4000 ==="
curl -s -o /dev/null -w "  127.0.0.1 : %{http_code}\n" --max-time 10 http://127.0.0.1:4000/api/health
curl -s -o /dev/null -w "  [::1]     : %{http_code}\n" --max-time 10 "http://[::1]:4000/api/health"

echo ""
echo "=== FRONT 5173 ==="
curl -s -o /dev/null -w "  127.0.0.1 racine : %{http_code}\n" --max-time 10 http://127.0.0.1:5173/
curl -s -o /dev/null -w "  [::1]     racine : %{http_code}\n" --max-time 10 "http://[::1]:5173/"

echo ""
echo "=== PROXY /api A TRAVERS VITE ==="
curl -s -o /dev/null -w "  127.0.0.1 : %{http_code}\n" --max-time 10 http://127.0.0.1:5173/api/health
curl -s -o /dev/null -w "  [::1]     : %{http_code}\n" --max-time 10 "http://[::1]:5173/api/health"

echo ""
echo "=== JOURNAL FRONT ==="
tail -12 /tmp/dlc-web.log
