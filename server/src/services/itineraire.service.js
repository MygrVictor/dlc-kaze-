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
// Un trajet qu'ORS ne sait pas calculer n'est retenté qu'après ce délai.
const ECHEC_RETRY_JOURS = 7;
const ECHEC = Object.freeze({ echec: true });

// Promesse partagée : deux requêtes simultanées ne doivent pas lancer deux
// CREATE TABLE en parallèle (Postgres lève alors pg_type_typname_nsp_index).
let tablePromise = null;

function ensureTable() {
  if (!tablePromise) {
    tablePromise = db
      .query(
        `CREATE TABLE IF NOT EXISTS itineraires_cache (
          cle         TEXT PRIMARY KEY,
          distance_km NUMERIC(10, 2) NOT NULL,
          geometrie   JSONB NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        -- Échecs mémorisés (géométrie nulle) pour ne pas consommer le quota
        -- ORS à chaque affichage de la carte.
        ALTER TABLE itineraires_cache ALTER COLUMN geometrie DROP NOT NULL;
        ALTER TABLE itineraires_cache ALTER COLUMN distance_km DROP NOT NULL;
        ALTER TABLE itineraires_cache ADD COLUMN IF NOT EXISTS echec TEXT;`,
      )
      .catch((err) => {
        tablePromise = null;
        // Course déjà perdue par une autre instance : la table existe.
        if (err.code === "23505" || err.code === "42P07") return;
        throw err;
      });
  }
  return tablePromise;
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
    `SELECT cle, distance_km, geometrie FROM itineraires_cache
      WHERE cle = ANY($1)
        AND (geometrie IS NOT NULL OR created_at > NOW() - INTERVAL '${ECHEC_RETRY_JOURS} days')`,
    [cles],
  );
  return new Map(
    rows.map((r) => [
      r.cle,
      r.geometrie
        ? { distance_km: Number(r.distance_km), coords: r.geometrie }
        : ECHEC,
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
  if (enCache) return enCache === ECHEC ? null : enCache;

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return null;

  try {
    const trace = await appelerOrs(from, to, apiKey);
    await db.query(
      `INSERT INTO itineraires_cache (cle, distance_km, geometrie)
       VALUES ($1, $2, $3)
       ON CONFLICT (cle) DO UPDATE
         SET distance_km = EXCLUDED.distance_km, geometrie = EXCLUDED.geometrie,
             echec = NULL, created_at = NOW()`,
      [cle, trace.distance_km, JSON.stringify(trace.coords)],
    );
    return trace;
  } catch (err) {
    console.warn(
      "[itineraire] ORS indisponible —",
      err.status || "",
      err.message,
    );
    // Erreur propre au trajet (4xx hors quota) : on la mémorise pour ne
    // pas la redemander à chaque affichage. Quota/réseau : on retentera.
    if (
      err.status &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 429 &&
      err.status !== 401 &&
      err.status !== 403
    ) {
      await db
        .query(
          `INSERT INTO itineraires_cache (cle, echec) VALUES ($1, $2)
           ON CONFLICT (cle) DO UPDATE SET echec = EXCLUDED.echec, created_at = NOW()
           WHERE itineraires_cache.geometrie IS NULL`,
          [cle, String(err.message).slice(0, 300)],
        )
        .catch(() => {});
    }
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
  const echecs = [];
  const aCalculer = [];
  valides.forEach((t, i) => {
    const trace = connus.get(cles[i]);
    if (trace === ECHEC) echecs.push(t.id);
    else if (trace) resultats[t.id] = trace;
    else aCalculer.push(t);
  });

  const disponible = Boolean(process.env.ORS_API_KEY);
  const lot = disponible ? aCalculer.slice(0, nouveauxMax) : [];
  for (const t of lot) {
    const trace = await itineraire(t.from, t.to);
    if (trace) resultats[t.id] = trace;
    else echecs.push(t.id);
  }

  return {
    itineraires: resultats,
    echecs,
    restants: disponible ? aCalculer.length - lot.length : 0,
    ors_configure: disponible,
  };
}

module.exports = {
  itineraire,
  itinerairesEnLot,
  _interne: { cleTrajet, simplifier, estCoordonnee },
};
