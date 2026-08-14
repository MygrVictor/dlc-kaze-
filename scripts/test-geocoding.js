/**
 * Vérifie que le géocodage fonctionne correctement pour des adresses réelles
 * (test unitaire manuel du correctif appliqué à kaze.service.js createMission).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const geocodingService = require("../server/src/services/geocoding.service");

(async () => {
  const addresses = [
    "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
    "10 Place Bellecour, 69002 Lyon",
    "1 Promenade des Anglais, 06000 Nice",
  ];
  for (const addr of addresses) {
    const coords = await geocodingService.geocode(addr);
    console.log(`${addr} ->`, coords);
  }
  process.exit(0);
})();
