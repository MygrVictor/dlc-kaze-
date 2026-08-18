/**
 * Migration : regroupement des missions créées en une seule fois.
 *
 * Quand un client déclare plusieurs véhicules au départ du même endroit,
 * l'application crée une mission par véhicule (c'est ce que Kaze attend :
 * un job = un véhicule = un convoyeur). Mais commercialement il s'agit
 * d'une seule affaire : le client veut un devis unique avec le total.
 *
 * `batch_id` relie ces missions entre elles sans changer la structure
 * existante ni le fonctionnement de Kaze.
 */
require("dotenv").config();
const db = require("./index");

const migrate = async () => {
  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS batch_id UUID;
  `);
  console.log("✅ Colonne batch_id ajoutée.");

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_batch ON missions(batch_id);
  `);
  console.log("✅ Index idx_missions_batch créé.");

  const { rows } = await db.query(`
    SELECT COUNT(*)::int AS total FROM missions WHERE batch_id IS NOT NULL;
  `);
  console.log(`ℹ️  ${rows[0].total} mission(s) déjà rattachée(s) à un lot.`);

  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Migration échouée :", err.message);
  process.exit(1);
});
