/**
 * Migration — Missions créées par l'administration.
 *
 * Deux besoins :
 *
 *  1. Une mission peut naître sans commanditaire. DLC prend parfois une
 *     course en direct, par téléphone, sans que le donneur d'ordre ait
 *     de compte sur la plateforme. `client_id` devient donc facultatif.
 *
 *  2. Il faut pouvoir distinguer ces missions de celles saisies par un
 *     client, ne serait-ce que pour ne pas leur envoyer de devis.
 *     `created_by` conserve l'administrateur à l'origine de la saisie.
 *
 * La contrainte NOT NULL est retirée plutôt que la colonne rendue
 * nullable par recréation : les missions existantes gardent leur client
 * et leurs clés étrangères.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — missions créées par l'administration…");

  await db.query(`
    ALTER TABLE missions ALTER COLUMN client_id DROP NOT NULL;

    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

    -- Les missions sans commanditaire sont consultées à part dans le
    -- tableau de bord : un index partiel suffit, elles restent minoritaires.
    CREATE INDEX IF NOT EXISTS idx_missions_sans_client
      ON missions(created_at DESC) WHERE client_id IS NULL;
  `);

  console.log("  · client_id est désormais facultatif");
  console.log("  · colonne created_by ajoutée");
  console.log("Migration terminée avec succès.");
};

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Échec de la migration :", err.message);
    process.exit(1);
  });
