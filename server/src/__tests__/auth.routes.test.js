/**
 * Tests d'intégration — Routes d'authentification
 * POST /api/auth/login
 * POST /api/auth/register-public
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
//  POST /api/auth/register-public
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register-public", () => {
  it("refuse si champs obligatoires manquants", async () => {
    const res = await request(app)
      .post("/api/auth/register-public")
      .send({ email: "new@test.com" });
    expect(res.status).toBe(400);
  });

  it("refuse si email invalide", async () => {
    const res = await request(app).post("/api/auth/register-public").send({
      email: "pas-un-email",
      fullName: "Jean Test",
      password: "GoodPass#1",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("refuse si mot de passe faible", async () => {
    const res = await request(app).post("/api/auth/register-public").send({
      email: "new@test.com",
      fullName: "Jean Test",
      password: "weak",
    });
    expect(res.status).toBe(400);
  });

  it("refuse si email déjà pris", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: "existing-id" }] });
    const res = await request(app).post("/api/auth/register-public").send({
      email: "existing@test.com",
      fullName: "Jean Test",
      password: "GoodPass#1",
      role: "client",
    });
    expect(res.status).toBe(409);
  });

  it("crée un compte client avec succès", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // pas d'existant
      .mockResolvedValueOnce({
        rows: [
          {
            id: "new-uuid",
            email: "new@test.com",
            full_name: "Jean Test",
            role: "client",
            is_validated: false,
          },
        ],
      });
    const res = await request(app).post("/api/auth/register-public").send({
      email: "new@test.com",
      fullName: "Jean Test",
      password: "GoodPass#1",
      role: "client",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/validation/i);
  });

  it("crée un compte convoyeur avec succès", async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: "new-uuid-2",
          email: "driver@test.com",
          full_name: "Marc Driver",
          role: "convoyeur",
          is_validated: false,
        },
      ],
    });
    const res = await request(app).post("/api/auth/register-public").send({
      email: "driver@test.com",
      fullName: "Marc Driver",
      phone: "0612345678",
      password: "GoodPass#1",
      role: "convoyeur",
    });
    expect(res.status).toBe(201);
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
