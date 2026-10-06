/**
 * Pièces jointes d'une mission (carte grise, bon d'enlèvement, PV…).
 *
 * Circuit :
 *   1. le client (ou l'admin) dépose les pièces en fin de tunnel de
 *      création, avec un libellé libre ;
 *   2. l'admin coche, depuis la fiche mission, celles que le convoyeur
 *      doit voir ;
 *   3. le convoyeur affecté télécharge les seules pièces cochées.
 *
 * Par défaut une pièce n'est PAS visible du convoyeur : un document
 * client peut contenir des informations commerciales, c'est à l'admin de
 * décider ce qui part sur le terrain.
 */

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { auditLog } = require("../middleware/security.middleware");
const { peutConsulter } = require("../db/perimetre");
const { dossier, cheminDisque } = require("../lib/uploads");

const DOSSIER = dossier("missions");
const MIMES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOSSIER),
    filename: (_req, file, cb) =>
      cb(
        null,
        `${crypto.randomBytes(16).toString("hex")}${MIMES[file.mimetype]}`,
      ),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    MIMES[file.mimetype]
      ? cb(null, true)
      : cb(
          Object.assign(
            new Error(
              "Format non supporté. Formats acceptés : PDF, JPG, PNG, WEBP.",
            ),
            { status: 400 },
          ),
        ),
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = express.Router();
router.use(authenticate);

router.param("missionId", (req, res, next, v) =>
  UUID_REGEX.test(v)
    ? next()
    : res.status(400).json({ error: "Identifiant invalide." }),
);
router.param("docId", (req, res, next, v) =>
  UUID_REGEX.test(v)
    ? next()
    : res.status(400).json({ error: "Identifiant invalide." }),
);

const COLONNES = `id, mission_id, label, original_name, file_path, mime_type,
                  visible_convoyeur, created_at`;

function retirer(fichier) {
  if (fichier?.path && fs.existsSync(fichier.path)) {
    try {
      fs.unlinkSync(fichier.path);
    } catch {
      /* sans conséquence pour la réponse */
    }
  }
}

async function chargerMission(id) {
  const { rows } = await db.query(
    "SELECT id, client_id, convoyeur_id FROM missions WHERE id = $1",
    [id],
  );
  return rows[0] || null;
}

/**
 * Lister les pièces d'une mission.
 * - admin : toutes ;
 * - client (ou son siège) : toutes celles de sa mission ;
 * - convoyeur affecté : uniquement celles cochées par l'admin.
 */
router.get(
  "/mission/:missionId",
  authorize("admin", "client", "convoyeur"),
  async (req, res, next) => {
    try {
      const mission = await chargerMission(req.params.missionId);
      if (!mission)
        return res.status(404).json({ error: "Mission introuvable." });

      const { role } = req.user;
      if (
        role === "client" &&
        !(await peutConsulter(req.user, mission.client_id))
      ) {
        return res.status(404).json({ error: "Mission introuvable." });
      }
      if (role === "convoyeur" && mission.convoyeur_id !== req.user.id) {
        return res.status(404).json({ error: "Mission introuvable." });
      }

      const filtreConvoyeur =
        role === "convoyeur" ? "AND visible_convoyeur = true" : "";
      const { rows } = await db.query(
        `SELECT ${COLONNES}
           FROM mission_documents
          WHERE mission_id = $1 ${filtreConvoyeur}
          ORDER BY created_at ASC`,
        [mission.id],
      );
      res.json({ documents: rows });
    } catch (err) {
      next(err);
    }
  },
);

/** Déposer une pièce (client propriétaire ou admin). */
router.post(
  "/mission/:missionId",
  authorize("admin", "client"),
  (req, res, next) =>
    upload.single("document")(req, res, (err) => {
      if (!err) return next();
      console.warn(
        `[mission-documents] dépôt refusé mission=${req.params.missionId} user=${req.user?.id} code=${err.code || "-"} : ${err.message}`,
      );
      res.status(err.status || 400).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "Fichier trop volumineux (25 Mo maximum)."
            : err.message,
      });
    }),
  async (req, res, next) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "Aucun fichier reçu." });

      const label = String(req.body?.label || "").trim();
      if (!label) {
        retirer(req.file);
        return res.status(400).json({ error: "Le libellé est obligatoire." });
      }
      if (label.length > 120) {
        retirer(req.file);
        return res
          .status(400)
          .json({ error: "Le libellé ne peut dépasser 120 caractères." });
      }

      const mission = await chargerMission(req.params.missionId);
      if (
        !mission ||
        (req.user.role === "client" &&
          !(await peutConsulter(req.user, mission.client_id)))
      ) {
        retirer(req.file);
        return res.status(404).json({ error: "Mission introuvable." });
      }

      const { rows } = await db.query(
        `INSERT INTO mission_documents
           (mission_id, label, original_name, file_path, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLONNES}`,
        [
          mission.id,
          label,
          req.file.originalname,
          `/uploads/missions/${req.file.filename}`,
          req.file.mimetype,
          req.user.id,
        ],
      );
      res.status(201).json({ document: rows[0] });
    } catch (err) {
      retirer(req.file);
      next(err);
    }
  },
);

/** Cocher / décocher la visibilité convoyeur (admin). */
router.patch("/:docId", authorize("admin"), async (req, res, next) => {
  try {
    if (typeof req.body?.visible_convoyeur !== "boolean") {
      return res
        .status(400)
        .json({ error: "visible_convoyeur doit être un booléen." });
    }
    const { rows } = await db.query(
      `UPDATE mission_documents
          SET visible_convoyeur = $1
        WHERE id = $2
        RETURNING ${COLONNES}`,
      [req.body.visible_convoyeur, req.params.docId],
    );
    if (!rows[0])
      return res.status(404).json({ error: "Document introuvable." });

    auditLog("MISSION_DOCUMENT_VISIBILITE", req.user.id, req.ip, {
      documentId: rows[0].id,
      missionId: rows[0].mission_id,
      visible: rows[0].visible_convoyeur,
    });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

/** Supprimer une pièce (admin). */
router.delete("/:docId", authorize("admin"), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM mission_documents WHERE id = $1 RETURNING id, file_path",
      [req.params.docId],
    );
    if (!rows[0])
      return res.status(404).json({ error: "Document introuvable." });

    const disque = cheminDisque(rows[0].file_path);
    if (disque && fs.existsSync(disque)) {
      try {
        fs.unlinkSync(disque);
      } catch {
        /* la ligne est déjà supprimée */
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
