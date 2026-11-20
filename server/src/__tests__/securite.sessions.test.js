/**
 * Durcissement des sessions et du login.
 *
 * - révocation des jetons via `token_version` ;
 * - algorithme de signature imposé ;
 * - verrouillage du compte après une série d'échecs ;
 * - mots de passe transmis sans passer par le filtre XSS, avec reprise
 *   des comptes dont le hachage porte encore sur la forme filtrée ;
 * - webhook Kaze incapable de faire régresser une mission terminée.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);
jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock("../services/email.service", () => ({}));
jest.mock("../services/kaze.service", () => ({}));
jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

const db = require("../db");
const app = require("./app.test-setup");
const { sanitizeInputs } = require("../middleware/security.middleware");

const COMPTE = {
  id: "uuid-1",
  email: "user@test.com",
  full_name: "Test User",
  role: "client",
  is_validated: true,
};

const jeton = (charge, options = {}) =>
  jwt.sign({ userId: COMPTE.id, role: "client", ...charge }, process.env.JWT_SECRET, {
    expiresIn: "1h",
    ...options,
  });

beforeEach(() => {
  db.query.mockReset();
  db.transaction.mockReset();
});

// ──────────────────────────────────────────────────────────────
describe("révocation des sessions", () => {
  it("refuse un jeton émis avant un changement de mot de passe", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...COMPTE, token_version: 1 }] });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jeton({ tv: 0 })}`);

    expect(res.status).toBe(401);
  });

  it("accepte un jeton de la version courante, sans exposer la version", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...COMPTE, token_version: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jeton({ tv: 3 })}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/token_version/);
  });

  it("traite un jeton sans `tv` (émis avant la migration) comme version 0", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...COMPTE, token_version: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jeton({})}`);

    expect(res.status).toBe(200);
  });

  it("refuse un jeton signé avec un autre algorithme que HS256", async () => {
    db.query.mockResolvedValue({ rows: [{ ...COMPTE, token_version: 0 }] });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jeton({ tv: 0 }, { algorithm: "HS512" })}`);

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
describe("login : verrouillage et version de jeton", () => {
  const compteEnBase = async (extra = {}) => ({
    ...COMPTE,
    password_hash: await bcrypt.hash("GoodPass#1", 4),
    token_version: 2,
    failed_login_count: 0,
    locked_until: null,
    ...extra,
  });

  it("refuse un compte verrouillé, même avec le bon mot de passe", async () => {
    db.query.mockResolvedValueOnce({
      rows: [await compteEnBase({ locked_until: new Date(Date.now() + 60_000) })],
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: COMPTE.email, password: "GoodPass#1" });

    expect(res.status).toBe(429);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("incrémente le compteur d'échecs sur un mauvais mot de passe", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [await compteEnBase()] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: COMPTE.email, password: "Mauvais#1" });

    expect(res.status).toBe(401);
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toMatch(/failed_login_count/);
    expect(sql).toMatch(/locked_until/);
    expect(params[0]).toBe(COMPTE.id);
  });

  it("remet le compteur à zéro après une connexion réussie", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [await compteEnBase({ failed_login_count: 4 })] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: COMPTE.email, password: "GoodPass#1" });

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toMatch(/failed_login_count = 0/);
  });

  it("inscrit la version du compte dans le jeton émis", async () => {
    db.query.mockResolvedValueOnce({ rows: [await compteEnBase()] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: COMPTE.email, password: "GoodPass#1" });

    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"].join(";");
    const token = decodeURIComponent(cookie.match(/dlc_token=([^;]+)/)[1]);
    expect(jwt.decode(token).tv).toBe(2);
  });

  it("reprend un compte dont le hachage porte sur l'ancienne forme filtrée", async () => {
    // L'ancien filtre XSS transformait « Pa<ss>w0rd! » en « Paw0rd! »
    // avant le hachage.
    db.query
      .mockResolvedValueOnce({
        rows: [await compteEnBase({ password_hash: await bcrypt.hash("Paw0rd!", 4) })],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: COMPTE.email, password: "Pa<ss>w0rd!" });

    expect(res.status).toBe(200);
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toMatch(/UPDATE users SET password_hash/);
    expect(await bcrypt.compare("Pa<ss>w0rd!", params[0])).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
describe("filtre XSS et secrets", () => {
  it("laisse les mots de passe intacts mais filtre les autres champs", () => {
    const req = {
      body: { password: " Pa<ss>w0rd! ", full_name: "Jean <b>Dupont</b>" },
      query: {},
      params: {},
    };
    sanitizeInputs(req, {}, () => {});

    expect(req.body.password).toBe(" Pa<ss>w0rd! ");
    expect(req.body.full_name).toBe("Jean Dupont");
  });
});

// ──────────────────────────────────────────────────────────────
describe("réinitialisation : fermeture des sessions", () => {
  it("incrémente token_version et lève le verrou", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "reset-1",
          user_id: COMPTE.id,
          email: COMPTE.email,
          full_name: COMPTE.full_name,
          expires_at: new Date(Date.now() + 60_000),
          used_at: null,
        },
      ],
    });
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db.transaction.mockImplementation((fn) => fn(client));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "a".repeat(64), password: "NouveauPass#1" });

    // L'email de confirmation n'est pas simulé ici : son échec est absorbé.
    expect(res.status).toBe(200);
    const sql = client.query.mock.calls.map(([s]) => s).join("\n");
    expect(sql).toMatch(/token_version = token_version \+ 1/);
    expect(sql).toMatch(/locked_until = NULL/);
  });
});
