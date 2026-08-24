/**
 * Service de géocodage — convertit les adresses en coordonnées GPS.
 *
 * ── Pourquoi deux fournisseurs ─────────────────────────────────
 * La Base Adresse Nationale (api-adresse.data.gouv.fr) est le service
 * officiel français : gratuit, sans clé, sans limite de débit pour un
 * usage raisonnable, et explicitement ouvert au commercial. Elle est
 * aussi nettement plus précise que Nominatim sur les adresses
 * françaises, qui représentent la quasi-totalité des convoyages.
 *
 * Nominatim reste en repli pour les rares trajets hors de France. Son
 * usage systématique par un service commercial est interdit par la
 * politique d'OpenStreetMap et expose à un blocage d'IP : il ne doit
 * donc jamais redevenir le chemin principal.
 *
 * Les résultats sont mis en cache en base PostgreSQL pour éviter de
 * re-géocoder une adresse déjà connue.
 *
 * ┌─────────────────────────────────────────────────┐
 * │  geocode("12 rue de Paris, Lyon")               │
 * │    → { lat: 45.764, lng: 4.8357 }               │
 * │                                                   │
 * │  1. Cherche en cache DB (geocode_cache)          │
 * │  2. Sinon → BAN, puis Nominatim si échec         │
 * │  3. Stocke le résultat en cache                  │
 * └─────────────────────────────────────────────────┘
 */

const axios = require("axios");
const db = require("../db");

const URL_BAN = "https://api-adresse.data.gouv.fr/search/";
const URL_NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Score en deçà duquel la BAN a trouvé quelque chose de trop approximatif
// pour être exploité : mieux vaut alors laisser sa chance au repli.
const SCORE_MINIMAL_BAN = 0.4;

// Pays desservis hors France. La BAN ne connaît que le territoire
// français, mais répond quand même à une adresse étrangère en la
// rapprochant d'une voie française homonyme : « Grand-Place Bruxelles »
// obtient ainsi un score de 0,56, indiscernable d'une vraie adresse.
// Le score seul ne peut donc pas trancher — on regarde le pays cité.
const PAYS_ETRANGERS =
  /\b(belgique|belgium|luxembourg|suisse|switzerland|schweiz|allemagne|germany|deutschland|espagne|spain|españa|italie|italy|italia|pays[- ]bas|netherlands|nederland|portugal|royaume[- ]uni|angleterre|united kingdom|england)\b/i;

/**
 * Indique si l'adresse désigne explicitement un pays étranger.
 *
 * Sert à court-circuiter la BAN, qui produirait sinon une coordonnée
 * française plausible mais fausse.
 */
function estEtrangere(adresse) {
  return PAYS_ETRANGERS.test(adresse);
}

// ── Rate limiter — Nominatim uniquement (1 req / 1.1s) ────────
// La BAN n'impose pas de tel délai ; l'y appliquer ralentirait
// inutilement le chemin principal.
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

/**
 * Interroge la Base Adresse Nationale.
 *
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocoderViaBan(adresse) {
  const { data } = await axios.get(URL_BAN, {
    params: { q: adresse, limit: 1 },
    timeout: 10000,
  });

  const trouve = data?.features?.[0];
  if (!trouve) return null;

  // La BAN répond toujours quelque chose, même pour une saisie farfelue ;
  // le score distingue une vraie correspondance d'un rapprochement vague.
  if (
    typeof trouve.properties?.score === "number" &&
    trouve.properties.score < SCORE_MINIMAL_BAN
  ) {
    return null;
  }

  // GeoJSON : les coordonnées sont ordonnées [longitude, latitude].
  const [lng, lat] = trouve.geometry?.coordinates || [];
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { lat, lng };
}

/**
 * Repli Nominatim, réservé aux adresses hors de France.
 *
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocoderViaNominatim(adresse) {
  const encoded = encodeURIComponent(adresse);
  const url = `${URL_NOMINATIM}?format=json&q=${encoded}&limit=1&countrycodes=fr,be,lu,ch,de,es,it,nl,pt,gb`;

  const resultats = await rateLimitedRequest(url);
  if (!resultats || resultats.length === 0) return null;

  const { lat, lon } = resultats[0];
  return { lat: parseFloat(lat), lng: parseFloat(lon) };
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

// ── Hash d'une adresse (normalisation + SHA256) ───────────────
const crypto = require("crypto");

/**
 * Réduit une adresse à une forme canonique avant hachage.
 *
 * Sans cette normalisation, « 12 Rue de Paris, LYON » et
 * « 12 rue de paris lyon » produisent deux entrées de cache distinctes
 * pour un même lieu — et donc deux appels au géocodeur.
 */
function hashAddress(address) {
  const normalized = address
    .toLowerCase()
    // Les accents ne changent pas le lieu désigné, mais changent le hash.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Virgules, points et tirets sont de simples séparateurs ici.
    .replace(/[.,;:\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

  // 2. Interroger les fournisseurs : la BAN d'abord, Nominatim ensuite.
  //    Une adresse explicitement étrangère va directement au repli : la
  //    BAN lui trouverait une correspondance française trompeuse.
  try {
    let coords = null;

    if (!estEtrangere(address)) {
      try {
        coords = await geocoderViaBan(address);
      } catch (err) {
        console.warn(`📍 BAN indisponible pour "${address}" : ${err.message}`);
      }
    }

    if (!coords) {
      // Adresse étrangère, ou introuvable dans le référentiel français.
      try {
        coords = await geocoderViaNominatim(address);
      } catch (err) {
        console.warn(
          `📍 Nominatim indisponible pour "${address}" : ${err.message}`,
        );
      }
    }

    if (!coords) {
      console.warn(`📍 Géocodage introuvable : "${address}"`);
      return null;
    }

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
