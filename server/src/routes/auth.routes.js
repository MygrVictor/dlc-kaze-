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
const { isValidSiret, normaliserSiret } = require("../lib/siret");

const { authenticate, authorize } = require("../middleware/auth.middleware");
const crypto = require("crypto");

const router = express.Router();

// ── Rate limiting ────────────────────────────────────────────
// Volontairement PAS de `router.use(authLimiter)` : cela plafonnerait aussi
// GET /me, que le front interroge à chaque chargement de page pour restaurer
// la session. Quelques navigations suffisaient alors à épuiser le quota et
// à provoquer un 429 sur la connexion elle-même.
// Le limiteur n'est appliqué qu'aux routes réellement sensibles.

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

// ══════════════════════════════════════════════════════════════
// POST /api/auth/demande — Demande de mise en relation (public)
//
// Les comptes ne sont plus créés librement : un visiteur laisse ses
// coordonnées, l'administrateur le rappelle puis crée le compte depuis
// l'espace d'administration. Cette route n'écrit donc jamais dans
// `users`, seulement dans `contact_requests`.
// ══════════════════════════════════════════════════════════════
router.post("/demande", authLimiter, async (req, res, next) => {
  try {
    const {
      type,
      firstName,
      lastName,
      company,
      jobTitle,
      email,
      phone,
      message,
      siret,
      rcCirculation,
      rcPro,
      wGarage,
    } = req.body;

    const allowedTypes = ["client", "convoyeur"];
    if (!allowedTypes.includes(type)) {
      return res
        .status(400)
        .json({ error: "Type de demande invalide (client ou convoyeur)." });
    }

    const mail = email ? email.toLowerCase().trim() : null;
    const tel = phone ? phone.trim() : null;

    if (mail && !isValidEmail(mail)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }

    // Longueurs bornées : ces valeurs sont réaffichées dans l'espace admin.
    const champs = { firstName, lastName, company, jobTitle };
    for (const [nom, valeur] of Object.entries(champs)) {
      if (valeur && valeur.length > 150) {
        return res.status(400).json({ error: `Champ ${nom} trop long.` });
      }
    }
    if (message && message.length > 2000) {
      return res
        .status(400)
        .json({ error: "Le message ne doit pas dépasser 2000 caractères." });
    }

    // Champs de qualification, propres aux candidatures convoyeur.
    let siretNet = null;
    const STATUTS = ["oui", "en_cours", "non"];

    if (type === "convoyeur") {
      // Un convoyeur est alerté des missions par WhatsApp : sans mobile
      // valide, la mise en relation n'aboutira pas.
      if (!firstName || !lastName) {
        return res.status(400).json({ error: "Nom et prénom obligatoires." });
      }
      if (!mail) {
        return res.status(400).json({ error: "Adresse email obligatoire." });
      }
      if (!tel || !isValidMobile(tel)) {
        return res.status(400).json({
          error:
            "Numéro de mobile invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.",
        });
      }

      // Le SIRET atteste d'une activité déclarée : c'est le premier filtre
      // contre les candidatures non professionnelles.
      if (!siret) {
        return res.status(400).json({ error: "Le SIRET est obligatoire." });
      }
      if (!isValidSiret(siret)) {
        return res.status(400).json({
          error:
            "SIRET invalide. Vérifiez les 14 chiffres figurant sur votre extrait Kbis.",
        });
      }
      siretNet = normaliserSiret(siret);

      // Sans RC Circulation — acquise ou en cours — aucun véhicule ne peut
      // être confié : la candidature n'aboutirait pas.
      if (!STATUTS.includes(rcCirculation)) {
        return res.status(400).json({
          error: "Précisez votre situation vis-à-vis de la RC Circulation.",
        });
      }
      if (rcCirculation === "non") {
        return res.status(400).json({
          error:
            "La RC Circulation est indispensable pour convoyer. Souscrivez-la, puis revenez déposer votre candidature.",
        });
      }
      // La RC Professionnelle couvre la prestation elle-même : elle est
      // exigée au même titre que la RC Circulation, une réponse vide ne
      // valant plus acceptation tacite.
      if (!STATUTS.includes(rcPro)) {
        return res.status(400).json({
          error: "Précisez votre situation vis-à-vis de la RC Professionnelle.",
        });
      }
      if (rcPro === "non") {
        return res.status(400).json({
          error:
            "La RC Professionnelle est indispensable pour exercer comme prestataire. Souscrivez-la, puis revenez déposer votre candidature.",
        });
      }
      // Le W garage ne conditionne pas l'éligibilité : la réponse affine
      // seulement les missions proposables, l'absence de réponse reste donc
      // admise. Seule une valeur mal typée est rejetée.
      if (
        wGarage !== undefined &&
        wGarage !== null &&
        typeof wGarage !== "boolean"
      ) {
        return res.status(400).json({ error: "Réponse W garage invalide." });
      }
    } else {
      if (!company) {
        return res
          .status(400)
          .json({ error: "Le nom de la structure est obligatoire." });
      }
      // Un client peut préférer être rappelé : l'un ou l'autre suffit.
      if (!mail && !tel) {
        return res.status(400).json({
          error: "Indiquez au moins un email ou un numéro à rappeler.",
        });
      }
    }

    const { rows } = await db.query(
      `INSERT INTO contact_requests
         (type, first_name, last_name, company, job_title, email, phone, message,
          siret, rc_circulation, rc_pro, w_garage, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, type, created_at`,
      [
        type,
        firstName ? firstName.trim() : null,
        lastName ? lastName.trim() : null,
        company ? company.trim() : null,
        jobTitle ? jobTitle.trim() : null,
        mail,
        tel,
        message ? message.trim() : null,
        siretNet,
        type === "convoyeur" ? rcCirculation : null,
        type === "convoyeur" && STATUTS.includes(rcPro) ? rcPro : null,
        type === "convoyeur" && typeof wGarage === "boolean" ? wGarage : null,
        req.ip || null,
      ],
    );

    const demande = rows[0];

    auditLog("CONTACT_REQUEST", null, {
      ip: req.ip,
      type,
      email: mail,
      phone: tel,
    });

    // Les notifications ne doivent jamais faire échouer l'enregistrement :
    // la demande est déjà en base, c'est le seul point qui compte.
    const contexte = {
      ...demande,
      first_name: firstName,
      last_name: lastName,
      company,
      job_title: jobTitle,
      email: mail,
      phone: tel,
      message,
      siret: siretNet,
      rc_circulation: rcCirculation,
      rc_pro: rcPro,
      w_garage: wGarage,
    };

    try {
      await emailService.notifyNouvelleDemande(contexte);
    } catch (emailErr) {
      console.error(
        "⚠️ Email admin (nouvelle demande) non envoyé :",
        emailErr.message,
      );
    }

    if (mail) {
      try {
        await emailService.notifyDemandeRecue(mail, firstName || company, type);
      } catch (emailErr) {
        console.error("⚠️ Accusé de réception non envoyé :", emailErr.message);
      }
    }

    res.status(201).json({
      message:
        "Votre demande a bien été enregistrée. Notre équipe vous recontacte rapidement.",
    });
  } catch (err) {
    next(err);
  }
});

// ── Connexion ────────────────────────────────────────────────
router.post("/login", authLimiter, async (req, res, next) => {
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
