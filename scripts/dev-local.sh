#!/usr/bin/env bash
# Démarre l'API et le front en local, en arrière-plan, avec journalisation.
#
# Lancer les deux serveurs depuis un terminal interactif s'est révélé fragile :
# la moindre commande envoyée par-dessus interrompt le processus. On détache
# donc l'exécution et on écrit tout dans un fichier consultable à tout moment.
#
#   bash scripts/dev-local.sh          démarre
#   tail -f /tmp/dlc-api.log           suit les logs de l'API
#   tail -f /tmp/dlc-web.log           suit les logs du front
#   bash scripts/dev-local.sh --stop   arrête

set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Deux journaux distincts : mêlées dans un seul fichier, les sorties de
# l'API et du front se recouvrent et l'erreur qui compte devient illisible.
JOURNAL_API="/tmp/dlc-api.log"
JOURNAL_WEB="/tmp/dlc-web.log"

arreter() {
  # « src/index.js » vise explicitement le serveur : lancé par nodemon, il
  # survit à la mort de son parent et ne porte ni le mot « nodemon » ni le mot
  # « vite ». Plusieurs exemplaires finissaient par coexister, tous bloqués.
  pkill -9 -f "nodemon|concurrently" 2>/dev/null
  pkill -9 -f "node_modules/.bin/vite" 2>/dev/null
  pkill -9 -f "src/index.js" 2>/dev/null
  # On libère aussi par numéro de port, au cas où un processus au nom
  # inattendu tiendrait encore la place.
  #
  # -sTCP:LISTEN est indispensable : sans ce filtre, lsof renvoie aussi les
  # clients connectés au port — on tuerait le navigateur en même temps que
  # le serveur.
  for port in 4000 5173; do
    occupants=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)
    [[ -n "$occupants" ]] && kill -9 $occupants 2>/dev/null
  done
  sleep 1
  echo "Processus de développement arrêtés."
}

if [[ "${1:-}" == "--stop" ]]; then
  arreter
  exit 0
fi

cd "$RACINE" || exit 1

# Repartir d'un état propre : processus résiduels et caches Vite incomplets
# sont la première cause de démarrages silencieusement cassés.
arreter
rm -rf node_modules/.vite client/node_modules/.vite
rm -f "$JOURNAL_API" "$JOURNAL_WEB"

# On invoque nodemon et vite directement, sans passer par « npm run dev ».
# Cette commande enchaîne trois npm imbriqués (racine, concurrently, workspace) ;
# le chemin du projet contenant des espaces et des parenthèses, la résolution
# des workspaces échoue en silence : aucun processus, aucune erreur, rien.
# Les binaires locaux, eux, se lancent sans ambiguïté.
#
# L'API démarre depuis server/ : son code résout .env et les migrations
# relativement à ce dossier, la lancer depuis la racine la fait échouer.
# --watch src cantonne nodemon au code du serveur. Sans cette limite il
# surveille tout le dossier courant et rebondit sur le moindre fichier touché
# ailleurs dans le dépôt, jusqu'à redémarrer en boucle sans jamais aboutir.
(cd "$RACINE/server" && nohup "$RACINE/node_modules/.bin/nodemon" --watch src --ext js,json src/index.js > "$JOURNAL_API" 2>&1 &)
(cd "$RACINE/client" && nohup "$RACINE/node_modules/.bin/vite" > "$JOURNAL_WEB" 2>&1 &)
echo "Démarrage en cours (journaux : $JOURNAL_API et $JOURNAL_WEB)"

# Attendre que les deux ports écoutent, sans dépasser 120 secondes. Le disque
# étant saturé, Vite a déjà mis 35 secondes à s'initialiser : une minute ne
# suffit pas toujours. On exige -sTCP:LISTEN, sinon une simple connexion
# sortante suffirait à faire croire que le serveur est prêt.
for _ in $(seq 1 120); do
  api=$(lsof -ti :4000 -sTCP:LISTEN 2>/dev/null)
  web=$(lsof -ti :5173 -sTCP:LISTEN 2>/dev/null)
  if [[ -n "$api" && -n "$web" ]]; then
    echo ""
    echo "  API   http://localhost:4000"
    echo "  Front http://localhost:5173"
    exit 0
  fi
  sleep 1
done

echo ""
echo "Les serveurs n'ont pas démarré dans le temps imparti."
[[ -n "${api:-}" ]] && echo "  port 4000 : ouvert" || echo "  port 4000 : FERME"
[[ -n "${web:-}" ]] && echo "  port 5173 : ouvert" || echo "  port 5173 : FERME"
echo ""
echo "----- API ($JOURNAL_API) -----"
tail -40 "$JOURNAL_API"
echo ""
echo "----- FRONT ($JOURNAL_WEB) -----"
tail -15 "$JOURNAL_WEB"
exit 1
