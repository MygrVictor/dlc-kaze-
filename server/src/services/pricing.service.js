const db = require("../db");
const { geocode } = require("./geocoding.service");
const { trouverType } = require("../lib/vehicules");

const VAT_RATE = 0.2;
const ROAD_FACTOR = 1.22;

const VEHICLE_MULTIPLIER = {
  citadine: 1,
  berline: 1,
  suv: 1.1,
  utilitaire: 1.25,
  prestige: 1.35,
};

const SERVICE_SURCHARGES = {
  service_wash_exterior: 25,
  service_clean_interior: 35,
  service_refuel: 20,
};

let tablesReady = false;

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalizeVehicleType(type) {
  if (!type) return "berline";

  // Codes du catalogue (berline, suv, L2H2, poids_lourd…) : le segment
  // tarifaire y est déjà déclaré, on s'y fie en priorité.
  const connu = trouverType(type);
  if (connu) return connu.tarification;

  // Libellés libres et missions historiques.
  const t = String(type).trim().toLowerCase();
  if (["citadine", "city"].includes(t)) return "citadine";
  if (["berline", "sedan", "break", "monospace"].includes(t)) return "berline";
  if (["suv", "4x4", "suv / 4x4"].includes(t)) return "suv";
  if (["utilitaire", "van", "camionnette", "fourgon"].includes(t))
    return "utilitaire";
  if (["prestige", "luxe"].includes(t)) return "prestige";
  return "berline";
}

async function ensurePricingTables() {
  if (tablesReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tariff_grid (
      id                BIGSERIAL PRIMARY KEY,
      vehicle_type      VARCHAR(30) NOT NULL DEFAULT 'default',
      distance_min_km   INTEGER NOT NULL,
      distance_max_km   INTEGER,
      base_price        NUMERIC(10, 2) NOT NULL,
      price_per_km      NUMERIC(10, 4) NOT NULL,
      convoyeur_ratio   NUMERIC(5, 4) NOT NULL DEFAULT 0.70,
      min_price         NUMERIC(10, 2),
      is_active         BOOLEAN NOT NULL DEFAULT true,
      priority          INTEGER NOT NULL DEFAULT 100,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tariff_grid_lookup
      ON tariff_grid (vehicle_type, is_active, distance_min_km, distance_max_km, priority);

    CREATE TABLE IF NOT EXISTS partner_quotes (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source              VARCHAR(50) NOT NULL DEFAULT 'interencheres',
      reference_vente     VARCHAR(120),
      adresse_depart      TEXT NOT NULL,
      adresse_arrivee     TEXT NOT NULL,
      vehicle_type        VARCHAR(30) NOT NULL,
      distance_km         NUMERIC(10, 2) NOT NULL,
      price_ht            NUMERIC(10, 2) NOT NULL,
      price_ttc           NUMERIC(10, 2) NOT NULL,
      price_convoyeur_ht  NUMERIC(10, 2) NOT NULL,
      breakdown           JSONB NOT NULL,
      expires_at          TIMESTAMPTZ NOT NULL,
      consumed_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_partner_quotes_ref ON partner_quotes(reference_vente);
  `);

  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS count FROM tariff_grid",
  );
  if (rows[0].count === 0) {
    await db.query(`
      INSERT INTO tariff_grid (
        vehicle_type, distance_min_km, distance_max_km,
        base_price, price_per_km, convoyeur_ratio, min_price, priority
      ) VALUES
        ('default', 0, 50, 110, 1.10, 0.70, 90, 100),
        ('default', 51, 150, 95, 1.00, 0.70, 120, 100),
        ('default', 151, 300, 90, 0.92, 0.70, 180, 100),
        ('default', 301, NULL, 85, 0.88, 0.70, 250, 100)
    `);
  }

  tablesReady = true;
}

async function resolveTariffRule(vehicleType, distanceKm) {
  const { rows } = await db.query(
    `SELECT *
     FROM tariff_grid
     WHERE is_active = true
       AND vehicle_type IN ($1, 'default')
       AND distance_min_km <= $2
       AND (distance_max_km IS NULL OR distance_max_km >= $2)
     ORDER BY
       CASE WHEN vehicle_type = $1 THEN 0 ELSE 1 END,
       priority ASC,
       distance_min_km DESC
     LIMIT 1`,
    [vehicleType, Math.ceil(distanceKm)],
  );

  return rows[0] || null;
}

function computeServiceSurcharges(services = {}) {
  let total = 0;
  const details = [];

  for (const [key, amount] of Object.entries(SERVICE_SURCHARGES)) {
    if (services[key]) {
      total += amount;
      details.push({ code: key, amount });
    }
  }

  return { total: round2(total), details };
}

async function computeAutomaticQuote({
  adresse_depart,
  adresse_arrivee,
  type_vehicule,
  services,
}) {
  await ensurePricingTables();

  const from = await geocode(adresse_depart);
  const to = await geocode(adresse_arrivee);

  if (!from || !to) {
    const error = new Error(
      "Impossible de géocoder une ou plusieurs adresses.",
    );
    error.status = 400;
    throw error;
  }

  const directKm = haversineKm(from, to);
  const roadKm = Math.max(5, round2(directKm * ROAD_FACTOR));

  const vehicleType = normalizeVehicleType(type_vehicule);
  const rule = await resolveTariffRule(vehicleType, roadKm);

  if (!rule) {
    const error = new Error(
      "Aucune règle tarifaire active ne correspond à ce trajet.",
    );
    error.status = 422;
    throw error;
  }

  const vehicleMultiplier = VEHICLE_MULTIPLIER[vehicleType] || 1;
  const variable = Number(rule.price_per_km) * roadKm;
  const fixed = Number(rule.base_price);
  const serviceExtra = computeServiceSurcharges(services);

  let priceHT = (fixed + variable) * vehicleMultiplier + serviceExtra.total;
  if (rule.min_price) {
    priceHT = Math.max(priceHT, Number(rule.min_price));
  }

  priceHT = round2(priceHT);
  const priceTTC = round2(priceHT * (1 + VAT_RATE));
  const convoyeur = round2(priceHT * Number(rule.convoyeur_ratio || 0.7));

  return {
    vehicle_type: vehicleType,
    distance_km: roadKm,
    price_ht: priceHT,
    price_ttc: priceTTC,
    price_convoyeur_ht: convoyeur,
    breakdown: {
      fixed: round2(fixed),
      variable: round2(variable),
      vehicle_multiplier: vehicleMultiplier,
      services: serviceExtra.details,
      services_total: serviceExtra.total,
      tariff_rule_id: rule.id,
      convoyeur_ratio: Number(rule.convoyeur_ratio),
      vat_rate: VAT_RATE,
    },
  };
}

async function storeQuote({
  reference_vente,
  adresse_depart,
  adresse_arrivee,
  result,
}) {
  await ensurePricingTables();

  const { rows } = await db.query(
    `INSERT INTO partner_quotes (
      reference_vente, adresse_depart, adresse_arrivee,
      vehicle_type, distance_km, price_ht, price_ttc,
      price_convoyeur_ht, breakdown, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() + INTERVAL '30 days')
    RETURNING *`,
    [
      reference_vente || null,
      adresse_depart,
      adresse_arrivee,
      result.vehicle_type,
      result.distance_km,
      result.price_ht,
      result.price_ttc,
      result.price_convoyeur_ht,
      JSON.stringify(result.breakdown),
    ],
  );

  return rows[0];
}

async function getValidQuoteById(quoteId) {
  await ensurePricingTables();

  const { rows } = await db.query(
    `SELECT *
     FROM partner_quotes
     WHERE id = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()`,
    [quoteId],
  );

  return rows[0] || null;
}

async function markQuoteConsumed(quoteId) {
  await db.query(
    `UPDATE partner_quotes
     SET consumed_at = NOW()
     WHERE id = $1 AND consumed_at IS NULL`,
    [quoteId],
  );
}

module.exports = {
  ensurePricingTables,
  computeAutomaticQuote,
  storeQuote,
  getValidQuoteById,
  markQuoteConsumed,
};
