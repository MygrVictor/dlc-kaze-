// node --test widget-livrauto/grille.test.js
const test = require("node:test");
const assert = require("node:assert");
const { prixVL } = require("./grille");

test("forfait jusqu'à 143 km", () => {
  assert.strictEqual(prixVL(5).price_ht, 200);
  assert.strictEqual(prixVL(143).price_ht, 200);
  assert.strictEqual(prixVL(143).forfait, true);
});

test("tarif au km appliqué sur toute la distance", () => {
  assert.strictEqual(prixVL(144).price_ht, 201.6); // 144 × 1,40
  assert.strictEqual(prixVL(200).price_ht, 280); // 200 × 1,40
  assert.strictEqual(prixVL(250).price_ht, 305); // 250 × 1,22
  assert.strictEqual(prixVL(316).price_ht, 360.24); // 316 × 1,14
  assert.strictEqual(prixVL(1000).price_ht, 920); // 1000 × 0,92
  assert.strictEqual(prixVL(1200).price_ht, 1080); // 1200 × 0,90
});

test("bornes incluses dans la tranche inférieure", () => {
  assert.strictEqual(prixVL(300).prix_km, 1.22);
  assert.strictEqual(prixVL(300.5).prix_km, 1.14);
  assert.strictEqual(prixVL(800).prix_km, 0.98);
});

test("distance invalide refusée", () => {
  assert.throws(() => prixVL(-1));
  assert.throws(() => prixVL("abc"));
});
