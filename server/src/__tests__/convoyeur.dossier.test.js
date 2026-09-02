/**
 * Éligibilité du convoyeur — dossier de pièces justificatives.
 *
 * Un convoyeur ne peut se voir confier un véhicule qu'une fois ses cinq
 * pièces déposées : sans elles, ni son identité, ni son droit de conduire,
 * ni sa couverture d'assurance ne sont établis. Le contrôle vit côté
 * serveur, l'interface ne faisant qu'en rendre compte.
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
const app = require("./app.test-setup");

const CONVOYEUR = {
  id: "44444444-4444-4444-4444-444444444444",
  email: "convoyeur@test.com",
  full_name: "Convoyeur Test",
  phone: "0612345678",
  role: "convoyeur",
  is_validated: true,
  kaze_driver_id: "kaze-driver-1",
};

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REQUIS = [
  "permis",
  "carte_identite",
  "rc_circulation",
  "rc_pro",
  "domicile",
];

const token = jwt.sign({ userId: CONVOYEUR.id }, process.env.JWT_SECRET);
const auth = (req) => req.set("Authorization", `Bearer ${token}`);

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

/**
 * @param docs pièces déposées, sous la forme [{ type, status }]
 */
function mockAvecDossier(docs) {
  db.query.mockImplementation(async (sql) => {
    if (isUserLookup(sql)) return { rows: [CONVOYEUR] };
    if (/FROM convoyeur_documents/i.test(sql)) return { rows: docs };
    if (/SELECT \* FROM missions WHERE id/i.test(sql))
      return {
        rows: [{ id: MISSION_ID, status: "ACCEPTEE", convoyeur_id: null }],
      };
    if (/UPDATE missions SET convoyeur_id/i.test(sql))
      return { rows: [{ id: MISSION_ID, status: "ASSIGNEE" }] };
    return { rows: [] };
  });
}

const complet = () => REQUIS.map((type) => ({ type, status: "valide" }));

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();
  kazeService.fetchJob.mockResolvedValue({
    status: "waiting",
    performer: null,
  });
  kazeService.assignDriver.mockResolvedValue(true);
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

const prendreMission = () =>
  auth(request(app).post(`/api/convoyeur/missions/${MISSION_ID}/prendre`));

const prendreKaze = () =>
  auth(request(app).post("/api/convoyeur/kaze-missions/kz-1/prendre"));

// ═════════════════════════════════════════════════════════════
describe("Prise de mission conditionnée au dossier", () => {
  it("refuse un convoyeur qui n'a déposé aucune pièce", async () => {
    mockAvecDossier([]);

    const res = await prendreMission();

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/dossier est incomplet/i);
    expect(res.body.documentsManquants).toEqual(REQUIS);
  });

  it("refuse tant qu'une seule pièce manque", async () => {
    mockAvecDossier(complet().filter((d) => d.type !== "rc_pro"));

    const res = await prendreMission();

    expect(res.status).toBe(403);
    expect(res.body.documentsManquants).toEqual(["rc_pro"]);
  });

  it("autorise dès que les cinq pièces sont déposées", async () => {
    mockAvecDossier(complet());

    const res = await prendreMission();

    expect(res.status).toBe(200);
  });

  it("accepte une pièce en attente de vérification", async () => {
    // Exiger la validation manuelle immobiliserait les convoyeurs le
    // week-end, quand personne n'est là pour valider et que les missions
    // urgentes tombent. Le dépôt suffit.
    mockAvecDossier(REQUIS.map((type) => ({ type, status: "en_attente" })));

    const res = await prendreMission();

    expect(res.status).toBe(200);
  });

  it("traite une pièce refusée comme absente", async () => {
    const docs = complet();
    docs.find((d) => d.type === "permis").status = "refuse";
    mockAvecDossier(docs);

    const res = await prendreMission();

    expect(res.status).toBe(403);
    expect(res.body.documentsManquants).toEqual(["permis"]);
  });

  it("ne touche jamais à la base quand le dossier est incomplet", async () => {
    const requetes = [];
    db.query.mockImplementation(async (sql) => {
      requetes.push(sql);
      if (isUserLookup(sql)) return { rows: [CONVOYEUR] };
      return { rows: [] };
    });

    await prendreMission();

    expect(requetes.some((sql) => /UPDATE missions/i.test(sql))).toBe(false);
  });

  it("applique la même règle aux missions Kaze", async () => {
    // Sans cela, un convoyeur sans dossier contournerait le contrôle en
    // passant par les annonces Kaze.
    mockAvecDossier([]);

    const res = await prendreKaze();

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/dossier est incomplet/i);
    expect(kazeService.assignDriver).not.toHaveBeenCalled();
  });

  it("laisse passer une mission Kaze si le dossier est complet", async () => {
    mockAvecDossier(complet());

    const res = await prendreKaze();

    expect(res.status).toBe(200);
    expect(kazeService.assignDriver).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/convoyeur/documents — état du dossier", () => {
  it("joint l'état du dossier à la liste des pièces", async () => {
    // L'interface a besoin de ce verdict pour afficher son bandeau ; le
    // recalculer côté client dupliquerait la règle, avec le risque
    // qu'elle diverge.
    mockAvecDossier(complet().filter((d) => d.type !== "domicile"));

    const res = await auth(request(app).get("/api/convoyeur/documents"));

    expect(res.status).toBe(200);
    expect(res.body.dossier).toMatchObject({
      requis: 5,
      deposes: 4,
      manquants: ["domicile"],
      complet: false,
    });
  });

  it("signale un dossier complet", async () => {
    mockAvecDossier(complet());

    const res = await auth(request(app).get("/api/convoyeur/documents"));

    expect(res.body.dossier.complet).toBe(true);
    expect(res.body.dossier.manquants).toEqual([]);
  });

  it("distingue les pièces refusées des pièces absentes", async () => {
    const docs = complet();
    docs.find((d) => d.type === "rc_circulation").status = "refuse";
    mockAvecDossier(docs);

    const res = await auth(request(app).get("/api/convoyeur/documents"));

    expect(res.body.dossier.refuses).toEqual(["rc_circulation"]);
    expect(res.body.dossier.manquants).toEqual(["rc_circulation"]);
  });
});
