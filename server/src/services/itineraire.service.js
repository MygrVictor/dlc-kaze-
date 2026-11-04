/**
 * Itinéraires routiers (OpenRouteService) pour la carte admin.
 *
 * Même fournisseur que le widget Livr'Auto (widget-livrauto/distance.js) :
 * la distance facturée et le tracé affiché sur la carte proviennent ainsi
 * du même calcul.
 *
 * Les tracés sont conservés en base (table itineraires_cache) : un trajet
 * n'est demandé qu'une fois à ORS, quel que soit le nombre d'affichages de
 * la carte. C'est indispensable avec l'offre gratuite (2 000 itinéraires
 * par jour, 40 par minute).
 *
 * Sans ORS_API_KEY, ou si ORS échoue, la fonction renvoie null : la carte
 * garde alors sa ligne droite, comme avant.
 */
const db = require("../db");

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const ORS_TIMEOUT_MS = 6000;
// Au-delà, la ligne est simplifiée : quelques centaines de points suffisent
// à l'échelle d'une carte de France et allègent fortement la réponse.
const POINTS_MAX = 400;

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS itineraires_cache (
      cle         TEXT PRIMARY KEY,
      distance_km NUMERIC(10, 2) NOT NULL,
      geometrie   JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

function estCoordonnee(p) {
  return (
    p &&
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng)) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

/** Clé de cache : un trajet à ~100 m près. */
function cleTrajet(from, to) {
  const r = (n) => Number(n).toFixed(3);
  return `${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}`;
}

/** Garde un point sur n, en conservant toujours le premier et le dernier. */
function simplifier(points, max = POINTS_MAX) {
  if (points.length <= max) return points;
  const pas = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % pas === 0);
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

async function appelerOrs(from, to, apiKey) {
  const res = await fetch(ORS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/geo+json, application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [Number(from.lng), Number(from.lat)],
        [Number(to.lng), Number(to.lat)],
      ],
      radiuses: [1500, 1500],
      instructions: false,
    }),
    signal: AbortSignal.timeout(ORS_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data?.error?.message || `OpenRouteService HTTP ${res.status}`,
    );
    err.status = res.status;
    throw err;
  }

  const feature = data?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  const metres = feature?.properties?.summary?.distance;
  if (!Array.isArray(coords) || !coords.length || !Number.isFinite(metres)) {
    throw new Error("Réponse ORS incomplète");
  }

  return {
    distance_km: Math.round((metres / 1000) * 100) / 100,
    // GeoJSON est en [lng, lat] ; Leaflet attend [lat, lng].
    // 5 décimales ≈ 1 m : largement assez précis pour un tracé.
    coords: simplifier(coords).map(([lng, lat]) => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
  };
}

/**
 * Lit en cache les itinéraires connus, sans appel externe.
 * @returns {Promise<Map<string, {distance_km:number, coords:number[][]}>>}
 */
async function lireCache(cles) {
  await ensureTable();
  if (!cles.length) return new Map();
  const { rows } = await db.query(
    `SELECT cle, distance_km, geometrie FROM itineraires_cache WHERE cle = ANY($1)`,
    [cles],
  );
  return new Map(
    rows.map((r) => [
      r.cle,
      { distance_km: Number(r.distance_km), coords: r.geometrie },
    ]),
  );
}

/**
 * Itinéraire routier entre deux points, depuis le cache ou ORS.
 * @returns {Promise<{distance_km:number, coords:number[][]} | null>}
 */
async function itineraire(from, to) {
  if (!estCoordonnee(from) || !estCoordonnee(to)) return null;

  const cle = cleTrajet(from, to);
  const enCache = (await lireCache([cle])).get(cle);
  if (enCache) return enCache;

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return null;

  try {
    const trace = await appelerOrs(from, to, apiKey);
    await db.query(
      `INSERT INTO itineraires_cache (cle, distance_km, geometrie)
       VALUES ($1, $2, $3)
       ON CONFLICT (cle) DO NOTHING`,
      [cle, trace.distance_km, JSON.stringify(trace.coords)],
    );
    return trace;
  } catch (err) {
    // Un échec n'est pas mis en cache : le trajet sera retenté plus tard.
    console.warn(
      "[itineraire] ORS indisponible —",
      err.status || "",
      err.message,
    );
    return null;
  }
}

/**
 * Itinéraires d'un lot de trajets. Les tracés déjà connus sont renvoyés
 * immédiatement ; au plus `nouveauxMax` sont demandés à ORS par appel, en
 * série, pour rester sous la limite de 40 requêtes par minute. Les autres
 * sont signalés dans `restants` et seront calculés à l'appel suivant.
 *
 * @param {{id:string, from:{lat,lng}, to:{lat,lng}}[]} trajets
 */
async function itinerairesEnLot(trajets, { nouveauxMax = 15 } = {}) {
  const valides = trajets.filter(
    (t) => t && t.id && estCoordonnee(t.from) && estCoordonnee(t.to),
  );
  const cles = valides.map((t) => cleTrajet(t.from, t.to));
  const connus = await lireCache([...new Set(cles)]);

  const resultats = {};
  const aCalculer = [];
  valides.forEach((t, i) => {
    const trace = connus.get(cles[i]);
    if (trace) resultats[t.id] = trace;
    else aCalculer.push(t);
  });

  const disponible = Boolean(process.env.ORS_API_KEY);
  const lot = disponible ? aCalculer.slice(0, nouveauxMax) : [];
  for (const t of lot) {
    const trace = await itineraire(t.from, t.to);
    if (trace) resultats[t.id] = trace;
  }

  return {
    itineraires: resultats,
    restants: disponible ? aCalculer.length - lot.length : 0,
    ors_configure: disponible,
  };
}

module.exports = {
  itineraire,
  itinerairesEnLot,
  _interne: { cleTrajet, simplifier, estCoordonnee },
};
