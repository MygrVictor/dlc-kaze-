/**
 * Middleware de sécurité avancée — DLC Kaze
 *
 * Regroupe : sanitization XSS, validation d'entrées,
 * protection contre les injections, audit logging.
 */

const xss = require("xss");

// ─── 1. Sanitization XSS récursive ────────────────────────────
// Nettoie toutes les valeurs string du body/query/params
const xssOptions = {
  whiteList: {}, // Aucune balise HTML autorisée
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

function sanitizeValue(value) {
  if (typeof value === "string") {
    return xss(value.trim(), xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    clean[key] = sanitizeValue(val);
  }
  return clean;
}

const sanitizeInputs = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// ─── 2. Protection contre les injections SQL dans les params ──
// Vérifie que les UUID dans les params sont valides
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateUUIDParams = (req, res, next) => {
  for (const [key, value] of Object.entries(req.params)) {
    if (key === "id" && value && !UUID_REGEX.test(value)) {
      return res.status(400).json({ error: "Identifiant invalide." });
    }
  }
  next();
};

// ─── 3. Limite de taille du body ──────────────────────────────
const bodyTooLarge = (maxSizeKB = 100) => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > maxSizeKB * 1024) {
      return res.status(413).json({ error: "Requête trop volumineuse." });
    }
    next();
  };
};

// ─── 4. Validation de la force du mot de passe ───────────────
function validatePassword(password) {
  const errors = [];

  if (!password || password.length < 8) {
    errors.push("Le mot de passe doit faire au moins 8 caractères.");
  }
  if (password && password.length > 128) {
    errors.push("Le mot de passe ne doit pas dépasser 128 caractères.");
  }
  if (password && !/[A-Z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une majuscule.");
  }
  if (password && !/[a-z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une minuscule.");
  }
  if (password && !/[0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un chiffre.");
  }
  if (password && !/[^A-Za-z0-9]/.test(password)) {
    errors.push(
      "Le mot de passe doit contenir au moins un caractère spécial (!@#$%...).",
    );
  }

  return errors;
}

// ─── 5. Validation email stricte ─────────────────────────────
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidEmail(email) {
  return (
    typeof email === "string" && email.length <= 254 && EMAIL_REGEX.test(email)
  );
}

// ─── 5 bis. Validation du mobile (notifications WhatsApp) ─────
/**
 * Vérifie qu'un numéro est un mobile joignable sur WhatsApp.
 *
 * Accepte les écritures françaises courantes (06…, +33 6…, 0033 6…)
 * ainsi que les numéros internationaux préfixés par « + ».
 * Les fixes français (01 à 05, 09) sont refusés : WhatsApp exige un mobile.
 */
function isValidMobile(phone) {
  if (typeof phone !== "string") return false;

  const international = phone.trim().startsWith("+");
  let chiffres = phone.replace(/\D/g, "");
  if (!chiffres) return false;

  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  else if (international) {
    // déjà sans indicatif de sortie
  } else if (chiffres.length === 10 && chiffres.startsWith("0")) {
    // Numéro national : seuls 06 et 07 sont des mobiles.
    return /^0[67]\d{8}$/.test(chiffres);
  }

  // Forme internationale : France = 33 suivi de 6 ou 7.
  if (chiffres.startsWith("33")) {
    // Certains saisissent « +33 06… » en conservant le zéro national.
    const national = chiffres.slice(2).replace(/^0/, "");
    return /^[67]\d{8}$/.test(national);
  }

  // Autres pays : longueur plausible, on ne présume pas des plans de numérotation.
  return chiffres.length >= 8 && chiffres.length <= 15;
}

// ─── 6. Rate limiting par action sensible ─────────────────────
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 tentatives max par IP
  message: {
    error:
      "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Utiliser X-Forwarded-For si derrière un proxy, sinon IP directe
    return req.ip;
  },
});

const createMissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 30, // 30 missions par heure max
  message: {
    error: "Trop de missions créées. Veuillez réessayer plus tard.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── 7. Audit log (écriture console structurée) ──────────────
function auditLog(action, userId, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    userId: userId || "anonymous",
    ip: details.ip || "unknown",
    ...details,
  };
  // En production, écrire dans un fichier ou un service de logging
  console.log(`🔒 AUDIT: ${JSON.stringify(entry)}`);
}

// Middleware qui attache l'audit logger à chaque requête
const attachAuditLog = (req, _res, next) => {
  req.audit = (action, details = {}) => {
    auditLog(action, req.user?.id, {
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.substring(0, 200),
      path: req.originalUrl,
      method: req.method,
      ...details,
    });
  };
  next();
};

// ─── 8. Protection contre les réponses trop verbeuses ────────
// Empêche d'exposer des erreurs détaillées en production
const safeErrorHandler = (err, _req, res, _next) => {
  console.error("💥 Erreur :", err.message || err);

  const status = err.status || 500;
  const isDev = process.env.NODE_ENV === "development";

  res.status(status).json({
    error:
      status === 500 && !isDev
        ? "Erreur interne du serveur."
        : err.message || "Erreur interne du serveur.",
    ...(isDev && { stack: err.stack }),
  });
};

// ─── 9. Headers de sécurité supplémentaires ──────────────────
const securityHeaders = (_req, res, next) => {
  // Protection cache : ne jamais cacher de données sensibles
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Interdire l'intégration dans un iframe externe
  res.setHeader("X-Frame-Options", "DENY");

  // Empêcher le MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Politique de permissions restrictive
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  next();
};

// ─── 10. Détection de tentatives suspectes ────────────────────
// Patterns vérifiés dans l'URL uniquement (les bodies sont déjà sanitisés par XSS)
const urlSuspiciousPatterns = [
  /(%27)|(')|(--)|(\\%23)|(#)/i, // SQL injection classiques
  /((%3C)|<)((%2F)\/)*[a-z0-9%]+((%3E)|>)/i, // XSS tags
  /((%3C)|<)((%69)|i|(%49))((%6D)|m|(%4D))((%67)|g|(%47))/i, // img tags
  /(\.\.\/|\.\.\\)/i, // Path traversal
];

// Patterns vérifiés dans le body (uniquement injections structurées, pas de mots isolés)
const bodySuspiciousPatterns = [
  /('\s*(OR|AND)\s+')/i, // ' OR '1'='1'
  /(;\s*(DROP|ALTER|TRUNCATE|CREATE)\s)/i, // ; DROP TABLE
  /(UNION\s+(ALL\s+)?SELECT)/i, // UNION SELECT
  /(<script[^>]*>)/i, // <script> tags dans le body
];

const detectSuspiciousActivity = (req, res, next) => {
  const fullUrl = req.originalUrl || "";

  for (const pattern of urlSuspiciousPatterns) {
    if (pattern.test(fullUrl)) {
      console.warn(
        `🚨 SUSPICIOUS URL blocked from ${req.ip}: ${req.method} ${fullUrl}`,
      );
      return res.status(400).json({ error: "Requête rejetée." });
    }
  }

  if (req.body && typeof req.body === "object") {
    const body = JSON.stringify(req.body);
    for (const pattern of bodySuspiciousPatterns) {
      if (pattern.test(body)) {
        console.warn(
          `🚨 SUSPICIOUS BODY blocked from ${req.ip}: ${req.method} ${fullUrl}`,
        );
        return res.status(400).json({ error: "Requête rejetée." });
      }
    }
  }

  next();
};

module.exports = {
  sanitizeInputs,
  validateUUIDParams,
  bodyTooLarge,
  validatePassword,
  isValidEmail,
  isValidMobile,
  authLimiter,
  createMissionLimiter,
  attachAuditLog,
  auditLog,
  safeErrorHandler,
  securityHeaders,
  detectSuspiciousActivity,
};
