/**
 * Tests d'intégration — Routes d'authentification
 * POST /api/auth/login
 * POST /api/auth/demande
 * GET  /api/auth/me
 */
const request = require("supertest");

// Mock du rate limiter pour ne pas bloquer les tests
jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

// Mock DB pour ne pas toucher la vraie base en CI
jest.mock("../db", () => ({
  query: jest.fn(),
}));

// Mock email pour éviter les envois réels
jest.mock("../services/email.service", () => ({
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
  notifyNewRegistration: jest.fn().mockResolvedValue(undefined),
  notifyRegistrationReceived: jest.fn().mockResolvedValue(undefined),
  notifyNouvelleDemande: jest.fn().mockResolvedValue(undefined),
  notifyDemandeRecue: jest.fn().mockResolvedValue(undefined),
}));

// Mock kaze service
jest.mock("../services/kaze.service", () => ({
  getDriverByEmail: jest.fn().mockResolvedValue(null),
}));

// Mock sync service (ne pas démarrer le polling)
jest.mock("../services/sync.service", () => ({
  startSync: jest.fn(),
}));

const db = require("../db");
const bcrypt = require("bcryptjs");
const app = require("./app.test-setup");

// ──────────────────────────────────────────────────────────────
//  GET /api/health
// ──────────────────────────────────────────────────────────────
describe("GET /api/health", () => {
  it("retourne status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ──────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("refuse si champs manquants", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("refuse si utilisateur introuvable", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "inconnu@test.com", password: "Test#1234" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrects/i);
  });

  it("refuse si mot de passe incorrect", async () => {
    const hash = await bcrypt.hash("GoodPass#1", 4);
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "uuid-1",
          email: "user@test.com",
          password_hash: hash,
          role: "client",
          full_name: "Test User",
          is_validated: true,
        },
      ],
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.com", password: "WrongPass#1" });
    expect(res.status).toBe(401);
  });

  it("connecte avec les bons identifiants", async () => {
    const hash = await bcrypt.hash("GoodPass#1", 4);
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "uuid-1",
          email: "user@test.com",
          password_hash: hash,
          role: "client",
          full_name: "Test User",
          is_validated: true,
        },
      ],
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.com", password: "GoodPass#1" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("user@test.com");
  });
});

// ──────────────────────────────────────────────────────────────
//  POST /api/auth/demande
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/demande", () => {
  const enregistree = () =>
    db.query.mockResolvedValueOnce({
      rows: [{ id: "dem-1", type: "client", created_at: new Date() }],
    });

  it("refuse un type inconnu", async () => {
    const res = await request(app)
      .post("/api/auth/demande")
      .send({ type: "partenaire", company: "ACME", email: "a@b.fr" });
    expect(res.status).toBe(400);
  });

  it("refuse un email invalide", async () => {
    const res = await request(app)
      .post("/api/auth/demande")
      .send({ type: "client", company: "ACME", email: "pas-un-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("refuse un client sans structure", async () => {
    const res = await request(app)
      .post("/api/auth/demande")
      .send({ type: "client", email: "a@b.fr" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/structure/i);
  });

  it("refuse un client sans email ni téléphone", async () => {
    const res = await request(app)
      .post("/api/auth/demande")
      .send({ type: "client", company: "ACME" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email ou un num/i);
  });

  it("accepte un client joignable par téléphone seul", async () => {
    enregistree();
    const res = await request(app)
      .post("/api/auth/demande")
      .send({ type: "client", company: "ACME", phone: "0145678901" });
    expect(res.status).toBe(201);
  });

  it("refuse un convoyeur sans nom ni prénom", async () => {
    const res = await request(app).post("/api/auth/demande").send({
      type: "convoyeur",
      email: "driver@test.com",
      phone: "0612345678",
    });
    expect(res.status).toBe(400);
  });

  it("refuse un convoyeur avec un numéro fixe", async () => {
    const res = await request(app).post("/api/auth/demande").send({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0145678901",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile/i);
  });

  it("enregistre une demande de convoyeur complète", async () => {
    enregistree();
    const res = await request(app).post("/api/auth/demande").send({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
    });
    expect(res.status).toBe(201);
  });

  it("n'écrit jamais dans la table users", async () => {
    enregistree();
    await request(app)
      .post("/api/auth/demande")
      .send({ type: "client", company: "ACME", email: "a@b.fr" });

    const ecritures = db.query.mock.calls.filter(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(ecritures).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────
//  GET /api/auth/me — route protégée
// ──────────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  it("retourne 401 sans token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("retourne 401 avec un token invalide", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer fake.token.here");
    expect(res.status).toBe(401);
  });

  it("retourne l'utilisateur avec un token valide", async () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { userId: "uuid-1", role: "client" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "uuid-1",
          email: "user@test.com",
          full_name: "Test User",
          role: "client",
          is_validated: true,
        },
      ],
    });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("user@test.com");
  });
});
