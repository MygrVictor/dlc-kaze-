/**
 * Passe de synchronisation Kaze → DLC, en un seul coup.
 *
 * Destiné au cron de l'hébergeur, là où le processus applicatif n'est
 * pas garanti permanent (Passenger endort l'application entre deux
 * visites, ce qui interrompt le polling interne).
 *
 * Exemple de tâche cron o2switch, toutes les 5 minutes :
 *   *\/5 * * * * cd ~/dlc-kaze && /usr/bin/node scripts/sync-once.js >> ~/logs/sync.log 2>&1
 *
 * Le script se termine toujours : il ne laisse aucun processus vivant.
 */
require("dotenv").config();

const { syncKazeStatuses } = require("../server/src/services/sync.service");

// Filet de sécurité : si Kaze ne répond pas, on ne veut pas d'un
// processus cron qui traîne indéfiniment et s'empile à chaque passe.
const DELAI_MAX_MS = 4 * 60 * 1000;

const minuteur = setTimeout(() => {
  console.error(
    `⏱️  Sync interrompue : dépassement de ${DELAI_MAX_MS / 1000}s.`,
  );
  process.exit(1);
}, DELAI_MAX_MS);

(async () => {
  if (!process.env.KAZE_LOGIN || !process.env.KAZE_PASSWORD) {
    console.log("⏸️  Sync ignorée : identifiants Kaze non configurés.");
    clearTimeout(minuteur);
    process.exit(0);
  }

  const debut = Date.now();

  try {
    await syncKazeStatuses();
    const duree = ((Date.now() - debut) / 1000).toFixed(1);
    console.log(`✅ Sync terminée en ${duree}s — ${new Date().toISOString()}`);
    clearTimeout(minuteur);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Sync échouée : ${err.message}`);
    clearTimeout(minuteur);
    process.exit(1);
  }
})();
