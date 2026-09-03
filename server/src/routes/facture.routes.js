/**
 * Routes des factures
 *
 * L'administration dépose les pièces comptables dans l'espace de chaque
 * utilisateur : ce que nous facturons aux clients, les relevés de
 * prestations des convoyeurs. Chacun consulte les siennes.
 *
 * Deux principes gouvernent ce module :
 *
 * 1. Une facture déposée ne se supprime pas. Une pièce comptable remise
 *    fait foi : si elle est erronée, on l'annule et l'annulation reste
 *    visible. Effacer la ligne reviendrait à réécrire l'historique.
 *
 * 2. Le dépôt est réservé aux administrateurs. Aucun autre rôle n'écrit
 *    dans cette table.
 *
 * Aucune notification n'est envoyée : le destinataire découvre ses
 * factures en consultant son espace.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { auditLog } = require("../middleware/security.middleware");

const UPLOAD_DIR = require("../lib/uploads").dossier("factures");

// Une facture est un document comptable : le PDF est le seul format qui
// garantisse une mise en page stable et une valeur probante.
const EXTENSIONS_AUTORISEES = { "application/pdf": ".pdf" };
const ALLOWED_MIME = Object.keys(EXTENSIONS_AUTORISEES);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Nom imprévisible : le numéro de facture et la date de dépôt ne
    // doivent pas permettre de deviner l'URL d'une pièce voisine.
    const alea = crypto.randomBytes(16).toString("hex");
    cb(null, `${alea}${EXTENSIONS_AUTORISEES[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format non supporté. La facture doit être un PDF."));
  },
});

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUTS = ["emise", "payee", "annulee"];
const DESTINATAIRES = ["client", "convoyeur"];

router.use(authenticate);

router.param("id", (req, res, next, value) => {
  if (!UUID_REGEX.test(value))
    return res.status(400).json({ error: "Identifiant invalide." });
  next();
});

router.param("destinataireId", (req, res, next, value) => {
  if (!UUID_REGEX.test(value))
    return res.status(400).json({ error: "Identifiant invalide." });
  next();
});

/**
 * Supprimer le fichier déposé lorsque l'enregistrement en base échoue.
 * Sans cela, un numéro en doublon laisserait un PDF orphelin sur le disque.
 */
function retirerFichier(fichier) {
  if (!fichier) return;
  const chemin = path.join(UPLOAD_DIR, fichier.filename);
  if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
}

/**
 * Convertir un montant saisi en euros vers des centimes entiers.
 * Les centimes évitent les écarts d'arrondi des flottants, inacceptables
 * sur des pièces comptables.
 */
function versCentimes(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  const nombre = Number(String(valeur).replace(",", "."));
  if (!Number.isFinite(nombre) || nombre < 0) return undefined;
  return Math.round(nombre * 100);
}

function normaliserDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? undefined : valeur;
}

// ── Espace personnel ─────────────────────────────────────────

/**
 * Lister ses propres factures.
 *
 * L'identifiant est pris du jeton, jamais de la requête : c'est ce qui
 * empêche de lire les factures d'un tiers en changeant un paramètre
 * d'URL. La route sert indifféremment les clients et les convoyeurs.
 */
router.get(
  "/mes-factures",
  authorize("client", "convoyeur"),
  async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT id, numero, libelle, montant_ttc, periode,
                date_emission, date_echeance, statut,
                original_name, file_path, created_at
           FROM factures
          WHERE destinataire_id = $1
          ORDER BY date_emission DESC, created_at DESC`,
        [req.user.id],
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ── Administration ───────────────────────────────────────────

/**
 * Lister toutes les factures, filtrables par destinataire, par nature et
 * par statut.
 */
router.get("/", authorize("admin"), async (req, res, next) => {
  try {
    const conditions = [];
    const valeurs = [];

    if (req.query.destinataire_id) {
      if (!UUID_REGEX.test(req.query.destinataire_id)) {
        return res
          .status(400)
          .json({ error: "Identifiant destinataire invalide." });
      }
      valeurs.push(req.query.destinataire_id);
      conditions.push(`f.destinataire_id = $${valeurs.length}`);
    }

    if (req.query.role) {
      if (!DESTINATAIRES.includes(req.query.role)) {
        return res.status(400).json({ error: "Rôle invalide." });
      }
      valeurs.push(req.query.role);
      conditions.push(`f.destinataire_role = $${valeurs.length}`);
    }

    if (req.query.statut) {
      if (!STATUTS.includes(req.query.statut)) {
        return res.status(400).json({ error: "Statut invalide." });
      }
      valeurs.push(req.query.statut);
      conditions.push(`f.statut = $${valeurs.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT f.id, f.destinataire_id, f.destinataire_role, f.numero,
              f.libelle, f.montant_ttc, f.periode, f.date_emission,
              f.date_echeance, f.statut, f.original_name, f.file_path,
              f.created_at,
              u.full_name AS destinataire_nom,
              u.company   AS destinataire_societe,
              u.email     AS destinataire_email
         FROM factures f
         JOIN users u ON u.id = f.destinataire_id
         ${where}
        ORDER BY f.date_emission DESC, f.created_at DESC`,
      valeurs,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Déposer une facture dans l'espace d'un client ou d'un convoyeur.
 */
router.post(
  "/destinataires/:destinataireId",
  authorize("admin"),
  upload.single("facture"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier reçu." });
      }

      const numero = String(req.body.numero || "").trim();
      if (!numero) {
        retirerFichier(req.file);
        return res
          .status(400)
          .json({ error: "Le numéro de facture est obligatoire." });
      }
      if (numero.length > 60) {
        retirerFichier(req.file);
        return res
          .status(400)
          .json({ error: "Le numéro ne peut dépasser 60 caractères." });
      }

      const montant = versCentimes(req.body.montant_ttc);
      if (montant === undefined) {
        retirerFichier(req.file);
        return res.status(400).json({ error: "Montant invalide." });
      }

      const dateEmission = normaliserDate(req.body.date_emission);
      const dateEcheance = normaliserDate(req.body.date_echeance);
      if (dateEmission === undefined || dateEcheance === undefined) {
        retirerFichier(req.file);
        return res.status(400).json({ error: "Date invalide." });
      }

      // Le destinataire doit exister et être client ou convoyeur :
      // déposer une facture dans l'espace d'un administrateur n'aurait
      // aucun sens. Son rôle actuel devient la nature de la pièce.
      const { rows: comptes } = await db.query(
        "SELECT id, role FROM users WHERE id = $1",
        [req.params.destinataireId],
      );
      const destinataire = comptes[0];
      if (!destinataire || !DESTINATAIRES.includes(destinataire.role)) {
        retirerFichier(req.file);
        return res.status(404).json({ error: "Destinataire introuvable." });
      }

      const { rows } = await db.query(
        `INSERT INTO factures
           (destinataire_id, destinataire_role, numero, libelle,
            montant_ttc, periode, date_emission, date_echeance,
            original_name, file_path, mime_type, deposee_par)
         VALUES ($1, $2, $3, $4, $5, $6,
                 COALESCE($7::date, CURRENT_DATE), $8,
                 $9, $10, $11, $12)
         RETURNING *`,
        [
          destinataire.id,
          destinataire.role,
          numero,
          req.body.libelle?.trim() || null,
          montant,
          req.body.periode?.trim() || null,
          dateEmission,
          dateEcheance,
          req.file.originalname,
          `/uploads/factures/${req.file.filename}`,
          req.file.mimetype,
          req.user.id,
        ],
      );

      auditLog("FACTURE_DEPOSEE", req.user.id, req.ip, {
        factureId: rows[0].id,
        destinataireId: destinataire.id,
        role: destinataire.role,
        numero,
      });

      res.status(201).json(rows[0]);
    } catch (err) {
      retirerFichier(req.file);
      // 23505 : violation d'unicité sur (destinataire_id, numero). Le
      // message générique du serveur ne dirait pas à l'admin ce qui cloche.
      if (err.code === "23505") {
        return res.status(409).json({
          error: "Ce numéro de facture existe déjà pour ce destinataire.",
        });
      }
      next(err);
    }
  },
);

/**
 * Changer le statut d'une facture.
 *
 * Une facture annulée est définitive : la réactiver reviendrait à faire
 * réapparaître une pièce dont le destinataire a déjà constaté le retrait.
 */
router.patch("/:id/statut", authorize("admin"), async (req, res, next) => {
  try {
    const { statut } = req.body;
    if (!STATUTS.includes(statut)) {
      return res.status(400).json({
        error: "Statut invalide. Valeurs acceptées : emise, payee, annulee.",
      });
    }

    const { rows: existantes } = await db.query(
      "SELECT statut FROM factures WHERE id = $1",
      [req.params.id],
    );
    if (!existantes[0]) {
      return res.status(404).json({ error: "Facture introuvable." });
    }
    if (existantes[0].statut === "annulee") {
      return res
        .status(409)
        .json({ error: "Une facture annulée ne peut plus changer de statut." });
    }

    const { rows } = await db.query(
      `UPDATE factures
          SET statut = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [statut, req.params.id],
    );

    auditLog("FACTURE_STATUT", req.user.id, req.ip, {
      factureId: req.params.id,
      ancien: existantes[0].statut,
      nouveau: statut,
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
