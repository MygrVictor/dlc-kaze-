/**
 * Tests d'intégration — Téléphone convoyeur
 *
 * Le mobile reste obligatoire à l'inscription et modifiable via
 * /convoyeur/telephone, mais l'accès au portail convoyeur n'est plus bloqué
 * par un écran dédié quand le numéro manque.
 */
const request = require("supertest");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  getDriver: jest.fn().mockResolvedValue(null),
  getDriverByEmail: jest.fn().mockResolvedValue(null),
  getMissionsByDriver: jest.fn().mockResolvedValue({ missions: [] }),
  fetchRecentJobs: jest.fn().mockResolvedValue([]),
}));

jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

const db = require("../db");
const jwt = require("jsonwebtoken");
const app = require("./app.test-setup");

const CONVOYEUR = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "driver@test.com",
  full_name: "Marc Driver",
  phone: "0612345678",
  role: "convoyeur",
  is_validated: true,
  kaze_driver_id: null,
};

const tokenPour = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

const estRechercheUtilisateur = (sql) => /FROM users WHERE id = \$1/i.test(sql);

/** Installe db.query en répondant d'abord au middleware `authenticate`. */
function mockDb(user, handler = () => ({ rows: [] })) {
  db.query.mockImplementation(async (sql, params) => {
    if (estRechercheUtilisateur(sql) && /is_validated/i.test(sql)) {
      return { rows: user ? [user] : [] };
    }
    return handler(sql, params) || { rows: [] };
  });
}

const avecAuth = (req, user = CONVOYEUR) =>
  req.set("Authorization", `Bearer ${tokenPour(user)}`);

/** Convoyeur dont le profil est incomplet. */
const sansMobile = (phone) => ({ ...CONVOYEUR, phone });

beforeEach(() => {
  jest.clearAllMocks();
  mockDb(CONVOYEUR);
});

// ──────────────────────────────────────────────────────────────
//  Accès aux routes convoyeur sans blocage PHONE_REQUIRED
// ──────────────────────────────────────────────────────────────
describe("Convoyeur sans mobile — accès au portail", () => {
  it("accède au profil même sans téléphone", async () => {
    mockDb(sansMobile(null), (sql) => {
      if (/FROM users WHERE id = \$1/i.test(sql)) {
        return { rows: [sansMobile(null)] };
      }
      return { rows: [] };
    });

    const res = await avecAuth(request(app).get("/api/convoyeur/profil"));
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
//  PUT /api/convoyeur/telephone
// ──────────────────────────────────────────────────────────────
describe("PUT /api/convoyeur/telephone", () => {
  const enregistrer = (phone, user = sansMobile(null)) => {
    mockDb(user, (sql) => {
      if (/UPDATE users SET phone/i.test(sql)) {
        return { rows: [{ ...user, phone }] };
      }
      return { rows: [] };
    });
    return avecAuth(
      request(app).put("/api/convoyeur/telephone").send({ phone }),
      user,
    );
  };

  it("refuse un corps vide (400)", async () => {
    mockDb(sansMobile(null));
    const res = await avecAuth(
      request(app).put("/api/convoyeur/telephone").send({}),
      sansMobile(null),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatoire/i);
  });

  it("refuse un fixe français (400)", async () => {
    const res = await enregistrer("0145678901");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/i);
  });

  it("refuse un numéro trop court (400)", async () => {
    const res = await enregistrer("0612");
    expect(res.status).toBe(400);
  });

  it("n'écrit rien en base si le numéro est invalide", async () => {
    await enregistrer("0145678901");
    const updates = db.query.mock.calls.filter(([sql]) =>
      /UPDATE users SET phone/i.test(sql),
    );
    expect(updates).toHaveLength(0);
  });

  it("enregistre un mobile en 06", async () => {
    const res = await enregistrer("0612345678");
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe("0612345678");
  });

  it("enregistre un mobile en 07", async () => {
    expect((await enregistrer("0712345678")).status).toBe(200);
  });

  it("accepte les séparateurs usuels", async () => {
    expect((await enregistrer("06 12 34 56 78")).status).toBe(200);
  });

  it("accepte la forme internationale", async () => {
    expect((await enregistrer("+33 6 12 34 56 78")).status).toBe(200);
  });

  it("supprime les espaces de bord avant l'écriture", async () => {
    await enregistrer("  0612345678  ");
    const update = db.query.mock.calls.find(([sql]) =>
      /UPDATE users SET phone/i.test(sql),
    );
    expect(update[1][0]).toBe("0612345678");
  });

  it("ne met à jour que l'utilisateur authentifié", async () => {
    await enregistrer("0612345678");
    const update = db.query.mock.calls.find(([sql]) =>
      /UPDATE users SET phone/i.test(sql),
    );
    expect(update[1][1]).toBe(CONVOYEUR.id);
  });

  it("confirme que les missions arriveront par Telegram", async () => {
    const res = await enregistrer("0612345678");
    expect(res.body.message).toMatch(/telegram/i);
  });

  it("refuse un appelant non authentifié (401)", async () => {
    const res = await request(app)
      .put("/api/convoyeur/telephone")
      .send({ phone: "0612345678" });
    expect(res.status).toBe(401);
  });

  it("refuse un client (403)", async () => {
    const client = { ...CONVOYEUR, role: "client" };
    mockDb(client);
    const res = await avecAuth(
      request(app)
        .put("/api/convoyeur/telephone")
        .send({ phone: "0612345678" }),
      client,
    );
    expect(res.status).toBe(403);
  });

  it("propage une erreur SQL (500)", async () => {
    mockDb(sansMobile(null), (sql) => {
      if (/UPDATE users SET phone/i.test(sql)) throw new Error("DB down");
      return { rows: [] };
    });
    const res = await avecAuth(
      request(app)
        .put("/api/convoyeur/telephone")
        .send({ phone: "0612345678" }),
      sansMobile(null),
    );
    expect(res.status).toBe(500);
  });
});
