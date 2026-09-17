const jwt = require("jsonwebtoken");
const db = require("../db");

/**
 * Vérifie le token JWT et attache req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant." });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(
      "SELECT id, email, full_name, phone, role, is_validated, kaze_driver_id, parent_id FROM users WHERE id = $1",
      [decoded.userId],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Utilisateur introuvable." });
    }

    req.user = rows[0];
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
