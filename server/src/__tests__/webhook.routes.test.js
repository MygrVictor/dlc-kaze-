/**
 * Tests unitaires — webhook.routes
 *
 * Couvre :
 *   - la vérification de signature HMAC-SHA256 (sécurité critique)
 *   - le mapping des statuts Kaze → DLC
 *   - le filtrage des types d'événements
 *   - la résilience (toujours répondre vite pour éviter les retries Kaze)
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-jest";

const crypto = require("crypto");
const express = require("express");
const request = require("supertest");

// ── Mock de la base de données ───────────────────────────────
jest.mock("../db", () => ({
  query: jest.fn(),
}));

const db = require("../db");

const WEBHOOK_SECRET = "secret-webhook-de-test";

/**
 * Construit une app Express minimale montant le routeur webhook
 * avec le parser `raw` attendu (la signature porte sur le corps brut).
 */
function buildApp() {
  // Le routeur lit process.env au moment de l'appel : on peut le charger une fois.
  const webhookRoutes = require("../routes/webhook.routes");
  const app = express();
  app.use("/api/webhooks", express.raw({ type: "*/*" }), webhookRoutes);
  return app;
}

/** Signe un payload comme le ferait Kaze. */
function sign(payload, secret = WEBHOOK_SECRET) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

/** Envoie un webhook signé. */
function postSigned(app, body, { secret, signature, header } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = signature !== undefined ? signature : sign(raw, secret);
  const req = request(app)
    .post("/api/webhooks/kaze")
    .set("Content-Type", "application/json");
  if (sig !== null) req.set(header || "x-kaze-signature", sig);
  // Important : envoyer la chaîne brute telle quelle. Un Buffer serait
  // re-sérialisé par superagent et invaliderait la signature.
  return req.send(raw);
}

let app;
let consoleSpies;

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.KAZE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NODE_ENV = "test";
  db.query.mockResolvedValue({ rows: [] });

  // Silencier les logs attendus pour garder une sortie de test lisible
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

// ═════════════════════════════════════════════════════════════
describe("Sécurité — vérification de la signature", () => {
  it("accepte un webhook correctement signé", async () => {
    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-1", status: "started" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("rejette une signature invalide avec un 401", async () => {
    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { signature: "sha256=deadbeef" },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejette une signature calculée avec un mauvais secret", async () => {
    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { secret: "mauvais-secret" },
    );

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejette une requête sans header de signature", async () => {
    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { signature: null },
    );

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("accepte le header alternatif x-webhook-signature", async () => {
    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { header: "x-webhook-signature" },
    );

    expect(res.status).toBe(200);
  });

  it("détecte une altération du corps après signature", async () => {
    const original = JSON.stringify({
      type: "mission.updated",
      data: { id: "kaze-1", status: "started" },
    });
    const falsifie = JSON.stringify({
      type: "mission.updated",
      data: { id: "kaze-1", status: "completed" },
    });

    const res = await postSigned(app, falsifie, {
      signature: sign(original),
    });

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejette le webhook en production si le secret n'est pas configuré", async () => {
    delete process.env.KAZE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";

    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { signature: "sha256=peu-importe" },
    );

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("tolère l'absence de secret hors production (mode dev)", async () => {
    delete process.env.KAZE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "development";

    const res = await postSigned(
      app,
      { type: "mission.updated", data: { id: "kaze-1", status: "started" } },
      { signature: null },
    );

    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Mapping des statuts Kaze → DLC", () => {
  const cas = [
    ["pending", "EN_ATTENTE_DE_COTATION"],
    ["waiting", "EN_ATTENTE_DE_COTATION"],
    ["quoted", "DEVIS_PROPOSE"],
    ["accepted", "ACCEPTEE"],
    ["assigned", "ASSIGNEE"],
    ["started", "EN_COURS"],
    ["in_progress", "EN_COURS"],
    ["in_transit", "EN_COURS"],
    ["delivered", "LIVREE"],
    ["completed", "LIVREE"],
    ["cancelled", "ANNULEE"],
  ];

  it.each(cas)("mappe le statut Kaze «%s» vers «%s»", async (kaze, local) => {
    db.query.mockResolvedValue({ rows: [{ id: "m-1", status: local }] });

    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-42", status: kaze },
    });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      local,
      "kaze-42",
    ]);
  });

  it("met à jour la mission via kaze_mission_id", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "m-1", status: "LIVREE" }] });

    await postSigned(app, {
      type: "mission.completed",
      data: { id: "kaze-99", status: "completed" },
    });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE missions/i);
    expect(sql).toMatch(/WHERE kaze_mission_id = \$2/i);
  });

  it("ignore un statut Kaze inconnu sans écrire en base", async () => {
    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-1", status: "statut_inexistant" },
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/ignoré/i);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("accepte mission_id comme identifiant alternatif", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "m-1", status: "EN_COURS" }] });

    const res = await postSigned(app, {
      type: "mission.updated",
      data: { mission_id: "kaze-alt", status: "started" },
    });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      "EN_COURS",
      "kaze-alt",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Filtrage des événements", () => {
  it("traite mission.updated", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "m-1", status: "EN_COURS" }] });

    await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-1", status: "started" },
    });

    expect(db.query).toHaveBeenCalled();
  });

  it("traite mission.completed", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "m-1", status: "LIVREE" }] });

    await postSigned(app, {
      type: "mission.completed",
      data: { id: "kaze-1", status: "completed" },
    });

    expect(db.query).toHaveBeenCalled();
  });

  it("ignore les types d'événements non gérés", async () => {
    const res = await postSigned(app, {
      type: "user.created",
      data: { id: "kaze-1", status: "started" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("Validation des données", () => {
  it("retourne 400 si l'identifiant de mission est absent", async () => {
    const res = await postSigned(app, {
      type: "mission.updated",
      data: { status: "started" },
    });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("retourne 400 si le statut est absent", async () => {
    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-1" },
    });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("retourne 400 si data est absent", async () => {
    const res = await postSigned(app, { type: "mission.updated" });

    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Résilience", () => {
  it("retourne 500 sur un JSON malformé", async () => {
    const res = await postSigned(app, "{ ceci n'est pas du json");

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it("retourne 500 si la base de données échoue", async () => {
    db.query.mockRejectedValue(new Error("connexion perdue"));

    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-1", status: "started" },
    });

    expect(res.status).toBe(500);
  });

  it("répond 200 même si aucune mission locale ne correspond", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await postSigned(app, {
      type: "mission.updated",
      data: { id: "kaze-inconnu", status: "started" },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
