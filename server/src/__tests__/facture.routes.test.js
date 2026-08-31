/**
 * Tests d'intégration — facture.routes
 *
 * Ce module manipule des pièces comptables destinées à deux publics :
 * les clients et les convoyeurs. Les propriétés qui comptent sont le
 * cloisonnement — personne ne lit les factures d'un tiers, quel que soit
 * son rôle — et l'irréversibilité de l'annulation.
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
  full_name: "Admin Test",
  role: "admin",
  is_validated: true,
};

const CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "client@test.com",
  full_name: "Client Test",
  role: "client",
  is_validated: true,
};

const CONVOYEUR = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "convoyeur@test.com",
  full_name: "Convoyeur Test",
  role: "convoyeur",
  is_validated: true,
};

const FACTURE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const tokenFor = (user) =>
  jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

const auth = (req, user) =>
  req.set("Authorization", `Bearer ${tokenFor(user)}`);

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

function mockDb(user, handler = () => ({ rows: [] })) {
  db.query.mockImplementation(async (sql, params) => {
    if (isUserLookup(sql)) return { rows: user ? [user] : [] };
    return handler(sql, params) || { rows: [] };
  });
}

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

// ── Cloisonnement ────────────────────────────────────────────

describe("Cloisonnement des factures", () => {
  it.each([
    ["client", CLIENT],
    ["convoyeur", CONVOYEUR],
  ])("ne rend au %s que ses propres factures", async (_role, utilisateur) => {
    let parametres = null;
    mockDb(utilisateur, (sql, params) => {
      if (/FROM factures/i.test(sql)) {
        parametres = params;
        return { rows: [{ id: FACTURE_ID, numero: "F-001" }] };
      }
    });

    const res = await auth(
      request(app).get("/api/factures/mes-factures"),
      utilisateur,
    );

    expect(res.status).toBe(200);
    // L'identifiant provient du jeton : c'est ce qui rend impossible la
    // lecture des factures d'un tiers en manipulant l'URL.
    expect(parametres).toEqual([utilisateur.id]);
  });

  it.each([
    ["client", CLIENT],
    ["convoyeur", CONVOYEUR],
  ])("refuse au %s la liste complète de l'administration", async (_r, u) => {
    mockDb(u);
    const res = await auth(request(app).get("/api/factures"), u);
    expect(res.status).toBe(403);
  });

  it.each([
    ["client", CLIENT],
    ["convoyeur", CONVOYEUR],
  ])("refuse au %s le dépôt d'une facture", async (_r, u) => {
    mockDb(u);
    const res = await auth(
      request(app).post(`/api/factures/destinataires/${CLIENT.id}`),
      u,
    );
    expect(res.status).toBe(403);
  });

  it("refuse à l'administrateur la route d'espace personnel", async () => {
    mockDb(ADMIN);
    const res = await auth(
      request(app).get("/api/factures/mes-factures"),
      ADMIN,
    );
    expect(res.status).toBe(403);
  });

  it("exige un jeton", async () => {
    mockDb(null);
    const res = await request(app).get("/api/factures/mes-factures");
    expect(res.status).toBe(401);
  });
});

// ── Liste administrateur ─────────────────────────────────────

describe("Liste administrateur", () => {
  it("filtre par destinataire, par nature et par statut", async () => {
    let parametres = null;
    mockDb(ADMIN, (sql, params) => {
      if (/FROM factures/i.test(sql)) {
        parametres = params;
        return { rows: [] };
      }
    });

    const res = await auth(
      request(app).get(
        `/api/factures?destinataire_id=${CONVOYEUR.id}&role=convoyeur&statut=payee`,
      ),
      ADMIN,
    );

    expect(res.status).toBe(200);
    expect(parametres).toEqual([CONVOYEUR.id, "convoyeur", "payee"]);
  });

  it("rejette un statut inconnu", async () => {
    mockDb(ADMIN);
    const res = await auth(
      request(app).get("/api/factures?statut=perdue"),
      ADMIN,
    );
    expect(res.status).toBe(400);
  });

  it("rejette une nature inconnue", async () => {
    mockDb(ADMIN);
    const res = await auth(request(app).get("/api/factures?role=admin"), ADMIN);
    expect(res.status).toBe(400);
  });

  it("rejette un identifiant destinataire malformé", async () => {
    mockDb(ADMIN);
    const res = await auth(
      request(app).get("/api/factures?destinataire_id=pas-un-uuid"),
      ADMIN,
    );
    expect(res.status).toBe(400);
  });
});

// ── Dépôt ────────────────────────────────────────────────────

describe("Dépôt d'une facture", () => {
  const deposer = (champs = {}, destinataire = CLIENT) => {
    let req = auth(
      request(app).post(`/api/factures/destinataires/${destinataire.id}`),
      ADMIN,
    );
    for (const [cle, valeur] of Object.entries(champs)) {
      req = req.field(cle, valeur);
    }
    return req.attach("facture", Buffer.from("%PDF-1.4 test"), {
      filename: "facture.pdf",
      contentType: "application/pdf",
    });
  };

  const compteExiste = (role) => (sql) => {
    if (/SELECT id, role FROM users WHERE id = \$1/i.test(sql)) {
      return { rows: role ? [{ id: CLIENT.id, role }] : [] };
    }
  };

  it.each([["client"], ["convoyeur"]])(
    "enregistre une facture destinée à un %s",
    async (role) => {
      let insertion = null;
      mockDb(ADMIN, (sql, params) => {
        const compte = compteExiste(role)(sql);
        if (compte) return compte;
        if (/INSERT INTO factures/i.test(sql)) {
          insertion = params;
          return { rows: [{ id: FACTURE_ID, destinataire_role: role }] };
        }
      });

      const res = await deposer({ numero: "F-2026-001" });

      expect(res.status).toBe(201);
      // La nature de la pièce est figée d'après le rôle du destinataire.
      expect(insertion[1]).toBe(role);
    },
  );

  it("convertit le montant en centimes", async () => {
    let insertion = null;
    mockDb(ADMIN, (sql, params) => {
      const compte = compteExiste("client")(sql);
      if (compte) return compte;
      if (/INSERT INTO factures/i.test(sql)) {
        insertion = params;
        return { rows: [{ id: FACTURE_ID }] };
      }
    });

    const res = await deposer({ numero: "F-001", montant_ttc: "1234,56" });

    expect(res.status).toBe(201);
    // Les centimes évitent les écarts d'arrondi des flottants.
    expect(insertion[4]).toBe(123456);
    expect(insertion[11]).toBe(ADMIN.id);
  });

  it("exige un numéro de facture", async () => {
    mockDb(ADMIN);
    const res = await deposer({ montant_ttc: "100" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/numéro/i);
  });

  it("rejette un montant non numérique", async () => {
    mockDb(ADMIN);
    const res = await deposer({ numero: "F-001", montant_ttc: "beaucoup" });
    expect(res.status).toBe(400);
  });

  it("rejette un montant négatif", async () => {
    mockDb(ADMIN);
    const res = await deposer({ numero: "F-001", montant_ttc: "-50" });
    expect(res.status).toBe(400);
  });

  it("refuse un destinataire administrateur", async () => {
    mockDb(ADMIN, compteExiste("admin"));
    const res = await deposer({ numero: "F-001" });
    expect(res.status).toBe(404);
  });

  it("refuse un destinataire inexistant", async () => {
    mockDb(ADMIN, compteExiste(null));
    const res = await deposer({ numero: "F-001" });
    expect(res.status).toBe(404);
  });

  it("signale un numéro déjà utilisé pour ce destinataire", async () => {
    mockDb(ADMIN, (sql) => {
      const compte = compteExiste("client")(sql);
      if (compte) return compte;
      if (/INSERT INTO factures/i.test(sql)) {
        const err = new Error("doublon");
        err.code = "23505";
        throw err;
      }
    });

    const res = await deposer({ numero: "F-001" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/existe déjà/i);
  });

  it("rejette un identifiant destinataire malformé", async () => {
    mockDb(ADMIN);
    const res = await auth(
      request(app).post("/api/factures/destinataires/pas-un-uuid"),
      ADMIN,
    );
    expect(res.status).toBe(400);
  });
});

// ── Changement de statut ─────────────────────────────────────

describe("Changement de statut", () => {
  const changer = (statut, user = ADMIN) =>
    auth(request(app).patch(`/api/factures/${FACTURE_ID}/statut`), user).send({
      statut,
    });

  it("marque une facture comme payée", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT statut FROM factures/i.test(sql)) {
        return { rows: [{ statut: "emise" }] };
      }
      if (/UPDATE factures/i.test(sql)) {
        return { rows: [{ id: FACTURE_ID, statut: "payee" }] };
      }
    });

    const res = await changer("payee");
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe("payee");
  });

  it("refuse de ressusciter une facture annulée", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT statut FROM factures/i.test(sql)) {
        return { rows: [{ statut: "annulee" }] };
      }
    });

    // Une annulation constatée par le destinataire ne se rétracte pas.
    const res = await changer("emise");
    expect(res.status).toBe(409);
  });

  it("rejette un statut hors nomenclature", async () => {
    mockDb(ADMIN);
    const res = await changer("oubliee");
    expect(res.status).toBe(400);
  });

  it("répond 404 sur une facture inconnue", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT statut FROM factures/i.test(sql)) return { rows: [] };
    });

    const res = await changer("payee");
    expect(res.status).toBe(404);
  });

  it.each([
    ["client", CLIENT],
    ["convoyeur", CONVOYEUR],
  ])("refuse au %s de changer un statut", async (_r, u) => {
    mockDb(u);
    const res = await changer("payee", u);
    expect(res.status).toBe(403);
  });
});
