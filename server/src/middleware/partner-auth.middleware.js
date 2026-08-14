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

  if (!token || !configuredKeys.includes(token)) {
    return res.status(401).json({ error: "Clé API invalide." });
  }

  return next();
}

module.exports = { authenticatePartnerApiKey };
