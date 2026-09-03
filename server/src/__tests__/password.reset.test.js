/**
 * Tests d'intégration — Réinitialisation de mot de passe
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 *
 * Deux propriétés priment sur le reste et structurent ces tests :
 * la demande ne doit jamais révéler l'existence d'un compte, et un
 * jeton ne doit servir qu'une fois, dans sa fenêtre de validité.
 */
const request = require("supertest");
const crypto = require("crypto");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock("../services/email.service", () => ({
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
  notifyNewRegistration: jest.fn().mockResolvedValue(undefined),
  notifyRegistrationReceived: jest.fn().mockResolvedValue(undefined),
  notifyNouvelleDemande: jest.fn().mockResolvedValue(undefined),
  notifyDemandeRecue: jest.fn().mockResolvedValue(undefined),
  notifyPasswordReset: jest.fn().mockResolvedValue(undefined),
  notifyPasswordChanged: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/kaze.service", () => ({
  getDriverByEmail: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

const db = require("../db");
const bcrypt = require("bcryptjs");
const emailService = require("../services/email.service");
const app = require("./app.test-setup");

const UTILISATEUR = {
  id: "uuid-user",
  email: "convoyeur@test.com",
  full_name: "Jean Convoyeur",
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CLIENT_URL = "https://exemple.test";
});

// ──────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/forgot-password", () => {
  it("envoie un lien quand le compte existe", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [UTILISATEUR] }) // SELECT users
      .mockResolvedValueOnce({ rows: [] }) // invalidation des demandes
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "Convoyeur@Test.com" });

    expect(res.status).toBe(200);
    expect(emailService.notifyPasswordReset).toHaveBeenCalledTimes(1);

    const [destinataire, , lien] =
      emailService.notifyPasswordReset.mock.calls[0];
    expect(destinataire).toBe(UTILISATEUR.email);
    expect(lien).toMatch(
      /^https:\/\/exemple\.test\/reinitialiser-mot-de-passe\?token=[0-9a-f]{64}$/,
    );
  });

  it("répond la même chose pour une adresse inconnue, sans envoyer d'email", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const connu = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "inconnu@test.com" });

    expect(connu.status).toBe(200);
    expect(connu.body.message).toMatch(/si un compte existe/i);
    expect(emailService.notifyPasswordReset).not.toHaveBeenCalled();
  });

  it("invalide les demandes précédentes avant d'en créer une nouvelle", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [UTILISATEUR] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: UTILISATEUR.email });

    const requetes = db.query.mock.calls.map(([sql]) => sql);
    expect(
      requetes.some((sql) =>
        /UPDATE password_resets SET used_at = NOW\(\)[\s\S]*used_at IS NULL/i.test(
          sql,
        ),
      ),
    ).toBe(true);
  });

  it("ne stocke que l'empreinte du jeton, jamais le jeton lui-même", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [UTILISATEUR] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: UTILISATEUR.email });

    const insertion = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO password_resets/i.test(sql),
    );
    const [, params] = insertion;
    const lien = emailService.notifyPasswordReset.mock.calls[0][2];
    const jeton = new URL(lien).searchParams.get("token");

    expect(params[1]).toBe(
      crypto.createHash("sha256").update(jeton).digest("hex"),
    );
    expect(params[1]).not.toBe(jeton);
  });

  it("répond normalement même si l'envoi de l'email échoue", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [UTILISATEUR] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    emailService.notifyPasswordReset.mockRejectedValueOnce(
      new Error("SMTP indisponible"),
    );

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: UTILISATEUR.email });

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/reset-password", () => {
  const demandeValide = (surcharge = {}) => ({
    id: "uuid-reset",
    user_id: UTILISATEUR.id,
    email: UTILISATEUR.email,
    full_name: UTILISATEUR.full_name,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    used_at: null,
    ...surcharge,
  });

  it("refuse un mot de passe trop court", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: "court" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caractères/i);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuse un jeton inconnu", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "inconnu", password: "NouveauPass#1" });

    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuse un jeton expiré", async () => {
    db.query.mockResolvedValueOnce({
      rows: [demandeValide({ expires_at: new Date(Date.now() - 1000) })],
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: "NouveauPass#1" });

    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuse un jeton déjà consommé", async () => {
    db.query.mockResolvedValueOnce({
      rows: [demandeValide({ used_at: new Date() })],
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: "NouveauPass#1" });

    expect(res.status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("change le mot de passe et consomme le jeton dans la même transaction", async () => {
    db.query.mockResolvedValueOnce({ rows: [demandeValide()] });

    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db.transaction.mockImplementation((fn) => fn(client));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: "NouveauPass#1" });

    expect(res.status).toBe(200);

    const requetes = client.query.mock.calls.map(([sql]) => sql);
    expect(
      requetes.some((sql) => /UPDATE users SET password_hash/i.test(sql)),
    ).toBe(true);
    expect(
      requetes.some((sql) =>
        /UPDATE password_resets SET used_at = NOW\(\)/i.test(sql),
      ),
    ).toBe(true);

    // Le mot de passe ne doit jamais atteindre la base en clair.
    const [, params] = client.query.mock.calls.find(([sql]) =>
      /UPDATE users SET password_hash/i.test(sql),
    );
    expect(params[0]).not.toBe("NouveauPass#1");
    expect(await bcrypt.compare("NouveauPass#1", params[0])).toBe(true);

    expect(emailService.notifyPasswordChanged).toHaveBeenCalledWith(
      UTILISATEUR.email,
      UTILISATEUR.full_name,
    );
  });
});
