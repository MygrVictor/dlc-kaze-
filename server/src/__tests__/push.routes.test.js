/**
 * Tests — routes des notifications de l'application
 * (abonnement convoyeur, interrupteur admin).
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);
jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock("../services/push.service", () => ({
  actif: true,
  clePublique: jest.fn(() => "CLE-PUBLIQUE"),
  abonnementValide: jest.requireActual("../services/push.service")
    .abonnementValide,
  enregistrerAbonnement: jest.fn().mockResolvedValue(undefined),
  supprimerAbonnement: jest.fn().mockResolvedValue(undefined),
  annoncesActivees: jest.fn().mockResolvedValue(true),
  definirAnnoncesActivees: jest.fn(async (v) => v),
  annoncerMission: jest.fn().mockResolvedValue({ envoyees: 0, echecs: 0 }),
}));

const db = require("../db");
const push = require("../services/push.service");
const app = require("./app.test-setup");

const CONVOYEUR = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "c@test.com",
  full_name: "Convoyeur",
  role: "convoyeur",
  is_validated: true,
};
const ADMIN = { ...CONVOYEUR, id: "99999999-9999-9999-9999-999999999999", role: "admin" };
const CLIENT = { ...CONVOYEUR, id: "11111111-1111-1111-1111-111111111111", role: "client" };

const jeton = (u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET);
const connecte = (u) => {
  db.query.mockImplementation(async (sql) =>
    /FROM users WHERE id = \$1/i.test(sql) ? { rows: [u] } : { rows: [] },
  );
  return `Bearer ${jeton(u)}`;
};

const ABONNEMENT = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "cle", auth: "secret" },
};

beforeEach(() => jest.clearAllMocks());

describe("abonnement convoyeur", () => {
  test("donne la clé publique", async () => {
    const res = await request(app)
      .get("/api/convoyeur/notifications/cle")
      .set("Authorization", connecte(CONVOYEUR));
    expect(res.status).toBe(200);
    expect(res.body.clePublique).toBe("CLE-PUBLIQUE");
  });

  test("enregistre l'abonnement du convoyeur connecté", async () => {
    const res = await request(app)
      .post("/api/convoyeur/notifications/abonnement")
      .set("Authorization", connecte(CONVOYEUR))
      .set("User-Agent", "Safari iPhone")
      .send(ABONNEMENT);
    expect(res.status).toBe(201);
    expect(push.enregistrerAbonnement).toHaveBeenCalledWith(
      CONVOYEUR.id,
      expect.objectContaining({ endpoint: ABONNEMENT.endpoint }),
      "Safari iPhone",
    );
  });

  test("refuse un abonnement mal formé", async () => {
    const res = await request(app)
      .post("/api/convoyeur/notifications/abonnement")
      .set("Authorization", connecte(CONVOYEUR))
      .send({ endpoint: "http://127.0.0.1/x", keys: {} });
    expect(res.status).toBe(400);
    expect(push.enregistrerAbonnement).not.toHaveBeenCalled();
  });

  test("est réservé aux convoyeurs", async () => {
    const res = await request(app)
      .post("/api/convoyeur/notifications/abonnement")
      .set("Authorization", connecte(CLIENT))
      .send(ABONNEMENT);
    expect(res.status).toBe(403);
  });

  test("désabonne uniquement l'appareil du convoyeur connecté", async () => {
    const res = await request(app)
      .delete("/api/convoyeur/notifications/abonnement")
      .set("Authorization", connecte(CONVOYEUR))
      .send({ endpoint: ABONNEMENT.endpoint });
    expect(res.status).toBe(200);
    expect(push.supprimerAbonnement).toHaveBeenCalledWith(
      CONVOYEUR.id,
      ABONNEMENT.endpoint,
    );
  });
});

describe("interrupteur admin", () => {
  test("lit l'état", async () => {
    const res = await request(app)
      .get("/api/admin/parametres/notifications")
      .set("Authorization", connecte(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ annoncesActives: true, configure: true });
  });

  test("coupe les notifications", async () => {
    const res = await request(app)
      .put("/api/admin/parametres/notifications")
      .set("Authorization", connecte(ADMIN))
      .send({ annoncesActives: false });
    expect(res.status).toBe(200);
    expect(push.definirAnnoncesActivees).toHaveBeenCalledWith(false);
  });

  test("refuse une valeur qui n'est pas un booléen", async () => {
    const res = await request(app)
      .put("/api/admin/parametres/notifications")
      .set("Authorization", connecte(ADMIN))
      .send({ annoncesActives: "non" });
    expect(res.status).toBe(400);
  });

  test("est réservé à l'admin", async () => {
    const res = await request(app)
      .put("/api/admin/parametres/notifications")
      .set("Authorization", connecte(CONVOYEUR))
      .send({ annoncesActives: false });
    expect(res.status).toBe(403);
  });
});
