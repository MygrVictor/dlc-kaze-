// Cherche un convoyeur Kaze par email. Sert à retrouver l'identifiant à
// inscrire dans users.kaze_driver_id, sans avoir à le relever à la main
// dans l'interface Kaze.
//
//   node scripts/trouver-driver-kaze.js driverlineconnect@gmail.com

require("../server/src/lib/charger-env").chargerEnv();
const kazeService = require("../server/src/services/kaze.service");

const email = process.argv[2];
if (!email) {
  console.error("Usage : node scripts/trouver-driver-kaze.js <email>");
  process.exit(1);
}

(async () => {
  try {
    const driver = await kazeService.getDriverByEmail(email);
    if (!driver) {
      console.log(`Aucun convoyeur Kaze pour « ${email} ».`);
      process.exit(2);
    }
    console.log("Convoyeur trouvé :");
    console.log(`  id        : ${driver.id}`);
    console.log(`  nom       : ${driver.name || driver.full_name || "—"}`);
    console.log(`  email     : ${driver.email || "—"}`);
    console.log("\nÀ reporter dans Utilisateurs → colonne Kaze → « Non lié ».");
  } catch (err) {
    console.error("Échec de la recherche :", err.message);
    process.exit(1);
  }
})();
