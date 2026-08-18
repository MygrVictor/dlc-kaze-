const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../db");
const {
  authenticate,
  authorize,
  requirePhone,
} = require("../middleware/auth.middleware");
const kazeService = require("../services/kaze.service");
const syncService = require("../services/sync.service");
const {
  auditLog,
  isValidMobile,
} = require("../middleware/security.middleware");

// ── Configuration Multer ─────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../../../uploads/documents");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = ["permis", "carte_identite", "assurance", "domicile"];
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${req.user.id}_${req.params.type}_${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format non supporté. Utilisez JPG, PNG, WEBP ou PDF."));
  },
});

const router = express.Router();

router.use(authenticate, authorize("convoyeur"));

// ── Validation UUID sur toutes les routes avec :id ───────────
router.param("id", (req, res, next, value) => {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(value)) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  next();
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Mon profil (avec statut liaison Kaze)
// ═════════════════════════════════════════════════════════════
router.get("/profil", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT id, email, full_name, phone, role, kaze_driver_id, created_at FROM users WHERE id = $1",
      [req.user.id],
    );
    const user = rows[0];
    let kazeLinked = false;
    let kazeDriverInfo = null;

    if (user.kaze_driver_id) {
      kazeLinked = true;
      try {
        kazeDriverInfo = await kazeService.getDriver(user.kaze_driver_id);
      } catch {
        // Kaze indisponible, on retourne quand même le profil
        kazeDriverInfo = { id: user.kaze_driver_id };
      }
    }

    res.json({ user, kazeLinked, kazeDriverInfo });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Lier son compte Kaze (par email OU téléphone Kaze)
// ═════════════════════════════════════════════════════════════
router.post("/lier-kaze", async (req, res, next) => {
  try {
    const { kazeEmail, kazePhone } = req.body;

    if (!kazeEmail && !kazePhone) {
      return res.status(400).json({
        error: "Veuillez fournir votre email ou votre téléphone Kaze.",
      });
    }

    // Chercher le convoyeur dans Kaze par email (priorité) ou téléphone
    let kazeDriver = null;
    if (kazeEmail) {
      kazeDriver = await kazeService.getDriverByEmail(kazeEmail);
    }
    if (!kazeDriver && kazePhone) {
      kazeDriver = await kazeService.getDriverByPhone(kazePhone);
    }

    if (!kazeDriver) {
      return res.status(404).json({
        error: kazeEmail
          ? "Aucun convoyeur trouvé dans Kaze avec cet email. Vérifiez que votre compte Kaze existe et que l'email est correct."
          : "Aucun convoyeur trouvé dans Kaze avec ce numéro de téléphone. Vérifiez que votre compte Kaze existe et que le numéro est correct.",
      });
    }

    // Vérifier que ce kaze_driver_id n'est pas déjà utilisé par un autre user
    const existing = await db.query(
      "SELECT id, full_name FROM users WHERE kaze_driver_id = $1 AND id != $2",
      [kazeDriver.id, req.user.id],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: `Ce compte Kaze est déjà lié à un autre utilisateur (${existing.rows[0].full_name}).`,
      });
    }

    // Sauvegarder le kaze_driver_id
    await db.query(
      "UPDATE users SET kaze_driver_id = $1, updated_at = NOW() WHERE id = $2",
      [kazeDriver.id, req.user.id],
    );

    console.log(
      `✅ Convoyeur ${req.user.full_name} lié au compte Kaze ${kazeDriver.id}`,
    );

    res.json({
      message: "Compte Kaze lié avec succès !",
      kazeDriverId: kazeDriver.id,
      kazeDriver,
    });
  } catch (err) {
    if (err.response?.status) {
      // Erreur Kaze API
      return res.status(502).json({
        error:
          "Impossible de contacter l'API Kaze. Réessayez plus tard ou contactez l'administrateur.",
      });
    }
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Délier son compte Kaze
// ═════════════════════════════════════════════════════════════
router.delete("/lier-kaze", async (req, res, next) => {
  try {
    await db.query(
      "UPDATE users SET kaze_driver_id = NULL, updated_at = NOW() WHERE id = $1",
      [req.user.id],
    );
    res.json({ message: "Compte Kaze délié." });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════// Convoyeur : Renseigner son numéro de mobile
//
// Volontairement placée avant `requirePhone` : c'est la seule action
// possible tant que le profil est incomplet.
// ════════════════════════════════════════════════════════════
router.put("/telephone", async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ error: "Le numéro de mobile est obligatoire." });
    }
    if (!isValidMobile(phone)) {
      return res.status(400).json({
        error:
          "Numéro de mobile invalide. Format attendu : 06 12 34 56 78 ou +33 6 12 34 56 78.",
      });
    }

    const { rows } = await db.query(
      `UPDATE users SET phone = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, phone, role`,
      [phone.trim(), req.user.id],
    );

    auditLog("PHONE_UPDATED", req.user.id, { ip: req.ip });

    res.json({
      user: rows[0],
      message: "Numéro enregistré. Vous recevrez les missions par WhatsApp.",
    });
  } catch (err) {
    next(err);
  }
});

// ── À partir d'ici, un mobile valide est requis ───────────
router.use(requirePhone);

// ════════════════════════════════════════════════════════════// Portail Convoyeur : Missions attribuées (depuis Kaze)
// ═════════════════════════════════════════════════════════════
router.get("/missions", async (req, res, next) => {
  try {
    const { kaze_driver_id } = req.user;

    // Si le convoyeur a un ID Kaze, on récupère directement depuis Kaze
    if (kaze_driver_id) {
      try {
        const kazeData = await kazeService.getMissionsByDriver(kaze_driver_id);
        const kazeMissions = kazeData.missions || kazeData;

        // La liste Kaze /jobs est allégée : pas de steps détaillés (donc pas
        // d'adresse de livraison) et aucune notion de rémunération convoyeur.
        // On complète chaque mission avec sa jumelle en base, retrouvée par
        // kaze_mission_id, pour que la carte affiche un trajet complet et le
        // prix convoyeur. Les valeurs Kaze restent prioritaires quand elles
        // existent : Kaze reste la source de vérité du terrain.
        const kazeIds = kazeMissions
          .map((m) => m.kaze_job_id)
          .filter(Boolean)
          .map(String);

        let locales = new Map();
        if (kazeIds.length > 0) {
          const { rows } = await db.query(
            `SELECT m.kaze_mission_id, m.id,
                    m.departure_address, m.departure_date,
                    m.departure_contact_name, m.departure_contact_phone,
                    m.departure_instructions,
                    m.arrival_address, m.arrival_date,
                    m.arrival_contact_name, m.arrival_contact_phone,
                    m.vehicle_brand, m.vehicle_model, m.vehicle_plate,
                    m.vehicle_vin, m.vehicle_finish, m.vehicle_energy,
                    m.vehicle_state, m.vehicle_keys, m.vehicle_year,
                    m.vehicle_type, m.vehicle_toll_class, m.vehicle_utility_12m3,
                    m.service_wash_exterior, m.service_clean_interior,
                    m.service_refuel, m.service_handover,
                    m.emergency_phone, m.comments,
                    m.price_convoyeur AS price,
                    u.full_name AS client_name
               FROM missions m
               JOIN users u ON u.id = m.client_id
              WHERE m.kaze_mission_id = ANY($1)`,
            [kazeIds],
          );
          locales = new Map(rows.map((r) => [String(r.kaze_mission_id), r]));
        }

        const enrichies = kazeMissions.map((m) => {
          const locale = locales.get(String(m.kaze_job_id));
          if (!locale) return m;
          const fusion = { ...m };
          for (const [cle, valeur] of Object.entries(locale)) {
            if (fusion[cle] === undefined || fusion[cle] === null) {
              fusion[cle] = valeur;
            }
          }
          // Le prix ne vient jamais de Kaze : on impose celui de la base.
          fusion.price = locale.price;
          fusion.mission_id = locale.id;
          return fusion;
        });

        return res.json({ source: "kaze", missions: enrichies });
      } catch (kazeErr) {
        console.error(
          "⚠️ Kaze indisponible, fallback sur la base locale :",
          kazeErr.message,
        );
      }
    }

    // Fallback : missions locales attribuées à ce convoyeur
    // NB : on expose price_convoyeur comme "price" pour ne jamais montrer le prix client
    const { rows } = await db.query(
      `SELECT m.id, m.client_id, m.vehicle_plate, m.vehicle_vin, m.vehicle_brand, m.vehicle_model,
              m.vehicle_finish, m.vehicle_energy, m.vehicle_state, m.vehicle_keys, m.vehicle_year, m.vehicle_type,
              m.vehicle_toll_class, m.vehicle_utility_12m3,
              m.departure_address, m.departure_date, m.departure_contact_name, m.departure_contact_phone,
              m.departure_instructions, m.arrival_address, m.arrival_date, m.arrival_contact_name,
              m.arrival_contact_phone, m.service_wash_exterior, m.service_clean_interior, m.service_refuel,
              m.service_handover,
              m.emergency_phone, m.comments, m.price_convoyeur AS price, m.status, m.kaze_mission_id,
              m.convoyeur_id, m.created_at, m.updated_at,
              u.full_name AS client_name
       FROM missions m
       JOIN users u ON u.id = m.client_id
       WHERE m.convoyeur_id = $1
         AND (
           m.status IN ('ASSIGNEE', 'EN_COURS')
           -- Les missions livrées restent visibles une semaine, le temps que
           -- le convoyeur vérifie son historique récent, sans faire grossir
           -- la liste indéfiniment.
           OR (m.status = 'LIVREE' AND m.updated_at > NOW() - INTERVAL '7 days')
         )
       ORDER BY m.departure_date ASC NULLS LAST`,
      [req.user.id],
    );

    res.json({ source: "local", missions: rows });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Historique de ses missions terminées
//
// Le planning ne montre que les 7 derniers jours pour rester
// lisible. Cette route sert l'archive complète, paginée, afin que
// le convoyeur puisse retrouver une course ancienne et vérifier sa
// rémunération. Comme partout côté convoyeur, on expose
// price_convoyeur sous le nom « price » : le prix client ne doit
// jamais transiter jusqu'ici.
// ═════════════════════════════════════════════════════════════
router.get("/historique", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const { rows: totalRows } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(price_convoyeur), 0)::float AS revenus
         FROM missions
        WHERE convoyeur_id = $1
          AND status = 'LIVREE'`,
      [req.user.id],
    );

    const { rows } = await db.query(
      `SELECT m.id, m.vehicle_plate, m.vehicle_brand, m.vehicle_model,
              m.departure_address, m.departure_date,
              m.arrival_address, m.arrival_date,
              m.price_convoyeur AS price, m.status,
              m.kaze_mission_id, m.created_at, m.updated_at,
              u.full_name AS client_name
         FROM missions m
         JOIN users u ON u.id = m.client_id
        WHERE m.convoyeur_id = $1
          AND m.status = 'LIVREE'
        ORDER BY m.updated_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );

    res.json({
      missions: rows,
      total: totalRows[0].total,
      revenus: totalRows[0].revenus,
      page,
      limit,
      hasMore: offset + rows.length < totalRows[0].total,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Compter les missions disponibles (pour badge)
// ═════════════════════════════════════════════════════════════
router.get("/missions-disponibles-count", async (req, res, next) => {
  try {
    // Compter les missions avec statut ACCEPTEE (disponibles pour prendre)
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM missions WHERE status = 'ACCEPTEE'`,
    );
    const count = parseInt(rows[0].count, 10);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Missions disponibles (DLC ACCEPTEE + Kaze waiting)
// ═════════════════════════════════════════════════════════════
router.get("/missions-disponibles", async (req, res, next) => {
  try {
    // ── 1. Missions DLC ──────────────────────────────────────
    const { rows } = await db.query(
      `SELECT m.id, m.client_id, m.vehicle_plate, m.vehicle_vin, m.vehicle_brand, m.vehicle_model,
              m.vehicle_finish, m.vehicle_energy, m.vehicle_state, m.vehicle_keys, m.vehicle_year, m.vehicle_type,
              m.vehicle_toll_class, m.vehicle_utility_12m3,
              m.departure_address, m.departure_date, m.departure_contact_name, m.departure_contact_phone,
              m.departure_instructions, m.arrival_address, m.arrival_date, m.arrival_contact_name,
              m.arrival_contact_phone, m.service_wash_exterior, m.service_clean_interior, m.service_refuel,
              m.service_handover,
              m.emergency_phone, m.comments, m.price_convoyeur AS price, m.status, m.kaze_mission_id,
              m.convoyeur_id, m.created_at, m.updated_at,
              u.full_name AS client_name
       FROM missions m
       JOIN users u ON u.id = m.client_id
       WHERE m.convoyeur_id IS NULL AND m.status = 'ACCEPTEE'
       ORDER BY m.departure_date ASC NULLS LAST, m.created_at DESC`,
    );
    const dlcMissions = rows.map((m) => ({ ...m, source: "dlc" }));

    // ── 2. Missions Kaze (waiting, sans performer) ───────────
    let kazeMissions = [];
    try {
      const rawJobs = await kazeService.fetchRecentJobs(60);
      // IDs des jobs Kaze déjà liés à une mission DLC
      const linkedKazeIds = new Set(
        rows.filter((m) => m.kaze_mission_id).map((m) => m.kaze_mission_id),
      );
      kazeMissions = rawJobs
        .filter(
          (j) =>
            j.status === "waiting" &&
            !j.performer &&
            !linkedKazeIds.has(String(j.id)),
        )
        .map((j) => {
          const local = kazeService.kazeJobToLocal(j);
          return {
            id: `kaze_${j.id}`,
            kaze_job_id: j.id,
            source: "kaze",
            status: local.status,
            kaze_status: j.status,
            title: j.title || `Mission #${j.reference}`,
            kaze_reference: j.reference,
            departure_address: local.departure_address,
            arrival_address: local.arrival_address,
            departure_date: local.start_date || local.due_date || null,
            arrival_date: local.end_date || null,
            vehicle_brand: null,
            vehicle_model: null,
            vehicle_plate: null,
            price: null,
            client_name: j.owner_name || j.target_name || null,
            created_at: local.created_at,
            updated_at: local.updated_at,
          };
        });
    } catch (kazeErr) {
      console.warn(
        "⚠️ Kaze indisponible pour missions-disponibles:",
        kazeErr.message,
      );
    }

    res.json({ missions: [...dlcMissions, ...kazeMissions] });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : S'auto-attribuer une mission KAZE
// ═════════════════════════════════════════════════════════════
router.post("/kaze-missions/:kazeJobId/prendre", async (req, res, next) => {
  try {
    if (!req.user.kaze_driver_id) {
      return res.status(400).json({
        error:
          "Votre compte n'est pas lié à Kaze. Rendez-vous dans Mon profil pour vous lier.",
      });
    }

    // Vérifier que la mission est encore disponible
    const job = await kazeService.fetchJob(req.params.kazeJobId);
    if (!job) {
      return res.status(404).json({ error: "Mission Kaze introuvable." });
    }
    if (job.status !== "waiting") {
      return res.status(400).json({
        error: `Cette mission n'est plus disponible (statut : ${job.status}).`,
      });
    }
    if (job.performer) {
      return res.status(400).json({
        error: "Cette mission est déjà attribuée à un autre convoyeur.",
      });
    }

    // Assigner le convoyeur dans Kaze
    await kazeService.assignDriver(
      req.params.kazeJobId,
      req.user.kaze_driver_id,
    );

    console.log(
      `✅ Kaze: convoyeur ${req.user.kaze_driver_id} s'est assigné la mission ${req.params.kazeJobId}`,
    );

    res.json({
      message: "Mission Kaze prise avec succès !",
      kazeJobId: req.params.kazeJobId,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : S'auto-attribuer une mission disponible
// ═════════════════════════════════════════════════════════════
router.post("/missions/:id/prendre", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM missions WHERE id = $1", [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Mission introuvable." });
    }

    const mission = rows[0];

    if (mission.status !== "ACCEPTEE") {
      return res.status(400).json({
        error: `Cette mission n'est pas disponible (statut : "${mission.status}").`,
      });
    }
    if (mission.convoyeur_id) {
      return res.status(400).json({
        error: "Cette mission est déjà attribuée à un autre convoyeur.",
      });
    }

    const updated = await db.query(
      `UPDATE missions SET convoyeur_id = $1, status = 'ASSIGNEE', updated_at = NOW()
       WHERE id = $2 AND convoyeur_id IS NULL
       RETURNING *`,
      [req.user.id, mission.id],
    );

    if (updated.rows.length === 0) {
      return res.status(409).json({
        error: "Un autre convoyeur a pris cette mission entre-temps.",
      });
    }

    const updatedMission = updated.rows[0];

    // ── Synchroniser avec Kaze : créer la mission si besoin, puis assigner ──
    // (filet de rattrapage si la création Kaze avait échoué silencieusement
    // à l'étape « client accepte le devis »)
    const kazeSync = { synced: false, error: null };
    if (req.user.kaze_driver_id) {
      try {
        const kazeMissionId =
          await syncService.ensureKazeMission(updatedMission);
        if (kazeMissionId) {
          await kazeService.assignDriver(
            kazeMissionId,
            req.user.kaze_driver_id,
          );
          updatedMission.kaze_mission_id = kazeMissionId;
          kazeSync.synced = true;
          console.log(
            `✅ Kaze : convoyeur ${req.user.kaze_driver_id} assigné à la mission ${kazeMissionId}`,
          );
        } else {
          kazeSync.error = "La mission n'a pas pu être créée dans Kaze.";
          console.warn(
            `⚠️ Kaze : mission ${updatedMission.id} non synchronisée — assignation Kaze impossible.`,
          );
        }
      } catch (kazeErr) {
        kazeSync.error =
          kazeErr.response?.data?.message ||
          kazeErr.response?.data?.error ||
          kazeErr.message;
        console.error(
          "⚠️ Kaze : échec de l'assignation du convoyeur :",
          kazeErr.response?.data || kazeErr.message,
        );
      }
    } else {
      kazeSync.error = "Votre compte n'est pas lié à Kaze.";
      console.warn(
        `⚠️ Kaze : convoyeur ${req.user.id} sans kaze_driver_id — assignation Kaze ignorée.`,
      );
    }

    res.json({
      mission: updatedMission,
      message: "Mission prise avec succès !",
      kazeSync,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Démarrer une mission (passer EN_COURS)
// ═════════════════════════════════════════════════════════════
router.post("/missions/:id/demarrer", async (req, res, next) => {
  try {
    return res.status(403).json({
      error:
        "Le démarrage n'est pas autorisé dans DLC Kaze. Démarrez la mission depuis Kaze.",
      hint: "Le statut EN_COURS sera synchronisé automatiquement depuis Kaze (webhook/sync).",
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Marquer une mission comme livrée (LIVREE)
// ═════════════════════════════════════════════════════════════
router.post("/missions/:id/livrer", async (req, res, next) => {
  try {
    return res.status(403).json({
      error:
        "La clôture n'est pas autorisée dans DLC Kaze. Clôturez la mission depuis Kaze.",
      hint: "Le statut LIVREE sera synchronisé automatiquement depuis Kaze (webhook/sync).",
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Détail d'une mission
// ═════════════════════════════════════════════════════════════
router.get("/missions/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, u.full_name AS client_name
       FROM missions m
       JOIN users u ON u.id = m.client_id
       WHERE m.id = $1 AND m.convoyeur_id = $2`,
      [req.params.id, req.user.id],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Mission introuvable ou non attribuée." });
    }

    res.json({ mission: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Liste de ses documents
// ═════════════════════════════════════════════════════════════
router.get("/documents", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, type, original_name, mime_type, status, admin_note, created_at, updated_at
       FROM convoyeur_documents
       WHERE convoyeur_id = $1
       ORDER BY type ASC`,
      [req.user.id],
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Convoyeur : Téléverser / remplacer un document
// ═════════════════════════════════════════════════════════════
router.post(
  "/documents/:type",
  (req, res, next) => {
    if (!ALLOWED_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: "Type de document invalide." });
    }
    next();
  },
  upload.single("document"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Aucun fichier reçu." });
      }

      const { type } = req.params;
      const filePath = `/uploads/documents/${req.file.filename}`;

      // Supprimer l'ancien fichier physique si existant
      const existing = await db.query(
        "SELECT file_path FROM convoyeur_documents WHERE convoyeur_id = $1 AND type = $2",
        [req.user.id, type],
      );
      if (existing.rows[0]) {
        const oldPath = path.join(
          __dirname,
          "../../..",
          existing.rows[0].file_path,
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Upsert : insert ou remplacement si déjà existant
      const { rows } = await db.query(
        `INSERT INTO convoyeur_documents
           (convoyeur_id, type, original_name, file_path, mime_type, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'en_attente', NOW())
         ON CONFLICT (convoyeur_id, type)
         DO UPDATE SET
           original_name = EXCLUDED.original_name,
           file_path     = EXCLUDED.file_path,
           mime_type     = EXCLUDED.mime_type,
           status        = 'en_attente',
           admin_note    = NULL,
           reviewed_by   = NULL,
           reviewed_at   = NULL,
           updated_at    = NOW()
         RETURNING id, type, original_name, mime_type, status, created_at, updated_at`,
        [req.user.id, type, req.file.originalname, filePath, req.file.mimetype],
      );

      res
        .status(201)
        .json({ document: rows[0], message: "Document déposé avec succès." });
    } catch (err) {
      // Nettoyer le fichier si erreur DB
      if (req.file) {
        const p = path.join(UPLOAD_DIR, req.file.filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      next(err);
    }
  },
);

// ═════════════════════════════════════════════════════════════
// Convoyeur : Supprimer un de ses documents
// ═════════════════════════════════════════════════════════════
router.delete("/documents/:type", async (req, res, next) => {
  try {
    if (!ALLOWED_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: "Type de document invalide." });
    }

    const { rows } = await db.query(
      "DELETE FROM convoyeur_documents WHERE convoyeur_id = $1 AND type = $2 RETURNING file_path",
      [req.user.id, req.params.type],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Document introuvable." });
    }

    // Supprimer le fichier physique
    const oldPath = path.join(__dirname, "../../..", rows[0].file_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    res.json({ message: "Document supprimé." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
