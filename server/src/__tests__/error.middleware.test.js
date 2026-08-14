/**
 * Tests unitaires — error.middleware
 *
 * Gestionnaire d'erreurs global d'Express. Il normalise le code HTTP,
 * expose un message exploitable et n'ajoute la pile d'appels qu'en
 * développement.
 */
const request = require("supertest");
const express = require("express");

const { errorHandler } = require("../middleware/error.middleware");

/** Monte une app qui déclenche l'erreur fournie sur GET /boom. */
function creerApp(erreur) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(erreur));
  app.use(errorHandler);
  return app;
}

const declencher = (erreur) => request(creerApp(erreur)).get("/boom");

const ENV_INITIAL = process.env.NODE_ENV;
let consoleError;

beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  process.env.NODE_ENV = ENV_INITIAL;
});

// ═════════════════════════════════════════════════════════════
describe("Code de statut", () => {
  it("retourne 500 par défaut", async () => {
    const res = await declencher(new Error("panne"));

    expect(res.status).toBe(500);
  });

  it.each([400, 401, 403, 404, 409, 422, 503])(
    "respecte un statut %i porté par l'erreur",
    async (status) => {
      const err = new Error("erreur métier");
      err.status = status;

      const res = await declencher(err);

      expect(res.status).toBe(status);
    },
  );
});

// ═════════════════════════════════════════════════════════════
describe("Corps de la réponse", () => {
  it("expose le message de l'erreur", async () => {
    const res = await declencher(new Error("Mission introuvable."));

    expect(res.body.error).toBe("Mission introuvable.");
  });

  it("retombe sur un message générique si l'erreur n'en porte pas", async () => {
    const res = await declencher(new Error());

    expect(res.body.error).toBe("Erreur interne du serveur.");
  });

  it("répond en JSON", async () => {
    const res = await declencher(new Error("panne"));

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Divulgation de la pile d'appels", () => {
  it("joint la pile en développement", async () => {
    process.env.NODE_ENV = "development";

    const res = await declencher(new Error("panne"));

    expect(res.body.stack).toEqual(expect.stringContaining("Error: panne"));
  });

  it("n'expose jamais la pile en production", async () => {
    process.env.NODE_ENV = "production";

    const res = await declencher(new Error("panne"));

    expect(res.body).not.toHaveProperty("stack");
  });

  it("n'expose pas la pile en environnement de test", async () => {
    process.env.NODE_ENV = "test";

    const res = await declencher(new Error("panne"));

    expect(res.body).not.toHaveProperty("stack");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Journalisation", () => {
  it("consigne le message de l'erreur", async () => {
    await declencher(new Error("panne base de données"));

    expect(consoleError).toHaveBeenCalledWith(
      "💥 Erreur :",
      "panne base de données",
    );
  });

  it("consigne l'erreur brute lorsqu'elle n'a pas de message", async () => {
    const err = new Error();

    await declencher(err);

    expect(consoleError).toHaveBeenCalledWith("💥 Erreur :", err);
  });
});
