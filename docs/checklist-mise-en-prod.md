# Liste de contrôle avant chaque mise en production

Née d'un incident du 24/11/2026 : la validation des devis s'est bloquée en
prod parce qu'une écriture passait par une autre connexion à la base que la
transaction en cours. 1128 tests étaient verts : ils simulent la base et ne
peuvent pas voir un blocage. Seul un essai sur une vraie base le montre.

Règle : **on ne fusionne dans `main` qu'après avoir essayé à la main, sur le
staging, les parcours que la modification touche.**

## 1. Code

- [ ] Tests serveur verts : `cd server && npx jest --silent`
- [ ] Tests client verts : `cd client && npx vitest run --maxWorkers=2`
- [ ] Front recompilé et commité : `cd client && npx vite build`, puis `git add -A client/dist`
- [ ] Aucun fichier « nom 2.ext » (doublons iCloud) dans le commit
- [ ] Le banc de test du staging n'est pas dans la branche
      (`StagingTestBench.jsx`, `utils/staging.js`) : le script de prod le refuse
- [ ] Fusion en avance rapide seulement : `git merge --ff-only`

## 2. Essai à la main sur le staging

Déployer avec `bash scripts/preparer-staging.sh staging/ma-branche`, puis la
commande affichée. Essayer **ce que la modification touche**, et en plus :

| Si la modification touche… | Essayer sur le staging |
|---|---|
| Devis, missions, Kaze, références | Créer une demande, la coter, **valider le devis côté client** (réponse en quelques secondes, mission « Acceptée ») |
| Missions des convoyeurs | Prendre une mission côté convoyeur ; assigner depuis l'admin |
| Une migration de base | Elle s'applique sans erreur sur le staging (base distincte de la prod) |
| Connexion, comptes, sessions | Connexion client, convoyeur et admin ; déconnexion ; mot de passe oublié |
| Notifications, Telegram | Publier une mission et vérifier qu'elle arrive (clés VAPID du staging) |
| Interface seulement | Parcourir les pages modifiées, sur mobile aussi |

- [ ] Après les essais, aucune requête n'attend un verrou :
```
psql "$(grep '^DATABASE_URL=' ~/dlc-kaze-staging/.env | cut -d= -f2- | tr -d '"')" -c "SELECT pid, now()-query_start AS depuis, left(query,70) FROM pg_stat_activity WHERE wait_event_type='Lock';"
```
  (résultat attendu : 0 ligne)

Le staging a Kaze coupé : ce qui part vers Kaze ne s'y vérifie pas. Le dire
explicitement, et le vérifier tout de suite en prod (point 3).

## 3. Mise en prod

- [ ] Noter le commit actuel de la prod (pour revenir en arrière) : `cd ~/dlc-kaze && git log --oneline -1`
- [ ] `git checkout main && bash scripts/deploy-o2switch.sh` (sauvegarde de la base incluse)
- [ ] `touch ~/dlc-kaze/tmp/restart.txt`
- [ ] **Immédiatement après** : refaire le parcours principal touché
      (valider un devis, prendre une mission…) avec un compte réel ou de test
- [ ] Verrous : la requête ci-dessus, sur `~/dlc-kaze`, ne renvoie rien
- [ ] Logs sans erreur : `grep -n -i -E "erreur|error|❌" ~/logs/dlc-kaze.log | tail -n 30`

## 4. Si ça tourne mal

- Déploiement bloqué à l'étape « Migrations » : des connexions tiennent la
  table. Interrompre (Ctrl+C), couper les connexions en attente
  (`pg_terminate_backend`), relancer le script.
- Retour arrière : `git revert <commit fautif>` sur `main`, pousser, redéployer.
  La sauvegarde SQL est dans `~/backups/dlc-kaze/`.

## Correctif urgent

Même liste, allégée : on ne saute jamais l'essai du parcours touché, même
sur le staging en deux minutes. Un correctif non essayé a déjà causé un
second incident.
