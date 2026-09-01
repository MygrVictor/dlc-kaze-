/**
 * Tests d'intégration — création de mission par l'administration.
 *
 * Le même formulaire sert au client et à l'administration, mais les deux
 * ne produisent pas la même chose :
 *
 *   • un client dépose une demande, qui attend une cotation ;
 *   • un administrateur saisit une mission déjà négociée, qui part
 *     directement en ACCEPTEE — le statut sous lequel les convoyeurs la
 *     voient dans leurs missions disponibles.
 *
 * Ces tests vérifient surtout ce qui sépare les deux chemins, y compris
 * qu'un client ne peut pas emprunter le second en forgeant sa requête.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  createMission: jest.fn(),
  cancelMission: jest.fn(),
  getDriverByEmail: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/email.service", () => ({
  notifyMissionACoter: jest.fn().mockResolvedValue(undefined),
  notifyMissionDisponible: jest.fn().mockResolvedValue(undefined),
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
  notifyNewRegistration: jest.fn().mockResolvedValue(undefined),
  notifyRegistrationReceived: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

jest.mock("../services/telegram.service", () => ({
  actif: true,
  annoncerMissionDisponible: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/whatsapp.service", () => ({
  estActif: jest.fn(() => true),
  normaliserNumero: jest.fn((n) => (n ? String(n).replace(/\D/g, "") : null)),
  notifierMissionDisponible: jest
    .fn()
    .mockResolvedValue({ envoyes: 0, ignores: 0, echecs: 0 }),
}));

jest.mock("../services/devis.service", () => ({
  generateDevisPDF: jest.fn(),
  generateDevisGroupePDF: jest.fn(),
}));

const db = require("../db");
const emailService = require("../services/email.service");
const telegramService = require("../services/telegram.service");
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

const CLIENT_CIBLE = "44444444-4444-4444-4444-444444444444";
const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const tokenFor = (user) =>
  jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

// Les annonces aux convoyeurs partent après l'envoi de la réponse HTTP.
const viderTachesDeFond = () =>
  new Promise((resolve) => setTimeout(resolve, 20));

const estLectureUtilisateur = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

const corpsMinimal = {
  vehicles: [{ plate: "AA-123-BB" }],
  departureAddress: "1 rue A, Paris",
  arrivalAddress: "2 rue B, Lyon",
};

/**
 * Installe le mock de `db.query` et retourne l'objet dans lequel les
 * paramètres de l'insertion seront capturés.
 */
function preparerBase(utilisateur, { clientExiste = true } = {}) {
  const capture = {};
  db.query.mockImplementation(async (sql, params) => {
    if (estLectureUtilisateur(sql)) return { rows: [utilisateur] };
    if (/AND role = 'client'/i.test(sql))
      return { rows: clientExiste ? [{ id: CLIENT_CIBLE }] : [] };
    if (/INSERT INTO missions/i.test(sql)) {
      capture.sql = sql;
      capture.params = params;
      return { rows: [{ id: MISSION_ID, status: "ACCEPTEE" }] };
    }
    return { rows: [] };
  });
  return capture;
}

const creer = (corps, utilisateur = ADMIN) =>
  request(app)
    .post("/api/missions")
    .set("Authorization", `Bearer ${tokenFor(utilisateur)}`)
    .send(corps);

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();
  telegramService.actif = true;
  telegramService.annoncerMissionDisponible.mockResolvedValue(undefined);
  emailService.notifyMissionACoter.mockResolvedValue(undefined);
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

describe("POST /api/missions — saisie administrative", () => {
  it("publie la mission auprès des convoyeurs, sans cotation", async () => {
    const capture = preparerBase(ADMIN);

    const res = await creer({
      ...corpsMinimal,
      clientId: CLIENT_CIBLE,
      priceConvoyeur: 180,
    });

    expect(res.status).toBe(201);
    // C'est le statut qui décide de la visibilité côté convoyeur.
    expect(capture.params).toContain("ACCEPTEE");
    expect(capture.params[0]).toBe(CLIENT_CIBLE);
  });

  it("accepte une mission sans commanditaire enregistré", async () => {
    const capture = preparerBase(ADMIN);

    const res = await creer({ ...corpsMinimal, priceConvoyeur: 150 });

    expect(res.status).toBe(201);
    expect(capture.params[0]).toBeNull();
  });

  it("refuse une mission sans rémunération convoyeur", async () => {
    preparerBase(ADMIN);

    const res = await creer(corpsMinimal);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rémunération/i);
  });

  it("refuse un commanditaire introuvable", async () => {
    preparerBase(ADMIN, { clientExiste: false });

    const res = await creer({
      ...corpsMinimal,
      clientId: CLIENT_CIBLE,
      priceConvoyeur: 180,
    });

    expect(res.status).toBe(404);
  });

  it("annonce la mission aux convoyeurs", async () => {
    preparerBase(ADMIN);

    await creer({ ...corpsMinimal, priceConvoyeur: 180 });
    await viderTachesDeFond();

    expect(telegramService.annoncerMissionDisponible).toHaveBeenCalledTimes(1);
  });

  it("n'alerte pas l'administration d'une mission à coter", async () => {
    preparerBase(ADMIN);

    await creer({ ...corpsMinimal, priceConvoyeur: 180 });
    await viderTachesDeFond();

    expect(emailService.notifyMissionACoter).not.toHaveBeenCalled();
  });

  it("ignore les champs administratifs envoyés par un client", async () => {
    const capture = preparerBase(CLIENT);

    const res = await creer(
      { ...corpsMinimal, clientId: CLIENT_CIBLE, priceConvoyeur: 9999 },
      CLIENT,
    );

    expect(res.status).toBe(201);
    // Le commanditaire reste l'auteur, la mission attend une cotation.
    expect(capture.params[0]).toBe(CLIENT.id);
    expect(capture.params).toContain("EN_ATTENTE_DE_COTATION");
    expect(capture.params).not.toContain(9999);
  });

  it("alerte l'administration quand c'est un client qui dépose", async () => {
    preparerBase(CLIENT);

    await creer(corpsMinimal, CLIENT);
    await viderTachesDeFond();

    expect(emailService.notifyMissionACoter).toHaveBeenCalledTimes(1);
    expect(telegramService.annoncerMissionDisponible).not.toHaveBeenCalled();
  });
});
