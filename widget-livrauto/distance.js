/**
 * Distance routière entre deux points GPS.
 *
 * Source principale : OpenRouteService (profil voiture), distance par la
 * route. Si le service est indisponible, sans clé, en quota dépassé ou ne
 * trouve pas d'itinéraire, on se replie sur la ligne droite × 1,22 : le
 * widget ne doit jamais tomber en panne à cause d'un service tiers.
 *
 * Chaque résultat indique sa méthode (`ors` ou `estimation`), conservée
 * dans le devis pour savoir a posteriori comment un prix a été calculé.
 *
 * Clé gratuite : https://openrouteservice.org/dev/#/signup
 * (2 000 itinéraires / jour, 40 / minute sur l'offre gratuite).
 */
const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
const ORS_TIMEOUT_MS = 4000;
const ROAD_FACTOR = 1.22;
const CACHE_MAX = 5000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

// Un même trajet (à ~100 m près) n'est calculé qu'une fois : économise le
// quota et rend la réponse instantanée quand l'acheteur revient en arrière.
const cache = new Map();

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function cleCache(a, b) {
  const r = (n) => n.toFixed(3); // ~100 m
  return `${r(a.lat)},${r(a.lng)}>${r(b.lat)},${r(b.lng)}`;
}

function estimationVolOiseau(from, to, raison) {
  return {
    km: Math.max(5, haversineKm(from, to) * ROAD_FACTOR),
    methode: "estimation",
    raison,
  };
}

async function appelerOrs(from, to, apiKey) {
  const res = await fetch(ORS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey, // en en-tête : la clé n'apparaît pas dans les journaux d'URL
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      // Rayon de recherche d'une route autour de chaque point (mètres) :
      // un dépôt ou une maison en retrait de la route reste routable.
      radiuses: [1500, 1500],
      instructions: false,
      geometry: false,
    }),
    signal: AbortSignal.timeout(ORS_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code;
    const err = new Error(
      data?.error?.message || `OpenRouteService HTTP ${res.status}`,
    );
    err.status = res.status;
    err.code = code;
    throw err;
  }

  const metres = data?.routes?.[0]?.summary?.distance;
  if (!Number.isFinite(metres)) throw new Error("Réponse ORS sans distance");
  return metres / 1000;
}

/**
 * @returns {Promise<{km:number, methode:'ors'|'estimation', raison?:string}>}
 */
async function distanceRoutiere(from, to) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return estimationVolOiseau(from, to, "ORS_API_KEY absente");

  const cle = cleCache(from, to);
  const enCache = cache.get(cle);
  if (enCache && enCache.expire > Date.now()) return enCache.valeur;

  try {
    const km = await appelerOrs(from, to, apiKey);
    const valeur = { km: Math.max(5, km), methode: "ors" };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cle, { valeur, expire: Date.now() + CACHE_TTL_MS });
    return valeur;
  } catch (err) {
    // 401/403 : clé invalide ; 429 : quota ; 404 / code 2010 : pas de route.
    const raison =
      err.name === "TimeoutError"
        ? "ORS trop lent"
        : `ORS: ${err.status || ""} ${err.message}`.trim();
    console.warn("[distance] repli vol d'oiseau —", raison);
    return estimationVolOiseau(from, to, raison);
  }
}

module.exports = { distanceRoutiere, haversineKm, _cache: cache };
