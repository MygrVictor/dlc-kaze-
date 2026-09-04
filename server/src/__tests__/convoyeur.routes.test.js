/**
 * Tests d'intégration — convoyeur.routes
 *
 * Le principe directeur vérifié ici : **Kaze est la source de vérité**.
 * DLC n'autorise que l'auto-attribution ; le démarrage et la clôture d'une
 * mission sont explicitement bloqués (403) et proviennent du webhook Kaze.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  getDriver: jest.fn(),
  getDriverByEmail: jest.fn(),
  getDriverByPhone: jest.fn(),
  getMissionsByDriver: jest.fn(),
  fetchRecentJobs: jest.fn(),
  fetchJob: jest.fn(),
  assignDriver: jest.fn(),
  kazeJobToLocal: jest.fn(),
  createMission: jest.fn(),
  cancelMission: jest.fn(),
}));

jest.mock("../services/sync.service", () => ({
  startSync: jest.fn(),
  ensureKazeMission: jest.fn(),
}));

jest.mock("../services/email.service", () => ({
  notifyMissionDisponible: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/devis.service", () => ({ generateDevisPDF: jest.fn() }));

const db = require("../db");
const kazeService = require("../services/kaze.service");
const syncService = require("../services/sync.service");
const app = require("./app.test-setup");

const CONVOYEUR = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "convoyeur@test.com",
  full_name: "Convoyeur Test",
  // Obligatoire : les missions sont annoncées par WhatsApp.
  phone: "0612345678",
  role: "convoyeur",
  is_validated: true,
  kaze_driver_id: "kaze-driver-1",
};

const CONVOYEUR_SANS_KAZE = { ...CONVOYEUR, kaze_driver_id: null };

const CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "client@test.com",
  full_name: "Client Test",
  role: "client",
  is_validated: true,
  kaze_driver_id: null,
};

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const tokenFor = (user) =>
  jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

// Les cinq pièces exigées avant toute prise de mission.
const DOCUMENTS_REQUIS = [
  "permis",
  "carte_identite",
  "rc_circulation",
  "rc_pro",
  "domicile",
];

const isEtatDossier = (sql) =>
  /FROM convoyeur_documents/i.test(sql) && /type = ANY/i.test(sql);

/** Dossier complet : le cas nominal de la plupart des tests. */
const dossierComplet = () => ({
  rows: DOCUMENTS_REQUIS.map((type) => ({ type, status: "valide" })),
});

function mockDb(user, handler = () => undefined) {
  db.query.mockImplementation(async (sql, params) => {
    if (isUserLookup(sql)) return { rows: user ? [user] : [] };
    // Sans dossier complet, la prise de mission renverrait 403 avant même
    // d'atteindre la règle testée. Les tests qui s'intéressent au dossier
    // lui-même surchargent cette réponse par leur propre `handler`.
    const propre = handler(sql, params);
    if (propre) return propre;
    if (isEtatDossier(sql)) return dossierComplet();
    return { rows: [] };
  });
}

const auth = (req, user = CONVOYEUR) =>
  req.set("Authorization", `Bearer ${tokenFor(user)}`);

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();

  // `clearAllMocks` n'efface que l'historique des appels : sans ces valeurs par
  // défaut, un `mockRejectedValue` fuiterait vers les tests suivants.
  kazeService.getDriver.mockResolvedValue(null);
  kazeService.getDriverByEmail.mockResolvedValue(null);
  kazeService.getDriverByPhone.mockResolvedValue(null);
  kazeService.getMissionsByDriver.mockResolvedValue({ missions: [] });
  kazeService.fetchRecentJobs.mockResolvedValue([]);
  kazeService.fetchJob.mockResolvedValue(null);
  kazeService.assignDriver.mockResolvedValue(undefined);
  syncService.ensureKazeMission.mockResolvedValue(null);

  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

// ═════════════════════════════════════════════════════════════
describe("Contrôle d'accès du portail convoyeur", () => {
  it("refuse l'accès sans token", async () => {
    const res = await request(app).get("/api/convoyeur/profil");
    expect(res.status).toBe(401);
  });

  it("interdit l'accès à un client", async () => {
    mockDb(CLIENT);
    const res = await auth(request(app).get("/api/convoyeur/profil"), CLIENT);
    expect(res.status).toBe(403);
  });

  it("refuse un identifiant de mission non-UUID", async () => {
    mockDb(CONVOYEUR);
    const res = await auth(request(app).get("/api/convoyeur/missions/abc"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/i);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/profil", () => {
  const consulter = (user = CONVOYEUR) =>
    auth(request(app).get("/api/convoyeur/profil"), user);

  it("indique que le compte n'est pas lié à Kaze", async () => {
    mockDb(CONVOYEUR_SANS_KAZE, () => ({ rows: [CONVOYEUR_SANS_KAZE] }));

    const res = await consulter(CONVOYEUR_SANS_KAZE);

    expect(res.status).toBe(200);
    expect(res.body.kazeLinked).toBe(false);
    expect(res.body.kazeDriverInfo).toBeNull();
    expect(kazeService.getDriver).not.toHaveBeenCalled();
  });

  it("enrichit le profil avec les données Kaze", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [CONVOYEUR] }));
    kazeService.getDriver.mockResolvedValue({
      id: "kaze-driver-1",
      name: "Jean",
    });

    const res = await consulter();

    expect(res.body.kazeLinked).toBe(true);
    expect(res.body.kazeDriverInfo.name).toBe("Jean");
  });

  it("retourne quand même le profil si Kaze est indisponible", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [CONVOYEUR] }));
    kazeService.getDriver.mockRejectedValue(new Error("timeout"));

    const res = await consulter();

    expect(res.status).toBe(200);
    expect(res.body.kazeLinked).toBe(true);
    expect(res.body.kazeDriverInfo).toEqual({ id: "kaze-driver-1" });
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/convoyeur/lier-kaze", () => {
  const lier = (body) =>
    auth(request(app).post("/api/convoyeur/lier-kaze")).send(body);

  it("exige un email ou un téléphone", async () => {
    mockDb(CONVOYEUR);
    const res = await lier({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email ou votre téléphone/i);
  });

  it("lie le compte à partir de l'email Kaze", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/kaze_driver_id = \$1 AND id/i.test(sql)) return { rows: [] };
    });
    kazeService.getDriverByEmail.mockResolvedValue({ id: "kz-99" });

    const res = await lier({ kazeEmail: "jean@kaze.so" });

    expect(res.status).toBe(200);
    expect(res.body.kazeDriverId).toBe("kz-99");
    expect(kazeService.getDriverByPhone).not.toHaveBeenCalled();
  });

  it("bascule sur le téléphone si l'email ne donne rien", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [] }));
    kazeService.getDriverByEmail.mockResolvedValue(null);
    kazeService.getDriverByPhone.mockResolvedValue({ id: "kz-77" });

    const res = await lier({
      kazeEmail: "inconnu@kaze.so",
      kazePhone: "0600000000",
    });

    expect(res.status).toBe(200);
    expect(res.body.kazeDriverId).toBe("kz-77");
  });

  it("retourne 404 si aucun convoyeur Kaze ne correspond", async () => {
    mockDb(CONVOYEUR);
    kazeService.getDriverByEmail.mockResolvedValue(null);

    const res = await lier({ kazeEmail: "inconnu@kaze.so" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/email/i);
  });

  it("retourne 409 si le compte Kaze est déjà lié à un autre utilisateur", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/kaze_driver_id = \$1 AND id/i.test(sql))
        return { rows: [{ id: "autre", full_name: "Paul Martin" }] };
    });
    kazeService.getDriverByEmail.mockResolvedValue({ id: "kz-99" });

    const res = await lier({ kazeEmail: "jean@kaze.so" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Paul Martin/);
  });

  it("traduit une erreur de l'API Kaze en 502", async () => {
    mockDb(CONVOYEUR);
    const err = new Error("Bad Gateway");
    err.response = { status: 500 };
    kazeService.getDriverByEmail.mockRejectedValue(err);

    const res = await lier({ kazeEmail: "jean@kaze.so" });

    expect(res.status).toBe(502);
  });
});

// ═════════════════════════════════════════════════════════════
describe("DELETE /api/convoyeur/lier-kaze", () => {
  it("délie le compte Kaze", async () => {
    let requete;
    mockDb(CONVOYEUR, (sql) => {
      if (/UPDATE users/i.test(sql)) requete = sql;
    });

    const res = await auth(request(app).delete("/api/convoyeur/lier-kaze"));

    expect(res.status).toBe(200);
    expect(requete).toMatch(/kaze_driver_id = NULL/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/missions", () => {
  const lister = (user = CONVOYEUR) =>
    auth(request(app).get("/api/convoyeur/missions"), user);

  it("privilégie la source Kaze quand le compte est lié", async () => {
    mockDb(CONVOYEUR);
    kazeService.getMissionsByDriver.mockResolvedValue({
      missions: [{ id: "kz-1" }],
    });

    const res = await lister();

    expect(res.body.source).toBe("kaze");
    expect(res.body.missions).toHaveLength(1);
  });

  it("bascule sur la base locale si Kaze échoue", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql)) return { rows: [{ id: MISSION_ID }] };
    });
    kazeService.getMissionsByDriver.mockRejectedValue(new Error("Kaze HS"));

    const res = await lister();

    expect(res.body.source).toBe("local");
    expect(res.body.missions[0].id).toBe(MISSION_ID);
  });

  it("n'expose jamais le prix client au convoyeur", async () => {
    let requete;
    mockDb(CONVOYEUR_SANS_KAZE, (sql) => {
      if (/FROM missions m/i.test(sql)) {
        requete = sql;
        return { rows: [] };
      }
    });

    await lister(CONVOYEUR_SANS_KAZE);

    expect(requete).toMatch(/m\.price_convoyeur AS price/);
    expect(requete).not.toMatch(/m\.price\b/);
  });

  it("ne retourne que les missions ASSIGNEE ou EN_COURS du convoyeur", async () => {
    let requete;
    let params;
    mockDb(CONVOYEUR_SANS_KAZE, (sql, p) => {
      if (/FROM missions m/i.test(sql)) {
        requete = sql;
        params = p;
        return { rows: [] };
      }
    });

    await lister(CONVOYEUR_SANS_KAZE);

    expect(requete).toMatch(/m\.convoyeur_id = \$1/);
    expect(requete).toMatch(/'ASSIGNEE', 'EN_COURS'/);
    expect(params).toEqual([CONVOYEUR.id]);
  });

  it("laisse les missions livrées au seul onglet Historique", async () => {
    let requete;
    mockDb(CONVOYEUR_SANS_KAZE, (sql) => {
      if (/FROM missions m/i.test(sql)) {
        requete = sql;
        return { rows: [] };
      }
    });

    await lister(CONVOYEUR_SANS_KAZE);

    // Le planning répond à « qu'ai-je à faire ? ». Une mission terminée
    // n'y a plus sa place, même livrée du matin même.
    expect(requete).not.toMatch(/LIVREE/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/missions-disponibles-count", () => {
  const compter = () =>
    auth(request(app).get("/api/convoyeur/missions-disponibles-count"));

  it("retourne le nombre de missions ACCEPTEE sous forme d'entier", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "7" }] };
    });

    const res = await compter();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 7 });
  });

  it("retourne 0 quand aucune mission n'est disponible", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "0" }] };
    });

    const res = await compter();

    expect(res.body.count).toBe(0);
  });

  it("ne compte que le statut ACCEPTEE", async () => {
    let requete;
    mockDb(CONVOYEUR, (sql) => {
      requete = sql;
      return { rows: [{ count: "0" }] };
    });

    await compter();

    expect(requete).toMatch(/status = 'ACCEPTEE'/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/missions-disponibles", () => {
  const lister = () =>
    auth(request(app).get("/api/convoyeur/missions-disponibles"));

  const jobKaze = (extra = {}) => ({
    id: "kz-job-1",
    status: "waiting",
    performer: null,
    reference: "REF-1",
    title: "Convoyage Paris-Lyon",
    steps: [
      { step_type: "start", address: "Paris" },
      { step_type: "end", address: "Lyon" },
    ],
    ...extra,
  });

  beforeEach(() => {
    kazeService.kazeJobToLocal.mockReturnValue({
      status: "ACCEPTEE",
      departure_address: "Paris",
      arrival_address: "Lyon",
      start_date: "2026-08-01",
      end_date: "2026-08-02",
    });
  });

  it("marque les missions locales avec la source dlc", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql)) return { rows: [{ id: MISSION_ID }] };
    });
    kazeService.fetchRecentJobs.mockResolvedValue([]);

    const res = await lister();

    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0].source).toBe("dlc");
  });

  it("ne remonte que les missions non attribuées au statut ACCEPTEE", async () => {
    let requete;
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql)) {
        requete = sql;
        return { rows: [] };
      }
    });
    kazeService.fetchRecentJobs.mockResolvedValue([]);

    await lister();

    expect(requete).toMatch(
      /m\.convoyeur_id IS NULL AND m\.status = 'ACCEPTEE'/,
    );
  });

  it("agrège les jobs Kaze en attente", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [] }));
    kazeService.fetchRecentJobs.mockResolvedValue([jobKaze()]);

    const res = await lister();

    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0]).toMatchObject({
      id: "kaze_kz-job-1",
      source: "kaze",
      departure_address: "Paris",
      arrival_address: "Lyon",
      kaze_reference: "REF-1",
    });
  });

  it("écarte les jobs Kaze déjà attribués ou hors statut waiting", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [] }));
    kazeService.fetchRecentJobs.mockResolvedValue([
      jobKaze({ id: "a", performer: { id: "p1" } }),
      jobKaze({ id: "b", status: "started" }),
    ]);

    const res = await lister();

    expect(res.body.missions).toHaveLength(0);
  });

  it("évite le doublon d'une mission DLC déjà liée à son job Kaze", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql))
        return { rows: [{ id: MISSION_ID, kaze_mission_id: "kz-job-1" }] };
    });
    kazeService.fetchRecentJobs.mockResolvedValue([jobKaze()]);

    const res = await lister();

    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0].source).toBe("dlc");
  });

  it("retourne les missions DLC même si Kaze est indisponible", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql)) return { rows: [{ id: MISSION_ID }] };
    });
    kazeService.fetchRecentJobs.mockRejectedValue(new Error("Kaze HS"));

    const res = await lister();

    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/convoyeur/kaze-missions/:kazeJobId/prendre", () => {
  const prendre = (user = CONVOYEUR) =>
    auth(
      request(app).post("/api/convoyeur/kaze-missions/kz-job-1/prendre"),
      user,
    );

  it("exige un compte lié à Kaze", async () => {
    mockDb(CONVOYEUR_SANS_KAZE);

    const res = await prendre(CONVOYEUR_SANS_KAZE);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pas lié à Kaze/i);
  });

  it("retourne 404 si le job Kaze est introuvable", async () => {
    mockDb(CONVOYEUR);
    kazeService.fetchJob.mockResolvedValue(null);

    const res = await prendre();

    expect(res.status).toBe(404);
  });

  it("refuse si le job n'est plus en attente", async () => {
    mockDb(CONVOYEUR);
    kazeService.fetchJob.mockResolvedValue({ status: "started" });

    const res = await prendre();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/started/);
  });

  it("refuse si le job a déjà un performer", async () => {
    mockDb(CONVOYEUR);
    kazeService.fetchJob.mockResolvedValue({
      status: "waiting",
      performer: { id: "p1" },
    });

    const res = await prendre();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/déjà attribuée/i);
  });

  it("assigne le convoyeur dans Kaze", async () => {
    mockDb(CONVOYEUR);
    kazeService.fetchJob.mockResolvedValue({
      status: "waiting",
      performer: null,
    });
    kazeService.assignDriver.mockResolvedValue(true);

    const res = await prendre();

    expect(res.status).toBe(200);
    expect(kazeService.assignDriver).toHaveBeenCalledWith(
      "kz-job-1",
      "kaze-driver-1",
    );
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/convoyeur/missions/:id/prendre", () => {
  const prendre = (user = CONVOYEUR) =>
    auth(
      request(app).post(`/api/convoyeur/missions/${MISSION_ID}/prendre`),
      user,
    );

  /** Simule la lecture puis la mise à jour optimiste de la mission. */
  function mockPriseDeMission({ mission, updated }) {
    mockDb(mission === null ? CONVOYEUR : CONVOYEUR, (sql) => {
      if (/SELECT \* FROM missions WHERE id/i.test(sql))
        return { rows: mission ? [mission] : [] };
      if (/UPDATE missions SET convoyeur_id/i.test(sql))
        return { rows: updated ? [updated] : [] };
    });
  }

  const disponible = {
    id: MISSION_ID,
    status: "ACCEPTEE",
    convoyeur_id: null,
  };

  it("retourne 404 si la mission n'existe pas", async () => {
    mockPriseDeMission({ mission: null });

    const res = await prendre();

    expect(res.status).toBe(404);
  });

  it("refuse une mission qui n'est pas au statut ACCEPTEE", async () => {
    mockPriseDeMission({ mission: { ...disponible, status: "LIVREE" } });

    const res = await prendre();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/LIVREE/);
  });

  it("refuse une mission déjà attribuée", async () => {
    mockPriseDeMission({
      mission: { ...disponible, convoyeur_id: "autre-convoyeur" },
    });

    const res = await prendre();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/déjà attribuée/i);
  });

  it("retourne 409 en cas de course entre deux convoyeurs", async () => {
    mockPriseDeMission({ mission: disponible, updated: null });

    const res = await prendre();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/entre-temps/i);
  });

  it("attribue la mission puis la synchronise avec Kaze", async () => {
    mockPriseDeMission({
      mission: disponible,
      updated: { ...disponible, status: "ASSIGNEE" },
    });
    syncService.ensureKazeMission.mockResolvedValue("kz-created-1");
    kazeService.assignDriver.mockResolvedValue(true);

    const res = await prendre();

    expect(res.status).toBe(200);
    expect(res.body.kazeSync).toEqual({ synced: true, error: null });
    expect(res.body.mission.kaze_mission_id).toBe("kz-created-1");
    expect(kazeService.assignDriver).toHaveBeenCalledWith(
      "kz-created-1",
      "kaze-driver-1",
    );
  });

  it("signale l'échec de création du job Kaze sans bloquer l'attribution", async () => {
    mockPriseDeMission({
      mission: disponible,
      updated: { ...disponible, status: "ASSIGNEE" },
    });
    syncService.ensureKazeMission.mockResolvedValue(null);

    const res = await prendre();

    expect(res.status).toBe(200);
    expect(res.body.kazeSync.synced).toBe(false);
    expect(res.body.kazeSync.error).toMatch(/n'a pas pu être créée/i);
    expect(kazeService.assignDriver).not.toHaveBeenCalled();
  });

  it("remonte le message d'erreur détaillé de l'API Kaze", async () => {
    mockPriseDeMission({
      mission: disponible,
      updated: { ...disponible, status: "ASSIGNEE" },
    });
    syncService.ensureKazeMission.mockResolvedValue("kz-1");
    const err = new Error("générique");
    err.response = { data: { message: "Performer introuvable" } };
    kazeService.assignDriver.mockRejectedValue(err);

    const res = await prendre();

    expect(res.status).toBe(200);
    expect(res.body.kazeSync.error).toBe("Performer introuvable");
  });

  it("attribue la mission sans toucher à Kaze si le compte n'est pas lié", async () => {
    db.query.mockImplementation(async (sql) => {
      if (isUserLookup(sql)) return { rows: [CONVOYEUR_SANS_KAZE] };
      if (isEtatDossier(sql)) return dossierComplet();
      if (/SELECT \* FROM missions WHERE id/i.test(sql))
        return { rows: [disponible] };
      if (/UPDATE missions SET convoyeur_id/i.test(sql))
        return { rows: [{ ...disponible, status: "ASSIGNEE" }] };
      return { rows: [] };
    });

    const res = await prendre(CONVOYEUR_SANS_KAZE);

    expect(res.status).toBe(200);
    expect(res.body.kazeSync.error).toMatch(/pas lié à Kaze/i);
    expect(syncService.ensureKazeMission).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
// Non-régression : Kaze est la seule source de vérité
// ═════════════════════════════════════════════════════════════
describe("Progression de mission verrouillée côté Kaze", () => {
  it.each([
    ["demarrer", /démarrage n'est pas autorisé/i, /EN_COURS/],
    ["livrer", /clôture n'est pas autorisée/i, /LIVREE/],
  ])(
    "POST /missions/:id/%s renvoie 403 et renvoie vers Kaze",
    async (action, messageAttendu, statutAttendu) => {
      mockDb(CONVOYEUR);

      const res = await auth(
        request(app).post(`/api/convoyeur/missions/${MISSION_ID}/${action}`),
      );

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(messageAttendu);
      expect(res.body.hint).toMatch(statutAttendu);
    },
  );

  it("ne modifie jamais la base lors d'une tentative de démarrage", async () => {
    const requetes = [];
    mockDb(CONVOYEUR, (sql) => {
      requetes.push(sql);
    });

    await auth(
      request(app).post(`/api/convoyeur/missions/${MISSION_ID}/demarrer`),
    );

    expect(requetes.some((sql) => /UPDATE missions/i.test(sql))).toBe(false);
  });

  it("ne modifie jamais la base lors d'une tentative de clôture", async () => {
    const requetes = [];
    mockDb(CONVOYEUR, (sql) => {
      requetes.push(sql);
    });

    await auth(
      request(app).post(`/api/convoyeur/missions/${MISSION_ID}/livrer`),
    );

    expect(requetes.some((sql) => /UPDATE missions/i.test(sql))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/missions/:id — détail", () => {
  const consulter = () =>
    auth(request(app).get(`/api/convoyeur/missions/${MISSION_ID}`));

  it("retourne la mission attribuée au convoyeur", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/FROM missions m/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_name: "Client Test" }] };
    });

    const res = await consulter();

    expect(res.status).toBe(200);
    expect(res.body.mission.client_name).toBe("Client Test");
  });

  it("retourne 404 si la mission n'est pas attribuée à ce convoyeur", async () => {
    mockDb(CONVOYEUR, () => ({ rows: [] }));

    const res = await consulter();

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/non attribuée/i);
  });

  it("filtre la requête sur le convoyeur authentifié", async () => {
    let params;
    mockDb(CONVOYEUR, (sql, p) => {
      if (/FROM missions m/i.test(sql)) {
        params = p;
        return { rows: [{}] };
      }
    });

    await consulter();

    expect(params).toEqual([MISSION_ID, CONVOYEUR.id]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Documents du convoyeur", () => {
  it("liste les documents du convoyeur uniquement", async () => {
    let params;
    mockDb(CONVOYEUR, (sql, p) => {
      // `etatDossier` interroge la même table : on ne retient que la
      // requête de listage, sans quoi les paramètres capturés seraient
      // ceux du contrôle d'éligibilité.
      if (/convoyeur_documents/i.test(sql) && !/type = ANY/i.test(sql)) {
        params = p;
        return { rows: [{ id: "d1", type: "permis", status: "en_attente" }] };
      }
    });

    const res = await auth(request(app).get("/api/convoyeur/documents"));

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(params).toEqual([CONVOYEUR.id]);
  });

  it("refuse un type de document inconnu au téléversement", async () => {
    mockDb(CONVOYEUR);

    const res = await auth(
      request(app).post("/api/convoyeur/documents/passeport"),
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Type de document invalide/i);
  });

  it("refuse un type de document inconnu à la suppression", async () => {
    mockDb(CONVOYEUR);

    const res = await auth(
      request(app).delete("/api/convoyeur/documents/passeport"),
    );

    expect(res.status).toBe(400);
  });

  it("retourne 404 si le document à supprimer n'existe pas", async () => {
    mockDb(CONVOYEUR, (sql) => {
      if (/DELETE FROM convoyeur_documents/i.test(sql)) return { rows: [] };
    });

    const res = await auth(
      request(app).delete("/api/convoyeur/documents/permis"),
    );

    expect(res.status).toBe(404);
  });

  it.each(["permis", "carte_identite", "assurance", "domicile"])(
    "accepte le type de document %s",
    async (type) => {
      mockDb(CONVOYEUR, (sql) => {
        if (/DELETE FROM convoyeur_documents/i.test(sql)) return { rows: [] };
      });

      const res = await auth(
        request(app).delete(`/api/convoyeur/documents/${type}`),
      );

      // 404 (et non 400) prouve que le type a passé la validation
      expect(res.status).toBe(404);
    },
  );
});
