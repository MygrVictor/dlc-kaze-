/**
 * Recherche dans Kaze un driver correspondant au convoyeur DLC
 * "Victor Maso Y Guell Rivet" (kaze_driver_id actuel = "sdfgbfhddg",
 * une valeur invalide/de test) via son téléphone (0638872575).
 *
 * Si trouvé, met à jour la base DLC avec le VRAI kaze_driver_id.
 * Sinon, nettoie simplement la valeur invalide (met à NULL) pour éviter
 * que le système tente d'assigner un driver_id qui n'existe pas dans Kaze.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");
const db = require("../server/src/db");

const CONVOYEUR_ID = "12adee25-66f7-4e76-a232-d3ddf9cd3ed0";
const PHONE_VARIANTS = [
  "0638872575",
  "33638872575",
  "+33638872575",
  "638872575",
];

(async () => {
  try {
    await kazeService.authenticate();

    console.log("--- Recherche du driver Kaze par téléphone ---");
    let found = null;
    for (const phone of PHONE_VARIANTS) {
      try {
        const driver = await kazeService.getDriverByPhone(phone);
        if (driver) {
          found = driver;
          console.log(
            `✅ Trouvé avec le format "${phone}":`,
            JSON.stringify(driver),
          );
          break;
        }
      } catch (e) {
        console.log(`  (pas de résultat pour "${phone}")`);
      }
    }

    if (!found) {
      console.log("\n❌ Aucun driver Kaze ne correspond à ce téléphone.");
      console.log(
        "→ Nettoyage : mise à NULL du kaze_driver_id invalide 'sdfgbfhddg'.",
      );
      const updated = await db.query(
        `UPDATE users SET kaze_driver_id = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, full_name, email, kaze_driver_id`,
        [CONVOYEUR_ID],
      );
      console.log("✅ Mis à jour:", updated.rows[0]);
    } else {
      console.log(
        `\n✅ Driver Kaze réel trouvé (id=${found.id}) → mise à jour DB.`,
      );
      const updated = await db.query(
        `UPDATE users SET kaze_driver_id = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, full_name, email, kaze_driver_id`,
        [found.id, CONVOYEUR_ID],
      );
      console.log("✅ Mis à jour:", updated.rows[0]);
    }

    process.exit(0);
  } catch (err) {
    console.error(
      "ERREUR:",
      err.response?.status,
      err.response?.data || err.message,
    );
    process.exit(1);
  }
})();
