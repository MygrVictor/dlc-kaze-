/**
 * Service de géocodage — convertit les adresses en coordonnées GPS.
 *
 * Utilise OpenStreetMap Nominatim (gratuit, pas de clé API).
 * Les résultats sont mis en cache en base PostgreSQL pour :
 *  - éviter de re-géocoder la même adresse
 *  - respecter le rate-limit Nominatim (1 req/sec)
 *
 * ┌─────────────────────────────────────────────────┐
 * │  geocode("12 rue de Paris, Lyon")               │
 * │    → { lat: 45.764, lng: 4.8357 }               │
 * │                                                   │
 * │  1. Cherche en cache DB (geocode_cache)          │
 * │  2. Sinon → appel Nominatim + stockage cache     │
 * └─────────────────────────────────────────────────┘
 */

const axios = require("axios");
const db = require("../db");

// ── Rate limiter simple (1 req / 1.1s pour Nominatim) ────────
let lastRequestTime = 0;
const MIN_INTERVAL = 1100; // ms

async function rateLimitedRequest(url) {
  const now = Date.now();
  const waitTime = Math.max(0, MIN_INTERVAL - (now - lastRequestTime));
  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  const response = await axios.get(url, {
    headers: {
      "User-Agent": "DLC-Kaze-ConvoyApp/1.0 (contact@dlc-kaze.fr)",
      Accept: "application/json",
    },
    timeout: 10000,
  });
  return response.data;
}

// ── Initialisation de la table cache ──────────────────────────
let cacheTableReady = false;

async function ensureCacheTable() {
  if (cacheTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS geocode_cache (
      address_hash  VARCHAR(64) PRIMARY KEY,
      address       TEXT NOT NULL,
      lat           DOUBLE PRECISION NOT NULL,
      lng           DOUBLE PRECISION NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_geocode_cache_hash ON geocode_cache(address_hash);
  `);
  cacheTableReady = true;
}

// ── Hash simple d'une adresse (normalisation + SHA256) ────────
const crypto = require("crypto");

function hashAddress(address) {
  const normalized = address.toLowerCase().trim().replace(/\s+/g, " ");
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 64);
}

// ── Géocoder une adresse ──────────────────────────────────────
async function geocode(address) {
  if (!address || address.trim().length < 3) return null;

  await ensureCacheTable();
  const hash = hashAddress(address);

  // 1. Chercher en cache
  const cached = await db.query(
    "SELECT lat, lng FROM geocode_cache WHERE address_hash = $1",
    [hash],
  );
  if (cached.rows.length > 0) {
    return {
      lat: parseFloat(cached.rows[0].lat),
      lng: parseFloat(cached.rows[0].lng),
    };
  }

  // 2. Appeler Nominatim
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=fr,be,lu,ch,de,es,it,nl,pt,gb`;

    let results = await rateLimitedRequest(url);

    // Fallback : si l'adresse complète ne donne rien, essayer avec les 2 derniers mots (ville + CP)
    if ((!results || results.length === 0) && address.includes(" ")) {
      const words = address.trim().split(/\s+/);
      // Essayer les 2 derniers mots (ex: "44000 Nantes" ou "Nantes France")
      const fallback = words.slice(-2).join(" ");
      console.warn(
        `📍 Géocodage : fallback sur "${fallback}" pour "${address}"`,
      );
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallback)}&limit=1&countrycodes=fr,be,lu,ch,de,es,it,nl,pt,gb`;
      results = await rateLimitedRequest(fallbackUrl);
    }

    if (!results || results.length === 0) {
      console.warn(`📍 Géocodage introuvable : "${address}"`);
      return null;
    }

    const { lat, lon } = results[0];
    const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };

    // 3. Stocker en cache
    await db.query(
      `INSERT INTO geocode_cache (address_hash, address, lat, lng)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address_hash) DO NOTHING`,
      [hash, address.trim(), coords.lat, coords.lng],
    );

    return coords;
  } catch (err) {
    console.error(`📍 Erreur géocodage "${address}" :`, err.message);
    return null;
  }
}

// ── Géocoder un lot d'adresses (avec dédoublonnage) ──────────
async function geocodeBatch(addresses) {
  const unique = [...new Set(addresses.filter(Boolean).map((a) => a.trim()))];
  const results = new Map();

  for (const addr of unique) {
    const coords = await geocode(addr);
    if (coords) {
      results.set(addr.trim(), coords);
    }
  }

  return results;
}

/**
 * Lecture du cache seul, en une requête, sans jamais appeler Nominatim.
 *
 * `geocodeBatch` interroge Nominatim pour toute adresse inconnue, à raison
 * d'une requête par seconde. Sur quelques dizaines d'adresses c'est
 * acceptable ; sur un historique de plusieurs milliers de missions cela
 * représente des heures, et la requête HTTP expire bien avant.
 *
 * Les gros volumes passent donc par ce chemin : la carte n'affiche que ce
 * qui est déjà connu, et le remplissage du cache est confié à un traitement
 * hors ligne (scripts/backfill-geocodage-kaze.js). Une adresse manquante
 * fait défaut à l'affichage, elle ne ralentit jamais la page.
 *
 * @param {string[]} addresses
 * @returns {Promise<Map<string, {lat: number, lng: number}>>}
 */
async function geocodeDepuisCache(addresses) {
  const uniques = [...new Set(addresses.filter(Boolean).map((a) => a.trim()))];
  const resultats = new Map();
  if (uniques.length === 0) return resultats;

  await ensureCacheTable();

  // Le hash est calculé côté Node : l'index sur address_hash reste
  // utilisable, ce qu'une normalisation en SQL empêcherait.
  const parHash = new Map();
  for (const adresse of uniques) parHash.set(hashAddress(adresse), adresse);

  const { rows } = await db.query(
    "SELECT address_hash, lat, lng FROM geocode_cache WHERE address_hash = ANY($1)",
    [[...parHash.keys()]],
  );

  for (const ligne of rows) {
    const adresse = parHash.get(ligne.address_hash);
    if (adresse) {
      resultats.set(adresse, {
        lat: parseFloat(ligne.lat),
        lng: parseFloat(ligne.lng),
      });
    }
  }

  return resultats;
}

module.exports = {
  geocode,
  geocodeBatch,
  geocodeDepuisCache,
  ensureCacheTable,
};
