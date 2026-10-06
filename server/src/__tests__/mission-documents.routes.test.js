/**
 * Tests — pièces jointes de mission
 *
 * Ce qui compte : un convoyeur ne voit que les pièces cochées par
 * l'admin, et seulement sur sa propre mission ; seul l'admin coche.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);
jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

const db = require("../db");
const app = require("./app.test-setup");

const ADMIN = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "admin@test.com",
  role: "admin",
  is_validated: true,
};
const CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "client@test.com",
  role: "client",
  is_validated: true,
};
const CONVOYEUR = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "conv@test.com",
  role: "convoyeur",
  is_validated: true,
};
const AUTRE_CONVOYEUR = {
  ...CONVOYEUR,
  id: "55555555-5555-5555-5555-555555555555",
};

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MISSION = {
  id: MISSION_ID,
  client_id: CLIENT.id,
  convoyeur_id: CONVOYEUR.id,
};

const auth = (req, user) =>
  req.set(
    "Authorization",
    `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`,
  );

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

function mockDb(user, handler = () => ({ rows: [] })) {
  const requetes = [];
  db.query.mockImplementation(async (sql, params) => {
    if (isUserLookup(sql)) return { rows: [user] };
    requetes.push(sql);
    return handler(sql, params) || { rows: [] };
  });
  return requetes;
}

let spies;
beforeEach(() => {
  jest.clearAllMocks();
  spies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("GET /api/mission-documents/mission/:id", () => {
  const lister = (user) =>
    auth(
      request(app).get(`/api/mission-documents/mission/${MISSION_ID}`),
      user,
    );

  it("le convoyeur affecté ne reçoit que les pièces cochées", async () => {
    const requetes = mockDb(CONVOYEUR, (sql) =>
      /FROM missions/i.test(sql) ? { rows: [MISSION] } : { rows: [] },
    );

    const res = await lister(CONVOYEUR);

    expect(res.status).toBe(200);
    expect(requetes.find((s) => /mission_documents/i.test(s))).toMatch(
      /visible_convoyeur = true/,
    );
  });

  it("refuse un convoyeur qui n'est pas affecté à la mission", async () => {
    mockDb(AUTRE_CONVOYEUR, (sql) =>
      /FROM missions/i.test(sql) ? { rows: [MISSION] } : null,
    );
    const res = await lister(AUTRE_CONVOYEUR);
    expect(res.status).toBe(404);
  });

  it("l'admin reçoit toutes les pièces", async () => {
    const requetes = mockDb(ADMIN, (sql) =>
      /FROM missions/i.test(sql) ? { rows: [MISSION] } : { rows: [] },
    );
    const res = await lister(ADMIN);
    expect(res.status).toBe(200);
    expect(requetes.find((s) => /mission_documents/i.test(s))).not.toMatch(
      /visible_convoyeur = true/,
    );
  });
});

describe("PATCH /api/mission-documents/:id", () => {
  const cocher = (user, body = { visible_convoyeur: true }) =>
    auth(request(app).patch(`/api/mission-documents/${DOC_ID}`), user).send(
      body,
    );

  it("seul l'admin peut cocher une pièce", async () => {
    mockDb(CLIENT);
    expect((await cocher(CLIENT)).status).toBe(403);
    mockDb(CONVOYEUR);
    expect((await cocher(CONVOYEUR)).status).toBe(403);
  });

  it("l'admin coche la visibilité convoyeur", async () => {
    mockDb(ADMIN, (sql) =>
      /UPDATE mission_documents/i.test(sql)
        ? {
            rows: [
              { id: DOC_ID, mission_id: MISSION_ID, visible_convoyeur: true },
            ],
          }
        : null,
    );
    const res = await cocher(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.document.visible_convoyeur).toBe(true);
  });

  it("refuse une valeur non booléenne", async () => {
    mockDb(ADMIN);
    const res = await cocher(ADMIN, { visible_convoyeur: "oui" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/mission-documents/mission/:id", () => {
  it("un convoyeur ne peut pas déposer de pièce", async () => {
    mockDb(CONVOYEUR);
    const res = await auth(
      request(app).post(`/api/mission-documents/mission/${MISSION_ID}`),
      CONVOYEUR,
    )
      .field("label", "Carte grise")
      .attach("document", Buffer.from("%PDF-1.4"), {
        filename: "cg.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(403);
  });

  it("exige un libellé", async () => {
    mockDb(CLIENT, (sql) =>
      /FROM missions/i.test(sql) ? { rows: [MISSION] } : null,
    );
    const res = await auth(
      request(app).post(`/api/mission-documents/mission/${MISSION_ID}`),
      CLIENT,
    ).attach("document", Buffer.from("%PDF-1.4"), {
      filename: "cg.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/libellé/i);
  });

  it("le client dépose une pièce sur sa mission", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions/i.test(sql)) return { rows: [MISSION] };
      if (/INSERT INTO mission_documents/i.test(sql))
        return {
          rows: [
            { id: DOC_ID, label: "Carte grise", visible_convoyeur: false },
          ],
        };
    });
    const res = await auth(
      request(app).post(`/api/mission-documents/mission/${MISSION_ID}`),
      CLIENT,
    )
      .field("label", "Carte grise")
      .attach("document", Buffer.from("%PDF-1.4"), {
        filename: "cg.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(201);
    expect(res.body.document.visible_convoyeur).toBe(false);
  });
});
