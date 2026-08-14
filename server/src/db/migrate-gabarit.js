/**
 * Migration : gabarit du véhicule et classe de péage.
 *
 * Le type de véhicule ne se limite plus à « berline / utilitaire » : on
 * enregistre le gabarit précis (L1H1 → L4H3) car il conditionne la
 * conduite et la classe facturée aux péages.
 */
require("dotenv").config();
const db = require("./index");

const migrate = async () => {
  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS vehicle_toll_class VARCHAR(2);
  `);
  console.log("✅ Colonne vehicle_toll_class ajoutée.");

  // La colonne vehicle_type stockait des libellés ("Berline", "SUV / 4x4").
  // Elle accueille désormais des codes ; on élargit pour être tranquille.
  await db.query(
    `ALTER TABLE missions ALTER COLUMN vehicle_type TYPE VARCHAR(50);`,
  );

  const { rows } = await db.query(`
    SELECT vehicle_type, COUNT(*)::int AS total
    FROM missions
    WHERE vehicle_type IS NOT NULL
    GROUP BY vehicle_type
    ORDER BY total DESC;
  `);

  if (rows.length === 0) {
    console.log("ℹ️  Aucune mission ne porte de type de véhicule.");
  } else {
    console.log("ℹ️  Types présents en base :");
    for (const r of rows) console.log(`   • ${r.vehicle_type} → ${r.total}`);
  }

  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Migration échouée :", err.message);
  process.exit(1);
});
