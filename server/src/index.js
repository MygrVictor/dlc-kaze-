require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");

const authRoutes = require("./routes/auth.routes");
const missionRoutes = require("./routes/mission.routes");
const adminRoutes = require("./routes/admin.routes");
const convoyeurRoutes = require("./routes/convoyeur.routes");
const webhookRoutes = require("./routes/webhook.routes");
const partnerRoutes = require("./routes/partner.routes");
const {
  sanitizeInputs,
  securityHeaders,
  attachAuditLog,
  detectSuspiciousActivity,
  safeErrorHandler,
  bodyTooLarge,
} = require("./middleware/security.middleware");
const { startSync } = require("./services/sync.service");

// ── Validation des variables d'environnement ─────────────────
const requiredEnv = ["DATABASE_URL", "JWT_SECRET"];
const optionalEnv = [
  {
    key: "KAZE_LOGIN",
    warn: "Intégration Kaze désactivée (KAZE_LOGIN manquant)",
  },
  {
    key: "KAZE_PASSWORD",
    warn: "Intégration Kaze désactivée (KAZE_PASSWORD manquant)",
  },
  {
    key: "KAZE_WEBHOOK_SECRET",
    warn: "Webhooks Kaze non sécurisés (KAZE_WEBHOOK_SECRET manquant)",
  },
  {
    key: "KAZE_TARGET_ID",
    warn: "Création Kaze potentiellement bloquée en initial (KAZE_TARGET_ID manquant)",
  },
  {
    key: "INTERENCHERES_API_KEY",
    warn: "API partenaire Interenchères non sécurisée (INTERENCHERES_API_KEY manquant)",
  },
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `❌ Variables d'environnement manquantes : ${missing.join(", ")}`,
  );
  console.error(
    "   → Copiez .env.example vers .env et remplissez les valeurs.",
  );
  process.exit(1);
}

optionalEnv.forEach(({ key, warn }) => {
  if (!process.env[key]) {
    console.warn(`⚠️  ${warn}`);
  }
});

const app = express();
const PORT = process.env.PORT || 4000;

const isProduction = process.env.NODE_ENV === "production";

// ── Sécurité — Headers ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Fournisseurs de tuiles utilisés par la carte admin (AdminMap.jsx).
        // Toute nouvelle couche doit être ajoutée ici, sinon le navigateur
        // bloque silencieusement les images en production.
        imgSrc: [
          "'self'",
          "data:",
          "https://server.arcgisonline.com",
          "https://*.basemaps.cartocdn.com",
          "https://tile.openstreetmap.org",
          "https://*.tile.openstreetmap.org",
          "https://*.tile.openstreetmap.fr",
          "https://*.tile.opentopomap.org",
        ],
        connectSrc: [
          "'self'",
          process.env.CLIENT_URL,
          "https://server.arcgisonline.com",
          "https://*.basemaps.cartocdn.com",
          "https://tile.openstreetmap.org",
          "https://*.tile.openstreetmap.org",
          "https://*.tile.openstreetmap.fr",
          "https://*.tile.opentopomap.org",
        ].filter(Boolean),
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(securityHeaders);

// ── CORS strict ─────────────────────────────────────────────
if (isProduction) {
  // En production, le client est servi depuis le même serveur
  // CORS n'est pas nécessaire mais on l'active pour les requêtes API
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(
    cors({
      origin: process.env.CLIENT_URL,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );
}

// ── Protection HTTP Parameter Pollution ─────────────────────
app.use(hpp());

// ── Webhook (raw body nécessaire pour la vérification de signature) ──
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

// ── Body parsing + Limite de taille ─────────────────────────
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// ── Logging ──────────────────────────────────────────────────
app.use(morgan(isProduction ? "combined" : "dev"));

// ── Sécurité — Middleware globaux ────────────────────────────
app.use(sanitizeInputs); // Nettoyage XSS récursif
app.use(detectSuspiciousActivity); // Détection d'injections
app.use(attachAuditLog); // Logger d'audit sur req.audit()

// ── Rate limiting ────────────────────────────────────────────
// Global : généreux pour les dashboards auto-refresh
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez dans quelques minutes." },
});
// Auth : strict anti-bruteforce (20 tentatives / 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Réessayez plus tard." },
});
app.use("/api/", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/convoyeur", convoyeurRoutes);
app.use("/api/v1", partnerRoutes);

// ── Fichiers uploadés (documents convoyeurs) ─────────────────
// Accessible via token en query param (?token=...) pour les liens directs
const uploadsDir = path.resolve(__dirname, "../../uploads");
if (!require("fs").existsSync(uploadsDir))
  require("fs").mkdirSync(uploadsDir, { recursive: true });

const jwt = require("jsonwebtoken");
const fs = require("fs");

app.get("/uploads/*", async (req, res) => {
  try {
    // Accepter le token soit en header Authorization soit en query param
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Token manquant." });
    }

    jwt.verify(token, process.env.JWT_SECRET);

    // Construire le chemin du fichier
    const filePath = path.join(uploadsDir, req.params[0]);

    // Vérifier que le fichier est bien dans uploadsDir (sécurité path traversal)
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
      return res.status(403).json({ error: "Accès interdit." });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }

    res.sendFile(resolvedPath);
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
});

// ── Health check ─────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Servir le client React en production ─────────────────────
if (isProduction) {
  const clientBuild = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientBuild));
  // SPA fallback : toute route non-API renvoie index.html
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(clientBuild, "index.html"));
    }
  });
}

// ── Error handler sécurisé (pas de stack trace en prod) ──────
app.use(safeErrorHandler);

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Serveur DLC-Kaze démarré sur http://localhost:${PORT}`);
  console.log(`🔒  Sécurité renforcée : XSS, HPP, CSP, injection, audit`);

  // Sync Kaze → DLC. Le polling interne suppose un processus permanent.
  // En hébergement mutualisé (Passenger endort l'application entre deux
  // visites), on le désactive avec SYNC_INTERVAL_MS=0 et on confie la
  // synchronisation au cron : scripts/sync-once.js.
  const intervalle = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);

  if (intervalle > 0) {
    startSync(intervalle);
  } else {
    console.log(
      "⏸️  Polling interne désactivé — la synchronisation doit être assurée par le cron (scripts/sync-once.js).",
    );
  }
});

module.exports = app;
