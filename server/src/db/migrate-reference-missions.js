require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});

const db = require("./index");

// Prochain numéro à attribuer, donné par l'exploitation le 23/11/2026 :
// la numérotation manuelle du client sur Kaze s'est arrêtée à R.2889.
const PREMIER_NUMERO = 2890;

async function migrate() {
  console.log("Migration — références de missions R.xxxx…");

  // IF NOT EXISTS : rejouer la migration ne remet jamais le compteur à
  // zéro. Le déplacer se fait à la main (voir reference-mission.service).
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS mission_reference_seq
      START WITH ${PREMIER_NUMERO}
      MINVALUE 1;
  `);

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS kaze_reference VARCHAR(30);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_kaze_reference
      ON missions(kaze_reference)
      WHERE kaze_reference IS NOT NULL;
  `);

  console.log("✅ Migration terminée avec succès.");
}

migrate()
  .catch((err) => {
    console.error("❌ Erreur migration références:", err);
    process.exit(1);
  })
  .finally(() => db.pool.end());

module.exports = migrate;
