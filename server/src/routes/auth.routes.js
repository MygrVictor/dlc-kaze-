const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const {
  authLimiter,
  validatePassword,
  isValidEmail,
  isValidMobile,
  auditLog,
  sanitizeInputs,
} = require("../middleware/security.middleware");
const emailService = require("../services/email.service");
const kazeService = require("../services/kaze.service");
const { isValidSiret, normaliserSiret } = require("../lib/siret");

const { authenticate, authorize } = require("../middleware/auth.middleware");
const crypto = require("crypto");

const router = express.Router();

// ── Justificatifs joints à une candidature convoyeur ─────────
//
// Le dossier part avec le formulaire : cinq pièces, ni plus ni moins.
// Les réclamer après coup par courriel n'aboutissait presque jamais, et
// une candidature sans pièces n'est de toute façon pas instruisible.
const UPLOAD_DIR = require("../lib/uploads").dossier("documents");

// Le permis compte pour deux pièces : la validité et les catégories
// figurent au recto, les restrictions et la date de délivrance au verso.
// Un seul cliché ne permet pas de vérifier le droit de conduire.
//
// Le Kbis a remplacé le SIRET saisi à la main : quatorze chiffres tapés
// dans un champ n'attestent de rien, l'extrait si — et il porte le SIRET.
// Les deux attestations d'assurance ont, de même, remplacé les listes
// déroulantes où le candidat déclarait être couvert.
const DOCUMENTS_REQUIS = [
  "carte_identite",
  "permis",
  "permis_verso",
  "kbis",
  "rc_circulation",
  "rc_pro",
  "domicile",
];

// La pièce d'identité n'a pas un nombre de faces fixe : une carte
// nationale se lit au recto et au verso, un passeport tient sur sa seule
// page d'identification. Le verso est donc exigé ou non selon ce que le
// candidat déclare présenter — réclamer deux faces d'un passeport
// bloquerait un dossier parfaitement valable.
const TYPES_IDENTITE = ["cni", "passeport"];

// Le W garage n'est pas exigible : il ouvre des missions supplémentaires
// sans conditionner l'accès. Le réclamer écarterait des convoyeurs
// parfaitement en règle.
const DOCUMENTS_FACULTATIFS = ["w_garage", "carte_identite_verso"];

const DOCUMENTS_ACCEPTES = [...DOCUMENTS_REQUIS, ...DOCUMENTS_FACULTATIFS];

const LIBELLES_DOCUMENTS = {
  carte_identite: "pièce d'identité",
  carte_identite_verso: "carte d'identité (verso)",
  permis: "permis de conduire (recto)",
  permis_verso: "permis de conduire (verso)",
  kbis: "extrait Kbis",
  rc_circulation: "attestation RC Circulation",
  rc_pro: "attestation RC Professionnelle",
  domicile: "justificatif de domicile",
  w_garage: "certification W garage",
};

// Le type MIME est déclaré par le client : il ne prouve rien. C'est
// l'extension du fichier stocké qui décidera du Content-Type au moment
// de le servir, donc c'est elle qu'il faut contraindre. On ignore le nom
// d'origine : un « photo.png.html » ne peut plus se glisser au travers.
const EXTENSIONS_AUTORISEES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const uploadCandidature = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      // Nom imprévisible : sans cela, la date de dépôt suffirait à
      // deviner l'URL d'une pièce d'identité.
      const alea = crypto.randomBytes(16).toString("hex");
      cb(null, `${alea}${EXTENSIONS_AUTORISEES[file.mimetype]}`);
    },
  }),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: DOCUMENTS_ACCEPTES.length,
  },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONS_AUTORISEES[file.mimetype]) cb(null, true);
    else cb(new Error("Format non supporté. Utilisez JPG, PNG, WEBP ou PDF."));
  },
}).fields(DOCUMENTS_ACCEPTES.map((name) => ({ name, maxCount: 1 })));

/**
 * Enveloppe Multer pour traduire ses refus en messages exploitables.
 *
 * Sans cela, un fichier trop lourd — cas banal depuis un téléphone, où
 * une photo dépasse volontiers 8 Mo — remonterait en erreur 500 et le
 * candidat ne saurait pas quoi corriger.
 */
const recevoirCandidature = (req, res, next) => {
  uploadCandidature(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error:
          "Fichier trop volumineux : 8 Mo maximum par document. Réduisez la qualité de la photo ou envoyez un PDF.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Document inattendu." });
    }
    return res.status(400).json({ error: err.message });
  });
};

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

/**
 * Transfère vers le compte les justificatifs déposés à la candidature.
 *
 * C'est l'une des deux issues possibles pour une candidature : elle est
 * acceptée, un compte est ouvert, et les pièces déjà transmises le
 * suivent. L'autre issue — la suppression — est traitée côté admin.
 *
 * Le rattachement se fait par l'identifiant de la candidature, transmis
 * par l'écran de conversion. L'email ne sert que de repli : l'admin peut
 * le corriger au moment de créer le compte, et le lien serait alors rompu.
 *
 * Les fichiers eux-mêmes ne bougent pas : seule la ligne change de table,
 * `convoyeur_documents` pointant sur les mêmes chemins. Les documents
 * arrivent en `en_attente`, la vérification restant du ressort de
 * l'administration.
 *
 * L'échec n'interrompt jamais la création du compte : mieux vaut un
 * convoyeur à qui l'on redemande ses pièces qu'un compte non créé.
 *
 * @returns {Promise<number>} nombre de pièces reprises
 */
async function reprendreDocumentsCandidature(user, demandeId) {
  try {
    // Le cast `::uuid` rejetterait une chaîne mal formée par une erreur
    // Postgres. On filtre en amont : une valeur douteuse fait simplement
    // retomber sur le rapprochement par email.
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cible = UUID_REGEX.test(demandeId || "") ? demandeId : null;

    // Deux critères, par ordre de fiabilité décroissante : l'identifiant
    // exact de la candidature, sinon l'email. Le second reste utile quand
    // le compte est créé sans passer par l'écran de conversion.
    const { rows } = await db.query(
      `SELECT dd.type, dd.original_name, dd.file_path, dd.mime_type, dd.demande_id
         FROM demande_documents dd
         JOIN contact_requests cr ON cr.id = dd.demande_id
        WHERE cr.type = 'convoyeur'
          AND (cr.id = $2::uuid OR ($2::uuid IS NULL AND LOWER(cr.email) = $1))
        ORDER BY dd.created_at DESC`,
      [user.email, cible],
    );
    if (rows.length === 0) return 0;

    // Plusieurs candidatures peuvent porter le même email (relance après
    // un premier refus). Le tri antéchronologique fait que la première
    // occurrence rencontrée pour un type est la plus récente.
    const retenus = new Map();
    for (const doc of rows) {
      if (!retenus.has(doc.type)) retenus.set(doc.type, doc);
    }

    for (const doc of retenus.values()) {
      await db.query(
        `INSERT INTO convoyeur_documents
           (convoyeur_id, type, original_name, file_path, mime_type, status)
         VALUES ($1, $2, $3, $4, $5, 'en_attente')
         ON CONFLICT (convoyeur_id, type) DO NOTHING`,
        [user.id, doc.type, doc.original_name, doc.file_path, doc.mime_type],
      );
    }

    // Les lignes en salle d'attente n'ont plus lieu d'être : le compte
    // fait désormais foi. Les fichiers restent en place, ils appartiennent
    // maintenant au convoyeur.
    const demandes = [...new Set(rows.map((d) => d.demande_id))];
    await db.query(
      `DELETE FROM demande_documents WHERE demande_id = ANY($1::uuid[])`,
      [demandes],
    );

    // La candidature est officiellement convertie : la trace du compte
    // évite qu'on la relance par erreur.
    await db.query(
      `UPDATE contact_requests
          SET status = 'convertie', converted_user_id = $2
        WHERE id = ANY($1::uuid[])`,
      [demandes, user.id],
    );

    console.log(
      `✅ ${retenus.size} document(s) de candidature repris pour ${user.email}`,
    );
    return retenus.size;
  } catch (err) {
    console.error(
      "⚠️ Reprise des documents de candidature échouée (non bloquant) :",
      err.message,
    );
    return 0;
  }
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
      const { email, fullName, phone, company, role, password, demandeId } =
        req.body;

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

      // ── Reprise des pièces déposées à la candidature ───────────
      let documentsRepris = 0;
      if (userRole === "convoyeur") {
        documentsRepris = await reprendreDocumentsCandidature(user, demandeId);
      }

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
        documentsRepris,
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
//
// Pour un convoyeur, la candidature et ses cinq justificatifs partent
// d'un seul bloc : un dossier incomplet n'est pas enregistré. La requête
// est donc en multipart, et l'écriture se fait en transaction — soit la
// candidature et ses pièces entrent ensemble, soit rien n'entre.
// ══════════════════════════════════════════════════════════════
router.post(
  "/demande",
  authLimiter,
  recevoirCandidature,
  // Le nettoyage global des entrées s'exécute avant Multer : en multipart,
  // `req.body` était encore vide à ce moment-là. On le repasse ici, sans
  // quoi les champs texte d'une candidature convoyeur échapperaient au
  // filtre XSS alors qu'ils sont réaffichés dans l'espace admin.
  sanitizeInputs,
  async (req, res, next) => {
    // Les fichiers déjà écrits par Multer doivent disparaître dès que la
    // requête est rejetée : sinon chaque tentative invalide laisserait un
    // résidu sur le disque.
    const nettoyerFichiers = () => {
      for (const liste of Object.values(req.files || {})) {
        for (const f of liste) {
          fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {});
        }
      }
    };

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
        typeIdentite,
      } = req.body;

      const refuser = (error) => {
        nettoyerFichiers();
        return res.status(400).json({ error });
      };

      const allowedTypes = ["client", "convoyeur"];
      if (!allowedTypes.includes(type)) {
        return refuser("Type de demande invalide (client ou convoyeur).");
      }

      const mail = email ? email.toLowerCase().trim() : null;
      const tel = phone ? phone.trim() : null;

      if (mail && !isValidEmail(mail)) {
        return refuser("Adresse email invalide.");
      }

      // Longueurs bornées : ces valeurs sont réaffichées dans l'espace admin.
      const champs = { firstName, lastName, company, jobTitle };
      for (const [nom, valeur] of Object.entries(champs)) {
        if (valeur && valeur.length > 150) {
          return refuser(`Champ ${nom} trop long.`);
        }
      }
      if (message && message.length > 2000) {
        return refuser("Le message ne doit pas dépasser 2000 caractères.");
      }

      // Champs de qualification, propres aux candidatures convoyeur.
      if (type === "convoyeur") {
        // Un convoyeur est alerté des missions par WhatsApp : sans mobile
        // valide, la mise en relation n'aboutira pas.
        if (!firstName || !lastName) {
          return refuser("Nom et prénom obligatoires.");
        }
        if (!mail) {
          return refuser("Adresse email obligatoire.");
        }
        if (!tel || !isValidMobile(tel)) {
          return refuser(
            "Numéro de mobile invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.",
          );
        }

        // Le dossier complet conditionne l'enregistrement : une
        // candidature sans pièces n'est pas exploitable, et la réclamer
        // ensuite par courriel n'aboutit presque jamais.
        //
        // Ce contrôle a absorbé les anciennes questions déclaratives.
        // Demander « avez-vous une RC Circulation ? » puis l'attestation
        // faisait doublon, et la déclaration ne valait rien face à la
        // pièce : c'est désormais l'absence d'attestation qui écarte une
        // candidature, non une case cochée.
        //
        // Seule exception : le type de pièce d'identité reste déclaré,
        // parce qu'il ne se déduit pas d'un fichier. Sans cette réponse,
        // on ne saurait pas s'il manque un verso ou s'il n'y en a pas.
        const identite = typeIdentite ? String(typeIdentite).trim() : "";
        if (!TYPES_IDENTITE.includes(identite)) {
          return refuser(
            "Précisez si votre pièce d'identité est une carte nationale ou un passeport.",
          );
        }

        const attendus = [...DOCUMENTS_REQUIS];
        // Une carte nationale se lit sur ses deux faces ; un passeport
        // tient sur sa page d'identification.
        if (identite === "cni") attendus.push("carte_identite_verso");

        const manquants = attendus.filter(
          (t) => !(req.files && req.files[t] && req.files[t][0]),
        );
        if (manquants.length > 0) {
          return refuser(
            `Justificatifs manquants : ${manquants
              .map((t) => LIBELLES_DOCUMENTS[t])
              .join(", ")}. Les ${
              attendus.length
            } pièces sont nécessaires pour étudier votre candidature.`,
          );
        }
      } else {
        if (!company) {
          return refuser("Le nom de la structure est obligatoire.");
        }
        // Un client peut préférer être rappelé : l'un ou l'autre suffit.
        if (!mail && !tel) {
          return refuser("Indiquez au moins un email ou un numéro à rappeler.");
        }
        // Un client n'a aucune pièce à fournir : des fichiers joints ici
        // relèvent au mieux de l'erreur, au pire du dépôt opportuniste.
        nettoyerFichiers();
      }

      // Candidature et justificatifs entrent ensemble ou pas du tout : une
      // demande enregistrée sans ses pièces serait un dossier fantôme,
      // impossible à instruire et invisible comme incomplet.
      const demande = await db.transaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO contact_requests
             (type, first_name, last_name, company, job_title, email, phone, message, ip)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
            req.ip || null,
          ],
        );

        const creee = rows[0];

        if (type === "convoyeur") {
          // Les pièces facultatives ne sont enregistrées que si le
          // candidat les a jointes ; leur absence est une réponse en soi.
          for (const doc of DOCUMENTS_ACCEPTES) {
            const fichier = req.files[doc] && req.files[doc][0];
            if (!fichier) continue;
            await client.query(
              `INSERT INTO demande_documents
                 (demande_id, type, original_name, file_path, mime_type)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                creee.id,
                doc,
                fichier.originalname.slice(0, 255),
                `/uploads/documents/${fichier.filename}`,
                fichier.mimetype,
              ],
            );
          }
        }

        return creee;
      });

      auditLog("CONTACT_REQUEST", null, {
        ip: req.ip,
        type,
        email: mail,
        phone: tel,
        documents:
          type === "convoyeur"
            ? DOCUMENTS_ACCEPTES.filter((d) => req.files && req.files[d]).length
            : 0,
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
        // Le nombre de pièces remplace les anciennes mentions d'assurance
        // dans la notification : c'est désormais ce qui renseigne l'admin
        // sur la complétude du dossier.
        documents:
          type === "convoyeur"
            ? DOCUMENTS_ACCEPTES.filter((d) => req.files && req.files[d]).length
            : 0,
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
          await emailService.notifyDemandeRecue(
            mail,
            firstName || company,
            type,
          );
        } catch (emailErr) {
          console.error(
            "⚠️ Accusé de réception non envoyé :",
            emailErr.message,
          );
        }
      }

      res.status(201).json({
        message:
          type === "convoyeur"
            ? "Votre candidature et vos justificatifs ont bien été reçus. Notre équipe étudie votre dossier et vous recontacte rapidement."
            : "Votre demande a bien été enregistrée. Notre équipe vous recontacte rapidement.",
      });
    } catch (err) {
      // L'écriture a échoué : les fichiers déjà sur le disque ne se
      // rattachent plus à rien et doivent partir avec elle.
      nettoyerFichiers();
      next(err);
    }
  },
);

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

// ── Réinitialisation de mot de passe ─────────────────────────
//
// Durée volontairement courte : le lien vaut identification complète,
// il n'a pas à survivre à la boîte mail qui le transporte.
const RESET_VALIDITE_MINUTES = 30;

/** Empreinte du jeton : seule elle est conservée en base. */
const empreinte = (jeton) =>
  crypto.createHash("sha256").update(jeton).digest("hex");

router.post("/forgot-password", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .toLowerCase()
      .trim();

    // Réponse identique quoi qu'il arrive : distinguer les cas
    // transformerait ce point d'entrée en énumérateur de comptes.
    const reponse = {
      message:
        "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
    };

    if (!email) return res.json(reponse);

    const { rows } = await db.query(
      "SELECT id, email, full_name FROM users WHERE email = $1",
      [email],
    );
    const user = rows[0];
    if (!user) {
      auditLog("PASSWORD_RESET_REQUESTED", null, {
        ip: req.ip,
        email,
        reason: "user_not_found",
      });
      return res.json(reponse);
    }

    // Une nouvelle demande annule les précédentes : sans cela, plusieurs
    // liens vivraient en parallèle, et le plus ancien courrier resterait
    // exploitable longtemps après que l'utilisateur a cru le remplacer.
    await db.query(
      `UPDATE password_resets SET used_at = NOW()
        WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
    );

    const jeton = crypto.randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [user.id, empreinte(jeton), String(RESET_VALIDITE_MINUTES)],
    );

    const lien = `${process.env.CLIENT_URL}/reinitialiser-mot-de-passe?token=${jeton}`;

    // L'échec d'envoi ne doit pas révéler l'existence du compte : on
    // consigne, et la réponse reste la même.
    try {
      await emailService.notifyPasswordReset(
        user.email,
        user.full_name,
        lien,
        RESET_VALIDITE_MINUTES,
      );
    } catch (err) {
      console.error("Envoi du lien de réinitialisation échoué :", err.message);
    }

    auditLog("PASSWORD_RESET_REQUESTED", user.id, { ip: req.ip, email });
    res.json(reponse);
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res
        .status(400)
        .json({ error: "Lien et nouveau mot de passe obligatoires." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 8 caractères.",
      });
    }

    const { rows } = await db.query(
      `SELECT pr.id, pr.expires_at, pr.used_at, u.id AS user_id, u.email, u.full_name
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1`,
      [empreinte(String(token))],
    );
    const demande = rows[0];

    // Un seul message pour les trois causes d'échec — jeton inconnu,
    // déjà consommé, expiré : les distinguer renseignerait un attaquant
    // sur la validité des jetons qu'il essaie.
    const invalide = () =>
      res.status(400).json({
        error:
          "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page de connexion.",
      });

    if (!demande || demande.used_at) return invalide();
    if (new Date(demande.expires_at) <= new Date()) return invalide();

    const hash = await bcrypt.hash(String(password), 10);

    // Marquage et changement dans la même transaction : un jeton consommé
    // sans mot de passe changé enfermerait l'utilisateur dehors.
    await db.transaction(async (client) => {
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        hash,
        demande.user_id,
      ]);
      await client.query(
        "UPDATE password_resets SET used_at = NOW() WHERE id = $1",
        [demande.id],
      );
    });

    try {
      await emailService.notifyPasswordChanged(
        demande.email,
        demande.full_name,
      );
    } catch (err) {
      console.error("Envoi de la confirmation échoué :", err.message);
    }

    auditLog("PASSWORD_RESET_COMPLETED", demande.user_id, {
      ip: req.ip,
      email: demande.email,
    });

    res.json({
      message:
        "Mot de passe modifié. Vous pouvez maintenant vous connecter avec vos nouveaux identifiants.",
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
