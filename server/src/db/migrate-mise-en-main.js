/**
 * Migration : service « Mise en main du véhicule ».
 *
 * Les services proposés à la création se limitent désormais à trois :
 * carburant, gestion documentaire et mise en main. Le lavage extérieur et
 * le nettoyage intérieur ne sont plus proposés, mais leurs colonnes sont
 * conservées : des missions historiques les portent encore.
 */
require("dotenv").config();
const db = require("./index");

const migrate = async () => {
  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS service_handover BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log("✅ Colonne service_handover ajoutée.");

  const { rows } = await db.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE service_handover) ::int AS avec_mise_en_main
    FROM missions;
  `);
  const { total, avec_mise_en_main } = rows[0];
  console.log(
    `ℹ️  ${total} mission(s) — ${avec_mise_en_main} avec mise en main.`,
  );

  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Migration échouée :", err.message);
  process.exit(1);
});
