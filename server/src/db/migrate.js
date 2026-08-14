/**
 * Script de migration — crée les tables users et missions.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  SCHÉMA DE LA BASE DE DONNÉES LOCALE                            │
 * ├──────────────────────────────────────────────────────────────────┤
 * │                                                                  │
 * │  ┌─────────── users ──────────────┐                              │
 * │  │ id              UUID (PK)      │                              │
 * │  │ email           VARCHAR UNIQUE │                              │
 * │  │ password_hash   VARCHAR        │                              │
 * │  │ full_name       VARCHAR        │                              │
 * │  │ phone           VARCHAR        │                              │
 * │  │ company         VARCHAR        │                              │
 * │  │ role            ENUM           │  client | convoyeur | admin  │
 * │  │ is_validated    BOOLEAN        │  (Admin valide le client)    │
 * │  │ kaze_driver_id  VARCHAR        │  (ID Kaze du convoyeur)      │
 * │  │ created_at      TIMESTAMPTZ    │                              │
 * │  │ updated_at      TIMESTAMPTZ    │                              │
 * │  └────────────────────────────────┘                              │
 * │         │                                                        │
 * │         │ 1:N                                                    │
 * │         ▼                                                        │
 * │  ┌─────────── missions ───────────┐                              │
 * │  │ id              UUID (PK)      │                              │
 * │  │ client_id       UUID (FK)      │ → users.id                   │
 * │  │ departure_city  VARCHAR        │                              │
 * │  │ departure_addr  TEXT           │                              │
 * │  │ arrival_city    VARCHAR        │                              │
 * │  │ arrival_addr    TEXT           │                              │
 * │  │ vehicle_brand   VARCHAR        │                              │
 * │  │ vehicle_model   VARCHAR        │                              │
 * │  │ vehicle_plate   VARCHAR        │                              │
 * │  │ vehicle_year    INTEGER        │                              │
 * │  │ vehicle_type    VARCHAR        │  (berline, SUV, utilitaire…) │
 * │  │ comments        TEXT           │                              │
 * │  │ desired_date    DATE           │                              │
 * │  │ price           NUMERIC(10,2)  │  (fixé par l'Admin)          │
 * │  │ status          ENUM           │  (workflow 4 étapes)         │
 * │  │ kaze_mission_id VARCHAR        │  (ID retourné par Kaze)      │
 * │  │ convoyeur_id    UUID (FK)      │ → users.id (nullable)        │
 * │  │ created_at      TIMESTAMPTZ    │                              │
 * │  │ updated_at      TIMESTAMPTZ    │                              │
 * │  └────────────────────────────────┘                              │
 * │                                                                  │
 * │  Status possibles :                                              │
 * │    EN_ATTENTE_DE_COTATION → DEVIS_PROPOSE → ACCEPTEE             │
 * │    → EN_COURS → LIVREE → ANNULEE                                 │
 * └──────────────────────────────────────────────────────────────────┘
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Lancement de la migration…");

  // gen_random_uuid() est intégré à PostgreSQL depuis la version 13.
  // Avant, il fallait l'extension pgcrypto — or CREATE EXTENSION exige
  // des privilèges souvent refusés en hébergement mutualisé. On tente,
  // et on ne bloque que si la fonction reste réellement indisponible.
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  } catch (err) {
    console.warn(
      `⚠️  Extension pgcrypto non installable (${err.message.split("\n")[0]}).`,
    );
  }

  try {
    await db.query(`SELECT gen_random_uuid();`);
  } catch {
    console.error(
      "❌ gen_random_uuid() indisponible : PostgreSQL 13+ est requis,\n" +
        "   ou l'extension pgcrypto doit être activée par l'hébergeur.",
    );
    process.exit(1);
  }

  await db.query(`
    -- Types ENUM
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('client', 'convoyeur', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE mission_status AS ENUM (
        'EN_ATTENTE_DE_COTATION',
        'DEVIS_PROPOSE',
        'ACCEPTEE',
        'ASSIGNEE',
        'EN_COURS',
        'LIVREE',
        'ANNULEE'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    -- Table USERS
    CREATE TABLE IF NOT EXISTS users (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email           VARCHAR(255) UNIQUE NOT NULL,
      password_hash   VARCHAR(255) NOT NULL,
      full_name       VARCHAR(150) NOT NULL,
      phone           VARCHAR(30),
      company         VARCHAR(150),
      role            user_role NOT NULL DEFAULT 'client',
      is_validated    BOOLEAN NOT NULL DEFAULT false,
      kaze_driver_id  VARCHAR(100),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Table MISSIONS
    CREATE TABLE IF NOT EXISTS missions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      -- Étape 1 : Identité du véhicule
      vehicle_plate   VARCHAR(20),
      vehicle_vin     VARCHAR(17),
      vehicle_brand   VARCHAR(80),
      vehicle_model   VARCHAR(80),
      vehicle_finish  VARCHAR(100),
      vehicle_energy  VARCHAR(30),
      vehicle_state   VARCHAR(30),
      vehicle_keys    INTEGER DEFAULT 1,
      vehicle_year    INTEGER,
      vehicle_type    VARCHAR(50),

      -- Étape 2 : Logistique de départ (enlèvement)
      departure_address TEXT NOT NULL,
      departure_date    TIMESTAMPTZ,
      departure_contact_name VARCHAR(150),
      departure_contact_phone VARCHAR(30),
      departure_instructions TEXT,

      -- Étape 3 : Logistique d'arrivée (livraison)
      arrival_address   TEXT NOT NULL,
      arrival_date      TIMESTAMPTZ,
      arrival_contact_name VARCHAR(150),
      arrival_contact_phone VARCHAR(30),
      service_wash_exterior BOOLEAN DEFAULT false,
      service_clean_interior BOOLEAN DEFAULT false,
      service_refuel BOOLEAN DEFAULT false,

      -- Étape 4 : Sécurité & urgence
      emergency_phone VARCHAR(30),

      -- Date souhaitée par le client. Interne à DLC : arrival_date porte
      -- la date opérationnelle (lundi) transmise à Kaze.
      desired_delivery_date TIMESTAMPTZ,
      -- Coché par le client lui-même, sans seuil automatique.
      is_urgent       BOOLEAN NOT NULL DEFAULT false,

      -- Méta
      comments        TEXT,
      price           NUMERIC(10, 2),
      price_convoyeur NUMERIC(10, 2),
      status          mission_status NOT NULL DEFAULT 'EN_ATTENTE_DE_COTATION',
      kaze_mission_id VARCHAR(100),
      convoyeur_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Index utiles
    CREATE INDEX IF NOT EXISTS idx_missions_client   ON missions(client_id);
    CREATE INDEX IF NOT EXISTS idx_missions_status   ON missions(status);
    CREATE INDEX IF NOT EXISTS idx_missions_convoyeur ON missions(convoyeur_id);
    CREATE INDEX IF NOT EXISTS idx_missions_urgent    ON missions(is_urgent) WHERE is_urgent = true;
    CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_kaze_unique ON missions(kaze_mission_id) WHERE kaze_mission_id IS NOT NULL;

    -- ──────────────────────────────────────────────────────────
    -- Alignement strict avec le formulaire Kaze (workflow CONVOYAGE,
    -- étape « Résumé mission »). Chaque colonne correspond à un
    -- widget du workflow afin que les deux formulaires soient
    -- des duplicatas l'un de l'autre.
    -- ──────────────────────────────────────────────────────────
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS vehicle_utility_12m3    VARCHAR(10);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS departure_structure     VARCHAR(150);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS departure_structure_name VARCHAR(150);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS departure_contact_email VARCHAR(255);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrival_contact_email   VARCHAR(255);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrival_instructions    TEXT;
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS retribution_details     VARCHAR(255);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS service_document_management VARCHAR(255);
    -- Services proposés à la création : carburant, gestion documentaire et
    -- mise en main. Les colonnes service_wash_exterior / service_clean_interior
    -- subsistent uniquement pour les missions historiques.
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS service_handover BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS emergency_contact_name  VARCHAR(150);
    ALTER TABLE missions ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(255);
  `);

  console.log("✅ Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Erreur de migration :", err);
  process.exit(1);
});
