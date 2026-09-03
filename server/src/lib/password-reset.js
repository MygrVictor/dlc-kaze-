/**
 * Création d'un lien de réinitialisation de mot de passe.
 *
 * Deux points d'entrée le déclenchent : l'utilisateur qui a oublié son
 * mot de passe, et l'administrateur qui le dépanne. Les règles de
 * sécurité — empreinte seule en base, usage unique, invalidation des
 * demandes antérieures — sont identiques dans les deux cas et n'ont donc
 * aucune raison d'être écrites deux fois : les dupliquer, c'est prendre
 * le risque de n'en corriger qu'une le jour où elles évoluent.
 */
const crypto = require("crypto");
const db = require("../db");

// Durée volontairement courte : le lien vaut identification complète,
// il n'a pas à survivre à la boîte mail qui le transporte.
const VALIDITE_MINUTES = 30;

/** Empreinte du jeton : seule elle est conservée en base. */
const empreinte = (jeton) =>
  crypto.createHash("sha256").update(jeton).digest("hex");

/**
 * Génère un jeton, l'enregistre et renvoie le lien à communiquer.
 *
 * @param {string} userId identifiant de l'utilisateur concerné
 * @returns {Promise<{lien: string, minutes: number}>}
 */
async function creerLienReinitialisation(userId) {
  // Une nouvelle demande annule les précédentes : sans cela, plusieurs
  // liens vivraient en parallèle, et le plus ancien courrier resterait
  // exploitable longtemps après que l'utilisateur a cru le remplacer.
  await db.query(
    `UPDATE password_resets SET used_at = NOW()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );

  const jeton = crypto.randomBytes(32).toString("hex");
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [userId, empreinte(jeton), String(VALIDITE_MINUTES)],
  );

  return {
    lien: `${process.env.CLIENT_URL}/reinitialiser-mot-de-passe?token=${jeton}`,
    minutes: VALIDITE_MINUTES,
  };
}

module.exports = { creerLienReinitialisation, empreinte, VALIDITE_MINUTES };
