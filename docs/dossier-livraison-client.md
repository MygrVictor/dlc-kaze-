# Drive Line Connect — Dossier de livraison

**Plateforme de gestion de convoyage de véhicules**
Document de remise client · Version 1.0

---

## Sommaire

1. [Présentation de la solution](#1-présentation-de-la-solution)
2. [Les trois espaces utilisateurs](#2-les-trois-espaces-utilisateurs)
3. [Le cycle de vie d'une mission](#3-le-cycle-de-vie-dune-mission)
4. [L'intégration Kaze](#4-lintégration-kaze)
5. [Notifications et communication](#5-notifications-et-communication)
6. [Facturation](#6-facturation)
7. [Architecture technique](#7-architecture-technique)
8. [Modèle de données](#8-modèle-de-données)
9. [Sécurité](#9-sécurité)
10. [Hébergement et déploiement](#10-hébergement-et-déploiement)
11. [Configuration (variables d'environnement)](#11-configuration-variables-denvironnement)
12. [Qualité et tests](#12-qualité-et-tests)
13. [Exploitation courante](#13-exploitation-courante)
14. [Limites connues et évolutions possibles](#14-limites-connues-et-évolutions-possibles)
15. [Contacts et accès](#15-contacts-et-accès)

---

## 1. Présentation de la solution

Drive Line Connect est une application web qui gère l'intégralité du parcours d'un convoyage de véhicule, depuis la demande du client jusqu'à la facturation, en passant par la cotation, l'affectation d'un convoyeur et le suivi de la livraison.

La plateforme s'articule autour de **trois populations d'utilisateurs** — les clients donneurs d'ordre, les convoyeurs, et l'équipe administrative — et se synchronise avec **Kaze**, l'outil métier terrain utilisé par les convoyeurs sur smartphone.

**Ce que la plateforme apporte concrètement :**

- Un point d'entrée unique pour les demandes de convoyage, avec un formulaire structuré qui capture dès l'origine toutes les informations nécessaires (véhicule, adresses, contacts, dates, prestations annexes).
- Un circuit de validation et de cotation maîtrisé par l'administration : aucune mission ne part sans qu'un prix ait été proposé et accepté.
- Une visibilité en temps réel pour le client sur l'avancement de ses véhicules.
- Une bourse de missions pour les convoyeurs, qui consultent les missions disponibles et se positionnent.
- La génération et la mise à disposition automatiques des factures.
- Un pont bidirectionnel avec Kaze : la mission créée dans Drive Line Connect devient un « job » Kaze, et les événements du terrain (départ, livraison) remontent automatiquement dans la plateforme.

---

## 2. Les trois espaces utilisateurs

### 2.1 Site public (8 pages)

Accessible sans compte :

| Page                                           | Rôle                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| **Accueil**                                    | Vitrine commerciale, présentation de l'offre              |
| **Devenir client**                             | Formulaire d'inscription donneur d'ordre                  |
| **Devenir convoyeur**                          | Candidature convoyeur avec dépôt de pièces justificatives |
| **Être rappelé**                               | Formulaire de rappel téléphonique                         |
| **Demande de convoyage**                       | Demande de devis sans compte préalable                    |
| **Connexion**                                  | Authentification                                          |
| **Mot de passe oublié** / **Réinitialisation** | Parcours de récupération par e-mail                       |

### 2.2 Espace client (4 pages)

| Page                 | Rôle                                                           |
| -------------------- | -------------------------------------------------------------- |
| **Tableau de bord**  | Vue d'ensemble des missions en cours, indicateurs clés         |
| **Nouvelle mission** | Formulaire complet de commande d'un convoyage                  |
| **Détail mission**   | Suivi d'une mission, historique, acceptation ou refus du devis |
| **Factures**         | Consultation et téléchargement des factures                    |

Le client saisit sa demande, reçoit une proposition de prix, l'accepte ou la refuse, puis suit l'avancement jusqu'à la livraison.

### 2.3 Espace convoyeur (6 pages)

| Page                       | Rôle                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| **Tableau de bord**        | Missions attribuées, prochaines échéances                                 |
| **Missions disponibles**   | Bourse des missions ouvertes au positionnement                            |
| **Historique**             | Missions passées                                                          |
| **Profil**                 | Coordonnées, informations professionnelles                                |
| **Documents / Validation** | Dépôt et suivi des pièces obligatoires (permis, assurance, Kbis, RC pro…) |
| **Factures**               | Rétributions et documents comptables                                      |

Un convoyeur ne devient opérationnel qu'après **validation de son compte par l'administration**, laquelle contrôle les pièces justificatives déposées.

### 2.4 Espace administration (7 pages)

| Page                | Rôle                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| **Tableau de bord** | Pilotage global, volumétrie, missions à traiter                      |
| **Missions**        | Liste complète, cotation, affectation, modification, annulation      |
| **Demandes**        | Traitement des demandes entrantes du site public                     |
| **Utilisateurs**    | Gestion des comptes clients et convoyeurs, validation des convoyeurs |
| **Factures**        | Émission et suivi de la facturation                                  |
| **Carte**           | Visualisation géographique des missions                              |
| **Kaze**            | Supervision de la synchronisation avec l'outil terrain               |

L'administration est le **chef d'orchestre** : c'est elle qui fixe les prix, décide des affectations et arbitre les cas particuliers.

---

## 3. Le cycle de vie d'une mission

Une mission traverse une suite d'états contrôlés. Chaque transition déclenche les notifications appropriées.

```
   EN_ATTENTE_DE_COTATION
            │  l'admin chiffre la mission
            ▼
      DEVIS_PROPOSE
            │
     ┌──────┴──────┐
     │             │  le client refuse
     ▼             ▼
  ACCEPTEE    DEVIS_REFUSE
     │
     │  l'admin affecte un convoyeur
     ▼
  ASSIGNEE
     │  le convoyeur prend en charge le véhicule
     ▼
  EN_COURS
     │  le véhicule est remis au destinataire
     ▼
   LIVREE  ──────►  facturation
```

À tout moment avant la livraison, une mission peut basculer en **ANNULEE**.

**Signification opérationnelle des états :**

| Statut                   | Signification                                                   |
| ------------------------ | --------------------------------------------------------------- |
| `EN_ATTENTE_DE_COTATION` | La demande est enregistrée, l'administration doit fixer un prix |
| `DEVIS_PROPOSE`          | Un prix a été communiqué au client, en attente de sa réponse    |
| `DEVIS_REFUSE`           | Le client a décliné la proposition                              |
| `ACCEPTEE`               | Le client a validé le prix, la mission est à pourvoir           |
| `ASSIGNEE`               | Un convoyeur est désigné, le job Kaze est créé                  |
| `EN_COURS`               | Le véhicule est pris en charge, convoyage en cours              |
| `LIVREE`                 | Véhicule remis, mission close, facturable                       |
| `ANNULEE`                | Mission abandonnée                                              |

Une mission `LIVREE` ou `ANNULEE` est considérée comme **close** : elle n'est plus modifiable, afin de préserver la cohérence comptable.

---

## 4. L'intégration Kaze

Kaze est l'application terrain que les convoyeurs utilisent sur leur téléphone. Drive Line Connect y crée automatiquement les interventions et en récupère les événements.

### 4.1 Sens Drive Line Connect → Kaze

Lorsqu'une mission est affectée à un convoyeur, la plateforme crée dans Kaze un **job** complet : véhicule, adresses d'enlèvement et de livraison, contacts, dates, prestations demandées, et le convoyeur désigné comme intervenant. Le job est construit à partir d'un **gabarit de workflow** qui reproduit le déroulé métier (état des lieux départ, transport, état des lieux arrivée).

L'identifiant Kaze est mémorisé dans la mission (`kaze_mission_id`), ce qui permet de retrouver le job à tout moment.

### 4.2 Sens Kaze → Drive Line Connect

Deux mécanismes complémentaires :

- **Webhooks** — Kaze notifie la plateforme en temps réel lorsqu'un événement survient sur le terrain. Les webhooks sont authentifiés par un secret partagé.
- **Synchronisation périodique** — un service de rattrapage interroge Kaze à intervalle régulier (paramétrable via `SYNC_INTERVAL_MS`) pour capter ce qui aurait pu échapper aux webhooks. C'est le filet de sécurité qui garantit qu'aucun événement n'est perdu en cas d'indisponibilité momentanée.

Les positions GPS remontées par Kaze alimentent la carte de l'espace administration.

### 4.3 Point de vigilance important

**La modification d'un job déjà créé dans Kaze n'est pas automatique.** Kaze impose de reconstruire l'intégralité du gabarit de workflow lors d'une mise à jour ; une modification partielle réinitialiserait le job à son état initial et ferait perdre le travail déjà saisi par le convoyeur.

En conséquence, lorsqu'un administrateur modifie une adresse ou une date sur une mission déjà transmise à Kaze, la plateforme **signale explicitement qu'une resynchronisation manuelle est nécessaire** plutôt que de risquer d'écraser des données terrain. Une action dédiée de resynchronisation est disponible dans l'espace administration.

---

## 5. Notifications et communication

La plateforme dispose de quatre canaux, activables indépendamment par configuration :

| Canal                | Usage                                                                                               | Configuration                        |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **E-mail**           | Notifications métier : devis proposé, mission affectée, livraison, réinitialisation de mot de passe | SMTP classique **ou** service Resend |
| **WhatsApp**         | Alertes aux convoyeurs via l'API WhatsApp Business (messages basés sur des gabarits validés)        | `WHATSAPP_*`                         |
| **Telegram**         | Alertes techniques et d'exploitation destinées à l'équipe interne                                   | `TELEGRAM_*`                         |
| **Alertes internes** | Supervision des incidents applicatifs                                                               | Service dédié                        |

Si un canal n'est pas configuré, il est simplement ignoré : l'application continue de fonctionner normalement.

---

## 6. Facturation

Les factures sont rattachées aux missions livrées et distinguent :

- la **facturation client** (prix de vente du convoyage) ;
- la **rétribution convoyeur** (montant reversé au prestataire).

Chaque partie ne voit que ce qui la concerne. L'administration dispose de la vue complète et pilote l'émission des documents. Les factures sont consultables et téléchargeables depuis l'espace de chaque utilisateur.

---

## 7. Architecture technique

```
┌──────────────────────────────────────────────────────────┐
│  NAVIGATEUR                                              │
│  Application React 18 (build statique Vite)              │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS / API REST + JWT
┌───────────────────────▼──────────────────────────────────┐
│  SERVEUR APPLICATIF — Node.js 22 / Express 4             │
│                                                          │
│  Routes (7)      admin · auth · convoyeur · facture      │
│                  mission · partner · webhook             │
│                                                          │
│  Middleware      authentification · sécurité             │
│                  auth partenaire · gestion d'erreurs     │
│                                                          │
│  Services (9)    kaze · sync · devis · pricing           │
│                  geocoding · email · whatsapp            │
│                  telegram · alerte                       │
└──────┬────────────────────────────────┬──────────────────┘
       │                                │
┌──────▼───────────┐          ┌─────────▼──────────────────┐
│  PostgreSQL      │          │  Services externes         │
│  8 tables        │          │  Kaze · Resend/SMTP        │
│                  │          │  WhatsApp · Telegram       │
│                  │          │  Géocodage · Interenchères │
└──────────────────┘          └────────────────────────────┘
```

**Technologies principales :**

| Composant          | Technologie              | Version   |
| ------------------ | ------------------------ | --------- |
| Runtime serveur    | Node.js                  | 22        |
| Framework HTTP     | Express                  | 4.19      |
| Base de données    | PostgreSQL (client `pg`) | 8.12      |
| Interface          | React                    | 18.3      |
| Build frontend     | Vite                     | 5.4       |
| Styles             | TailwindCSS              | 3         |
| Authentification   | jsonwebtoken + bcryptjs  | 9.0 / 2.4 |
| Sécurité HTTP      | Helmet                   | 7.1       |
| Envoi d'e-mails    | Nodemailer / Resend      | 9.0       |
| Upload de fichiers | Multer                   | 2.1       |

**Volumétrie du code :** 65 points d'entrée API répartis sur 7 fichiers de routes, 25 pages d'interface, 9 services métier.

---

## 8. Modèle de données

La base compte **8 tables** :

| Table                 | Contenu                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `users`               | Comptes de tous les rôles (client, convoyeur, admin)                           |
| `missions`            | Cœur métier : les convoyages, 47 attributs                                     |
| `factures`            | Documents de facturation                                                       |
| `convoyeur_documents` | Pièces justificatives des convoyeurs                                           |
| `demande_documents`   | Pièces jointes aux demandes entrantes                                          |
| `contact_requests`    | Demandes issues des formulaires publics                                        |
| `password_resets`     | Jetons de réinitialisation de mot de passe                                     |
| `geocode_cache`       | Cache des adresses géocodées (limite les appels externes et accélère la carte) |

### 8.1 Table `users`

`id` · `email` · `password_hash` · `full_name` · `phone` · `company` · `role` · `is_validated` · `kaze_driver_id` · `created_at` · `updated_at`

- `role` distingue **client**, **convoyeur** et **admin**.
- `is_validated` conditionne l'accès opérationnel d'un convoyeur.
- `kaze_driver_id` fait le lien avec l'identité du convoyeur dans Kaze.
- Les mots de passe ne sont **jamais stockés en clair** : seul un condensat bcrypt est conservé.

### 8.2 Table `missions`

Les 47 colonnes se regroupent en huit familles :

| Famille         | Attributs                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identité**    | `id`, `client_id`, `convoyeur_id`, `status`, `kaze_mission_id`, `created_at`, `updated_at`                                                                                                                          |
| **Véhicule**    | `vehicle_plate`, `vehicle_vin`, `vehicle_brand`, `vehicle_model`, `vehicle_finish`, `vehicle_energy`, `vehicle_state`, `vehicle_keys`, `vehicle_year`, `vehicle_type`, `vehicle_utility_12m3`, `vehicle_toll_class` |
| **Enlèvement**  | `departure_address`, `departure_date`, `departure_contact_name`, `departure_contact_phone`, `departure_contact_email`, `departure_instructions`, `departure_structure`, `departure_structure_name`                  |
| **Livraison**   | `arrival_address`, `arrival_date`, `arrival_contact_name`, `arrival_contact_phone`, `arrival_contact_email`, `arrival_instructions`, `desired_delivery_date`                                                        |
| **Prestations** | `service_wash_exterior`, `service_clean_interior`, `service_refuel`, `service_handover`, `service_document_management`                                                                                              |
| **Urgence**     | `emergency_phone`, `emergency_contact_name`, `emergency_contact_email`, `is_urgent`                                                                                                                                 |
| **Financier**   | `price` (client), `price_convoyeur` (rétribution), `retribution_details`                                                                                                                                            |
| **Divers**      | `comments`                                                                                                                                                                                                          |

Les identifiants sont des **UUID**, ce qui évite toute énumération des ressources depuis l'extérieur.

---

## 9. Sécurité

| Mesure                      | Mise en œuvre                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Authentification**        | Jetons JWT signés, durée de validité paramétrable (`JWT_EXPIRES_IN`)                                                  |
| **Mots de passe**           | Hachage bcrypt, jamais de stockage en clair, jamais de renvoi par e-mail                                              |
| **Réinitialisation**        | Jeton à usage unique et à durée limitée, transmis par e-mail                                                          |
| **Cloisonnement des rôles** | Middleware d'autorisation sur chaque route sensible ; un client ne peut accéder qu'à ses propres missions et factures |
| **En-têtes HTTP**           | Helmet (protection XSS, clickjacking, sniffing MIME)                                                                  |
| **Limitation de débit**     | Middleware de sécurité sur les points d'entrée sensibles                                                              |
| **Injection SQL**           | Requêtes exclusivement paramétrées                                                                                    |
| **Webhooks**                | Vérification d'un secret partagé (`KAZE_WEBHOOK_SECRET`)                                                              |
| **API partenaires**         | Middleware d'authentification dédié, distinct de l'authentification utilisateur                                       |
| **Identifiants**            | UUID non énumérables                                                                                                  |
| **Missions closes**         | Verrouillage en modification une fois livrées ou annulées                                                             |

---

## 10. Hébergement et déploiement

### 10.1 Environnement de production

Hébergement mutualisé **o2switch**, Node.js 22 via environnement virtuel cPanel.

- Racine applicative : `/home/<compte>/dlc-kaze`
- Environnement Node : `/home/<compte>/nodevenv/dlc-kaze/22/bin/activate`
- Base PostgreSQL hébergée sur le même serveur
- Redémarrage applicatif par fichier sentinelle `tmp/restart.txt`

### 10.2 Procédure de déploiement

Le déploiement est **scripté et sécurisé** (`scripts/deploy-o2switch.sh`). Il enchaîne sept étapes :

1. **Sauvegarde** de la base de données (`pg_dump`) avant toute modification
2. **Récupération du code** depuis le dépôt Git (`git pull --ff-only`, sans réécriture d'historique)
3. **Installation des dépendances** de production
4. **Migrations de base de données** (idempotentes : rejouables sans risque)
5. **Test de démarrage à blanc** — l'application est lancée à part et l'on vérifie qu'elle démarre correctement ; **en cas d'échec, le script s'interrompt sans toucher au site en ligne**
6. **Redémarrage** applicatif
7. **Contrôle de santé** HTTP — vérification que le site répond effectivement

Ce garde-fou de l'étape 5 est essentiel : une régression bloquante est détectée **avant** d'affecter les utilisateurs.

### 10.3 Point d'attention

Le frontend est livré sous forme de **build compilé versionné** (`client/dist/`). Le script de déploiement ne recompile pas l'interface. Toute modification de l'interface impose donc de lancer la compilation en local et de committer le résultat **avant** de déployer.

### 10.4 Sauvegardes

Un script dédié (`scripts/backup-db.sh`) permet la sauvegarde de la base à la demande. Une sauvegarde est en outre systématiquement créée à chaque déploiement.

---

## 11. Configuration (variables d'environnement)

L'application se configure entièrement par variables d'environnement, sans modification de code.

### 11.1 Indispensables

| Variable                         | Rôle                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                   | Chaîne de connexion PostgreSQL                                        |
| `JWT_SECRET`                     | Clé de signature des jetons — **à garder strictement confidentielle** |
| `JWT_EXPIRES_IN`                 | Durée de validité des sessions                                        |
| `PORT`                           | Port d'écoute du serveur                                              |
| `NODE_ENV`                       | `production` en production                                            |
| `CLIENT_URL`                     | URL publique du site (liens dans les e-mails)                         |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte administrateur initial                                         |

### 11.2 Intégration Kaze

`KAZE_API_BASE_URL` · `KAZE_LOGIN` · `KAZE_PASSWORD` · `KAZE_API_KEY` · `KAZE_TARGET_ID` · `KAZE_WEBHOOK_SECRET` · `SYNC_INTERVAL_MS`

### 11.3 E-mails

Deux options au choix :

- **Resend** : `RESEND_API_KEY`, `EMAIL_FROM`
- **SMTP** : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

`SALES_EMAIL` reçoit les demandes commerciales.

### 11.4 Notifications complémentaires

- WhatsApp : `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`
- Telegram : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALERTES_CHAT_ID`

### 11.5 Divers

- `UPLOADS_DIR` — répertoire de stockage des pièces jointes
- `MODE_DEMO` — bascule en mode démonstration
- `INTERENCHERES_API_KEY` / `INTERENCHERES_API_KEY_SANDBOX` — intégration partenaire Interenchères

> **Rappel de sécurité :** le fichier `.env` ne doit jamais être versionné ni transmis par messagerie non chiffrée. En cas de fuite de `JWT_SECRET`, la clé doit être régénérée — ce qui déconnectera l'ensemble des utilisateurs, sans autre conséquence.

---

## 12. Qualité et tests

L'application dispose d'une **couverture de tests automatisés substantielle** :

- **968 tests** répartis sur **29 suites**, sur 31 fichiers de test
- Exécution complète en environ 2 minutes 20
- **Totalité des tests au vert** à la date de livraison

Ces tests couvrent l'authentification, les règles de gestion des missions, les transitions de statut, la facturation, la gestion des documents, l'intégration Kaze et les webhooks.

Ils constituent un **filet de sécurité pour les évolutions futures** : toute régression sur une règle métier existante est détectée immédiatement, avant tout déploiement.

**Commande :** `npm run test:server`

---

## 13. Exploitation courante

### 13.1 Développement local

```bash
bash scripts/dev-local.sh          # démarre l'API et l'interface
bash scripts/dev-local.sh --stop   # arrête tout
bash scripts/diag-local.sh         # diagnostic si quelque chose ne répond pas
```

- API : `http://localhost:4000`
- Interface : `http://localhost:5173`

### 13.2 Compilation de l'interface

```bash
cd client && npx vite build
```

À exécuter et à committer **avant tout déploiement** touchant l'interface.

### 13.3 Déploiement

```bash
cd ~/dlc-kaze && bash scripts/deploy-o2switch.sh
```

### 13.4 Jeu de démonstration

```bash
bash scripts/demo-local.sh
```

Crée un environnement de démonstration avec des comptes de test — utile pour la formation des utilisateurs.

### 13.5 Outillage de diagnostic

Le répertoire `scripts/` contient une quarantaine d'utilitaires de diagnostic, principalement dédiés à l'intégration Kaze (analyse des jobs, des workflows, des jetons, des webhooks, des affectations). Ils permettent d'investiguer un incident d'intégration sans modifier le code applicatif.

---

## 14. Limites connues et évolutions possibles

### 14.1 Limites assumées

| Sujet                         | Situation                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Mise à jour d'un job Kaze** | Non automatique par conception (voir §4.3). Une resynchronisation manuelle est proposée à l'administrateur, qui garde la main. |
| **Build frontend versionné**  | Le déploiement ne recompile pas l'interface ; la compilation reste une étape manuelle préalable.                               |
| **Missions closes**           | Volontairement non modifiables, pour garantir la cohérence comptable.                                                          |

### 14.2 Évolutions naturelles

- **Édition inline des missions côté administration** — le point d'entrée API (`PATCH /api/admin/missions/:id`) est **déjà développé et testé** ; il ne reste qu'à y brancher un formulaire dans l'interface. 32 champs sont modifiables, avec contrôles de validité et détection des cas nécessitant une resynchronisation Kaze.
- **Automatisation de la compilation** au déploiement (intégration continue).
- **Tableaux de bord analytiques** : délais moyens, taux d'acceptation des devis, rentabilité par trajet.
- **Application mobile** pour les convoyeurs, en complément ou en remplacement de Kaze.

### 14.3 Points de vérification à la recette

- Contrôler que les migrations de base de données ont bien été appliquées en production (elles sont idempotentes et jouées à chaque déploiement).
- Vérifier le bon acheminement des e-mails transactionnels depuis l'environnement de production.
- Valider la réception effective des webhooks Kaze depuis l'URL publique.

---

## 15. Contacts et accès

### 15.1 Éléments à transmettre séparément

Pour des raisons de sécurité, les éléments suivants sont communiqués **hors de ce document** :

- Accès au dépôt de code source
- Accès SSH et cPanel de l'hébergement
- Contenu du fichier `.env` de production
- Identifiants du compte administrateur
- Identifiants d'accès à l'API Kaze

### 15.2 Comptes de démonstration

Réservés à l'environnement de démonstration, **à ne jamais créer en production** :

| Rôle      | Identifiant                 |
| --------- | --------------------------- |
| Client    | `demo.client@demo.local`    |
| Convoyeur | `demo.convoyeur@demo.local` |

Le mot de passe associé est transmis séparément.

### 15.3 Documentation complémentaire

- `README.md` — documentation technique du dépôt
- `docs/` — notes de travail et comptes rendus (dont l'intégration Interenchères)
- `scripts/` — outillage d'exploitation et de diagnostic

---

_Document établi à partir d'une vérification directe du code source, de la base de données et de la configuration de production._
