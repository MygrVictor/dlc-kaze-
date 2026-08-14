/**
 * Webhook Kaze → Synchronisation des statuts.
 *
 * Quand une mission est marquée "Livrée" dans Kaze, Kaze envoie
 * un POST à cette route. Le statut local est mis à jour.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  FLUX WEBHOOK                                                │
 * │                                                              │
 * │  Kaze (mission = "delivered")                                │
 * │       │                                                      │
 * │       ▼  POST /api/webhooks/kaze                             │
 * │  ┌─────────────────────────┐                                 │
 * │  │ 1. Vérifier la signature │                                │
 * │  │ 2. Extraire l'événement  │                                │
 * │  │ 3. Mapper le statut      │                                │
 * │  │ 4. UPDATE missions SET…  │                                │
 * │  └─────────────────────────┘                                 │
 * │       │                                                      │
 * │       ▼                                                      │
 * │  Base locale : statut → LIVREE                               │
 * │  (Le client voit le statut mis à jour sur le front)          │
 * └──────────────────────────────────────────────────────────────┘
 *
 * CONFIGURATION CÔTÉ KAZE :
 *   1. Aller dans Paramètres > Webhooks
 *   2. Ajouter URL : https://votre-domaine.com/api/webhooks/kaze
 *   3. Sélectionner les événements : mission.updated, mission.completed
 *   4. Copier le secret et le mettre dans KAZE_WEBHOOK_SECRET de votre .env
 */

const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

// ── Mapping des statuts Kaze → statuts locaux ────────────────
const STATUS_MAP = {
  pending: "EN_ATTENTE_DE_COTATION",
  waiting: "EN_ATTENTE_DE_COTATION",
  quoted: "DEVIS_PROPOSE",
  accepted: "ACCEPTEE",
  assigned: "ASSIGNEE",
  started: "EN_COURS",
  in_progress: "EN_COURS",
  in_transit: "EN_COURS",
  delivered: "LIVREE",
  completed: "LIVREE",
  cancelled: "ANNULEE",
};

/**
 * Vérifie la signature HMAC du webhook Kaze.
 */
const verifySignature = (payload, signature) => {
  const secret = process.env.KAZE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "❌ KAZE_WEBHOOK_SECRET non configuré — webhook rejeté en production.",
      );
      return false;
    }
    console.warn(
      "⚠️  KAZE_WEBHOOK_SECRET non configuré — vérification ignorée en dev.",
    );
    return true;
  }

  if (!signature) {
    console.error("❌ Signature manquante dans les headers du webhook.");
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
};

// ═════════════════════════════════════════════════════════════
// POST /api/webhooks/kaze
// ═════════════════════════════════════════════════════════════
router.post("/kaze", async (req, res) => {
  try {
    const rawBody = req.body.toString("utf8");
    const signature =
      req.headers["x-kaze-signature"] || req.headers["x-webhook-signature"];

    // 1. Vérifier la signature
    if (!verifySignature(rawBody, signature)) {
      console.error("❌ Signature webhook invalide.");
      return res.status(401).json({ error: "Signature invalide." });
    }

    const event = JSON.parse(rawBody);
    console.log("📨 Webhook Kaze reçu :", event.type, event.data?.id);

    // 2. Traiter l'événement
    if (
      event.type === "mission.updated" ||
      event.type === "mission.completed"
    ) {
      const kazeMissionId = event.data?.id || event.data?.mission_id;
      const kazeStatus = event.data?.status;

      if (!kazeMissionId || !kazeStatus) {
        return res.status(400).json({ error: "Données manquantes." });
      }

      const localStatus = STATUS_MAP[kazeStatus];
      if (!localStatus) {
        console.warn(`⚠️ Statut Kaze inconnu : "${kazeStatus}"`);
        return res.status(200).json({ message: "Statut ignoré." });
      }

      // 3. Mettre à jour la mission locale
      const result = await db.query(
        `UPDATE missions SET status = $1, updated_at = NOW()
         WHERE kaze_mission_id = $2 RETURNING id, status`,
        [localStatus, kazeMissionId],
      );

      if (result.rows.length > 0) {
        console.log(`✅ Mission ${result.rows[0].id} → ${localStatus}`);
      } else {
        console.warn(
          `⚠️ Aucune mission locale trouvée pour kaze_mission_id = ${kazeMissionId}`,
        );
      }
    }

    // Toujours répondre 200 rapidement pour éviter les retries
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Erreur webhook :", err);
    res.status(500).json({ error: "Erreur de traitement." });
  }
});

module.exports = router;
