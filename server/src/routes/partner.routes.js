const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");
const {
  authenticatePartnerApiKey,
} = require("../middleware/partner-auth.middleware");
const pricingService = require("../services/pricing.service");

const router = express.Router();

router.use(authenticatePartnerApiKey);

router.post("/devis", async (req, res, next) => {
  try {
    const {
      adresse_depart,
      adresse_arrivee,
      type_vehicule,
      reference_vente,
      services,
    } = req.body || {};

    if (!adresse_depart || !adresse_arrivee) {
      return res.status(400).json({
        error: "adresse_depart et adresse_arrivee sont obligatoires.",
      });
    }

    const result = await pricingService.computeAutomaticQuote({
      adresse_depart,
      adresse_arrivee,
      type_vehicule,
      services,
    });

    const quote = await pricingService.storeQuote({
      reference_vente,
      adresse_depart,
      adresse_arrivee,
      result,
    });

    return res.status(201).json({
      quote_id: quote.id,
      reference_vente: reference_vente || null,
      vehicle_type: result.vehicle_type,
      distance_km: result.distance_km,
      price_ht: result.price_ht,
      price_ttc: result.price_ttc,
      price_convoyeur_ht: result.price_convoyeur_ht,
      expires_at: quote.expires_at,
      breakdown: result.breakdown,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/commandes", async (req, res, next) => {
  try {
    const {
      quote_id,
      reference_vente,
      client,
      departure_contact_name,
      departure_contact_phone,
      arrival_contact_name,
      arrival_contact_phone,
      departure_date,
      arrival_date,
      comments,
      vehicle,
    } = req.body || {};

    if (!quote_id) {
      return res.status(400).json({ error: "quote_id est obligatoire." });
    }

    if (!client?.email || !client?.full_name) {
      return res.status(400).json({
        error: "client.email et client.full_name sont obligatoires.",
      });
    }

    const quote = await pricingService.getValidQuoteById(quote_id);
    if (!quote) {
      return res
        .status(404)
        .json({ error: "Devis introuvable, expiré ou déjà consommé." });
    }

    const mission = await db.transaction(async (trx) => {
      const normalizedEmail = String(client.email).toLowerCase().trim();

      const existingUser = await trx.query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [normalizedEmail],
      );

      let clientId = existingUser.rows[0]?.id;

      if (!clientId) {
        const randomPassword = crypto.randomBytes(24).toString("hex");
        const hash = await bcrypt.hash(randomPassword, 10);

        const created = await trx.query(
          `INSERT INTO users (email, password_hash, full_name, phone, role, is_validated)
           VALUES ($1, $2, $3, $4, 'client', true)
           RETURNING id`,
          [normalizedEmail, hash, client.full_name, client.phone || null],
        );

        clientId = created.rows[0].id;
      }

      const inserted = await trx.query(
        `INSERT INTO missions (
          client_id,
          vehicle_plate, vehicle_brand, vehicle_model, vehicle_type,
          departure_address, departure_date, departure_contact_name, departure_contact_phone,
          arrival_address, arrival_date, arrival_contact_name, arrival_contact_phone,
          comments, price, price_convoyeur, status
        ) VALUES (
          $1,
          $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, 'DEVIS_PROPOSE'
        ) RETURNING *`,
        [
          clientId,
          vehicle?.plate || null,
          vehicle?.brand || null,
          vehicle?.model || null,
          quote.vehicle_type,
          quote.adresse_depart,
          departure_date || null,
          departure_contact_name || client.full_name,
          departure_contact_phone || client.phone || null,
          quote.adresse_arrivee,
          arrival_date || null,
          arrival_contact_name || client.full_name,
          arrival_contact_phone || client.phone || null,
          comments ||
            (reference_vente ? `Interenchères ref: ${reference_vente}` : null),
          quote.price_ht,
          quote.price_convoyeur_ht,
        ],
      );

      await trx.query(
        `UPDATE partner_quotes SET consumed_at = NOW() WHERE id = $1`,
        [quote_id],
      );

      return inserted.rows[0];
    });

    return res.status(201).json({
      mission_id: mission.id,
      status: mission.status,
      price_ht: mission.price,
      price_convoyeur_ht: mission.price_convoyeur,
      message: "Commande créée avec tarification automatique.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
