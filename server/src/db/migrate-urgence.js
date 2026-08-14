/**
 * Migration — Date souhaitée de livraison et marqueur d'urgence
 *
 * Deux notions de date cohabitent désormais :
 *   • `arrival_date`           : date opérationnelle transmise à Kaze,
 *                                systématiquement le lundi de la semaine
 *                                de création.
 *   • `desired_delivery_date`  : souhait exprimé par le client. Reste
 *                                interne à DLC, jamais transmis à Kaze.
 *
 * `is_urgent` est coché par le client lui-même : aucun seuil automatique,
 * une livraison sous 24 h comme sous 72 h relève du même bouton.
 *
 * Usage : node src/db/migrate-urgence.js
 */
require("dotenv").config({
  path: require("path").join(__dirname, "../../../.env"),
});
const db = require("./index");

async function migrer() {
  console.log("── Migration : date souhaitée et urgence ──\n");

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS desired_delivery_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log("✅ Colonnes desired_delivery_date et is_urgent ajoutées");

  // Les missions urgentes sont consultées en priorité au moment de la
  // cotation : un index partiel suffit, elles restent minoritaires.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_urgent
      ON missions(is_urgent) WHERE is_urgent = true;
  `);
  console.log("✅ Index sur les missions urgentes créé");

  const { rows } = await db.query(`
    SELECT COUNT(*) AS total,
           COUNT(desired_delivery_date) AS avec_souhait,
           COUNT(*) FILTER (WHERE is_urgent) AS urgentes
    FROM missions;
  `);
  console.log(
    `\n${rows[0].total} mission(s) — ${rows[0].avec_souhait} avec date souhaitée, ${rows[0].urgentes} urgente(s)`,
  );
}

migrer()
  .then(() => {
    console.log("\n✅ Migration terminée.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Migration échouée :", err.message);
    process.exit(1);
  });
