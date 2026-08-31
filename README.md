# Drive Line Connect — Plateforme SaaS de Convoyage Automobile

Plateforme de gestion de convoyage automobile avec intégration API **Kaze** (kaze.app).

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NAVIGATEUR                                  │
│                                                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐       │
│   │  Espace       │  │  Dashboard   │  │  Portail           │       │
│   │  Client       │  │  Admin       │  │  Convoyeur         │       │
│   └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘       │
│          │                 │                    │                    │
│          └─────────────────┼────────────────────┘                   │
│                            │  React + Tailwind CSS                  │
└────────────────────────────┼────────────────────────────────────────┘
                             │ HTTP (REST)
┌────────────────────────────┼────────────────────────────────────────┐
│                     SERVEUR EXPRESS                                  │
│                            │                                        │
│   ┌────────────────────────┼────────────────────────────┐           │
│   │  Auth (JWT + RBAC)     │  Missions CRUD              │          │
│   │  /api/auth/*           │  /api/missions/*             │          │
│   │                        │  /api/admin/*                │          │
│   │                        │  /api/convoyeur/*            │          │
│   └────────────┬───────────┴────────────────┬────────────┘          │
│                │                            │                       │
│         ┌──────┴──────┐             ┌───────┴────────┐              │
│         │  PostgreSQL │             │   API Kaze     │              │
│         │  (local)    │             │   (externe)    │              │
│         └─────────────┘             └───────┬────────┘              │
│                                             │                       │
│                                    ┌────────┴────────┐              │
│                                    │  Webhooks Kaze  │              │
│                                    │  POST /api/     │              │
│                                    │  webhooks/kaze  │              │
│                                    └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Schéma de la Base de Données

### Table `users`

| Colonne          | Type           | Description                        |
| ---------------- | -------------- | ---------------------------------- |
| `id`             | UUID (PK)      | Identifiant unique                 |
| `email`          | VARCHAR UNIQUE | Email de connexion                 |
| `password_hash`  | VARCHAR        | Mot de passe hashé (bcrypt)        |
| `full_name`      | VARCHAR(150)   | Nom complet                        |
| `phone`          | VARCHAR(30)    | Téléphone                          |
| `company`        | VARCHAR(150)   | Entreprise (client)                |
| `role`           | ENUM           | `client` \| `convoyeur` \| `admin` |
| `is_validated`   | BOOLEAN        | Compte validé par l'Admin          |
| `kaze_driver_id` | VARCHAR(100)   | ID du convoyeur dans Kaze          |
| `created_at`     | TIMESTAMPTZ    | Date de création                   |
| `updated_at`     | TIMESTAMPTZ    | Dernière mise à jour               |

### Table `missions`

| Colonne           | Type          | Description                          |
| ----------------- | ------------- | ------------------------------------ |
| `id`              | UUID (PK)     | Identifiant unique                   |
| `client_id`       | UUID (FK)     | → `users.id`                         |
| `departure_city`  | VARCHAR(150)  | Ville de départ                      |
| `departure_addr`  | TEXT          | Adresse complète départ              |
| `arrival_city`    | VARCHAR(150)  | Ville d'arrivée                      |
| `arrival_addr`    | TEXT          | Adresse complète arrivée             |
| `vehicle_brand`   | VARCHAR(80)   | Marque du véhicule                   |
| `vehicle_model`   | VARCHAR(80)   | Modèle                               |
| `vehicle_plate`   | VARCHAR(20)   | Immatriculation                      |
| `vehicle_year`    | INTEGER       | Année du véhicule                    |
| `vehicle_type`    | VARCHAR(50)   | Type (berline, SUV, utilitaire…)     |
| `comments`        | TEXT          | Instructions supplémentaires         |
| `desired_date`    | DATE          | Date souhaitée                       |
| `price`           | NUMERIC(10,2) | Prix fixé par l'Admin                |
| `status`          | ENUM          | Statut de la mission (voir workflow) |
| `kaze_mission_id` | VARCHAR(100)  | ID de la mission dans Kaze           |
| `convoyeur_id`    | UUID (FK)     | → `users.id` (nullable)              |
| `created_at`      | TIMESTAMPTZ   | Date de création                     |
| `updated_at`      | TIMESTAMPTZ   | Dernière mise à jour                 |

---

## 🔄 Workflow des Statuts

```
  ┌─────────────────────┐
  │ EN_ATTENTE_DE_       │  ← Client crée la demande
  │ COTATION             │
  └──────────┬──────────┘
             │  Admin saisit un prix
             ▼
  ┌─────────────────────┐
  │ DEVIS_PROPOSE       │  ← Client voit le prix
  └──────────┬──────────┘
             │  Client accepte
             ▼
  ┌─────────────────────┐
  │ ACCEPTEE            │  ← POST automatique → API Kaze
  └──────────┬──────────┘
             │  Convoyeur prend en charge
             ▼
  ┌─────────────────────┐
  │ EN_COURS            │  ← Webhook Kaze : in_progress
  └──────────┬──────────┘
             │  Livraison effectuée
             ▼
  ┌─────────────────────┐
  │ LIVREE              │  ← Webhook Kaze : delivered
  └─────────────────────┘

          ou à tout moment :

  ┌─────────────────────┐
  │ ANNULEE             │
  └─────────────────────┘
```

---

## 🚀 Installation & Démarrage

### Prérequis

- **Node.js** 18+
- **PostgreSQL** 14+ (ou Docker)
- **npm** 9+

### 1. Cloner le projet

```bash
git clone <repo-url>
cd dlc-kaze
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
# Éditez .env avec vos vraies valeurs (clé API Kaze, JWT secret, etc.)
```

### 3. Lancer la base de données (Docker)

```bash
docker compose up -d
```

### 4. Installer les dépendances

```bash
npm install
```

### 5. Créer les tables

```bash
npm run db:migrate
```

### 6. Seed (compte Admin)

```bash
npm run db:seed
```

Le seed exige `ADMIN_PASSWORD` dans le `.env` — il n'existe aucun mot de
passe par défaut. Définissez aussi `ADMIN_EMAIL` (sinon `drivelineconnect@gmail.com`).
Le compte est créé, ou son mot de passe réinitialisé s'il existe déjà.

### 7. Démarrer le projet

```bash
npm run dev
```

- **Front-end** : http://localhost:5173
- **Back-end** : http://localhost:4000
- **API Health** : http://localhost:4000/api/health

---

## 🔌 Intégration API Kaze

### Envoi automatique (POST)

Quand un client accepte un devis, le serveur envoie automatiquement les données à Kaze :

```
Client clique "Accepter"
  → POST /api/missions/:id/accepter
    → Statut local = ACCEPTEE
    → POST https://app.kaze.so/api/jobs (auth JWT via KAZE_LOGIN / KAZE_PASSWORD)
    → Stocke le kaze_mission_id en local
```

### Lecture planning convoyeur (GET)

Le portail convoyeur interroge directement l'API Kaze :

```
Convoyeur ouvre son planning
  → GET /api/convoyeur/missions
    → GET https://app.kaze.so/api/jobs?performer_id=XXX
    → Fallback sur la base locale si Kaze est indisponible
```

### Webhooks (synchronisation entrante)

Kaze notifie votre serveur quand un statut change :

```
Kaze envoie POST /api/webhooks/kaze
  → Vérification signature HMAC SHA-256
  → Mapping statut Kaze → statut local
  → UPDATE missions SET status = '...' WHERE kaze_mission_id = '...'
```

**Configuration côté Kaze :**

1. Paramètres → Webhooks
2. URL : `https://votre-domaine.com/api/webhooks/kaze`
3. Événements : `mission.updated`, `mission.completed`
4. Copier le secret dans `KAZE_WEBHOOK_SECRET`

---

## 📁 Structure du Projet

```
dlc-kaze/
├── .env.example
├── docker-compose.yml
├── package.json                  # Monorepo (workspaces)
│
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js              # Point d'entrée Express
│       ├── db/
│       │   ├── index.js          # Pool PostgreSQL
│       │   ├── migrate.js        # Création des tables
│       │   └── seed.js           # Seed Admin
│       ├── middleware/
│       │   ├── auth.middleware.js # JWT + RBAC + validation
│       │   └── error.middleware.js
│       ├── routes/
│       │   ├── auth.routes.js    # Login / Register / Me
│       │   ├── mission.routes.js # CRUD missions client
│       │   ├── admin.routes.js   # Dashboard admin + cotation
│       │   ├── convoyeur.routes.js # Planning convoyeur
│       │   └── webhook.routes.js # Webhooks Kaze
│       └── services/
│           └── kaze.service.js   # Client HTTP Kaze
│
└── client/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx               # Router principal + RBAC
        ├── index.css             # Tailwind + composants custom
        ├── lib/
        │   ├── api.js            # Client Axios + intercepteurs
        │   └── utils.js          # Helpers (statuts, dates, prix)
        ├── context/
        │   └── AuthContext.jsx   # Provider d'authentification
        ├── layouts/
        │   ├── PublicLayout.jsx  # Navbar + footer vitrine
        │   └── DashboardLayout.jsx # Sidebar + header dashboard
        └── pages/
            ├── LandingPage.jsx   # Page vitrine
            ├── LoginPage.jsx     # Connexion
            ├── RegisterPage.jsx  # Inscription
            ├── client/
            │   ├── ClientDashboard.jsx  # Liste missions
            │   ├── NewMission.jsx       # Formulaire création
            │   └── MissionDetail.jsx    # Détail + acceptation
            ├── admin/
            │   ├── AdminDashboard.jsx   # Stats + quick links
            │   ├── AdminMissions.jsx    # Table + modal cotation
            │   └── AdminUsers.jsx       # Gestion utilisateurs
            └── convoyeur/
                └── ConvoyeurDashboard.jsx # Planning missions
```

---

## 🔐 Sécurité

- **JWT** : Token signé avec `JWT_SECRET`, expirant après 7 jours.
- **RBAC** : Middleware `authorize('admin')` sur chaque route protégée.
- **Validation client** : Un client doit être validé par l'Admin (flag `is_validated`).
- **Auth Kaze** : Identifiants (`KAZE_LOGIN` / `KAZE_PASSWORD`) stockés dans `.env` côté serveur. Le proxy Vite empêche toute exposition front.
- **Webhook signature** : Vérification HMAC SHA-256 avec `crypto.timingSafeEqual`. Rejeté en production si `KAZE_WEBHOOK_SECRET` absent.
- **Rate limiting** : 5 000 req / 15 min global, 20 req / 15 min sur les routes auth.
- **Helmet** : Headers de sécurité HTTP + CSP.
- **CORS** : Restreint à `CLIENT_URL`.
- **Validation env** : Les variables critiques (`DATABASE_URL`, `JWT_SECRET`) sont vérifiées au démarrage.

---

## ⚙️ Variables d'environnement

| Variable              | Obligatoire | Description                        | Valeur par défaut                |
| --------------------- | ----------- | ---------------------------------- | -------------------------------- |
| `NODE_ENV`            | Non         | Environnement                      | `development`                    |
| `PORT`                | Non         | Port du serveur Express            | `4000`                           |
| `DATABASE_URL`        | **Oui**     | URL de connexion PostgreSQL        | —                                |
| `JWT_SECRET`          | **Oui**     | Secret pour signer les tokens JWT  | —                                |
| `JWT_EXPIRES_IN`      | Non         | Durée de validité du token         | `7d`                             |
| `CLIENT_URL`          | Non         | URL du front (CORS + liens emails) | —                                |
| `KAZE_API_BASE_URL`   | Non         | URL de base de l'API Kaze          | `https://app.kaze.so/api`        |
| `KAZE_LOGIN`          | Non\*       | Email de connexion Kaze            | —                                |
| `KAZE_PASSWORD`       | Non\*       | Mot de passe Kaze                  | —                                |
| `KAZE_WEBHOOK_SECRET` | Non\*       | Secret HMAC pour les webhooks Kaze | —                                |
| `SMTP_HOST`           | Non         | Serveur SMTP                       | — (mode console)                 |
| `SMTP_PORT`           | Non         | Port SMTP                          | `587`                            |
| `SMTP_USER`           | Non         | Utilisateur SMTP                   | —                                |
| `SMTP_PASS`           | Non         | Mot de passe SMTP                  | —                                |
| `SMTP_FROM`           | Non         | Expéditeur des emails              | `Drive Line Connect <noreply@drivelineconnect.com>` |
| `ADMIN_EMAIL`         | Non         | Email admin pour les notifications | `drivelineconnect@gmail.com`              |

> \* Nécessaire pour l'intégration Kaze. Sans ces variables, les fonctionnalités Kaze sont désactivées avec un warning.

---

## 📄 Licence

Projet privé — Tous droits réservés.
