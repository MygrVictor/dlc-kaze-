const { extractAuthToken } = require("../lib/auth-cookie");
const { utilisateurDuJeton } = require("../lib/session");

/**
 * Vérifie le token JWT et attache req.user.
 *
 * Un jeton émis avant le dernier changement de mot de passe est refusé
 * (voir lib/session.js).
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: "Token manquant." });
    }

    const user = await utilisateurDuJeton(token);
    if (!user) {
      return res.status(401).json({ error: "Token invalide ou expiré." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expiré." });
  }
};

/**
 * Middleware de contrôle de rôle (RBAC).
 * Usage : authorize('admin') ou authorize('client', 'admin')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Non authentifié." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès interdit pour ce rôle." });
    }
    next();
  };
};

/**
 * Vérifie que le client a été validé par l'Admin.
 */
const requireValidation = (req, res, next) => {
  if (req.user.role === "client" && !req.user.is_validated) {
    return res.status(403).json({
      error:
        "Votre compte doit être validé par un administrateur avant de pouvoir créer une mission.",
    });
  }
  next();
};

module.exports = { authenticate, authorize, requireValidation };
