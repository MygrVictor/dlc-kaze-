/**
 * Migration — référence de commande interne sur les missions.
 *
 * Besoin : stocker un numéro de commande / bon de commande visible
 * uniquement côté administration.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — ajout du numéro de commande…");

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(150);
  `);

  console.log("  · colonne purchase_order_number ajoutée");
  console.log("Migration terminée avec succès.");
};

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Échec de la migration :", err.message);
    process.exit(1);
  });
