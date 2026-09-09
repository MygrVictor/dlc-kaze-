/**
 * Migration — structure de livraison et assureur RC Circulation
 *
 * Deux ajouts distincts, réunis ici parce qu'ils répondent à la même
 * demande d'exploitation : cadrer des saisies jusqu'ici libres.
 *
 * 1. `missions.arrival_structure`
 *
 *    Le départ distinguait déjà professionnel et particulier ; l'arrivée
 *    ne le permettait pas. C'est pourtant la même information, et elle
 *    change le déroulé de la livraison : un particulier n'a ni horaires
 *    d'ouverture ni quai, un professionnel exige souvent une prise de
 *    rendez-vous. Le convoyeur doit le savoir avant de partir.
 *
 * 2. `contact_requests.assureur_rc`
 *
 *    Les candidats convoyeurs déposent une attestation RC Circulation,
 *    mais l'assureur ne s'en déduit qu'en ouvrant le PDF. Le donneur
 *    d'ordre ne travaille qu'avec deux compagnies : connaître laquelle
 *    dès la candidature évite d'instruire un dossier qui sera écarté.
 *
 *    La colonne reste nullable : les candidatures déjà reçues n'ont pas
 *    été interrogées, et leur inventer une valeur serait une donnée
 *    fausse. Une candidature ancienne se distingue ainsi d'une nouvelle
 *    laissée vide — ce que la contrainte applicative interdit désormais.
 *
 * Les deux instructions sont idempotentes : rejouer cette migration sur
 * une base déjà à jour ne produit aucun effet.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — structure de livraison et assureur RC…");

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS arrival_structure VARCHAR(50);
  `);
  console.log("  · missions.arrival_structure");

  await db.query(`
    ALTER TABLE contact_requests
      ADD COLUMN IF NOT EXISTS assureur_rc VARCHAR(50);
  `);
  console.log("  · contact_requests.assureur_rc");

  console.log("Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("Erreur migration structure/assureur :", err.message);
  process.exit(1);
});
