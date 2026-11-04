/**
 * Tests du calcul de distance (sans réseau : fetch est simulé).
 * Lancement : node widget-livrauto/distance.test.js
 */
const assert = require("assert");

const MARSEILLE = { lat: 43.280944, lng: 5.4126604 };
const LYON = { lat: 45.757814, lng: 4.832011 };

let appels = 0;
function simulerFetch(reponse) {
  global.fetch = async () => {
    appels++;
    if (reponse instanceof Error) throw reponse;
    return {
      ok: reponse.status === 200,
      status: reponse.status,
      json: async () => reponse.body,
    };
  };
}

async function main() {
  const { distanceRoutiere, haversineKm, _cache } = require("./distance");
  const volOiseau = haversineKm(MARSEILLE, LYON) * 1.22;

  // 1. Sans clé : estimation, aucun appel réseau.
  delete process.env.ORS_API_KEY;
  appels = 0;
  simulerFetch({ status: 200, body: {} });
  let r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(r.methode, "estimation");
  assert.strictEqual(appels, 0);
  assert.ok(Math.abs(r.km - volOiseau) < 0.01);
  console.log("✓ sans clé → estimation, pas d'appel");

  // 2. Avec clé : distance ORS.
  process.env.ORS_API_KEY = "test";
  simulerFetch({
    status: 200,
    body: { routes: [{ summary: { distance: 314200 } }] },
  });
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.deepStrictEqual(r, { km: 314.2, methode: "ors" });
  console.log("✓ ORS → 314,2 km par la route");

  // 3. Même trajet : servi par le cache.
  appels = 0;
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(appels, 0);
  assert.strictEqual(r.methode, "ors");
  console.log("✓ trajet déjà calculé → cache, pas d'appel");

  // 4. Quota dépassé : repli.
  _cache.clear();
  simulerFetch({ status: 429, body: { error: "Rate limit exceeded" } });
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(r.methode, "estimation");
  console.log("✓ quota ORS dépassé → repli estimation");

  // 5. Pas d'itinéraire trouvé (code 2010) : repli.
  simulerFetch({
    status: 404,
    body: { error: { code: 2010, message: "Could not find routable point" } },
  });
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(r.methode, "estimation");
  console.log("✓ point non routable → repli estimation");

  // 6. ORS injoignable / trop lent : repli.
  const lent = new Error("timeout");
  lent.name = "TimeoutError";
  simulerFetch(lent);
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(r.methode, "estimation");
  console.log("✓ ORS trop lent → repli estimation");

  // 7. Un échec n'est pas mis en cache : ORS revenu → vraie distance.
  simulerFetch({
    status: 200,
    body: { routes: [{ summary: { distance: 314200 } }] },
  });
  r = await distanceRoutiere(MARSEILLE, LYON);
  assert.strictEqual(r.methode, "ors");
  console.log("✓ échec non mis en cache");

  // 8. Trajet très court : minimum 5 km.
  _cache.clear();
  simulerFetch({
    status: 200,
    body: { routes: [{ summary: { distance: 800 } }] },
  });
  r = await distanceRoutiere(MARSEILLE, { lat: 43.2815, lng: 5.413 });
  assert.strictEqual(r.km, 5);
  console.log("✓ trajet < 5 km → 5 km facturés");

  console.log("\nTous les tests passent.");
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
