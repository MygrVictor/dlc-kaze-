/**
 * App Express isolée pour les tests — sans app.listen() ni startSync.
 * Utilisée par Supertest.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-jest";
process.env.PORT = "4001";

const path = require("path");
const express = require("express");
const cors = require("cors");
const hpp = require("hpp");
const {
  sanitizeInputs,
  securityHeaders,
  attachAuditLog,
  detectSuspiciousActivity,
  safeErrorHandler,
} = require("../middleware/security.middleware");

const authRoutes = require("../routes/auth.routes");
const missionRoutes = require("../routes/mission.routes");
const adminRoutes = require("../routes/admin.routes");
const convoyeurRoutes = require("../routes/convoyeur.routes");
const factureRoutes = require("../routes/facture.routes");

// Désactiver le rate limiter global pour les tests
const rateLimit = require("express-rate-limit");
const noLimit = rateLimit({ windowMs: 1000, max: 10000 });

const app = express();

app.use(noLimit);
app.use(cors({ origin: true, credentials: true }));
app.use(hpp());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(sanitizeInputs);
app.use(detectSuspiciousActivity);
app.use(attachAuditLog);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/convoyeur", convoyeurRoutes);
app.use("/api/factures", factureRoutes);

app.use(safeErrorHandler);

module.exports = app;
