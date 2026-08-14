const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const {
  authLimiter,
  validatePassword,
  isValidEmail,
  isValidMobile,
  auditLog,
} = require("../middleware/security.middleware");
const emailService = require("../services/email.service");
const kazeService = require("../services/kaze.service");

const { authenticate, authorize } = require("../middleware/auth.middleware");
const crypto = require("crypto");

const router = express.Router();

// ── Rate limiting sur les routes d'authentification ──────────
router.use(authLimiter);

/**
 * Génère un mot de passe temporaire sécurisé (12 caractères).
 * Contient majuscules, minuscules, chiffres et caractères spéciaux.
 */
function generateTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  let password = "";
  // Garantir au moins un de chaque type
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += special[crypto.randomInt(special.length)];
  // Compléter à 12 caractères
  for (let i = 4; i < 12; i++) {
    password += all[crypto.randomInt(all.length)];
  }
  // Mélanger
  return password
    .split("")
    .sort(() => crypto.randomInt(3) - 1)
    .join("");
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/register — Création de compte (Admin uniquement)
// ══════════════════════════════════════════════════════════════
router.post(
  "/register",
  authenticate,
  authorize("admin"),
  async (req, res, next) => {
    try {
      const { email, fullName, phone, company, role, password } = req.body;

      if (!email || !fullName) {
        return res
          .status(400)
          .json({ error: "Email et nom complet obligatoires." });
      }

      // Validation email stricte
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Adresse email invalide." });
      }

      // Sanitize fullName : max 100 chars
      if (fullName.length > 100) {
        return res.status(400).json({
          error: "Le nom complet ne doit pas dépasser 100 caractères.",
        });
      }

      // Seuls les rôles client et convoyeur peuvent être créés
      const allowedRoles = ["client", "convoyeur"];
      const userRole = allowedRoles.includes(role) ? role : "client";

      // Les convoyeurs sont alertés des missions par WhatsApp :
      // un mobile joignable est indispensable.
      if (userRole === "convoyeur") {
        if (!phone) {
          return res.status(400).json({
            error:
              "Le numéro de mobile est obligatoire pour un convoyeur (notifications WhatsApp).",
          });
        }
        if (!isValidMobile(phone)) {
          return res.status(400).json({
            error:
              "Numéro de mobile invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.",
          });
        }
      }

      const existing = await db.query("SELECT id FROM users WHERE email = $1", [
        email.toLowerCase().trim(),
      ]);
      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "Un compte existe déjà avec cet email." });
      }

      // Mot de passe : utiliser celui fourni ou en générer un temporaire
      const clearPassword = password || generateTempPassword();

      // Valider la force si mot de passe fourni manuellement
      if (password) {
        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
          return res
            .status(400)
            .json({ error: passwordErrors[0], details: passwordErrors });
        }
      }

      const passwordHash = await bcrypt.hash(clearPassword, 12);

      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, phone, company, role, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, full_name, role, is_validated, created_at`,
        [
          email.toLowerCase().trim(),
          passwordHash,
          fullName.trim(),
          phone || null,
          company || null,
          userRole,
          true, // Validé automatiquement car créé par l'admin
        ],
      );

      const user = rows[0];

      // ── Auto-liaison Kaze pour les convoyeurs ──────────────────
      if (userRole === "convoyeur") {
        try {
          const kazeDriver = await kazeService.getDriverByEmail(user.email);
          if (kazeDriver && kazeDriver.id) {
            const existingKaze = await db.query(
              "SELECT id FROM users WHERE kaze_driver_id = $1",
              [kazeDriver.id],
            );
            if (existingKaze.rows.length === 0) {
              await db.query(
                "UPDATE users SET kaze_driver_id = $1, updated_at = NOW() WHERE id = $2",
                [kazeDriver.id, user.id],
              );
              user.kaze_driver_id = kazeDriver.id;
              console.log(
                `✅ Auto-liaison Kaze : ${user.email} → driver ${kazeDriver.id}`,
              );
            }
          }
        } catch (kazeErr) {
          console.error(
            "⚠️ Auto-liaison Kaze échouée (non bloquant) :",
            kazeErr.message,
          );
        }
      }

      // Audit : création de compte par l'admin
      auditLog("USER_CREATED", req.user.id, {
        ip: req.ip,
        createdUser: user.email,
        role: userRole,
        createdBy: req.user.email,
      });

      // Envoyer un email de bienvenue avec les identifiants
      try {
        await emailService.notifyAccountCreated(user, clearPassword);
      } catch (emailErr) {
        console.error("⚠️ Email de bienvenue non envoyé :", emailErr.message);
      }

      // Retourner les identifiants à l'admin (mot de passe en clair, une seule fois)
      res.status(201).json({
        user,
        generatedPassword: clearPassword,
        message: `Compte ${userRole} créé. Les identifiants ont été envoyés par email.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Inscription publique (client ou convoyeur) ───────────────
router.post("/register-public", async (req, res, next) => {
  try {
    const { email, fullName, phone, company, password, role } = req.body;

    if (!email || !fullName || !password) {
      return res
        .status(400)
        .json({ error: "Nom, email et mot de passe obligatoires." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }

    if (fullName.length > 100) {
      return res
        .status(400)
        .json({ error: "Le nom complet ne doit pas dépasser 100 caractères." });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res
        .status(400)
        .json({ error: passwordErrors[0], details: passwordErrors });
    }

    const allowedRoles = ["client", "convoyeur"];
    const userRole = allowedRoles.includes(role) ? role : "client";

    // Les convoyeurs sont alertés des missions par WhatsApp :
    // un mobile joignable est indispensable.
    if (userRole === "convoyeur") {
      if (!phone) {
        return res.status(400).json({
          error:
            "Le numéro de mobile est obligatoire pour un convoyeur (notifications WhatsApp).",
        });
      }
      if (!isValidMobile(phone)) {
        return res.status(400).json({
          error:
            "Numéro de mobile invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.",
        });
      }
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "Un compte existe déjà avec cet email." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone, company, role, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, full_name, role, is_validated, created_at`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        fullName.trim(),
        phone || null,
        company || null,
        userRole,
        false, // En attente de validation par un admin
      ],
    );

    const user = rows[0];

    auditLog("USER_REGISTERED", user.id, {
      ip: req.ip,
      email: user.email,
      role: userRole,
    });

    try {
      await emailService.notifyNewRegistration(user);
    } catch (emailErr) {
      console.error(
        "⚠️ Email admin (nouvelle inscription) non envoyé :",
        emailErr.message,
      );
    }

    try {
      await emailService.notifyRegistrationReceived(user.email, user.full_name);
    } catch (emailErr) {
      console.error(
        "⚠️ Email de confirmation d'inscription non envoyé :",
        emailErr.message,
      );
    }

    res.status(201).json({
      message:
        "Compte créé avec succès. Votre demande est en attente de validation par un administrateur.",
    });
  } catch (err) {
    next(err);
  }
});

// ── Connexion ────────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email et mot de passe obligatoires." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [
      normalizedEmail,
    ]);
    if (rows.length === 0) {
      // Audit : tentative échouée (utilisateur inexistant)
      auditLog("LOGIN_FAILED", null, {
        ip: req.ip,
        email: normalizedEmail,
        reason: "user_not_found",
      });
      return res.status(401).json({ error: "Identifiants incorrects." });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Audit : tentative échouée (mauvais mot de passe)
      auditLog("LOGIN_FAILED", user.id, {
        ip: req.ip,
        email: normalizedEmail,
        reason: "invalid_password",
      });
      return res.status(401).json({ error: "Identifiants incorrects." });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    // Audit : connexion réussie
    auditLog("LOGIN_SUCCESS", user.id, {
      ip: req.ip,
      email: normalizedEmail,
      role: user.role,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_validated: user.is_validated,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// ── Profil courant ───────────────────────────────────────────
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
