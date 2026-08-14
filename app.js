/**
 * Point d'entrée pour o2switch (cPanel Node.js Selector / Phusion Passenger)
 *
 * Ce fichier est celui que cPanel référence comme "Application startup file".
 * Il charge simplement le serveur Express existant.
 */
process.env.NODE_ENV = "production";
require("./server/src/index.js");
