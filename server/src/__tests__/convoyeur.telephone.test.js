/**
 * Tests d'intégration — Obligation du mobile pour les convoyeurs
 *
 * Les missions disponibles étant annoncées par WhatsApp, un convoyeur sans
 * mobile valide ne peut pas accéder aux missions. Une seule route reste
 * ouverte : celle qui permet de renseigner le numéro.
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
//  Blocage des routes de missions
// ──────────────────────────────────────────────────────────────
describe("Convoyeur sans mobile — accès aux missions", () => {
  const ROUTES = [
    "/api/convoyeur/missions",
    "/api/convoyeur/missions-disponibles",
    "/api/convoyeur/missions-disponibles-count",
    "/api/convoyeur/documents",
  ];

  it.each(ROUTES)("refuse %s sans téléphone (403)", async (route) => {
    mockDb(sansMobile(null));
    const res = await avecAuth(request(app).get(route));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PHONE_REQUIRED");
  });

  it("refuse un téléphone vide", async () => {
    mockDb(sansMobile(""));
    const res = await avecAuth(request(app).get("/api/convoyeur/missions"));
    expect(res.status).toBe(403);
  });

  it("refuse un fixe français", async () => {
    mockDb(sansMobile("0145678901"));
    const res = await avecAuth(request(app).get("/api/convoyeur/missions"));
    expect(res.status).toBe(403);
  });

  it("explique la raison du blocage", async () => {
    mockDb(sansMobile(null));
    const res = await avecAuth(request(app).get("/api/convoyeur/missions"));
    expect(res.body.error).toMatch(/whatsapp/i);
  });

  it("n'interroge pas la base des missions quand le mobile manque", async () => {
    mockDb(sansMobile(null));
    await avecAuth(request(app).get("/api/convoyeur/missions"));
    const requetes = db.query.mock.calls.filter(([sql]) =>
      /FROM missions/i.test(sql),
    );
    expect(requetes).toHaveLength(0);
  });

  it("laisse passer un mobile valide", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const res = await avecAuth(request(app).get("/api/convoyeur/missions"));
    expect(res.status).toBe(200);
  });

  it("laisse passer un mobile au format international", async () => {
    mockDb(sansMobile("+33 6 12 34 56 78"), () => ({ rows: [] }));
    const res = await avecAuth(request(app).get("/api/convoyeur/missions"));
    expect(res.status).toBe(200);
  });

  it("n'affecte pas le profil, accessible sans mobile", async () => {
    mockDb(sansMobile(null), () => ({ rows: [sansMobile(null)] }));
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

  it("confirme que les missions arriveront par WhatsApp", async () => {
    const res = await enregistrer("0612345678");
    expect(res.body.message).toMatch(/whatsapp/i);
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
