/**
 * Référence des missions envoyées à Kaze : R.2890, R.2891…
 *
 * Le client numérotait ses missions Kaze à la suite (R.02, R.03…). DLC
 * envoyait « DLC-<8 caractères de l'identifiant> », sans ordre. La
 * référence vient désormais d'une séquence PostgreSQL : deux missions
 * créées au même instant ne peuvent pas recevoir le même numéro.
 *
 * Le point de départ est fixé par la migration
 * (db/migrate-reference-missions.js). Pour le déplacer plus tard :
 *   SELECT setval('mission_reference_seq', <prochain numéro>, false);
 */

const PREFIXE = "R.";

/** Ancienne référence, gardée en secours si la base ne répond pas. */
const referenceDeSecours = (mission) =>
  `DLC-${String(mission.id || "").substring(0, 8).toUpperCase()}`;

/**
 * Donne la référence Kaze d'une mission, en l'attribuant à la première
 * demande. Une mission renvoyée à Kaze (relance, recréation) garde son
 * numéro : on ne consomme jamais un numéro deux fois pour elle.
 *
 * Ne lève jamais : sans base, on revient à l'ancienne référence plutôt
 * que d'empêcher la création de la mission sur Kaze.
 */
async function referenceMission(mission) {
  if (mission?.kaze_reference) return mission.kaze_reference;
  if (!mission?.id) return referenceDeSecours(mission || {});

  const db = require("../db");
  try {
    const { rows: deja } = await db.query(
      "SELECT kaze_reference FROM missions WHERE id = $1",
      [mission.id],
    );
    if (deja[0]?.kaze_reference) return deja[0].kaze_reference;

    const { rows: suivant } = await db.query(
      "SELECT nextval('mission_reference_seq') AS numero",
    );
    const numero = suivant[0]?.numero;
    if (numero === undefined || numero === null) {
      return referenceDeSecours(mission);
    }
    const reference = `${PREFIXE}${numero}`;

    // `kaze_reference IS NULL` : si une autre requête a attribué un numéro
    // entre-temps, c'est le sien qui fait foi (le nôtre est perdu, ce qui
    // laisse un trou mais jamais de doublon).
    const { rows: pose } = await db.query(
      `UPDATE missions SET kaze_reference = $1
        WHERE id = $2 AND kaze_reference IS NULL
        RETURNING kaze_reference`,
      [reference, mission.id],
    );
    if (pose[0]?.kaze_reference) return pose[0].kaze_reference;

    const { rows: relu } = await db.query(
      "SELECT kaze_reference FROM missions WHERE id = $1",
      [mission.id],
    );
    return relu[0]?.kaze_reference || reference;
  } catch (err) {
    console.error(
      "⚠️ Référence de mission : numérotation indisponible, ancienne référence utilisée :",
      err.message,
    );
    return referenceDeSecours(mission);
  }
}

module.exports = { referenceMission, referenceDeSecours, PREFIXE };
