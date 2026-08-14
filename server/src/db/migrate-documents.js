/**
 * Migration — Ajoute la table convoyeur_documents
 * pour stocker les documents de validation des convoyeurs.
 *
 *  Types de documents :
 *    - permis          : Permis de conduire
 *    - carte_identite  : Carte d'identité
 *    - assurance       : Attestation d'assurance convoyeur
 *    - domicile        : Justificatif de domicile
 *
 *  Statuts :
 *    - en_attente   : Document soumis, en attente de vérification admin
 *    - valide       : Document validé par un admin
 *    - refuse       : Document refusé par un admin (motif dans admin_note)
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Migration documents convoyeurs…");

  await db.query(`
    -- ENUM type de document
    DO $$ BEGIN
      CREATE TYPE doc_type AS ENUM (
        'permis',
        'carte_identite',
        'assurance',
        'domicile'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    -- ENUM statut document
    DO $$ BEGIN
      CREATE TYPE doc_status AS ENUM (
        'en_attente',
        'valide',
        'refuse'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    -- Table convoyeur_documents
    CREATE TABLE IF NOT EXISTS convoyeur_documents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      convoyeur_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            doc_type NOT NULL,
      original_name   VARCHAR(255) NOT NULL,
      file_path       VARCHAR(500) NOT NULL,
      mime_type       VARCHAR(100),
      status          doc_status NOT NULL DEFAULT 'en_attente',
      admin_note      TEXT,
      reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Un seul document par type par convoyeur (le dernier remplace l'ancien)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_convoyeur_doc_type
      ON convoyeur_documents(convoyeur_id, type);

    CREATE INDEX IF NOT EXISTS idx_doc_convoyeur ON convoyeur_documents(convoyeur_id);
    CREATE INDEX IF NOT EXISTS idx_doc_status    ON convoyeur_documents(status);
  `);

  console.log("✅ Table convoyeur_documents créée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Erreur migration documents :", err);
  process.exit(1);
});
