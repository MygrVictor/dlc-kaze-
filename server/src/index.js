require("./lib/charger-env").chargerEnv();

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
const factureRoutes = require("./routes/facture.routes");
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

// ── Confiance dans le proxy ─────────────────────────────────
// Derrière Passenger/Apache (o2switch), l'IP réelle du client n'arrive que
// via X-Forwarded-For. Sans ce réglage, express-rate-limit refuse de démarrer
// et req.ip vaudrait l'adresse du proxy — limitant tout le monde ensemble.
// La valeur 1 ne fait confiance qu'au premier saut : un client ne peut donc
// pas usurper son IP en forgeant l'en-tête lui-même.
if (isProduction) {
  app.set("trust proxy", 1);
}

// ── Sécurité — Headers ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Crisp (messagerie de l'espace client) charge son widget depuis
        // ses propres domaines : sans ces autorisations, le navigateur
        // bloque le script et aucune bulle n'apparaît.
        scriptSrc: ["'self'", "https://client.crisp.chat"],
        // Google Fonts : la feuille de style vient de fonts.googleapis.com,
        // mais les fichiers de police (.woff2) sont servis par un autre
        // domaine, fonts.gstatic.com. Les deux sont nécessaires — n'en
        // autoriser qu'un donne un texte en police de repli, sans erreur
        // visible dans la console.
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://client.crisp.chat",
        ],
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
          "https://client.crisp.chat",
          "https://image.crisp.chat",
          "https://storage.crisp.chat",
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
          "https://client.crisp.chat",
          // La conversation est temps réel : elle passe par une
          // WebSocket, que `connect-src` gouverne aussi.
          "wss://client.relay.crisp.chat",
          "wss://stream.relay.crisp.chat",
        ].filter(Boolean),
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://client.crisp.chat",
        ],
        objectSrc: ["'none'"],
        // Crisp affiche son interface dans une iframe, et les pièces
        // jointes envoyées par l'équipe s'ouvrent depuis son stockage.
        frameSrc: ["'self'", "https://client.crisp.chat"],
        mediaSrc: ["'self'", "https://client.crisp.chat"],
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
  // Une connexion réussie ne doit pas consommer le quota : sinon un
  // utilisateur légitime qui se reconnecte plusieurs fois dans la journée
  // finit bloqué au même titre qu'un attaquant.
  skipSuccessfulRequests: true,
  message: { error: "Trop de tentatives de connexion. Réessayez plus tard." },
});
app.use("/api/", globalLimiter);
app.use("/api/auth/login", authLimiter);

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/convoyeur", convoyeurRoutes);
app.use("/api/factures", factureRoutes);
app.use("/api/v1", partnerRoutes);

// ── Fichiers uploadés (documents convoyeurs) ─────────────────
//
// Ces fichiers sont des pièces d'identité : leur accès est nominatif.
// Un jeton valide ne suffit pas, on vérifie en base que le demandeur
// est bien le propriétaire du document — ou un administrateur.
//
// Le jeton est accepté en query param car ces URL sont posées dans des
// balises <img>/<a> qui ne peuvent pas porter d'en-tête Authorization.
const uploadsDir = require("./lib/uploads").RACINE_UPLOADS;
if (!require("fs").existsSync(uploadsDir))
  require("fs").mkdirSync(uploadsDir, { recursive: true });

const jwt = require("jsonwebtoken");
const fs = require("fs");
const db = require("./db");

app.get("/uploads/*", async (req, res) => {
  let charge;
  try {
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

    charge = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré." });
  }

  try {
    // Le jeton porte un rôle figé à l'émission : on relit l'utilisateur
    // pour qu'un compte supprimé ou rétrogradé perde l'accès immédiatement.
    const { rows: comptes } = await db.query(
      "SELECT id, role FROM users WHERE id = $1",
      [charge.userId],
    );
    const demandeur = comptes[0];
    if (!demandeur) {
      return res.status(401).json({ error: "Compte introuvable." });
    }

    const cheminRelatif = `/uploads/${req.params[0]}`;

    // Deux familles de fichiers cohabitent sous /uploads : les pièces
    // d'identité des convoyeurs et les factures des clients. Chacune a sa
    // propre règle de propriété, on interroge donc les deux tables.
    const { rows: docs } = await db.query(
      "SELECT convoyeur_id FROM convoyeur_documents WHERE file_path = $1",
      [cheminRelatif],
    );
    const document = docs[0];

    let proprietaireId = document?.convoyeur_id ?? null;

    if (!document) {
      const { rows: factures } = await db.query(
        "SELECT destinataire_id FROM factures WHERE file_path = $1",
        [cheminRelatif],
      );
      if (factures[0]) proprietaireId = factures[0].destinataire_id;
    }

    // Troisième famille : les pièces déposées par un candidat convoyeur,
    // qui n'a pas encore de compte. Elles n'ont donc pas de propriétaire
    // au sens de `users` — seul un administrateur peut les consulter.
    let reserveAdmin = false;
    if (!proprietaireId) {
      const { rows: candidatures } = await db.query(
        "SELECT id FROM demande_documents WHERE file_path = $1",
        [cheminRelatif],
      );
      if (candidatures[0]) reserveAdmin = true;
    }

    if (reserveAdmin) {
      if (demandeur.role !== "admin") {
        return res.status(404).json({ error: "Fichier introuvable." });
      }
    } else {
      // Un fichier inconnu de la base n'a aucune raison d'être servi :
      // on répond 404 plutôt que 403 pour ne rien révéler de son existence.
      if (!proprietaireId) {
        return res.status(404).json({ error: "Fichier introuvable." });
      }

      const estProprietaire = proprietaireId === demandeur.id;
      if (!estProprietaire && demandeur.role !== "admin") {
        return res.status(404).json({ error: "Fichier introuvable." });
      }
    }

    const resolvedPath = path.resolve(path.join(uploadsDir, req.params[0]));
    // Le séparateur final est indispensable : sans lui, un dossier voisin
    // nommé « uploads_old » satisferait le test de préfixe.
    if (!resolvedPath.startsWith(uploadsDir + path.sep)) {
      return res.status(403).json({ error: "Accès interdit." });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }

    // Ceinture et bretelles : même si un HTML parvenait à être stocké,
    // le navigateur ne l'exécuterait pas sur notre origine.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error("Téléchargement de document impossible :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
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
  // visites), le cron scripts/sync-once.js fait déjà le travail : garder
  // en plus un polling toutes les 60 s multipliait par 6 le volume
  // d'appels à l'API Kaze pour un résultat identique. En production, le
  // polling est donc éteint par défaut ; SYNC_INTERVAL_MS permet de le
  // rallumer si l'application migre un jour vers un processus permanent.
  const defautIntervalle = process.env.NODE_ENV === "production" ? 0 : 60_000;
  const intervalle = Number(process.env.SYNC_INTERVAL_MS ?? defautIntervalle);

  if (intervalle > 0) {
    startSync(intervalle);
  } else {
    console.log(
      "⏸️  Polling interne désactivé — la synchronisation doit être assurée par le cron (scripts/sync-once.js).",
    );
  }
});

module.exports = app;
