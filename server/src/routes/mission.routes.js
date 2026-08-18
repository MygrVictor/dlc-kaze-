const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const {
  authenticate,
  authorize,
  requireValidation,
} = require("../middleware/auth.middleware");
const kazeService = require("../services/kaze.service");
const emailService = require("../services/email.service");
const whatsappService = require("../services/whatsapp.service");
const {
  generateDevisPDF,
  generateDevisGroupePDF,
} = require("../services/devis.service");
const { lundiDeLaSemaine } = require("../lib/dates");
const { classeDePeage, estUtilitaire12m3 } = require("../lib/vehicules");
const {
  createMissionLimiter,
  validateUUIDParams,
} = require("../middleware/security.middleware");

const router = express.Router();

// ── Toutes les routes nécessitent une authentification ───────
router.use(authenticate);

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
// ÉTAPE 1 — Client : Créer une demande de mission
// ═════════════════════════════════════════════════════════════
router.post(
  "/",
  authorize("client"),
  requireValidation,
  createMissionLimiter,
  async (req, res, next) => {
    try {
      const {
        // Étape 1 : Véhicules (tableau)
        vehicles,
        // Étape 2 : Départ
        departureAddress,
        departureDate,
        departureStructure,
        departureStructureName,
        departureContactName,
        departureContactPhone,
        departureContactEmail,
        departureInstructions,
        // Étape 3 : Arrivée
        arrivalAddress,
        arrivalContactName,
        arrivalContactPhone,
        arrivalContactEmail,
        arrivalInstructions,
        serviceRefuel,
        serviceDocumentManagement,
        serviceHandover,
        // Rétribution
        retributionDetails,
        // Étape 4 : Urgence
        emergencyContactName,
        emergencyPhone,
        emergencyContactEmail,
        comments,
      } = req.body;

      // Date souhaitée par le client et marqueur d'urgence : deux notions
      // internes à DLC, jamais transmises à Kaze.
      const { desiredDeliveryDate, isUrgent } = req.body;

      if (!departureAddress || !arrivalAddress) {
        return res
          .status(400)
          .json({ error: "Adresses de départ et d'arrivée obligatoires." });
      }

      // Normaliser : accepte un tableau de véhicules ou un seul véhicule (rétrocompat)
      let vehicleList = vehicles;
      if (!Array.isArray(vehicleList) || vehicleList.length === 0) {
        // Rétrocompatibilité : champs véhicule à plat
        vehicleList = [
          {
            plate: req.body.vehiclePlate,
            vin: req.body.vehicleVin,
            brand: req.body.vehicleBrand,
            model: req.body.vehicleModel,
            finish: req.body.vehicleFinish,
            energy: req.body.vehicleEnergy,
            state: req.body.vehicleState,
            keys: req.body.vehicleKeys,
            utility12m3: req.body.vehicleUtility12m3,
          },
        ];
      }

      const createdMissions = [];

      // Toute mission est datée du lundi de la semaine en cours : c'est
      // cette date qui part vers Kaze. Le souhait du client est conservé
      // à part, dans `desired_delivery_date`.
      const dateOperationnelle = lundiDeLaSemaine();

      // Un véhicule = une mission (contrainte Kaze), mais plusieurs
      // véhicules déclarés d'un coup restent une seule affaire pour le
      // client : le lot permet d'en tirer un devis unique et chiffré.
      const batchId = crypto.randomUUID();

      for (const v of vehicleList) {
        const { rows } = await db.query(
          `INSERT INTO missions (
            client_id,
            vehicle_plate, vehicle_vin, vehicle_brand, vehicle_model, vehicle_finish,
            vehicle_energy, vehicle_state, vehicle_keys, vehicle_type, vehicle_utility_12m3,
            vehicle_toll_class,
            departure_address, departure_date, departure_structure, departure_structure_name,
            departure_contact_name, departure_contact_phone, departure_contact_email,
            departure_instructions,
            arrival_address, arrival_date, arrival_contact_name, arrival_contact_phone,
            arrival_contact_email, arrival_instructions,
            service_refuel, service_document_management, service_handover,
            retribution_details,
            emergency_contact_name, emergency_phone, emergency_contact_email,
            comments, desired_delivery_date, is_urgent, batch_id, status
          ) VALUES (
            $1,
            $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12,
            $13, $14, $15, $16,
            $17, $18, $19,
            $20,
            $21, $22, $23, $24,
            $25, $26,
            $27, $28, $29,
            $30,
            $31, $32, $33,
            $34, $35, $36, $37, 'EN_ATTENTE_DE_COTATION'
          ) RETURNING *`,
          [
            req.user.id,
            v.plate || null,
            v.vin || null,
            v.brand || null,
            v.model || null,
            v.finish || null,
            v.energy || null,
            v.state || null,
            v.keys ? parseInt(v.keys) : 1,
            v.vehicleType || v.type || null,
            // Volume et classe de péage découlent du gabarit : le client
            // n'a pas à les saisir, et ils ne peuvent pas se contredire.
            estUtilitaire12m3(v.vehicleType || v.type),
            classeDePeage(v.vehicleType || v.type),
            departureAddress,
            dateOperationnelle,
            departureStructure || null,
            departureStructureName || null,
            departureContactName || null,
            departureContactPhone || null,
            departureContactEmail || null,
            departureInstructions || null,
            arrivalAddress,
            dateOperationnelle,
            arrivalContactName || null,
            arrivalContactPhone || null,
            arrivalContactEmail || null,
            arrivalInstructions || null,
            serviceRefuel || false,
            serviceDocumentManagement || null,
            Boolean(serviceHandover),
            retributionDetails || null,
            emergencyContactName || null,
            emergencyPhone || null,
            emergencyContactEmail || null,
            comments || null,
            desiredDeliveryDate || null,
            Boolean(isUrgent),
            batchId,
          ],
        );
        createdMissions.push(rows[0]);
      }

      // Alerter l'admin : une mission non cotée n'avance pas tant que
      // personne ne l'a vue. L'échec d'envoi ne doit pas annuler la
      // création, la mission est déjà en base.
      try {
        for (const mission of createdMissions) {
          await emailService.notifyMissionACoter(mission, req.user);
        }
      } catch (emailErr) {
        console.error(
          "⚠️ Email admin (mission à coter) non envoyé :",
          emailErr.message,
        );
      }

      res.status(201).json({
        missions: createdMissions,
        count: createdMissions.length,
        message:
          createdMissions.length > 1
            ? `${createdMissions.length} missions créées avec succès.`
            : "Mission créée avec succès.",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ═════════════════════════════════════════════════════════════
// Client : Lister ses missions
// ═════════════════════════════════════════════════════════════
router.get("/mes-missions", authorize("client"), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit)));

    let query = "SELECT * FROM missions WHERE client_id = $1";
    let countQuery = "SELECT COUNT(*) FROM missions WHERE client_id = $1";
    const params = [req.user.id];
    let paramIdx = 2;

    if (status) {
      query += ` AND status = $${paramIdx}`;
      countQuery += ` AND status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const queryParams = [...params, safeLimit, offset];

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, params),
    ]);

    res.json({
      missions: rows,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: parseInt(countRows[0].count),
        totalPages: Math.ceil(parseInt(countRows[0].count) / safeLimit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Client : Détail d'une mission
// ═════════════════════════════════════════════════════════════
router.get("/:id", authorize("client", "admin"), async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM missions WHERE id = $1", [
      req.params.id,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Mission introuvable." });

    const mission = rows[0];
    // Un client ne peut voir que ses propres missions
    if (req.user.role === "client" && mission.client_id !== req.user.id) {
      return res.status(403).json({ error: "Accès interdit." });
    }

    res.json({ mission });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Client : Télécharger le devis PDF
// ═════════════════════════════════════════════════════════════
router.get(
  "/:id/devis",
  authorize("client", "admin"),
  async (req, res, next) => {
    try {
      // 1. Récupérer la mission
      const { rows: mRows } = await db.query(
        "SELECT * FROM missions WHERE id = $1",
        [req.params.id],
      );
      if (mRows.length === 0)
        return res.status(404).json({ error: "Mission introuvable." });

      const mission = mRows[0];

      // Vérifier l'accès
      if (req.user.role === "client" && mission.client_id !== req.user.id) {
        return res.status(403).json({ error: "Accès interdit." });
      }

      // Le devis n'est dispo que si un prix a été proposé
      if (!mission.price) {
        return res
          .status(400)
          .json({ error: "Aucun devis disponible pour cette mission." });
      }

      // 2. Récupérer les infos client
      const { rows: uRows } = await db.query(
        "SELECT full_name, email, phone, company FROM users WHERE id = $1",
        [mission.client_id],
      );
      const client = uRows[0] || {};

      // 3. Le client a-t-il déclaré plusieurs véhicules d'un coup ? Dans
      //    ce cas il attend une seule proposition chiffrée, pas un PDF
      //    par véhicule. On ne retient que les missions déjà cotées :
      //    additionner un prix manquant fausserait le total.
      let lot = [mission];
      if (mission.batch_id) {
        const { rows } = await db.query(
          `SELECT * FROM missions
            WHERE batch_id = $1 AND price IS NOT NULL
            ORDER BY created_at ASC, id ASC`,
          [mission.batch_id],
        );
        if (rows.length > 1) lot = rows;
      }

      const groupe = lot.length > 1;
      const devisNum = groupe
        ? `DEV-${mission.batch_id.substring(0, 8).toUpperCase()}`
        : `DEV-${mission.id.substring(0, 8).toUpperCase()}`;
      const filename = `devis-${devisNum}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );

      const doc = groupe
        ? generateDevisGroupePDF(lot, client)
        : generateDevisPDF(mission, client);
      doc.pipe(res);
      doc.end();
    } catch (err) {
      next(err);
    }
  },
);

// ═════════════════════════════════════════════════════════════
// ÉTAPE 3 — Client : Accepter le devis → ÉTAPE 4 (POST Kaze)
// ═════════════════════════════════════════════════════════════
router.post("/:id/accepter", authorize("client"), async (req, res, next) => {
  try {
    // Utiliser une transaction pour garantir la cohérence
    const result = await db.transaction(async (client) => {
      // 1. Récupérer la mission avec verrou (FOR UPDATE)
      const { rows } = await client.query(
        "SELECT * FROM missions WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error("Mission introuvable."), {
          status: 404,
        });
      }

      const mission = rows[0];

      if (mission.client_id !== req.user.id) {
        throw Object.assign(
          new Error("Cette mission ne vous appartient pas."),
          { status: 403 },
        );
      }
      if (mission.status !== "DEVIS_PROPOSE") {
        throw Object.assign(
          new Error(
            `Impossible d'accepter : la mission est au statut "${mission.status}".`,
          ),
          { status: 400 },
        );
      }

      // 2. Passer le statut en ACCEPTEE
      await client.query(
        `UPDATE missions SET status = 'ACCEPTEE', updated_at = NOW() WHERE id = $1`,
        [mission.id],
      );

      // 3. Envoyer la mission à l'API Kaze
      let kazeMissionId = null;
      try {
        const kazeResponse = await kazeService.createMission(mission);
        kazeMissionId = kazeResponse.id || kazeResponse.mission_id;

        await client.query(
          `UPDATE missions SET kaze_mission_id = $1, updated_at = NOW() WHERE id = $2`,
          [kazeMissionId, mission.id],
        );
      } catch (kazeErr) {
        console.error(
          `⚠️  Erreur Kaze (mission acceptée localement, retry en queue) : ${kazeErr.message}`,
        );
      }

      return { kazeMissionId };
    });

    // 4. Notifier tous les convoyeurs (asynchrone, ne bloque pas la réponse)
    try {
      const { rows: convoyeurs } = await db.query(
        "SELECT id, email, full_name, phone FROM users WHERE role = 'convoyeur'",
      );
      if (convoyeurs.length > 0) {
        // Récupérer la mission complète pour la notification
        const { rows: fullMission } = await db.query(
          "SELECT * FROM missions WHERE id = $1",
          [req.body.missionId || req.params.id],
        );
        if (fullMission[0]) {
          // Le numéro de téléphone est obligatoire pour les convoyeurs :
          // la notification passe exclusivement par WhatsApp.
          whatsappService
            .notifierMissionDisponible(convoyeurs, fullMission[0])
            .catch((err) => {
              console.error(
                "⚠️ Erreur lors de la notification des convoyeurs :",
                err.message,
              );
            });
        }
      }
    } catch (notifyErr) {
      console.error(
        "⚠️ Erreur lors de la récupération des convoyeurs :",
        notifyErr.message,
      );
    }

    res.json({
      message: "Mission acceptée avec succès.",
      kazeMissionId: result.kazeMissionId,
      status: "ACCEPTEE",
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// ÉTAPE 3 bis — Client : Refuser le devis (avec motif obligatoire)
// Le motif remonte à l'équipe par email : il sert de point d'entrée
// pour rappeler le client et retravailler la proposition.
// ═════════════════════════════════════════════════════════════
router.post("/:id/refuser", authorize("client"), async (req, res, next) => {
  try {
    const motif = (req.body?.motif || "").trim();
    if (motif.length < 5) {
      return res.status(400).json({
        error: "Merci d'indiquer le motif du refus (5 caractères minimum).",
      });
    }
    if (motif.length > 2000) {
      return res
        .status(400)
        .json({ error: "Le motif ne peut pas dépasser 2000 caractères." });
    }

    const { rows } = await db.query("SELECT * FROM missions WHERE id = $1", [
      req.params.id,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Mission introuvable." });

    const mission = rows[0];

    if (mission.client_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Cette mission ne vous appartient pas." });
    }
    if (mission.status !== "DEVIS_PROPOSE") {
      return res.status(400).json({
        error: `Impossible de refuser : la mission est au statut "${mission.status}".`,
      });
    }

    const { rows: updated } = await db.query(
      `UPDATE missions
          SET status = 'DEVIS_REFUSE', refus_motif = $1, refused_at = NOW(), updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [motif, mission.id],
    );

    // Alerter l'équipe (non bloquant : le refus reste enregistré même si
    // l'email échoue).
    try {
      const { rows: clients } = await db.query(
        "SELECT id, email, full_name, phone, company FROM users WHERE id = $1",
        [mission.client_id],
      );
      await emailService.notifyDevisRefuse(mission, clients[0], motif);
    } catch (emailErr) {
      console.error("⚠️ Email refus de devis non envoyé :", emailErr.message);
    }

    res.json({
      message: "Devis refusé. Notre équipe vous recontacte rapidement.",
      status: "DEVIS_REFUSE",
      mission: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// Client : Annuler sa mission (avant qu'elle soit EN_COURS)
// ═════════════════════════════════════════════════════════════
router.post("/:id/annuler", authorize("client"), async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM missions WHERE id = $1", [
      req.params.id,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Mission introuvable." });

    const mission = rows[0];

    if (mission.client_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Cette mission ne vous appartient pas." });
    }

    // Le client ne peut annuler que si la mission n'est pas encore en cours/livrée
    const cancellable = [
      "EN_ATTENTE_DE_COTATION",
      "DEVIS_PROPOSE",
      "DEVIS_REFUSE",
      "ACCEPTEE",
      "ASSIGNEE",
    ];
    if (!cancellable.includes(mission.status)) {
      return res.status(400).json({
        error: `Impossible d'annuler : la mission est au statut "${mission.status}".`,
      });
    }

    await db.query(
      `UPDATE missions SET status = 'ANNULEE', updated_at = NOW() WHERE id = $1`,
      [mission.id],
    );

    // ── Synchroniser avec Kaze ────────────────────────────────
    if (mission.kaze_mission_id) {
      try {
        await kazeService.cancelMission(mission.kaze_mission_id);
        console.log(
          `✅ Kaze : mission ${mission.kaze_mission_id} annulée par le client`,
        );
      } catch (kazeErr) {
        console.error("⚠️ Kaze : échec de l'annulation :", kazeErr.message);
      }
    }

    res.json({ message: "Mission annulée.", status: "ANNULEE" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
