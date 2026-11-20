/**
 * Limiteur des candidatures publiques.
 *
 * Contrairement au limiteur de login, il compte aussi les requêtes
 * réussies : c'est la soumission valide répétée (cinq fichiers de 8 Mo à
 * chaque fois) qui remplirait le disque.
 */
const express = require("express");
const request = require("supertest");
const {
  creerLimiteurCandidature,
} = require("../middleware/security.middleware");

it("bloque au-delà du plafond, même quand les demandes réussissent", async () => {
  const app = express();
  app.post("/demande", creerLimiteurCandidature({ max: 2 }), (_req, res) =>
    res.status(201).json({ ok: true }),
  );

  expect((await request(app).post("/demande")).status).toBe(201);
  expect((await request(app).post("/demande")).status).toBe(201);

  const bloquee = await request(app).post("/demande");
  expect(bloquee.status).toBe(429);
  expect(bloquee.body.error).toMatch(/Trop de demandes/);
});
