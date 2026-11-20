/**
 * Émission et vérification des jetons de session.
 *
 * Un JWT est valable jusqu'à son expiration, quoi qu'il arrive au compte
 * entre-temps. Sans mécanisme de révocation, changer son mot de passe
 * après un vol de session ne servait à rien : le jeton dérobé restait
 * utilisable sept jours.
 *
 * Chaque compte porte donc une `token_version`, recopiée dans le jeton à
 * l'émission (`tv`). L'incrémenter — à chaque changement de mot de passe —
 * invalide d'un coup toutes les sessions ouvertes. La vérification ne
 * coûte rien de plus : l'utilisateur est de toute façon relu en base à
 * chaque requête, pour que rôle et existence du compte soient à jour.
 *
 * Les deux points d'entrée authentifiés (API et téléchargement de
 * documents) passent par ce module : écrire la règle deux fois, c'était
 * prendre le risque de n'en durcir qu'une.
 */
const jwt = require("jsonwebtoken");
const db = require("../db");

// Algorithme imposé : on ne laisse pas l'en-tête du jeton le choisir.
const ALGORITHME = "HS256";

const COLONNES_SESSION =
  "id, email, full_name, phone, role, is_validated, kaze_driver_id, parent_id, token_version";

/** Version courante d'un compte ; absente sur une base pas encore migrée. */
const versionDe = (valeur) => Number(valeur ?? 0) || 0;

function signerJeton(user, expiresIn) {
  return jwt.sign(
    { userId: user.id, role: user.role, tv: versionDe(user.token_version) },
    process.env.JWT_SECRET,
    { algorithm: ALGORITHME, expiresIn },
  );
}

/**
 * Renvoie l'utilisateur correspondant au jeton, ou `null` si le jeton est
 * invalide, expiré, révoqué, ou si le compte n'existe plus.
 */
async function utilisateurDuJeton(token) {
  let charge;
  try {
    charge = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [ALGORITHME],
    });
  } catch {
    return null;
  }

  const { rows } = await db.query(
    `SELECT ${COLONNES_SESSION} FROM users WHERE id = $1`,
    [charge.userId],
  );
  const user = rows?.[0];
  if (!user) return null;

  if (versionDe(user.token_version) !== versionDe(charge.tv)) return null;

  // La version est une donnée interne : elle n'a pas à suivre `req.user`
  // jusque dans une réponse.
  delete user.token_version;
  return user;
}

module.exports = { signerJeton, utilisateurDuJeton, ALGORITHME };
