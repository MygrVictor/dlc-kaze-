const crypto = require("crypto");

/**
 * Comparaison à temps constant entre la clé fournie et une clé attendue.
 *
 * Un `===` (ou `Array.includes`) s'arrête au premier caractère qui diffère :
 * le temps de réponse fuit alors la longueur du préfixe correct, ce qu'un
 * attaquant peut exploiter pour reconstituer la clé octet par octet. On
 * compare donc des condensés de longueur fixe en `timingSafeEqual`.
 */
function cleValide(fournie, attendue) {
  const a = crypto.createHash("sha256").update(String(fournie)).digest();
  const b = crypto.createHash("sha256").update(String(attendue)).digest();
  return crypto.timingSafeEqual(a, b);
}

function authenticatePartnerApiKey(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");

  const configuredKeys = [
    process.env.INTERENCHERES_API_KEY,
    process.env.INTERENCHERES_API_KEY_SANDBOX,
  ].filter(Boolean);

  if (!configuredKeys.length) {
    return res.status(503).json({
      error: "API partenaire non configurée (clé manquante).",
    });
  }

  // La comparaison parcourt toujours toutes les clés configurées, sans
  // court-circuit : le temps de réponse ne dépend donc pas de la clé visée.
  const autorise =
    Boolean(token) &&
    configuredKeys.reduce((ok, cle) => cleValide(token, cle) || ok, false);

  if (!autorise) {
    return res.status(401).json({ error: "Clé API invalide." });
  }

  return next();
}

module.exports = { authenticatePartnerApiKey };
