/**
 * Remplissage hors ligne du cache de géocodage pour les missions Kaze.
 *
 * La carte ne géocode plus les missions Kaze à la volée : Nominatim
 * n'accepte qu'une requête par seconde, si bien qu'un historique de
 * plusieurs milliers de missions demanderait des heures — largement plus
 * que le délai d'expiration d'une requête HTTP. La carte se contente donc
 * du cache, et c'est ce script qui le remplit, à son rythme.
 *
 * Usage :
 *   node scripts/backfill-geocodage-kaze.js            # 365 jours
 *   node scripts/backfill-geocodage-kaze.js 1095       # 3 ans
 *   node scripts/backfill-geocodage-kaze.js 365 200    # 200 adresses max
 *
 * Le traitement est interruptible et reprenable : chaque adresse résolue
 * est écrite en base immédiatement, et les adresses déjà connues sont
 * ignorées sans appel réseau. Relancer le script poursuit simplement le
 * travail là où il s'était arrêté.
 *
 * Comptez environ une seconde par adresse nouvelle.
 */
require("dotenv").config();

const db = require("../server/src/db");
const kazeService = require("../server/src/services/kaze.service");
const {
  geocode,
  geocodeDepuisCache,
} = require("../server/src/services/geocoding.service");

const JOURS = Number(process.argv[2]) || 365;
// Sans plafond, une première exécution sur trois ans pourrait tourner
// plusieurs heures. Mieux vaut plusieurs passes courtes et vérifiables.
const MAX_ADRESSES = Number(process.argv[3]) || 500;

async function main() {
  console.log(`🔍 Récupération des missions Kaze sur ${JOURS} jours…`);
  const jobs = (await kazeService.fetchRecentJobs(JOURS)) || [];
  console.log(`   ${jobs.length} mission(s) reçue(s).`);

  // Seules comptent les missions sans coordonnées : celles qui portent
  // déjà une position s'affichent sans géocodage.
  const adresses = [];
  for (const brut of jobs) {
    const job = kazeService.kazeJobToLocal(brut);
    if (job.latitude) continue;
    const adresse = job.address || job.departure_address;
    if (adresse && adresse.trim().length > 3) adresses.push(adresse.trim());
  }

  const uniques = [...new Set(adresses)];
  console.log(`   ${uniques.length} adresse(s) distincte(s) à résoudre.`);

  const dejaConnues = await geocodeDepuisCache(uniques);
  const manquantes = uniques.filter((a) => !dejaConnues.has(a));

  console.log(
    `   ${dejaConnues.size} déjà en cache, ${manquantes.length} à géocoder.`,
  );

  if (manquantes.length === 0) {
    console.log("\n✅ Cache complet, rien à faire.");
    return;
  }

  const lot = manquantes.slice(0, MAX_ADRESSES);
  if (lot.length < manquantes.length) {
    console.log(
      `   Traitement limité à ${lot.length} adresse(s) — relancez le script pour la suite.`,
    );
  }

  const debut = Date.now();
  let resolues = 0;
  let echecs = 0;

  for (const [index, adresse] of lot.entries()) {
    const coords = await geocode(adresse); // écrit en cache lui-même
    if (coords) {
      resolues++;
    } else {
      echecs++;
    }

    // Un point de repère régulier : sans lui, le script paraît figé.
    if ((index + 1) % 25 === 0 || index === lot.length - 1) {
      const ecoule = (Date.now() - debut) / 1000;
      const restant = Math.round(
        (ecoule / (index + 1)) * (lot.length - index - 1),
      );
      console.log(
        `   ${index + 1}/${lot.length} — ${resolues} résolue(s), ${echecs} échec(s), ~${restant}s restantes`,
      );
    }
  }

  console.log(
    `\n✅ Terminé : ${resolues} adresse(s) ajoutée(s) au cache, ${echecs} introuvable(s).`,
  );
  if (lot.length < manquantes.length) {
    console.log(
      `   Il reste ${manquantes.length - lot.length} adresse(s) : relancez le script.`,
    );
  }
}

main()
  .catch((err) => {
    console.error("\n❌ Interrompu :", err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool?.end?.());
