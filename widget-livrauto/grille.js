/**
 * Grille tarifaire Interenchères — véhicules légers (VL), prix HT.
 *
 * Cotation automatique, réservée au partenaire Interenchères (l'app reste
 * en cotation manuelle). Le tarif au km dépend de la distance totale et
 * s'applique à TOUS les km du trajet (pas de calcul par paliers) :
 *   250 km → 250 × 1,22 € = 305 € HT.
 * Jusqu'à 143 km : forfait de 200 € HT.
 */

const FORFAIT = { jusqua_km: 143, prix_ht: 200 };

// [distance maximale (km, incluse), prix HT au km]
const TRANCHES = [
  [200, 1.4],
  [300, 1.22],
  [400, 1.14],
  [500, 1.1],
  [600, 1.08],
  [700, 1.02],
  [800, 0.98],
  [1000, 0.92],
  [Infinity, 0.9],
];

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {number} km distance routière
 * @returns {{price_ht:number, prix_km:number|null, forfait:boolean}}
 */
function prixVL(km) {
  const d = Number(km);
  if (!Number.isFinite(d) || d < 0) throw new Error("Distance invalide");

  if (d <= FORFAIT.jusqua_km) {
    return { price_ht: FORFAIT.prix_ht, prix_km: null, forfait: true };
  }
  const [, prixKm] = TRANCHES.find(([max]) => d <= max);
  return { price_ht: round2(d * prixKm), prix_km: prixKm, forfait: false };
}

module.exports = { prixVL, FORFAIT, TRANCHES };
