/**
 * Migration — Table factures
 *
 * Les factures étaient jusqu'ici transmises par courriel, hors de la
 * plateforme : un destinataire qui cherchait une pièce comptable devait
 * fouiller sa messagerie, et nous n'avions aucune trace de ce qui avait
 * été remis.
 *
 * Une seule table couvre les deux flux, car ils décrivent le même objet :
 * une pièce comptable déposée par l'administration dans l'espace d'un
 * utilisateur, qui la consulte et la télécharge.
 *
 *   - vers un client    : ce que nous lui facturons ;
 *   - vers un convoyeur : le relevé de ses prestations.
 *
 * Le sens est porté par `destinataire_role`, figé au dépôt. Le dupliquer
 * ici plutôt que de le lire dans `users` évite une jointure à chaque
 * lecture et fige la nature de la pièce même si le compte change de rôle.
 *
 * Le fichier n'est pas stocké en base : seul son chemin l'est, le binaire
 * restant sur disque comme pour les documents convoyeurs.
 */

require("../lib/charger-env").chargerEnv();
const db = require("./index");

async function migrate() {
  console.log("Migration des factures…");

  await db.query(`
    -- Une facture émise reste due tant qu'elle n'est pas réglée ;
    -- « annulee » couvre les avoirs et les erreurs d'émission.
    DO $$ BEGIN
      CREATE TYPE facture_statut AS ENUM ('emise', 'payee', 'annulee');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE facture_destinataire AS ENUM ('client', 'convoyeur');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS factures (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      destinataire_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      destinataire_role  facture_destinataire NOT NULL,
      numero             VARCHAR(60) NOT NULL,
      libelle            VARCHAR(200),
      -- Montant TTC en centimes : un flottant introduirait des écarts
      -- d'arrondi inacceptables sur des pièces comptables.
      montant_ttc        INTEGER,
      periode            VARCHAR(40),
      date_emission      DATE NOT NULL DEFAULT CURRENT_DATE,
      date_echeance      DATE,
      statut             facture_statut NOT NULL DEFAULT 'emise',
      original_name      VARCHAR(255) NOT NULL,
      file_path          VARCHAR(500) NOT NULL,
      mime_type          VARCHAR(100),
      -- Qui a déposé la pièce : indispensable en cas de contestation.
      deposee_par        UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Deux factures ne peuvent porter le même numéro pour un même
    -- destinataire : la contrainte protège contre le double dépôt.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_facture_destinataire_numero
      ON factures(destinataire_id, numero);

    -- Chaque espace liste les factures de son titulaire, de la plus
    -- récente à la plus ancienne : l'index couvre exactement ce tri.
    CREATE INDEX IF NOT EXISTS idx_facture_destinataire
      ON factures(destinataire_id, date_emission DESC);

    -- Le service de fichiers résout un chemin vers sa facture à chaque
    -- téléchargement ; sans index, ce contrôle scannerait toute la table.
    CREATE INDEX IF NOT EXISTS idx_facture_chemin
      ON factures(file_path);

    -- Le back-office filtre par nature de pièce puis par statut.
    CREATE INDEX IF NOT EXISTS idx_facture_role_statut
      ON factures(destinataire_role, statut);
  `);

  console.log("Table factures créée avec succès.");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur migration factures :", err);
    process.exit(1);
  });
