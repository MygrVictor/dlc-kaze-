/**
 * Migration — qualification des candidatures convoyeur
 *
 * Le formulaire public était trop court : n'importe qui pouvait postuler,
 * et l'équipe perdait du temps à rappeler des profils non éligibles. On
 * demande désormais les éléments qui conditionnent réellement l'accès aux
 * missions, et on les stocke pour pouvoir filtrer avant tout rappel :
 *
 *  - le SIRET, qui atteste d'une activité déclarée ;
 *  - la RC Circulation, sans laquelle aucun véhicule ne peut être confié.
 *    Un convoyeur en cours d'obtention reste recevable, d'où un statut à
 *    trois valeurs plutôt qu'un simple booléen ;
 *  - la certification W garage, exigée par certains donneurs d'ordre.
 */
require("../lib/charger-env").chargerEnv();
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Qualification des candidatures convoyeur…");

  await db.query(`
    DO $$ BEGIN
      CREATE TYPE statut_assurance AS ENUM ('oui', 'en_cours', 'non');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE contact_requests
      ADD COLUMN IF NOT EXISTS siret           VARCHAR(14),
      ADD COLUMN IF NOT EXISTS rc_circulation  statut_assurance,
      ADD COLUMN IF NOT EXISTS rc_pro          statut_assurance,
      ADD COLUMN IF NOT EXISTS w_garage        BOOLEAN;

    -- Le filtre principal d'Inès porte sur l'assurance : sans index, la
    -- liste des candidatures se relit intégralement à chaque tri.
    CREATE INDEX IF NOT EXISTS idx_demandes_rc_circ
      ON contact_requests(rc_circulation);
  `);

  console.log("✅ Colonnes de qualification convoyeur ajoutées.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Erreur de migration :", err);
  process.exit(1);
});
