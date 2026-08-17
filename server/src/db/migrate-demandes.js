/**
 * Migration — table `contact_requests`.
 *
 * Les comptes ne sont plus créés librement depuis le site : un visiteur
 * laisse ses coordonnées, l'administrateur le rappelle puis crée le compte
 * lui-même. Cette table stocke ces demandes entrantes.
 *
 * Un prospect client fournit une structure et un moyen de contact (email
 * OU téléphone) ; un prospect convoyeur fournit nom, prénom, email et
 * mobile. La contrainte le vérifie côté base, pas seulement côté code.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Création de la table contact_requests…");

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE demande_type AS ENUM ('client', 'convoyeur');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE demande_status AS ENUM (
        'nouvelle',
        'contactee',
        'convertie',
        'archivee'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS contact_requests (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type          demande_type NOT NULL,

      -- Convoyeur : prénom + nom. Client : nom du contact (facultatif).
      first_name    VARCHAR(80),
      last_name     VARCHAR(80),

      -- Client : raison sociale de la structure.
      company       VARCHAR(150),

      email         VARCHAR(255),
      phone         VARCHAR(30),
      message       TEXT,

      status        demande_status NOT NULL DEFAULT 'nouvelle',
      admin_note    TEXT,

      -- Compte créé à partir de cette demande, s'il y en a un.
      converted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      handled_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      handled_at    TIMESTAMPTZ,

      -- Conservées pour tracer les envois abusifs.
      ip            VARCHAR(45),

      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Une demande sans moyen de rappel n'a aucune valeur.
    DO $$ BEGIN
      ALTER TABLE contact_requests
        ADD CONSTRAINT chk_demande_contact
        CHECK (email IS NOT NULL OR phone IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_demandes_status  ON contact_requests(status);
    CREATE INDEX IF NOT EXISTS idx_demandes_type    ON contact_requests(type);
    CREATE INDEX IF NOT EXISTS idx_demandes_created ON contact_requests(created_at DESC);
  `);

  console.log("✅ Table contact_requests créée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Erreur de migration :", err);
  process.exit(1);
});
