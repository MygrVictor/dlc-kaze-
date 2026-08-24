/**
 * Tests d'intégration — admin.routes
 *
 * Le back-office administrateur : pilotage des missions (cotation,
 * attribution, annulation, synchronisation Kaze), gestion des comptes
 * utilisateurs et de leurs pièces justificatives, et proxy Kaze.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  getKazeHealth: jest.fn(),
  testConnection: jest.fn(),
  fetchRecentJobs: jest.fn(),
  fetchJob: jest.fn(),
  fetchUsers: jest.fn(),
  fetchInvoices: jest.fn(),
  updateKazeJob: jest.fn(),
  kazeJobToLocal: jest.fn(),
  kazeUserToLocal: jest.fn(),
  getDriver: jest.fn(),
  getDriverByEmail: jest.fn(),
  getDriverByPhone: jest.fn(),
  assignDriver: jest.fn(),
  createMission: jest.fn(),
  cancelMission: jest.fn(),
}));

jest.mock("../services/sync.service", () => ({
  startSync: jest.fn(),
  ensureKazeMission: jest.fn(),
}));

jest.mock("../services/email.service", () => ({
  notifyAccountValidated: jest.fn().mockResolvedValue(undefined),
  notifyDevisPropose: jest.fn().mockResolvedValue(undefined),
  notifyMissionAssignee: jest.fn().mockResolvedValue(undefined),
  notifyMissionDisponible: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/geocoding.service", () => ({
  geocodeBatch: jest.fn(),
  geocodeDepuisCache: jest.fn(),
}));

jest.mock("../services/devis.service", () => ({ generateDevisPDF: jest.fn() }));

const db = require("../db");
const kazeService = require("../services/kaze.service");
const syncService = require("../services/sync.service");
const emailService = require("../services/email.service");
const geocodingService = require("../services/geocoding.service");
const app = require("./app.test-setup");

const ADMIN = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "admin@test.com",
  full_name: "Admin Test",
  role: "admin",
  is_validated: true,
  kaze_driver_id: null,
};

const CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "client@test.com",
  full_name: "Client Test",
  role: "client",
  is_validated: true,
  kaze_driver_id: null,
};

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DOC_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const tokenFor = (user) =>
  jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

function mockDb(user, handler = () => ({ rows: [] })) {
  db.query.mockImplementation(async (sql, params) => {
    if (isUserLookup(sql)) return { rows: user ? [user] : [] };
    return handler(sql, params) || { rows: [] };
  });
}

const auth = (req, user = ADMIN) =>
  req.set("Authorization", `Bearer ${tokenFor(user)}`);

/** Reconnaît la lecture d'une mission par `getMissionById`. */
const isGetMissionById = (sql) =>
  /SELECT \* FROM missions\s+WHERE id::text/i.test(sql);

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();

  // `clearAllMocks` n'efface que l'historique des appels : les implémentations
  // (notamment les `mockRejectedValue`) fuiteraient d'un test à l'autre.
  kazeService.assignDriver.mockResolvedValue(undefined);
  kazeService.cancelMission.mockResolvedValue(undefined);
  kazeService.createMission.mockResolvedValue({ id: "kz-default" });
  kazeService.getDriverByEmail.mockResolvedValue(null);
  kazeService.getDriverByPhone.mockResolvedValue(null);
  syncService.ensureKazeMission.mockResolvedValue(null);
  emailService.notifyAccountValidated.mockResolvedValue(undefined);
  emailService.notifyDevisPropose.mockResolvedValue(undefined);
  emailService.notifyMissionAssignee.mockResolvedValue(undefined);

  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

// ═════════════════════════════════════════════════════════════
describe("Contrôle d'accès du back-office", () => {
  it("refuse l'accès sans token", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("interdit l'accès à un client", async () => {
    mockDb(CLIENT);
    const res = await auth(request(app).get("/api/admin/stats"), CLIENT);
    expect(res.status).toBe(403);
  });

  it("refuse un identifiant de mission non-UUID", async () => {
    mockDb(ADMIN);
    const res = await auth(
      request(app).post("/api/admin/missions/xyz/annuler"),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/i);
  });

  it("accepte un identifiant préfixé kaze-", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql)) return { rows: [] };
    });

    const res = await auth(
      request(app).post(`/api/admin/missions/kaze-${MISSION_ID}/annuler`),
    );

    // 404 (et non 400) : l'identifiant a passé la validation
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/admin/missions", () => {
  const lister = (qs = "") =>
    auth(request(app).get(`/api/admin/missions${qs}`));

  function mockListe({ rows = [], count = "0" } = {}) {
    const appels = [];
    mockDb(ADMIN, (sql, params) => {
      appels.push({ sql, params });
      if (/COUNT/i.test(sql)) return { rows: [{ count }] };
      return { rows };
    });
    return appels;
  }

  it("retourne les missions avec la pagination", async () => {
    mockListe({ rows: [{ id: MISSION_ID }], count: "1" });

    const res = await lister();

    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: 1,
      totalPages: 1,
    });
  });

  it("filtre par statut", async () => {
    const appels = mockListe();

    await lister("?status=LIVREE");

    const liste = appels.find((a) => !/COUNT/i.test(a.sql));
    expect(liste.sql).toMatch(/m\.status = \$1/);
    expect(liste.params).toContain("LIVREE");
  });

  it("recherche sur le client, le véhicule et les adresses", async () => {
    const appels = mockListe();

    await lister("?search=Peugeot");

    const liste = appels.find((a) => !/COUNT/i.test(a.sql));
    expect(liste.sql).toMatch(/u\.full_name ILIKE/);
    expect(liste.sql).toMatch(/m\.vehicle_plate ILIKE/);
    expect(liste.params).toContain("%Peugeot%");
  });

  it("combine statut et recherche avec un AND", async () => {
    const appels = mockListe();

    await lister("?status=ACCEPTEE&search=Lyon");

    const liste = appels.find((a) => !/COUNT/i.test(a.sql));
    expect(liste.sql).toMatch(/m\.status = \$1 AND \(/);
    expect(liste.params.slice(0, 2)).toEqual(["ACCEPTEE", "%Lyon%"]);
  });

  it("plafonne la limite à 200", async () => {
    const appels = mockListe();

    const res = await lister("?limit=9999");

    expect(res.body.pagination.limit).toBe(200);
    const liste = appels.find((a) => !/COUNT/i.test(a.sql));
    expect(liste.params).toContain(200);
  });

  it("normalise une page négative à 1", async () => {
    mockListe();
    const res = await lister("?page=-5");
    expect(res.body.pagination.page).toBe(1);
  });

  it("garantit au moins une page même sans résultat", async () => {
    mockListe({ count: "0" });
    const res = await lister();
    expect(res.body.pagination.totalPages).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/admin/missions/search-plate", () => {
  const chercher = (qs) =>
    auth(request(app).get(`/api/admin/missions/search-plate${qs}`));

  it("exige au moins 2 caractères", async () => {
    mockDb(ADMIN);
    const res = await chercher("?plate=A");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 caractères/);
  });

  it("refuse une plaque absente", async () => {
    mockDb(ADMIN);
    const res = await chercher("");
    expect(res.status).toBe(400);
  });

  it("recherche indépendamment des tirets et de la casse", async () => {
    let requete;
    let params;
    mockDb(ADMIN, (sql, p) => {
      requete = sql;
      params = p;
      return { rows: [{ id: MISSION_ID }] };
    });

    const res = await chercher("?plate=  aa-123  ");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(requete).toMatch(/REPLACE\(UPPER\(m\.vehicle_plate\), '-', ''\)/);
    expect(params).toEqual(["aa-123"]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/admin/missions/export-csv", () => {
  const exporter = (qs = "") =>
    auth(request(app).get(`/api/admin/missions/export-csv${qs}`));

  const ligne = {
    id: MISSION_ID,
    status: "LIVREE",
    price: 450,
    client_name: "Client Test",
    client_email: "client@test.com",
    vehicle_plate: "AA-123-BB",
    service_refuel: true,
    service_wash_exterior: false,
    service_clean_interior: false,
    created_at: "2026-08-01",
  };

  it("produit un CSV avec BOM et en-têtes", async () => {
    mockDb(ADMIN, () => ({ rows: [ligne] }));

    const res = await exporter();

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/missions-dlc-/);
    expect(res.text.startsWith("\uFEFF")).toBe(true);
    expect(res.text).toMatch(/ID;Statut;Prix HT/);
  });

  it("traduit les services en Oui/Non", async () => {
    mockDb(ADMIN, () => ({ rows: [ligne] }));

    const res = await exporter();

    const [, donnees] = res.text.split("\n");
    expect(donnees).toContain(";Non;Non;Oui;");
  });

  it("filtre l'export par statut", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      params = p;
      return { rows: [] };
    });

    await exporter("?status=ANNULEE");

    expect(params).toEqual(["ANNULEE"]);
  });

  it("échappe les valeurs contenant un point-virgule ou un guillemet", async () => {
    mockDb(ADMIN, () => ({
      rows: [
        {
          ...ligne,
          client_name: 'Dupont; SARL "Le Convoi"',
          departure_address: "10 rue A;\nParis",
        },
      ],
    }));

    const res = await exporter();

    expect(res.text).toContain('"Dupont; SARL ""Le Convoi"""');
    expect(res.text).toContain('"10 rue A;\nParis"');
  });

  it("laisse intactes les valeurs sans caractère spécial", async () => {
    mockDb(ADMIN, () => ({ rows: [ligne] }));

    const res = await exporter();

    expect(res.text).toContain("Client Test");
    expect(res.text).not.toContain('"Client Test"');
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/admin/stats", () => {
  it("agrège les compteurs missions et utilisateurs", async () => {
    const missions = { total: "12", livrees: "3" };
    const users = { clients: "5", convoyeurs: "2" };
    mockDb(ADMIN, (sql) => {
      if (/FROM missions/i.test(sql)) return { rows: [missions] };
      if (/FROM users/i.test(sql)) return { rows: [users] };
    });

    const res = await auth(request(app).get("/api/admin/stats"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ missions, users });
  });
});

// ═════════════════════════════════════════════════════════════
describe("Gestion des utilisateurs", () => {
  it("liste tous les utilisateurs sans exposer le mot de passe", async () => {
    let requete;
    mockDb(ADMIN, (sql) => {
      requete = sql;
      return { rows: [{ id: USER_ID }] };
    });

    const res = await auth(request(app).get("/api/admin/users"));

    expect(res.status).toBe(200);
    expect(requete).not.toMatch(/password/i);
  });

  it("filtre les utilisateurs par rôle", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      params = p;
      return { rows: [] };
    });

    await auth(request(app).get("/api/admin/users?role=convoyeur"));

    expect(params).toEqual(["convoyeur"]);
  });

  it("valide un compte et notifie l'utilisateur", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SET is_validated = true/i.test(sql))
        return {
          rows: [
            {
              id: USER_ID,
              email: "nouveau@test.com",
              full_name: "Nouveau",
              role: "convoyeur",
            },
          ],
        };
    });

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/validate`),
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Convoyeur validé/);
    expect(emailService.notifyAccountValidated).toHaveBeenCalledWith(
      "nouveau@test.com",
      "Nouveau",
    );
  });

  it("valide le compte même si l'email de confirmation échoue", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SET is_validated = true/i.test(sql))
        return { rows: [{ id: USER_ID, role: "client", email: "c@t.fr" }] };
    });
    emailService.notifyAccountValidated.mockRejectedValue(new Error("SMTP HS"));

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/validate`),
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Client validé/);
  });

  it("retourne 404 si l'utilisateur à valider n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/validate`),
    );

    expect(res.status).toBe(404);
  });

  it("empêche un admin de supprimer son propre compte", async () => {
    mockDb(ADMIN);

    const res = await auth(request(app).delete(`/api/admin/users/${ADMIN.id}`));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/votre propre compte/i);
  });

  it("empêche la suppression d'un autre administrateur", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id, full_name, email, role FROM users/i.test(sql))
        return { rows: [{ id: USER_ID, role: "admin", full_name: "Autre" }] };
    });

    const res = await auth(request(app).delete(`/api/admin/users/${USER_ID}`));

    expect(res.status).toBe(403);
  });

  it("supprime un utilisateur standard", async () => {
    const requetes = [];
    mockDb(ADMIN, (sql) => {
      requetes.push(sql);
      if (/SELECT id, full_name, email, role FROM users/i.test(sql))
        return {
          rows: [{ id: USER_ID, role: "client", full_name: "Jean Dupont" }],
        };
    });

    const res = await auth(request(app).delete(`/api/admin/users/${USER_ID}`));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Jean Dupont/);
    expect(requetes.some((s) => /DELETE FROM users/i.test(s))).toBe(true);
  });

  it("retourne 404 si l'utilisateur à supprimer n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await auth(request(app).delete(`/api/admin/users/${USER_ID}`));

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════
describe("PATCH /api/admin/users/:id/kaze-link", () => {
  const lier = (body) =>
    auth(request(app).patch(`/api/admin/users/${USER_ID}/kaze-link`)).send(
      body,
    );

  it("retourne 404 si l'utilisateur n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));
    const res = await lier({ kazeDriverId: "kz-1" });
    expect(res.status).toBe(404);
  });

  it("refuse de lier un compte non convoyeur", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id, role FROM users/i.test(sql))
        return { rows: [{ id: USER_ID, role: "client" }] };
    });

    const res = await lier({ kazeDriverId: "kz-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Seuls les convoyeurs/i);
  });

  it("retourne 409 si le driver Kaze est déjà pris", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id, role FROM users/i.test(sql))
        return { rows: [{ id: USER_ID, role: "convoyeur" }] };
      if (/kaze_driver_id = \$1 AND id != \$2/i.test(sql))
        return { rows: [{ full_name: "Paul Martin" }] };
    });

    const res = await lier({ kazeDriverId: "kz-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Paul Martin/);
  });

  it("lie le compte Kaze au convoyeur", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id, role FROM users/i.test(sql))
        return { rows: [{ id: USER_ID, role: "convoyeur" }] };
      if (/kaze_driver_id = \$1 AND id != \$2/i.test(sql)) return { rows: [] };
      if (/SET kaze_driver_id = \$1/i.test(sql))
        return { rows: [{ id: USER_ID, kaze_driver_id: "kz-1" }] };
    });

    const res = await lier({ kazeDriverId: "kz-1" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Compte Kaze lié.");
  });

  it("supprime la liaison quand kazeDriverId est vide", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      if (/SELECT id, role FROM users/i.test(sql))
        return { rows: [{ id: USER_ID, role: "convoyeur" }] };
      if (/SET kaze_driver_id = \$1/i.test(sql)) {
        params = p;
        return { rows: [{ id: USER_ID, kaze_driver_id: null }] };
      }
    });

    const res = await lier({});

    expect(res.body.message).toBe("Liaison Kaze supprimée.");
    expect(params[0]).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
describe("Pièces justificatives des convoyeurs", () => {
  it("liste les documents d'un convoyeur avec le nom du relecteur", async () => {
    let requete;
    let params;
    mockDb(ADMIN, (sql, p) => {
      requete = sql;
      params = p;
      return { rows: [{ id: DOC_ID, type: "permis" }] };
    });

    const res = await auth(
      request(app).get(`/api/admin/users/${USER_ID}/documents`),
    );

    expect(res.status).toBe(200);
    expect(requete).toMatch(/reviewed_by_name/);
    expect(params).toEqual([USER_ID]);
  });

  it("refuse un statut de relecture non autorisé", async () => {
    mockDb(ADMIN);

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/documents/${DOC_ID}`),
    ).send({ status: "peut_etre" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valide.*refuse/i);
  });

  it.each([
    ["valide", /Document validé/],
    ["refuse", /Document refusé/],
  ])("enregistre la décision « %s »", async (status, message) => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      if (/UPDATE convoyeur_documents/i.test(sql)) {
        params = p;
        return { rows: [{ id: DOC_ID, status }] };
      }
    });

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/documents/${DOC_ID}`),
    ).send({ status, admin_note: "Illisible" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(message);
    expect(params).toEqual([status, "Illisible", ADMIN.id, DOC_ID, USER_ID]);
  });

  it("retourne 404 si le document n'appartient pas au convoyeur", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await auth(
      request(app).patch(`/api/admin/users/${USER_ID}/documents/${DOC_ID}`),
    ).send({ status: "valide" });

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/admin/missions — création manuelle", () => {
  const creer = (body) =>
    auth(request(app).post("/api/admin/missions")).send(body);

  it("exige les deux adresses", async () => {
    mockDb(ADMIN);
    const res = await creer({ departure_address: "Paris" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Adresses/i);
  });

  it("exige un client identifiable", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await creer({
      departure_address: "Paris",
      arrival_address: "Lyon",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/client_id ou client_email/i);
  });

  it("résout le client à partir de son email normalisé", async () => {
    let lookupParams;
    mockDb(ADMIN, (sql, p) => {
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        lookupParams = p;
        return { rows: [{ id: CLIENT.id }] };
      }
      if (/INSERT INTO missions/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
    });

    const res = await creer({
      client_email: "  CLIENT@Test.com ",
      departure_address: "Paris",
      arrival_address: "Lyon",
    });

    expect(res.status).toBe(201);
    expect(lookupParams).toEqual(["client@test.com"]);
  });

  it("applique le statut EN_ATTENTE_DE_COTATION par défaut", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      client_id: CLIENT.id,
      departure_address: "Paris",
      arrival_address: "Lyon",
    });

    expect(params[16]).toBe("EN_ATTENTE_DE_COTATION");
  });

  it("respecte un statut explicite", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      client_id: CLIENT.id,
      departure_address: "Paris",
      arrival_address: "Lyon",
      status: "ACCEPTEE",
    });

    expect(params[16]).toBe("ACCEPTEE");
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/admin/missions/:id/proposer-prix", () => {
  const proposer = (body) =>
    auth(
      request(app).post(`/api/admin/missions/${MISSION_ID}/proposer-prix`),
    ).send(body);

  const enAttente = {
    id: MISSION_ID,
    client_id: CLIENT.id,
    status: "EN_ATTENTE_DE_COTATION",
  };

  it.each([
    [{ price_convoyeur: 300 }, /prix client valide/i],
    [{ price: 0, price_convoyeur: 300 }, /prix client valide/i],
    [{ price: "abc", price_convoyeur: 300 }, /prix client valide/i],
    [{ price: 500 }, /prix convoyeur valide/i],
    [{ price: 500, price_convoyeur: -1 }, /prix convoyeur valide/i],
  ])("rejette une tarification invalide", async (body, message) => {
    mockDb(ADMIN);
    const res = await proposer(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("interdit une marge négative", async () => {
    mockDb(ADMIN);

    const res = await proposer({ price: 300, price_convoyeur: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ne peut pas dépasser/i);
  });

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await proposer({ price: 500, price_convoyeur: 300 });

    expect(res.status).toBe(404);
  });

  it("refuse de coter une mission déjà cotée", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql))
        return { rows: [{ ...enAttente, status: "DEVIS_PROPOSE" }] };
    });

    const res = await proposer({ price: 500, price_convoyeur: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/DEVIS_PROPOSE/);
  });

  it("bascule la mission en DEVIS_PROPOSE et notifie le client", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql)) return { rows: [enAttente] };
      if (/status = 'DEVIS_PROPOSE'/i.test(sql))
        return { rows: [{ ...enAttente, status: "DEVIS_PROPOSE" }] };
      if (/SELECT email, full_name FROM users/i.test(sql))
        return { rows: [{ email: CLIENT.email, full_name: CLIENT.full_name }] };
    });

    const res = await proposer({ price: 500, price_convoyeur: 300 });

    expect(res.status).toBe(200);
    expect(res.body.mission.status).toBe("DEVIS_PROPOSE");
    expect(emailService.notifyDevisPropose).toHaveBeenCalledWith(
      CLIENT.email,
      CLIENT.full_name,
      enAttente,
      500,
    );
  });

  it("propose le devis même si l'email échoue", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql)) return { rows: [enAttente] };
      if (/status = 'DEVIS_PROPOSE'/i.test(sql))
        return { rows: [{ ...enAttente, status: "DEVIS_PROPOSE" }] };
      if (/SELECT email, full_name FROM users/i.test(sql))
        return { rows: [{ email: CLIENT.email }] };
    });
    emailService.notifyDevisPropose.mockRejectedValue(new Error("SMTP HS"));

    const res = await proposer({ price: 500, price_convoyeur: 300 });

    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/admin/missions/:id/attribuer-convoyeur", () => {
  const attribuer = (body, id = MISSION_ID) =>
    auth(
      request(app).post(`/api/admin/missions/${id}/attribuer-convoyeur`),
    ).send(body);

  const CONVOYEUR_ROW = {
    id: USER_ID,
    full_name: "Jean Convoyeur",
    email: "jean@test.com",
    phone: "0600000000",
    kaze_driver_id: "kz-driver-1",
  };

  it("exige un convoyeur DLC ou Kaze", async () => {
    mockDb(ADMIN);
    const res = await attribuer({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ID du convoyeur/i);
  });

  it("retourne 404 si le convoyeur DLC est introuvable", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));

    const res = await attribuer({ convoyeurId: USER_ID });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Convoyeur introuvable/i);
  });

  it("retourne 404 si le convoyeur Kaze est introuvable", async () => {
    mockDb(ADMIN);
    const err = new Error("not found");
    err.response = { status: 404 };
    kazeService.getDriver.mockRejectedValue(err);

    const res = await attribuer({ kazeDriverId: "kz-inconnu" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Convoyeur Kaze introuvable/i);
  });

  it("attribue la mission et la synchronise dans Kaze", async () => {
    mockDb(ADMIN, (sql) => {
      if (/role = 'convoyeur'/i.test(sql)) return { rows: [CONVOYEUR_ROW] };
      if (isGetMissionById(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id }] };
      if (/SET convoyeur_id = \$1/i.test(sql))
        return {
          rows: [
            { id: MISSION_ID, client_id: CLIENT.id, convoyeur_id: USER_ID },
          ],
        };
      if (/SELECT email, full_name FROM users/i.test(sql))
        return { rows: [{ email: CLIENT.email, full_name: CLIENT.full_name }] };
    });
    syncService.ensureKazeMission.mockResolvedValue("kz-job-1");
    kazeService.assignDriver.mockResolvedValue(true);

    const res = await attribuer({ convoyeurId: USER_ID });

    expect(res.status).toBe(200);
    expect(res.body.kazeSync).toEqual({ synced: true, error: null });
    expect(kazeService.assignDriver).toHaveBeenCalledWith(
      "kz-job-1",
      "kz-driver-1",
    );
    expect(emailService.notifyMissionAssignee).toHaveBeenCalled();
  });

  it("signale un convoyeur sans compte Kaze sans bloquer l'attribution", async () => {
    mockDb(ADMIN, (sql) => {
      if (/role = 'convoyeur'/i.test(sql))
        return { rows: [{ ...CONVOYEUR_ROW, kaze_driver_id: null }] };
      if (isGetMissionById(sql)) return { rows: [{ id: MISSION_ID }] };
      if (/SET convoyeur_id = \$1/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
    });
    kazeService.getDriverByEmail.mockResolvedValue(null);
    kazeService.getDriverByPhone.mockResolvedValue(null);

    const res = await attribuer({ convoyeurId: USER_ID });

    expect(res.status).toBe(200);
    expect(res.body.kazeSync.error).toMatch(/pas de compte Kaze lié/i);
  });

  it("retrouve et mémorise le driver Kaze via l'email du convoyeur", async () => {
    const requetes = [];
    mockDb(ADMIN, (sql) => {
      requetes.push(sql);
      if (/role = 'convoyeur'/i.test(sql))
        return { rows: [{ ...CONVOYEUR_ROW, kaze_driver_id: null }] };
      if (isGetMissionById(sql)) return { rows: [{ id: MISSION_ID }] };
      if (/SET convoyeur_id = \$1/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
    });
    kazeService.getDriverByEmail.mockResolvedValue({ id: "kz-trouve" });
    syncService.ensureKazeMission.mockResolvedValue("kz-job-1");

    const res = await attribuer({ convoyeurId: USER_ID });

    expect(res.body.kazeSync.synced).toBe(true);
    expect(
      requetes.some((s) => /UPDATE users SET kaze_driver_id/i.test(s)),
    ).toBe(true);
  });

  it("remonte l'erreur détaillée quand l'assignation Kaze échoue", async () => {
    mockDb(ADMIN, (sql) => {
      if (/role = 'convoyeur'/i.test(sql)) return { rows: [CONVOYEUR_ROW] };
      if (isGetMissionById(sql)) return { rows: [{ id: MISSION_ID }] };
      if (/SET convoyeur_id = \$1/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
    });
    syncService.ensureKazeMission.mockResolvedValue("kz-job-1");
    const err = new Error("générique");
    err.response = { data: { error: "Performer invalide" } };
    kazeService.assignDriver.mockRejectedValue(err);

    const res = await attribuer({ convoyeurId: USER_ID });

    expect(res.body.kazeSync.error).toBe("Performer invalide");
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/admin/missions/:id/annuler", () => {
  const annuler = () =>
    auth(request(app).post(`/api/admin/missions/${MISSION_ID}/annuler`));

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));
    const res = await annuler();
    expect(res.status).toBe(404);
  });

  it.each(["LIVREE", "ANNULEE"])(
    "refuse d'annuler une mission au statut %s",
    async (status) => {
      mockDb(ADMIN, (sql) => {
        if (isGetMissionById(sql))
          return { rows: [{ id: MISSION_ID, status }] };
      });

      const res = await annuler();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(status);
    },
  );

  it("annule la mission et propage l'annulation à Kaze", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql))
        return {
          rows: [
            { id: MISSION_ID, status: "ASSIGNEE", kaze_mission_id: "kz-1" },
          ],
        };
      if (/status = 'ANNULEE'/i.test(sql))
        return { rows: [{ id: MISSION_ID, status: "ANNULEE" }] };
    });

    const res = await annuler();

    expect(res.status).toBe(200);
    expect(res.body.mission.status).toBe("ANNULEE");
    expect(kazeService.cancelMission).toHaveBeenCalledWith("kz-1");
  });

  it("annule localement même si Kaze échoue", async () => {
    mockDb(ADMIN, (sql) => {
      if (isGetMissionById(sql))
        return {
          rows: [
            { id: MISSION_ID, status: "ACCEPTEE", kaze_mission_id: "kz-1" },
          ],
        };
      if (/status = 'ANNULEE'/i.test(sql))
        return { rows: [{ id: MISSION_ID, status: "ANNULEE" }] };
    });
    kazeService.cancelMission.mockRejectedValue(new Error("Kaze HS"));

    const res = await annuler();

    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/admin/missions/:id/sync-kaze", () => {
  const synchroniser = () =>
    auth(request(app).post(`/api/admin/missions/${MISSION_ID}/sync-kaze`));

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));
    const res = await synchroniser();
    expect(res.status).toBe(404);
  });

  it("refuse de synchroniser une mission non éligible", async () => {
    mockDb(ADMIN, (sql) => {
      if (/FROM missions m JOIN users/i.test(sql))
        return {
          rows: [{ id: MISSION_ID, status: "EN_ATTENTE_DE_COTATION" }],
        };
    });

    const res = await synchroniser();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/EN_ATTENTE_DE_COTATION/);
  });

  it("crée le job Kaze manquant", async () => {
    mockDb(ADMIN, (sql) => {
      if (/FROM missions m JOIN users/i.test(sql))
        return { rows: [{ id: MISSION_ID, status: "ACCEPTEE" }] };
    });
    kazeService.createMission.mockResolvedValue({ id: "kz-new" });

    const res = await synchroniser();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kaze_mission_id: "kz-new",
      just_created: true,
      driver_assigned: false,
    });
  });

  it("ré-assigne le convoyeur d'une mission déjà synchronisée", async () => {
    mockDb(ADMIN, (sql) => {
      if (/FROM missions m JOIN users/i.test(sql))
        return {
          rows: [
            {
              id: MISSION_ID,
              status: "ASSIGNEE",
              kaze_mission_id: "kz-1",
              convoyeur_id: USER_ID,
            },
          ],
        };
      if (/SELECT kaze_driver_id, full_name FROM users/i.test(sql))
        return { rows: [{ kaze_driver_id: "kz-driver-1" }] };
    });

    const res = await synchroniser();

    expect(res.body.driver_assigned).toBe(true);
    expect(res.body.message).toMatch(/ré-assigné/i);
    expect(kazeService.assignDriver).toHaveBeenCalledWith(
      "kz-1",
      "kz-driver-1",
    );
  });

  it("signale un convoyeur sans compte Kaze", async () => {
    mockDb(ADMIN, (sql) => {
      if (/FROM missions m JOIN users/i.test(sql))
        return {
          rows: [
            {
              id: MISSION_ID,
              status: "ASSIGNEE",
              kaze_mission_id: "kz-1",
              convoyeur_id: USER_ID,
            },
          ],
        };
      if (/SELECT kaze_driver_id, full_name FROM users/i.test(sql))
        return { rows: [{ kaze_driver_id: null, full_name: "Jean" }] };
    });

    const res = await synchroniser();

    expect(res.body.driver_assigned).toBe(false);
    expect(res.body.assign_error).toMatch(/Jean/);
    expect(kazeService.assignDriver).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/admin/missions/map", () => {
  const carte = (qs = "") =>
    auth(request(app).get(`/api/admin/missions/map${qs}`));

  const mission = {
    id: MISSION_ID,
    status: "ACCEPTEE",
    departure_address: "Paris",
    arrival_address: "Lyon",
    vehicle_brand: "Renault",
    vehicle_model: "Clio",
  };

  beforeEach(() => {
    kazeService.fetchRecentJobs.mockResolvedValue([]);
    geocodingService.geocodeBatch.mockResolvedValue(new Map());
    geocodingService.geocodeDepuisCache.mockResolvedValue(new Map());
  });

  it("n'accepte que les statuts connus dans le filtre", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      params = p;
      return { rows: [] };
    });

    await carte("?statuses=ACCEPTEE,PIRATE,LIVREE");

    expect(params).toEqual(["ACCEPTEE", "LIVREE"]);
  });

  it("retient les six statuts par défaut", async () => {
    let params;
    mockDb(ADMIN, (sql, p) => {
      params = p;
      return { rows: [] };
    });

    await carte();

    expect(params).toHaveLength(6);
  });

  it("écarte les missions sans coordonnées exploitables", async () => {
    mockDb(ADMIN, () => ({ rows: [mission] }));

    const res = await carte();

    expect(res.body.total).toBe(1);
    expect(res.body.geocoded).toBe(0);
    expect(res.body.missions).toHaveLength(0);
  });

  it("expose les missions géocodées avec leur véhicule agrégé", async () => {
    mockDb(ADMIN, () => ({ rows: [mission] }));
    // Les missions DLC passent elles aussi par le cache seul : géocoder à
    // la volée ajouterait un aller-retour réseau par adresse inconnue.
    geocodingService.geocodeDepuisCache.mockResolvedValue(
      new Map([
        ["Paris", { lat: 48.85, lng: 2.35 }],
        ["Lyon", { lat: 45.76, lng: 4.83 }],
      ]),
    );

    const res = await carte();

    expect(res.body.geocoded).toBe(1);
    expect(res.body.missions[0]).toMatchObject({
      vehicle: "Renault Clio",
      departure: { address: "Paris", lat: 48.85, lng: 2.35 },
      arrival: { address: "Lyon", lat: 45.76, lng: 4.83 },
    });
  });

  it("plafonne le nombre de missions remontées", async () => {
    // Sans LIMIT, la requête grossit avec tout l'historique : plusieurs
    // milliers de lignes jointes après un an, pour une carte illisible.
    let requete;
    mockDb(ADMIN, (sql) => {
      if (/FROM missions m/i.test(sql)) requete = sql;
      return { rows: [] };
    });

    await carte();

    expect(requete).toMatch(/LIMIT \d+/);
  });

  it("conserve les jobs Kaze déjà géolocalisés", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));
    kazeService.fetchRecentJobs.mockResolvedValue([{ id: "kz-1" }]);
    kazeService.kazeJobToLocal.mockReturnValue({
      kaze_job_id: "kz-1",
      latitude: 43.6,
      longitude: 1.44,
      title: "Toulouse",
    });

    const res = await carte();

    expect(res.body.kazeMissions).toHaveLength(1);
    expect(res.body.kazeMissions[0].latitude).toBe(43.6);
  });

  it("positionne les jobs Kaze sans coordonnées depuis le cache de géocodage", async () => {
    // Les missions Kaze ne sont jamais géocodées à la volée : l'historique
    // se compte en milliers et Nominatim plafonne à une requête par
    // seconde. Seul le cache, rempli hors ligne, est consulté.
    mockDb(ADMIN, () => ({ rows: [] }));
    kazeService.fetchRecentJobs.mockResolvedValue([{ id: "kz-1" }]);
    kazeService.kazeJobToLocal.mockReturnValue({
      kaze_job_id: "kz-1",
      latitude: null,
      address: "Bordeaux",
    });
    geocodingService.geocodeDepuisCache.mockResolvedValue(
      new Map([["Bordeaux", { lat: 44.84, lng: -0.58 }]]),
    );

    const res = await carte();

    expect(res.body.kazeMissions[0]).toMatchObject({
      latitude: 44.84,
      longitude: -0.58,
    });
    expect(geocodingService.geocodeBatch).not.toHaveBeenCalledWith(
      expect.arrayContaining(["Bordeaux"]),
    );
  });

  it("rend la carte même si Kaze est indisponible", async () => {
    mockDb(ADMIN, () => ({ rows: [] }));
    kazeService.fetchRecentJobs.mockRejectedValue(new Error("Kaze HS"));

    const res = await carte();

    expect(res.status).toBe(200);
    expect(res.body.kazeMissions).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Proxy Kaze", () => {
  it("expose l'état de santé de l'intégration", async () => {
    mockDb(ADMIN);
    kazeService.getKazeHealth.mockReturnValue({ ok: true, lastSync: null });

    const res = await auth(request(app).get("/api/admin/kaze-health"));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("teste la connexion à l'API Kaze", async () => {
    mockDb(ADMIN);
    kazeService.testConnection.mockResolvedValue({ connected: true });

    const res = await auth(request(app).get("/api/admin/kaze/test"));

    expect(res.body.connected).toBe(true);
  });

  it("liste les jobs Kaze sur 60 jours par défaut", async () => {
    mockDb(ADMIN);
    kazeService.fetchRecentJobs.mockResolvedValue([{ id: "kz-1" }]);
    kazeService.kazeJobToLocal.mockReturnValue({ kaze_status: "waiting" });

    const res = await auth(request(app).get("/api/admin/kaze/jobs"));

    expect(kazeService.fetchRecentJobs).toHaveBeenCalledWith(60);
    expect(res.body.meta).toEqual({ total_count: 1, days: 60 });
  });

  it("filtre les jobs Kaze par statut", async () => {
    mockDb(ADMIN);
    kazeService.fetchRecentJobs.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    kazeService.kazeJobToLocal
      .mockReturnValueOnce({ kaze_status: "waiting" })
      .mockReturnValueOnce({ kaze_status: "done" });

    const res = await auth(
      request(app).get("/api/admin/kaze/jobs?status=done&days=15"),
    );

    expect(kazeService.fetchRecentJobs).toHaveBeenCalledWith(15);
    expect(res.body.data).toEqual([{ kaze_status: "done" }]);
  });

  it("tolère une réponse Kaze vide", async () => {
    mockDb(ADMIN);
    kazeService.fetchRecentJobs.mockResolvedValue(null);

    const res = await auth(request(app).get("/api/admin/kaze/jobs"));

    expect(res.body.data).toEqual([]);
  });

  it("retourne le détail d'un job Kaze normalisé", async () => {
    mockDb(ADMIN);
    kazeService.fetchJob.mockResolvedValue({ id: "kz-1" });
    kazeService.kazeJobToLocal.mockReturnValue({ kaze_job_id: "kz-1" });

    const res = await auth(request(app).get("/api/admin/kaze/jobs/kz-1"));

    expect(res.body).toEqual({ kaze_job_id: "kz-1" });
  });

  it("liste les utilisateurs Kaze normalisés", async () => {
    mockDb(ADMIN);
    kazeService.fetchUsers.mockResolvedValue({
      meta: { total: 1 },
      data: [{ id: "u1" }],
    });
    kazeService.kazeUserToLocal.mockReturnValue({ kaze_user_id: "u1" });

    const res = await auth(request(app).get("/api/admin/kaze/users"));

    expect(res.body).toEqual({
      meta: { total: 1 },
      data: [{ kaze_user_id: "u1" }],
    });
  });

  it("pagine les factures Kaze avec des valeurs par défaut", async () => {
    mockDb(ADMIN);
    kazeService.fetchInvoices.mockResolvedValue({ data: [] });

    await auth(request(app).get("/api/admin/kaze/invoices"));

    expect(kazeService.fetchInvoices).toHaveBeenCalledWith({
      page: 1,
      perPage: 100,
    });
  });

  it("transmet la pagination demandée pour les factures", async () => {
    mockDb(ADMIN);
    kazeService.fetchInvoices.mockResolvedValue({ data: [] });

    await auth(request(app).get("/api/admin/kaze/invoices?page=3&per_page=25"));

    expect(kazeService.fetchInvoices).toHaveBeenCalledWith({
      page: 3,
      perPage: 25,
    });
  });

  it("met à jour un job Kaze", async () => {
    mockDb(ADMIN);
    kazeService.updateKazeJob.mockResolvedValue({ id: "kz-1" });

    const res = await auth(request(app).put("/api/admin/kaze/jobs/kz-1")).send({
      title: "Nouveau titre",
    });

    expect(res.status).toBe(200);
    expect(kazeService.updateKazeJob).toHaveBeenCalledWith("kz-1", {
      title: "Nouveau titre",
    });
  });

  it("propage une erreur Kaze au gestionnaire d'erreurs", async () => {
    mockDb(ADMIN);
    kazeService.fetchUsers.mockRejectedValue(new Error("Kaze HS"));

    const res = await auth(request(app).get("/api/admin/kaze/users"));

    expect(res.status).toBe(500);
  });
});
