const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const kazeService = require("../services/kaze.service");
const syncService = require("../services/sync.service");
const emailService = require("../services/email.service");
const geocodingService = require("../services/geocoding.service");
const { auditLog } = require("../middleware/security.middleware");
const fs = require("fs");
const path = require("path");

// Racine des fichiers déposés. Sert à effacer du disque les pièces d'une
// candidature écartée : la cascade SQL n'emporte que les lignes.
const UPLOADS_DIR = path.join(__dirname, "../../../uploads");

const router = express.Router();

router.use(authenticate, authorize("admin"));

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KAZE_ID_REGEX =
  /^kaze-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.param("id", (req, res, next, value) => {
  if (!UUID_REGEX.test(value) && !KAZE_ID_REGEX.test(value))
    return res.status(400).json({ error: "Identifiant invalide." });
  next();
});

router.param("docId", (req, res, next, value) => {
  if (!UUID_REGEX.test(value) && !KAZE_ID_REGEX.test(value))
    return res.status(400).json({ error: "Identifiant invalide." });
  next();
});

async function getMissionById(missionId) {
  const normalizedId = missionId?.replace(/^kaze-/i, "") || "";
  const { rows } = await db.query(
    `SELECT * FROM missions
     WHERE id::text = $1
        OR id::text = $2
        OR kaze_mission_id = $3`,
    [missionId, normalizedId, normalizedId],
  );
  return rows[0] || null;
}

/**
 * Échappe une valeur pour un CSV séparé par des points-virgules.
 * Les guillemets sont doublés et la valeur est encadrée dès qu'elle contient
 * un séparateur, un guillemet ou un saut de ligne.
 */
function escapeCsv(value) {
  const str = String(value ?? "");
  if (!/[";\n\r]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function buildMissionCsv(rows) {
  const headers = [
    "ID",
    "Statut",
    "Prix HT",
    "Client",
    "Email client",
    "Entreprise",
    "Convoyeur",
    "Marque",
    "Modèle",
    "Plaque",
    "VIN",
    "Départ",
    "Date départ",
    "Arrivée",
    "Date arrivée",
    "Lavage ext.",
    "Nettoyage int.",
    "Plein",
    "Mise en main",
    "Tel urgence",
    "Commentaires",
    "Créée le",
  ];

  const lines = rows.map((m) =>
    [
      m.id,
      m.status,
      m.price || "",
      escapeCsv(m.client_name || ""),
      m.client_email || "",
      escapeCsv(m.client_company || ""),
      escapeCsv(m.convoyeur_name || ""),
      m.vehicle_brand || "",
      m.vehicle_model || "",
      m.vehicle_plate || "",
      m.vehicle_vin || "",
      escapeCsv(m.departure_address || ""),
      m.departure_date || "",
      escapeCsv(m.arrival_address || ""),
      m.arrival_date || "",
      m.service_wash_exterior ? "Oui" : "Non",
      m.service_clean_interior ? "Oui" : "Non",
      m.service_refuel ? "Oui" : "Non",
      m.service_handover ? "Oui" : "Non",
      m.emergency_phone || "",
      escapeCsv(m.comments || ""),
      m.created_at,
    ].join(";"),
  );

  return "\uFEFF" + headers.join(";") + "\n" + lines.join("\n");
}

router.get("/missions", async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;

    let query = `
      SELECT m.*, u.full_name AS client_name, u.email AS client_email, u.company AS client_company,
             u.phone AS client_phone,
             c.full_name AS convoyeur_name
      FROM missions m
      LEFT JOIN users u ON u.id = m.client_id
      LEFT JOIN users c ON c.id = m.convoyeur_id
    `;
    let countQuery = `SELECT COUNT(*) FROM missions m LEFT JOIN users u ON u.id = m.client_id`;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`m.status = $${paramIdx}`);
      params.push(status);
      paramIdx += 1;
    }

    if (search) {
      conditions.push(`(
        u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.company ILIKE $${paramIdx}
        OR m.vehicle_brand ILIKE $${paramIdx} OR m.vehicle_plate ILIKE $${paramIdx}
        OR m.departure_address ILIKE $${paramIdx} OR m.arrival_address ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx += 1;
    }

    if (conditions.length > 0) {
      const where = ` WHERE ${conditions.join(" AND ")}`;
      query += where;
      countQuery += where;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(query, [...params, safeLimit, offset]),
      db.query(countQuery, params),
    ]);

    const total = parseInt(countRows[0]?.count || "0", 10);
    res.json({
      missions: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/missions/search-plate", async (req, res, next) => {
  try {
    const { plate } = req.query;
    if (!plate || plate.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "Veuillez saisir au moins 2 caractères de plaque." });
    }

    const { rows } = await db.query(
      `SELECT m.*, u.full_name AS client_name, u.email AS client_email, u.company AS client_company,
              c.full_name AS convoyeur_name
       FROM missions m
       LEFT JOIN users u ON u.id = m.client_id
       LEFT JOIN users c ON c.id = m.convoyeur_id
       WHERE REPLACE(UPPER(m.vehicle_plate), '-', '') ILIKE '%' || REPLACE(UPPER($1), '-', '') || '%'
       ORDER BY m.updated_at DESC
       LIMIT 50`,
      [plate.trim()],
    );

    res.json({ missions: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get("/missions/export-csv", async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT m.*, u.full_name AS client_name, u.email AS client_email, u.company AS client_company,
             c.full_name AS convoyeur_name
      FROM missions m
      LEFT JOIN users u ON u.id = m.client_id
      LEFT JOIN users c ON c.id = m.convoyeur_id
    `;
    const params = [];
    if (status) {
      query += " WHERE m.status = $1";
      params.push(status);
    }
    query += " ORDER BY m.created_at DESC";

    const { rows } = await db.query(query, params);
    const csv = buildMissionCsv(rows);

    auditLog("EXPORT_CSV", req.user?.id, {
      ip: req.ip,
      count: rows.length,
      filter: status || "all",
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="missions-dlc-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/stats", async (_req, res, next) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'EN_ATTENTE_DE_COTATION') AS en_attente,
        COUNT(*) FILTER (WHERE status = 'DEVIS_PROPOSE') AS devis_proposes,
        COUNT(*) FILTER (WHERE status = 'ACCEPTEE') AS acceptees,
        COUNT(*) FILTER (WHERE status = 'ACCEPTEE' AND convoyeur_id IS NULL) AS en_attente_assignation,
        COUNT(*) FILTER (WHERE status = 'ASSIGNEE') AS assignees,
        COUNT(*) FILTER (WHERE status = 'EN_COURS') AS en_cours,
        COUNT(*) FILTER (WHERE status = 'LIVREE') AS livrees,
        COUNT(*) AS total
      FROM missions
    `);

    const userStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'client') AS clients,
        COUNT(*) FILTER (WHERE role = 'convoyeur') AS convoyeurs,
        COUNT(*) FILTER (WHERE role = 'client' AND is_validated = false) AS clients_en_attente
      FROM users
    `);

    res.json({ missions: stats.rows[0], users: userStats.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Demandes de mise en relation (prospects)
//
// Les comptes ne sont plus créés depuis le site public : ces demandes
// sont la porte d'entrée, et l'admin décide de les convertir ou non.
// ══════════════════════════════════════════════════════════════

router.get("/demandes", async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await db.query(
      `SELECT cr.id, cr.type, cr.first_name, cr.last_name, cr.company, cr.job_title,
              cr.email, cr.phone, cr.message,
              cr.siret, cr.rc_circulation, cr.rc_pro, cr.w_garage,
              cr.status, cr.admin_note, cr.converted_user_id, cr.handled_at, cr.created_at,
              -- Pièces déposées avec la candidature. L'agrégat renvoie un
              -- tableau vide plutôt que NULL, pour que le front puisse
              -- boucler dessus sans garde.
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'id', dd.id, 'type', dd.type,
                          'originalName', dd.original_name,
                          'filePath', dd.file_path,
                          'createdAt', dd.created_at)
                        ORDER BY dd.created_at)
                   FROM demande_documents dd
                  WHERE dd.demande_id = cr.id),
                '[]'::json
              ) AS documents
         FROM contact_requests cr
         ${where}
         ORDER BY cr.created_at DESC`,
      params,
    );

    res.json({ demandes: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/demandes/:id", async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const allowed = ["nouvelle", "contactee", "convertie", "archivee"];

    if (status && !allowed.includes(status)) {
      return res.status(400).json({ error: "Statut invalide." });
    }

    // COALESCE : un champ absent du corps de requête ne doit pas
    // écraser la valeur déjà enregistrée.
    const { rows } = await db.query(
      `UPDATE contact_requests
          SET status     = COALESCE($1, status),
              admin_note = COALESCE($2, admin_note),
              handled_by = $3,
              handled_at = NOW(),
              updated_at = NOW()
        WHERE id = $4
      RETURNING id, type, status, admin_note, handled_at`,
      [status || null, adminNote ?? null, req.user.id, req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Demande introuvable." });
    }

    res.json({ demande: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/demandes/:id", async (req, res, next) => {
  try {
    // Seconde issue d'une candidature : elle est écartée, et les pièces
    // transmises n'ont plus aucune raison d'exister. Les chemins sont
    // relevés avant la suppression — la cascade emporterait les lignes,
    // laissant les fichiers orphelins sur le disque.
    const { rows: pieces } = await db.query(
      "SELECT file_path FROM demande_documents WHERE demande_id = $1",
      [req.params.id],
    );

    const { rows } = await db.query(
      "DELETE FROM contact_requests WHERE id = $1 RETURNING id",
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Demande introuvable." });
    }

    // `demande_documents` est parti en cascade. Reste le disque : chaque
    // échec est consigné sans interrompre la boucle, la demande étant
    // déjà supprimée en base.
    let effaces = 0;
    for (const { file_path: chemin } of pieces) {
      const cible = path.resolve(
        path.join(UPLOADS_DIR, "documents", path.basename(chemin)),
      );
      // Garde-fou contre un chemin remonté : `basename` suffit en théorie,
      // mais rien ne justifie de s'en remettre à une seule barrière quand
      // l'opération est une suppression.
      if (!cible.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) continue;
      try {
        if (fs.existsSync(cible)) {
          fs.unlinkSync(cible);
          effaces++;
        }
      } catch (err) {
        console.error(`⚠️ Fichier ${chemin} non effacé : ${err.message}`);
      }
    }

    if (pieces.length > 0) {
      auditLog("CANDIDATURE_DOCUMENTS_SUPPRIMES", req.user.id, {
        demandeId: req.params.id,
        pieces: pieces.length,
        effaces,
      });
    }

    res.json({
      message:
        pieces.length > 0
          ? `Demande supprimée, ${effaces} document(s) effacé(s).`
          : "Demande supprimée.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const { role } = req.query;
    let query = `SELECT id, email, full_name, phone, company, role, is_validated, kaze_driver_id, created_at FROM users`;
    const params = [];
    if (role) {
      query += " WHERE role = $1";
      params.push(role);
    }
    query += " ORDER BY created_at DESC";
    const { rows } = await db.query(query, params);
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id/validate", async (req, res, next) => {
  try {
    const updated = await db.query(
      `UPDATE users SET is_validated = true, updated_at = NOW()
       WHERE id = $1 AND role IN ('client', 'convoyeur')
       RETURNING id, email, full_name, role, is_validated`,
      [req.params.id],
    );

    if (updated.rows.length === 0)
      return res.status(404).json({ error: "Utilisateur introuvable." });

    try {
      await emailService.notifyAccountValidated(
        updated.rows[0].email,
        updated.rows[0].full_name,
      );
    } catch (emailErr) {
      console.error("⚠️ Email validation non envoyé :", emailErr.message);
    }

    res.json({
      user: updated.rows[0],
      message: `${updated.rows[0].role === "convoyeur" ? "Convoyeur" : "Client"} validé.`,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res
        .status(400)
        .json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
    }

    const userRow = await db.query(
      "SELECT id, full_name, email, role FROM users WHERE id = $1",
      [req.params.id],
    );
    if (userRow.rows.length === 0)
      return res.status(404).json({ error: "Utilisateur introuvable." });

    const targetUser = userRow.rows[0];
    if (targetUser.role === "admin" && targetUser.id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Impossible de supprimer un compte administrateur." });
    }

    await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({
      message: `Utilisateur ${targetUser.full_name} supprimé.`,
      deletedUser: targetUser,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id/kaze-link", async (req, res, next) => {
  try {
    const { kazeDriverId } = req.body;
    const userRow = await db.query("SELECT id, role FROM users WHERE id = $1", [
      req.params.id,
    ]);
    if (userRow.rows.length === 0)
      return res.status(404).json({ error: "Utilisateur introuvable." });
    if (userRow.rows[0].role !== "convoyeur") {
      return res
        .status(400)
        .json({ error: "Seuls les convoyeurs peuvent être liés à Kaze." });
    }

    if (kazeDriverId) {
      const existing = await db.query(
        "SELECT id, full_name FROM users WHERE kaze_driver_id = $1 AND id != $2",
        [kazeDriverId, req.params.id],
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `Ce kaze_driver_id est déjà lié à ${existing.rows[0].full_name}.`,
        });
      }
    }

    const updated = await db.query(
      `UPDATE users SET kaze_driver_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, kaze_driver_id`,
      [kazeDriverId || null, req.params.id],
    );

    res.json({
      user: updated.rows[0],
      message: kazeDriverId ? "Compte Kaze lié." : "Liaison Kaze supprimée.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/users/:id/documents", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, u.full_name AS reviewed_by_name
       FROM convoyeur_documents d
       LEFT JOIN users u ON u.id = d.reviewed_by
       WHERE d.convoyeur_id = $1
       ORDER BY d.type ASC`,
      [req.params.id],
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id/documents/:docId", async (req, res, next) => {
  try {
    const { status, admin_note } = req.body;
    if (!["valide", "refuse"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Statut invalide. Utilisez 'valide' ou 'refuse'." });
    }

    const { rows } = await db.query(
      `UPDATE convoyeur_documents
       SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 AND convoyeur_id = $5
       RETURNING *`,
      [
        status,
        admin_note || null,
        req.user.id,
        req.params.docId,
        req.params.id,
      ],
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Document introuvable." });

    res.json({
      document: rows[0],
      message: `Document ${status === "valide" ? "validé" : "refusé"}.`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/kaze-health", (_req, res) =>
  res.json(kazeService.getKazeHealth()),
);

router.get("/kaze/test", async (_req, res, next) => {
  try {
    const result = await kazeService.testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/kaze/jobs", async (req, res, next) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 60;
    const rawJobs = await kazeService.fetchRecentJobs(days);
    const jobs = (rawJobs || []).map(kazeService.kazeJobToLocal);
    const { status } = req.query;
    const filtered = status
      ? jobs.filter((job) => job.kaze_status === status)
      : jobs;
    res.json({ meta: { total_count: filtered.length, days }, data: filtered });
  } catch (err) {
    next(err);
  }
});

router.get("/kaze/jobs/:jobId", async (req, res, next) => {
  try {
    const job = await kazeService.fetchJob(req.params.jobId);
    res.json(kazeService.kazeJobToLocal(job));
  } catch (err) {
    next(err);
  }
});

router.get("/kaze/users", async (_req, res, next) => {
  try {
    const result = await kazeService.fetchUsers();
    const users = (result.data || []).map(kazeService.kazeUserToLocal);
    res.json({ meta: result.meta, data: users });
  } catch (err) {
    next(err);
  }
});

router.get("/kaze/invoices", async (req, res, next) => {
  try {
    const { page, per_page } = req.query;
    const result = await kazeService.fetchInvoices({
      page: page ? parseInt(page, 10) : 1,
      perPage: per_page ? parseInt(per_page, 10) : 100,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/missions/map", async (req, res, next) => {
  try {
    const { statuses } = req.query;
    const allowedStatuses = [
      "EN_ATTENTE_DE_COTATION",
      "DEVIS_PROPOSE",
      "ACCEPTEE",
      "ASSIGNEE",
      "EN_COURS",
      "LIVREE",
    ];

    const filterStatuses = statuses
      ? statuses
          .split(",")
          .map((s) => s.trim())
          .filter((s) => allowedStatuses.includes(s))
      : allowedStatuses;

    const placeholders = filterStatuses.map((_, i) => `$${i + 1}`).join(", ");
    // Le nombre de missions affichables est borné : la carte devient
    // illisible bien avant, et sans plafond la requête grossit avec tout
    // l'historique — plusieurs milliers de lignes après un an d'activité
    // soutenue, pour un rendu identique.
    const PLAFOND_MISSIONS = 500;
    const { rows: missions } = await db.query(
      `SELECT m.id, m.status, m.departure_address, m.arrival_address, m.vehicle_brand, m.vehicle_model, m.vehicle_plate,
              m.departure_date, m.arrival_date, m.price,
              u.full_name AS client_name, u.company AS client_company,
              c.full_name AS convoyeur_name
       FROM missions m
       LEFT JOIN users u ON u.id = m.client_id
       LEFT JOIN users c ON c.id = m.convoyeur_id
       WHERE m.status IN (${placeholders})
       ORDER BY m.created_at DESC
       LIMIT ${PLAFOND_MISSIONS}`,
      filterStatuses,
    );

    let kazeJobs = [];
    try {
      // Profondeur d'historique demandée par le client. La valeur par
      // défaut reste courte : afficher plusieurs milliers de missions
      // closes noierait les missions actives et alourdirait la carte.
      // Le plafond évite qu'un paramètre fantaisiste ne déclenche un
      // balayage sans fin de l'API Kaze.
      const jours = Math.min(
        Math.max(Number(req.query.jours) || 60, 1),
        3 * 365,
      );
      const rawJobs = await kazeService.fetchRecentJobs(jours);
      kazeJobs = (rawJobs || []).map(kazeService.kazeJobToLocal);

      // La liste `/jobs` de Kaze est allégée : ni coordonnées, ni workflow,
      // et `work_order_address` est souvent vide sur les missions assignées.
      // Ces jobs n'avaient donc aucune adresse à géocoder et disparaissaient
      // de la carte. On va chercher leur détail, qui porte les adresses du
      // workflow. Le nombre d'appels est borné : la carte doit rester
      // rapide, quitte à ce que quelques missions anciennes manquent.
      const sansPosition = kazeJobs.filter(
        (j) => !j.latitude && !j.address && !j.departure_address,
      );
      const A_COMPLETER = 40;
      await Promise.all(
        sansPosition.slice(0, A_COMPLETER).map(async (job) => {
          try {
            const detail = await kazeService.fetchJob(job.kaze_job_id);
            const complet = kazeService.kazeJobToLocal(detail);
            job.departure_address = complet.departure_address;
            job.arrival_address = complet.arrival_address;
            job.latitude = complet.latitude;
            job.longitude = complet.longitude;
          } catch {
            // Un job introuvable ne doit pas priver la carte des autres.
          }
        }),
      );
    } catch (kazeErr) {
      console.error("⚠️ Kaze map fetch:", kazeErr.message);
    }

    const allAddresses = [];
    missions.forEach((mission) => {
      if (mission.departure_address)
        allAddresses.push(mission.departure_address);
      if (mission.arrival_address) allAddresses.push(mission.arrival_address);
    });

    // Le géocodage à la volée était tenable tant que les missions se
    // comptaient en dizaines. Au-delà, chaque adresse inconnue ajoute un
    // aller-retour réseau à la construction de la carte : quelques
    // centaines suffisent à faire expirer la requête HTTP. On ne lit donc
    // que le cache, alimenté à la création des missions et, pour le
    // rattrapage, par scripts/backfill-geocodage-kaze.js. Une adresse
    // encore inconnue manque à la carte sans jamais la ralentir.
    const coordsMap = await geocodingService.geocodeDepuisCache(allAddresses);

    // Même principe pour les jobs Kaze, qui se comptent en milliers dès
    // qu'on remonte l'historique.
    // Beaucoup de jobs n'ont pas de `work_order_address` — leur point de
    // départ vit dans le workflow, d'où le repli sur `departure_address`.
    const adressesKaze = [];
    kazeJobs
      .filter((job) => !job.latitude)
      .forEach((job) => {
        const adresse = job.address || job.departure_address;
        if (adresse) adressesKaze.push(adresse);
      });
    const cacheKaze = await geocodingService.geocodeDepuisCache(adressesKaze);
    for (const [adresse, coords] of cacheKaze) coordsMap.set(adresse, coords);

    const features = missions
      .map((mission) => {
        const departure = mission.departure_address
          ? coordsMap.get(mission.departure_address.trim())
          : null;
        const arrival = mission.arrival_address
          ? coordsMap.get(mission.arrival_address.trim())
          : null;
        if (!departure && !arrival) return null;
        return {
          id: mission.id,
          status: mission.status,
          vehicle: [mission.vehicle_brand, mission.vehicle_model]
            .filter(Boolean)
            .join(" "),
          plate: mission.vehicle_plate,
          client: mission.client_name,
          company: mission.client_company,
          convoyeur: mission.convoyeur_name,
          departureDate: mission.departure_date,
          arrivalDate: mission.arrival_date,
          price: mission.price,
          departure: departure
            ? { address: mission.departure_address, ...departure }
            : null,
          arrival: arrival
            ? { address: mission.arrival_address, ...arrival }
            : null,
        };
      })
      .filter(Boolean);

    const kazeFeatures = kazeJobs
      .map((job) => {
        let lat = job.latitude;
        let lng = job.longitude;
        const adresse = job.address || job.departure_address;
        if (!lat && adresse) {
          const geocoded = coordsMap.get(adresse.trim());
          if (geocoded) {
            lat = geocoded.lat;
            lng = geocoded.lng;
          }
        }
        if (!lat) return null;
        return {
          kaze_job_id: job.kaze_job_id,
          kaze_reference: job.kaze_reference,
          title: job.title,
          address: adresse,
          arrival_address: job.arrival_address,
          status_name: job.status_name,
          kaze_status: job.kaze_status,
          performer_name: job.performer_name,
          due_date: job.due_date,
          latitude: lat,
          longitude: lng,
        };
      })
      .filter(Boolean);

    res.json({
      total: missions.length,
      geocoded: features.length,
      missions: features,
      kazeMissions: kazeFeatures,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/missions", async (req, res, next) => {
  try {
    const {
      client_id,
      client_email,
      vehicle_plate,
      vehicle_brand,
      vehicle_model,
      vehicle_energy,
      departure_address,
      departure_date,
      departure_contact_name,
      departure_contact_phone,
      arrival_address,
      arrival_date,
      arrival_contact_name,
      arrival_contact_phone,
      comments,
      price,
      price_convoyeur,
      status,
    } = req.body;

    if (!departure_address || !arrival_address) {
      return res
        .status(400)
        .json({ error: "Adresses de départ et d'arrivée obligatoires." });
    }

    let resolvedClientId = client_id || null;
    if (!resolvedClientId && client_email) {
      const { rows: userRows } = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [client_email.toLowerCase().trim()],
      );
      resolvedClientId = userRows[0]?.id || null;
    }

    if (!resolvedClientId) {
      return res
        .status(400)
        .json({ error: "client_id ou client_email valide requis." });
    }

    const { rows } = await db.query(
      `INSERT INTO missions (
        client_id,
        vehicle_plate, vehicle_brand, vehicle_model, vehicle_energy,
        departure_address, departure_date, departure_contact_name, departure_contact_phone,
        arrival_address, arrival_date, arrival_contact_name, arrival_contact_phone,
        comments, price, price_convoyeur, status
      ) VALUES (
        $1,
        $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17
      ) RETURNING *`,
      [
        resolvedClientId,
        vehicle_plate || null,
        vehicle_brand || null,
        vehicle_model || null,
        vehicle_energy || null,
        departure_address,
        departure_date || null,
        departure_contact_name || null,
        departure_contact_phone || null,
        arrival_address,
        arrival_date || null,
        arrival_contact_name || null,
        arrival_contact_phone || null,
        comments || null,
        price || null,
        price_convoyeur || null,
        status || "EN_ATTENTE_DE_COTATION",
      ],
    );

    res
      .status(201)
      .json({ mission: rows[0], message: "Mission créée avec succès." });
  } catch (err) {
    next(err);
  }
});

router.post("/missions/:id/proposer-prix", async (req, res, next) => {
  try {
    const { price, price_convoyeur } = req.body;
    if (!price || isNaN(price) || Number(price) <= 0) {
      return res
        .status(400)
        .json({ error: "Veuillez fournir un prix client valide." });
    }
    if (
      !price_convoyeur ||
      isNaN(price_convoyeur) ||
      Number(price_convoyeur) <= 0
    ) {
      return res
        .status(400)
        .json({ error: "Veuillez fournir un prix convoyeur valide." });
    }
    if (Number(price_convoyeur) > Number(price)) {
      return res.status(400).json({
        error: "Le prix convoyeur ne peut pas dépasser le prix client.",
      });
    }

    const mission = await getMissionById(req.params.id);
    if (!mission)
      return res.status(404).json({ error: "Mission introuvable." });
    // Une mission refusée peut être recotée après discussion avec le client.
    if (!["EN_ATTENTE_DE_COTATION", "DEVIS_REFUSE"].includes(mission.status)) {
      return res.status(400).json({
        error: `Impossible de proposer un prix : statut actuel "${mission.status}".`,
      });
    }

    const updated = await db.query(
      `UPDATE missions SET price = $1, price_convoyeur = $2, status = 'DEVIS_PROPOSE', updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [price, price_convoyeur, mission.id],
    );

    try {
      const { rows: clientRows } = await db.query(
        "SELECT email, full_name FROM users WHERE id = $1",
        [mission.client_id],
      );
      if (clientRows[0]) {
        await emailService.notifyDevisPropose(
          clientRows[0].email,
          clientRows[0].full_name,
          mission,
          price,
        );
      }
    } catch (emailErr) {
      console.error("⚠️ Email devis non envoyé :", emailErr.message);
    }

    res.json({ mission: updated.rows[0], message: "Devis proposé au client." });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Supprimer une mission. Réservé aux dossiers qui n'ont pas
// démarré : une mission assignée ou en cours doit être annulée,
// pas effacée, afin de conserver la trace opérationnelle.
// ─────────────────────────────────────────────────────────────
router.delete("/missions/:id", async (req, res, next) => {
  try {
    const mission = await getMissionById(req.params.id);
    if (!mission)
      return res.status(404).json({ error: "Mission introuvable." });

    const deletable = [
      "EN_ATTENTE_DE_COTATION",
      "DEVIS_PROPOSE",
      "DEVIS_REFUSE",
      "ANNULEE",
    ];
    if (!deletable.includes(mission.status)) {
      return res.status(400).json({
        error: `Impossible de supprimer une mission au statut "${mission.status}". Annulez-la d'abord.`,
      });
    }

    if (mission.kaze_mission_id) {
      try {
        await kazeService.cancelMission(mission.kaze_mission_id);
      } catch (kazeErr) {
        console.error(
          "⚠️ Kaze : échec de l'annulation avant suppression :",
          kazeErr.message,
        );
      }
    }

    await db.query("DELETE FROM missions WHERE id = $1", [mission.id]);

    res.json({ message: "Mission supprimée.", deletedId: mission.id });
  } catch (err) {
    next(err);
  }
});

router.post("/missions/:id/attribuer-convoyeur", async (req, res, next) => {
  try {
    const { convoyeurId, kazeDriverId } = req.body;
    if (!convoyeurId && !kazeDriverId) {
      return res
        .status(400)
        .json({ error: "ID du convoyeur ou du driver Kaze requis." });
    }

    let convoyeur = null;
    if (convoyeurId) {
      convoyeur = await db.query(
        "SELECT id, full_name, email, phone, kaze_driver_id FROM users WHERE id = $1 AND role = 'convoyeur'",
        [convoyeurId],
      );
      if (convoyeur.rows.length === 0) {
        return res.status(404).json({ error: "Convoyeur introuvable." });
      }
    } else {
      try {
        const kazeDriver = await kazeService.getDriver(kazeDriverId);
        convoyeur = {
          rows: [
            {
              id: null,
              full_name:
                kazeDriver.name || kazeDriver.full_name || "Un convoyeur",
              kaze_driver_id: kazeDriver.id || kazeDriverId,
            },
          ],
        };
      } catch (kazeErr) {
        if (kazeErr.response?.status === 404) {
          return res.status(404).json({ error: "Convoyeur Kaze introuvable." });
        }
        throw kazeErr;
      }
    }

    let assignedKazeDriverId =
      convoyeur.rows[0].kaze_driver_id || kazeDriverId || null;

    if (!assignedKazeDriverId && convoyeurId) {
      try {
        const emailLookup = convoyeur.rows[0].email
          ? await kazeService.getDriverByEmail(convoyeur.rows[0].email)
          : null;
        const phoneLookup =
          !emailLookup && convoyeur.rows[0].phone
            ? await kazeService.getDriverByPhone(convoyeur.rows[0].phone)
            : null;
        const driverLookup = emailLookup || phoneLookup;
        if (driverLookup?.id) {
          assignedKazeDriverId = driverLookup.id;
          await db.query(
            "UPDATE users SET kaze_driver_id = $1, updated_at = NOW() WHERE id = $2",
            [assignedKazeDriverId, convoyeurId],
          );
          convoyeur.rows[0].kaze_driver_id = assignedKazeDriverId;
        }
      } catch (lookupErr) {
        // On continue : si on ne trouve pas de correspondance, on gardera l'erreur métier ci-dessous.
      }
    }

    const missionRecord = await getMissionById(req.params.id);
    if (!missionRecord) {
      const kazeMissionId = req.params.id.replace(/^kaze-/i, "");
      if (!kazeMissionId) {
        return res.status(404).json({ error: "Mission introuvable." });
      }

      try {
        await kazeService.fetchJob(kazeMissionId);
      } catch (kazeErr) {
        if (kazeErr.response?.status === 404) {
          return res.status(404).json({ error: "Mission introuvable." });
        }
        throw kazeErr;
      }

      if (!assignedKazeDriverId) {
        return res
          .status(400)
          .json({ error: "Ce convoyeur n'a pas de compte Kaze lié." });
      }

      await kazeService.assignDriver(kazeMissionId, assignedKazeDriverId);

      // Sauvegarder l'assignation localement (upsert sur kaze_mission_id)
      let localMission = null;
      try {
        const kazeJob = await kazeService.fetchJob(kazeMissionId);
        // Récupérer un client_id système (admin) pour satisfaire la contrainte NOT NULL
        const { rows: adminRows } = await db.query(
          `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
        );
        const systemClientId = adminRows[0]?.id;
        if (systemClientId) {
          const steps = kazeJob.steps || [];
          const startStep = steps.find(
            (s) => s.step_type === "start" || s.id === "start_navigation",
          );
          const endStep = steps.find(
            (s) => s.step_type === "end" || s.id === "end_navigation",
          );
          const depAddr =
            startStep?.address || kazeJob.work_order_address?.address || "—";
          const arrAddr =
            endStep?.address || kazeJob.work_order_address?.address || "—";
          const upsertResult = await db.query(
            `INSERT INTO missions (
              kaze_mission_id, status, convoyeur_id, client_id,
              departure_address, arrival_address,
              created_at, updated_at
            ) VALUES ($1, 'ASSIGNEE', $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (kaze_mission_id)
            DO UPDATE SET
              status = 'ASSIGNEE',
              convoyeur_id = $2,
              updated_at = NOW()
            RETURNING *`,
            [
              kazeMissionId,
              convoyeurId || null,
              systemClientId,
              depAddr,
              arrAddr,
            ],
          );
          localMission = upsertResult.rows[0];
        }
      } catch (upsertErr) {
        console.error(
          "⚠️ Impossible de sauvegarder l'assignation Kaze localement:",
          upsertErr.message,
        );
      }

      return res.json({
        mission: localMission || {
          id: req.params.id,
          kaze_mission_id: kazeMissionId,
          convoyeur_id: convoyeurId || null,
        },
        kazeSync: {
          synced: true,
          error: null,
          direct_kaze: true,
        },
      });
    }

    const updated = await db.query(
      `UPDATE missions SET convoyeur_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [convoyeurId, missionRecord.id],
    );
    if (updated.rows.length === 0)
      return res.status(404).json({ error: "Mission introuvable." });

    const mission = updated.rows[0];

    try {
      const { rows: clientRows } = await db.query(
        "SELECT email, full_name FROM users WHERE id = $1",
        [mission.client_id],
      );
      if (clientRows[0]) {
        await emailService.notifyMissionAssignee(
          clientRows[0].email,
          clientRows[0].full_name,
          mission,
          convoyeur.rows[0].full_name || "Un convoyeur",
        );
      }
    } catch (emailErr) {
      console.error("⚠️ Email assignation non envoyé :", emailErr.message);
    }

    const kazeSync = { synced: false, error: null };
    if (assignedKazeDriverId) {
      try {
        const kazeMissionId = await syncService.ensureKazeMission(mission);
        if (kazeMissionId) {
          await kazeService.assignDriver(kazeMissionId, assignedKazeDriverId);
          kazeSync.synced = true;
        } else {
          kazeSync.error = "La mission n'a pas pu être créée dans Kaze.";
        }
      } catch (kazeErr) {
        kazeSync.error =
          kazeErr.response?.data?.message ||
          kazeErr.response?.data?.error ||
          kazeErr.message;
      }
    } else {
      kazeSync.error = "Ce convoyeur n'a pas de compte Kaze lié.";
    }

    res.json({ mission, kazeSync });
  } catch (err) {
    next(err);
  }
});

router.post("/missions/:id/annuler", async (req, res, next) => {
  try {
    const mission = await getMissionById(req.params.id);
    if (!mission)
      return res.status(404).json({ error: "Mission introuvable." });
    if (mission.status === "LIVREE" || mission.status === "ANNULEE") {
      return res.status(400).json({
        error: `Impossible d'annuler : statut actuel "${mission.status}".`,
      });
    }

    const updated = await db.query(
      `UPDATE missions SET status = 'ANNULEE', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [mission.id],
    );

    if (mission.kaze_mission_id) {
      try {
        await kazeService.cancelMission(mission.kaze_mission_id);
      } catch (kazeErr) {
        console.error("⚠️ Kaze : échec annulation :", kazeErr.message);
      }
    }

    res.json({ mission: updated.rows[0], message: "Mission annulée." });
  } catch (err) {
    next(err);
  }
});

router.post("/missions/:id/sync-kaze", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, u.full_name AS client_name, u.email AS client_email
       FROM missions m LEFT JOIN users u ON u.id = m.client_id WHERE m.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Mission introuvable." });

    const mission = rows[0];
    let kazeMissionId = mission.kaze_mission_id;
    let justCreated = false;

    if (!kazeMissionId) {
      const syncable = ["ACCEPTEE", "ASSIGNEE", "EN_COURS"];
      if (!syncable.includes(mission.status)) {
        return res.status(400).json({
          error: `Impossible de synchroniser : statut actuel "${mission.status}".`,
        });
      }
      const kazeResponse = await kazeService.createMission(mission);
      kazeMissionId = kazeResponse.id || kazeResponse.mission_id;
      justCreated = true;
      await db.query(
        "UPDATE missions SET kaze_mission_id = $1, updated_at = NOW() WHERE id = $2",
        [kazeMissionId, mission.id],
      );
    }

    let driverAssigned = false;
    let assignError = null;
    if (mission.convoyeur_id) {
      const { rows: convRows } = await db.query(
        "SELECT kaze_driver_id, full_name FROM users WHERE id = $1",
        [mission.convoyeur_id],
      );
      const kazeDriverId = convRows[0]?.kaze_driver_id;
      if (!kazeDriverId) {
        assignError = `Le convoyeur ${convRows[0]?.full_name || "assigné"} n'a pas de compte Kaze lié.`;
      } else {
        await kazeService.assignDriver(kazeMissionId, kazeDriverId);
        driverAssigned = true;
      }
    }

    res.json({
      message: justCreated
        ? "Mission créée et synchronisée avec Kaze."
        : driverAssigned
          ? "Convoyeur ré-assigné dans Kaze avec succès."
          : "Mission déjà synchronisée avec Kaze.",
      kaze_mission_id: kazeMissionId,
      just_created: justCreated,
      driver_assigned: driverAssigned,
      assign_error: assignError,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/kaze/jobs/:jobId", async (req, res, next) => {
  try {
    const result = await kazeService.updateKazeJob(req.params.jobId, req.body);
    res.json({ message: "Mission Kaze mise à jour.", data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
