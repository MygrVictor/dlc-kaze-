/**
 * Tests d'intégration — mission.routes
 *
 * Couvre l'intégralité du cycle de vie côté client :
 *   POST   /api/missions            création (34 champs, multi-véhicules)
 *   GET    /api/missions/mes-missions   listing + pagination
 *   GET    /api/missions/:id        détail + cloisonnement des accès
 *   GET    /api/missions/:id/devis  génération du PDF
 *   POST   /api/missions/:id/accepter  acceptation + création Kaze
 *   POST   /api/missions/:id/annuler   annulation + sync Kaze
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock("../services/kaze.service", () => ({
  createMission: jest.fn(),
  cancelMission: jest.fn(),
  getDriverByEmail: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/email.service", () => ({
  notifyMissionDisponible: jest.fn().mockResolvedValue(undefined),
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
  notifyNewRegistration: jest.fn().mockResolvedValue(undefined),
  notifyRegistrationReceived: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

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
const kazeService = require("../services/kaze.service");
const emailService = require("../services/email.service");
const whatsappService = require("../services/whatsapp.service");
const {
  generateDevisPDF,
  generateDevisGroupePDF,
} = require("../services/devis.service");
const app = require("./app.test-setup");

const CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "client@test.com",
  full_name: "Client Test",
  role: "client",
  is_validated: true,
  kaze_driver_id: null,
};

const AUTRE_CLIENT = {
  ...CLIENT,
  id: "22222222-2222-2222-2222-222222222222",
  email: "autre@test.com",
};

const ADMIN = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "admin@test.com",
  full_name: "Admin Test",
  role: "admin",
  is_validated: true,
  kaze_driver_id: null,
};

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function tokenFor(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
}

/**
 * Les notifications aux convoyeurs sont déclenchées en arrière-plan, après
 * l'envoi de la réponse HTTP : on laisse la boucle d'événements les traiter.
 */
const flushBackgroundTasks = () =>
  new Promise((resolve) => setTimeout(resolve, 20));

const isUserLookup = (sql) =>
  /FROM users WHERE id = \$1/i.test(sql) && /is_validated/i.test(sql);

/**
 * Installe le mock de `db.query` :
 *   - la requête d'authentification renvoie toujours `user`
 *   - les autres requêtes sont déléguées à `handler`
 */
function mockDb(user, handler = () => ({ rows: [] })) {
  db.query.mockImplementation(async (sql, params) => {
    if (isUserLookup(sql)) return { rows: user ? [user] : [] };
    return handler(sql, params) || { rows: [] };
  });
}

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();

  // `clearAllMocks` n'efface que l'historique des appels : sans ces valeurs par
  // défaut, un `mockRejectedValue` fuiterait vers les tests suivants.
  kazeService.createMission.mockResolvedValue({ id: "kz-default" });
  kazeService.cancelMission.mockResolvedValue(undefined);
  emailService.notifyMissionDisponible.mockResolvedValue(undefined);
  whatsappService.notifierMissionDisponible.mockResolvedValue({
    envoyes: 0,
    ignores: 0,
    echecs: 0,
  });

  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

// ═════════════════════════════════════════════════════════════
describe("Authentification et validation des paramètres", () => {
  it("refuse l'accès sans token", async () => {
    const res = await request(app).get("/api/missions/mes-missions");
    expect(res.status).toBe(401);
  });

  it("refuse un token invalide", async () => {
    const res = await request(app)
      .get("/api/missions/mes-missions")
      .set("Authorization", "Bearer token-bidon");
    expect(res.status).toBe(401);
  });

  it("refuse un identifiant de mission non-UUID", async () => {
    mockDb(CLIENT);
    const res = await request(app)
      .get("/api/missions/pas-un-uuid")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalide/i);
  });

  it("interdit à un convoyeur de créer une mission", async () => {
    mockDb({ ...CLIENT, role: "convoyeur" });
    const res = await request(app)
      .post("/api/missions")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`)
      .send({ departureAddress: "Paris", arrivalAddress: "Lyon" });
    expect(res.status).toBe(403);
  });

  it("interdit la création à un client non validé", async () => {
    mockDb({ ...CLIENT, is_validated: false });
    const res = await request(app)
      .post("/api/missions")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`)
      .send({ departureAddress: "Paris", arrivalAddress: "Lyon" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/validé/i);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/missions — création", () => {
  const creer = (payload) =>
    request(app)
      .post("/api/missions")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`)
      .send(payload);

  it("refuse si l'adresse de départ est absente", async () => {
    mockDb(CLIENT);
    const res = await creer({ arrivalAddress: "Lyon" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/adresses/i);
  });

  it("refuse si l'adresse d'arrivée est absente", async () => {
    mockDb(CLIENT);
    const res = await creer({ departureAddress: "Paris" });
    expect(res.status).toBe(400);
  });

  it("crée une mission au statut EN_ATTENTE_DE_COTATION", async () => {
    mockDb(CLIENT, (sql) => {
      if (/INSERT INTO missions/i.test(sql))
        return { rows: [{ id: MISSION_ID, status: "EN_ATTENTE_DE_COTATION" }] };
    });

    const res = await creer({
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(res.body.missions[0].status).toBe("EN_ATTENTE_DE_COTATION");
  });

  it("persiste les 34 champs alignés sur le formulaire Kaze", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      vehicles: [
        {
          plate: "AA-123-BB",
          vin: "VF1TEST0000000001",
          brand: "Renault",
          model: "Clio",
          vehicleType: "berline",
          energy: "Diesel",
        },
      ],
      departureAddress: "10 Rue de Rivoli, Paris",
      departureStructure: "Concession",
      departureStructureName: "NET AUTO",
      departureContactName: "Alys",
      departureContactPhone: "0251788871",
      departureContactEmail: "depart@netauto.fr",
      departureInstructions: "Code portail 1234",
      arrivalAddress: "1 Place Bellecour, Lyon",
      arrivalContactName: "Ludovic",
      arrivalContactPhone: "0631793544",
      arrivalContactEmail: "arrivee@grdf.fr",
      arrivalInstructions: "Avant 17h",
      serviceRefuel: true,
      serviceDocumentManagement: "Carte grise",
      retributionDetails: "Péage à avancer",
      emergencyContactName: "DLC Urgence",
      emergencyPhone: "0669583430",
      emergencyContactEmail: "urgence@dlc.fr",
      comments: "Livraison délicate",
    });

    // 34 champs du formulaire + date souhaitée + urgence + identifiant
    // de lot + destinataire du récapitulatif + statut initial + les deux
    // prix et l'auteur, réservés à la saisie administrative.
    expect(params).toHaveLength(42);
    expect(params).toEqual(
      expect.arrayContaining([
        CLIENT.id,
        "AA-123-BB",
        "Renault",
        "Concession",
        "NET AUTO",
        "depart@netauto.fr",
        "Code portail 1234",
        "arrivee@grdf.fr",
        "Avant 17h",
        "Carte grise",
        "Péage à avancer",
        "DLC Urgence",
        "urgence@dlc.fr",
      ]),
    );
  });

  it("persiste le destinataire du récapitulatif choisi par le client", async () => {
    // Cette adresse commande à qui Kaze enverra le PV, les photos et
    // les réserves à la livraison.
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
      recapEmail: "compta@entreprise.fr",
    });

    expect(params).toContain("compta@entreprise.fr");
  });

  it("enregistre NULL quand le client ne fournit pas d'adresse", async () => {
    // Le service Kaze retombera sur l'email du compte : une chaîne vide
    // passerait la garde et priverait la mission de récapitulatif.
    let sqlVu;
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        sqlVu = sql;
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
      recapEmail: "",
    });

    expect(sqlVu).toMatch(/recap_email/);
    expect(params[params.length - 1]).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
//  Date opérationnelle, souhait du client et urgence
// ═════════════════════════════════════════════════════════════
describe("POST /api/missions — dates et urgence", () => {
  const { lundiDeLaSemaine } = require("../lib/dates");

  const creer = (payload) =>
    request(app)
      .post("/api/missions")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`)
      .send(payload);

  /** Capture les paramètres de l'INSERT. */
  const capturer = () => {
    const capture = {};
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        capture.params = p;
        capture.sql = sql;
        return { rows: [{ id: MISSION_ID }] };
      }
    });
    return capture;
  };

  const BASE = {
    vehicles: [{ plate: "AA-123-BB" }],
    departureAddress: "10 rue de Rivoli, Paris",
    arrivalAddress: "1 place Bellecour, Lyon",
  };

  /** Index des colonnes concernées dans l'INSERT. */
  const INDEX = {
    departureDate: 13,
    arrivalDate: 21,
    desiredDeliveryDate: 34,
    isUrgent: 35,
  };

  it("date l'enlèvement au lundi de la semaine en cours", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.params[INDEX.departureDate]).toEqual(lundiDeLaSemaine());
  });

  it("date la livraison au lundi de la semaine en cours", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.params[INDEX.arrivalDate]).toEqual(lundiDeLaSemaine());
  });

  it("produit toujours un lundi", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.params[INDEX.departureDate].getDay()).toBe(1);
  });

  it("ignore la date envoyée par le client pour les dates opérationnelles", async () => {
    const capture = capturer();
    await creer({
      ...BASE,
      departureDate: "2030-01-15",
      arrivalDate: "2030-01-20",
    });

    expect(capture.params[INDEX.departureDate]).toEqual(lundiDeLaSemaine());
    expect(capture.params[INDEX.arrivalDate]).toEqual(lundiDeLaSemaine());
  });

  it("conserve la date souhaitée par le client à part", async () => {
    const capture = capturer();
    await creer({ ...BASE, desiredDeliveryDate: "2026-08-14" });

    expect(capture.params[INDEX.desiredDeliveryDate]).toBe("2026-08-14");
  });

  it("n'impose pas de date souhaitée", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.params[INDEX.desiredDeliveryDate]).toBeNull();
  });

  it("n'utilise jamais la date souhaitée comme date opérationnelle", async () => {
    const capture = capturer();
    await creer({ ...BASE, desiredDeliveryDate: "2030-12-25" });

    expect(capture.params[INDEX.departureDate]).not.toBe("2030-12-25");
    expect(capture.params[INDEX.arrivalDate]).not.toBe("2030-12-25");
  });

  it("enregistre une mission non urgente par défaut", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.params[INDEX.isUrgent]).toBe(false);
  });

  it("enregistre l'urgence déclarée par le client", async () => {
    const capture = capturer();
    await creer({ ...BASE, isUrgent: true });

    expect(capture.params[INDEX.isUrgent]).toBe(true);
  });

  it("normalise une urgence transmise en chaîne", async () => {
    const capture = capturer();
    await creer({ ...BASE, isUrgent: "true" });

    expect(capture.params[INDEX.isUrgent]).toBe(true);
  });

  it("accepte une urgence sans date souhaitée", async () => {
    const capture = capturer();
    const res = await creer({ ...BASE, isUrgent: true });

    expect(res.status).toBe(201);
    expect(capture.params[INDEX.desiredDeliveryDate]).toBeNull();
  });

  it("écrit les deux nouvelles colonnes", async () => {
    const capture = capturer();
    await creer(BASE);

    expect(capture.sql).toMatch(/desired_delivery_date/);
    expect(capture.sql).toMatch(/is_urgent/);
  });

  describe("gabarit du véhicule", () => {
    const INDEX_VEHICULE = {
      type: 9,
      utility12m3: 10,
      tollClass: 11,
    };

    it("persiste le gabarit choisi par le client", async () => {
      const capture = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "L3H3" }] });

      expect(capture.params[INDEX_VEHICULE.type]).toBe("L3H3");
    });

    it("déduit la classe de péage du gabarit", async () => {
      const capture = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "L3H3" }] });

      expect(capture.params[INDEX_VEHICULE.tollClass]).toBe("2");
    });

    it("classe un toit bas en classe 1 et un poids lourd en classe 3", async () => {
      const bas = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "L1H1" }] });
      expect(bas.params[INDEX_VEHICULE.tollClass]).toBe("1");

      const lourd = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "poids_lourd" }] });
      expect(lourd.params[INDEX_VEHICULE.tollClass]).toBe("3");
    });

    it("déduit le dépassement des 12 m³ du gabarit", async () => {
      const grand = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "L2H2" }] });
      expect(grand.params[INDEX_VEHICULE.utility12m3]).toBe("OUI");

      const petit = capturer();
      await creer({ ...BASE, vehicles: [{ vehicleType: "L1H1" }] });
      expect(petit.params[INDEX_VEHICULE.utility12m3]).toBe("NON");
    });

    it("ignore un volume envoyé par le client au profit du gabarit", async () => {
      const capture = capturer();
      await creer({
        ...BASE,
        vehicles: [{ vehicleType: "L1H1", utility12m3: "OUI" }],
      });

      expect(capture.params[INDEX_VEHICULE.utility12m3]).toBe("NON");
    });

    it("reste tolérant quand aucun type n'est fourni", async () => {
      const capture = capturer();
      const res = await creer({ ...BASE, vehicles: [{ plate: "AA-123-BB" }] });

      expect(res.status).toBe(201);
      expect(capture.params[INDEX_VEHICULE.type]).toBeNull();
      expect(capture.params[INDEX_VEHICULE.utility12m3]).toBe("NON");
      expect(capture.params[INDEX_VEHICULE.tollClass]).toBe("1");
    });
  });

  describe("services proposés à la création", () => {
    const INDEX_SERVICES = {
      refuel: 26,
      documentManagement: 27,
      handover: 28,
    };

    it("persiste les trois services retenus", async () => {
      const capture = capturer();
      await creer({
        ...BASE,
        serviceRefuel: true,
        serviceDocumentManagement: "Carte grise",
        serviceHandover: true,
      });

      expect(capture.params[INDEX_SERVICES.refuel]).toBe(true);
      expect(capture.params[INDEX_SERVICES.documentManagement]).toBe(
        "Carte grise",
      );
      expect(capture.params[INDEX_SERVICES.handover]).toBe(true);
    });

    it("laisse les trois services à leur valeur neutre par défaut", async () => {
      const capture = capturer();
      await creer(BASE);

      expect(capture.params[INDEX_SERVICES.refuel]).toBe(false);
      expect(capture.params[INDEX_SERVICES.documentManagement]).toBeNull();
      expect(capture.params[INDEX_SERVICES.handover]).toBe(false);
    });

    it("normalise une mise en main transmise en chaîne", async () => {
      const capture = capturer();
      await creer({ ...BASE, serviceHandover: "true" });

      expect(capture.params[INDEX_SERVICES.handover]).toBe(true);
    });

    it("n'écrit plus le lavage extérieur ni le nettoyage intérieur", async () => {
      const capture = capturer();
      await creer(BASE);

      expect(capture.sql).not.toMatch(/service_wash_exterior/);
      expect(capture.sql).not.toMatch(/service_clean_interior/);
    });

    it("ignore ces deux services même s'ils sont encore envoyés", async () => {
      const capture = capturer();
      const res = await creer({
        ...BASE,
        serviceWashExterior: true,
        serviceCleanInterior: true,
      });

      expect(res.status).toBe(201);
      expect(capture.params).toHaveLength(42);
      expect(capture.sql).toMatch(/service_handover/);
    });
  });

  it("applique la même date à tous les véhicules d'une commande groupée", async () => {
    const dates = [];
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        dates.push(p[INDEX.departureDate]);
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      ...BASE,
      vehicles: [{ plate: "AA-111-AA" }, { plate: "BB-222-BB" }],
    });

    expect(dates).toHaveLength(2);
    expect(dates[0]).toEqual(dates[1]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/missions — variantes de véhicules", () => {
  const creer = (payload) =>
    request(app)
      .post("/api/missions")
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`)
      .send(payload);

  it("crée une mission par véhicule fourni", async () => {
    mockDb(CLIENT, (sql) => {
      if (/INSERT INTO missions/i.test(sql)) return { rows: [{ id: "m" }] };
    });

    const res = await creer({
      vehicles: [{ plate: "AA-111-AA" }, { plate: "BB-222-BB" }],
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    expect(res.body.message).toMatch(/2 missions/);
  });

  it("accepte les champs véhicule à plat (rétrocompatibilité)", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({
      vehiclePlate: "CC-333-CC",
      vehicleBrand: "Peugeot",
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
    });

    expect(params).toContain("CC-333-CC");
    expect(params).toContain("Peugeot");
  });

  it("applique 1 clé par défaut quand la valeur n'est pas fournie", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/INSERT INTO missions/i.test(sql)) {
        params = p;
        return { rows: [{ id: MISSION_ID }] };
      }
    });

    await creer({ departureAddress: "Paris", arrivalAddress: "Lyon" });

    // client_id, plate, vin, brand, model, finish, energy, state, keys
    expect(params[8]).toBe(1);
  });

  it("propage une erreur base de données au gestionnaire d'erreurs", async () => {
    mockDb(CLIENT, (sql) => {
      if (/INSERT INTO missions/i.test(sql))
        throw new Error("colonne inexistante");
    });

    const res = await creer({
      departureAddress: "Paris",
      arrivalAddress: "Lyon",
    });

    expect(res.status).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/missions/mes-missions", () => {
  const lister = (qs = "") =>
    request(app)
      .get(`/api/missions/mes-missions${qs}`)
      .set("Authorization", `Bearer ${tokenFor(CLIENT)}`);

  it("retourne les missions du client avec la pagination", async () => {
    mockDb(CLIENT, (sql) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "3" }] };
      if (/FROM missions/i.test(sql))
        return { rows: [{ id: MISSION_ID }, { id: "m2" }, { id: "m3" }] };
    });

    const res = await lister();

    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(3);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });

  it("filtre par statut quand il est fourni", async () => {
    const appels = [];
    mockDb(CLIENT, (sql, params) => {
      appels.push({ sql, params });
      if (/COUNT/i.test(sql)) return { rows: [{ count: "1" }] };
      return { rows: [] };
    });

    await lister("?status=LIVREE");

    const requeteListe = appels.find((a) => !/COUNT/i.test(a.sql));
    expect(requeteListe.sql).toMatch(/AND status = \$2/);
    expect(requeteListe.params).toContain("LIVREE");
  });

  it("plafonne la limite à 100 résultats", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "0" }] };
      params = p;
      return { rows: [] };
    });

    await lister("?limit=5000");

    expect(params).toContain(100);
  });

  it("calcule correctement l'offset de pagination", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "0" }] };
      params = p;
      return { rows: [] };
    });

    await lister("?page=3&limit=10");

    expect(params[params.length - 1]).toBe(20);
  });

  it("cloisonne la requête sur le client authentifié", async () => {
    let params;
    mockDb(CLIENT, (sql, p) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: "0" }] };
      params = p;
      return { rows: [] };
    });

    await lister();

    expect(params[0]).toBe(CLIENT.id);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/missions/:id — détail", () => {
  const consulter = (user) =>
    request(app)
      .get(`/api/missions/${MISSION_ID}`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

  it("retourne la mission du client propriétaire", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id }] };
    });

    const res = await consulter(CLIENT);

    expect(res.status).toBe(200);
    expect(res.body.mission.id).toBe(MISSION_ID);
  });

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(CLIENT, () => ({ rows: [] }));

    const res = await consulter(CLIENT);

    expect(res.status).toBe(404);
  });

  it("interdit à un client d'accéder à la mission d'un autre", async () => {
    mockDb(AUTRE_CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id }] };
    });

    const res = await consulter(AUTRE_CLIENT);

    expect(res.status).toBe(403);
  });

  it("autorise un admin à consulter n'importe quelle mission", async () => {
    mockDb(ADMIN, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id }] };
    });

    const res = await consulter(ADMIN);

    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════
describe("GET /api/missions/:id/devis", () => {
  const telecharger = (user) =>
    request(app)
      .get(`/api/missions/${MISSION_ID}/devis`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

  /** Simule un document PDFKit minimal. */
  function fakePdf() {
    return {
      pipe: (res) => res.end(Buffer.from("%PDF-1.4 factice")),
      end: () => {},
    };
  }

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(CLIENT, () => ({ rows: [] }));
    const res = await telecharger(CLIENT);
    expect(res.status).toBe(404);
  });

  it("refuse si aucun prix n'a été proposé", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [{ id: MISSION_ID, client_id: CLIENT.id, price: null }],
        };
    });

    const res = await telecharger(CLIENT);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/devis/i);
  });

  it("interdit l'accès au devis d'un autre client", async () => {
    mockDb(AUTRE_CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id, price: 450 }] };
    });

    const res = await telecharger(AUTRE_CLIENT);

    expect(res.status).toBe(403);
  });

  it("génère le PDF avec les bons en-têtes", async () => {
    generateDevisPDF.mockReturnValue(fakePdf());
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID, client_id: CLIENT.id, price: 450 }] };
      if (/FROM users WHERE id/i.test(sql))
        return { rows: [{ full_name: "Client Test", email: CLIENT.email }] };
    });

    const res = await telecharger(CLIENT);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/devis-DEV-/);
    expect(generateDevisPDF).toHaveBeenCalled();
  });

  // Plusieurs véhicules déclarés ensemble = une seule affaire : le client
  // doit recevoir un document unique portant le total, pas un PDF par
  // véhicule qu'il devrait télécharger puis additionner lui-même.
  const BATCH_ID = "22222222-2222-2222-2222-222222222222";

  it("regroupe les missions du même lot dans un devis unique", async () => {
    generateDevisGroupePDF.mockReturnValue(fakePdf());
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [
            {
              id: MISSION_ID,
              client_id: CLIENT.id,
              price: 450,
              batch_id: BATCH_ID,
            },
          ],
        };
      if (/WHERE batch_id/i.test(sql))
        return {
          rows: [
            { id: MISSION_ID, price: 450, batch_id: BATCH_ID },
            { id: "33333333-3333-3333-3333-333333333333", price: 550 },
          ],
        };
      if (/FROM users WHERE id/i.test(sql))
        return { rows: [{ full_name: "Client Test", email: CLIENT.email }] };
    });

    const res = await telecharger(CLIENT);

    expect(res.status).toBe(200);
    expect(generateDevisGroupePDF).toHaveBeenCalled();
    expect(generateDevisPDF).not.toHaveBeenCalled();
    expect(generateDevisGroupePDF.mock.calls[0][0]).toHaveLength(2);
  });

  it("reste sur le devis simple si le lot ne compte qu'une mission cotée", async () => {
    generateDevisPDF.mockReturnValue(fakePdf());
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [
            {
              id: MISSION_ID,
              client_id: CLIENT.id,
              price: 450,
              batch_id: BATCH_ID,
            },
          ],
        };
      // Les autres véhicules du lot ne sont pas encore cotés : les
      // additionner donnerait un total faux.
      if (/WHERE batch_id/i.test(sql))
        return { rows: [{ id: MISSION_ID, price: 450, batch_id: BATCH_ID }] };
      if (/FROM users WHERE id/i.test(sql))
        return { rows: [{ full_name: "Client Test", email: CLIENT.email }] };
    });

    const res = await telecharger(CLIENT);

    expect(res.status).toBe(200);
    expect(generateDevisPDF).toHaveBeenCalled();
    expect(generateDevisGroupePDF).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/missions/:id/accepter", () => {
  const accepter = (user = CLIENT) =>
    request(app)
      .post(`/api/missions/${MISSION_ID}/accepter`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

  /**
   * Prépare `db.transaction` avec un client transactionnel simulé.
   * `missionRow` est la ligne renvoyée par le SELECT ... FOR UPDATE.
   */
  function mockTransaction(missionRow) {
    const clientQueries = [];
    db.transaction.mockImplementation(async (callback) => {
      const trxClient = {
        query: jest.fn(async (sql, params) => {
          clientQueries.push({ sql, params });
          if (/FOR UPDATE/i.test(sql))
            return { rows: missionRow ? [missionRow] : [] };
          return { rows: [] };
        }),
      };
      return callback(trxClient);
    });
    return clientQueries;
  }

  it("refuse si la mission n'existe pas", async () => {
    mockDb(CLIENT);
    mockTransaction(null);

    const res = await accepter();

    expect(res.status).toBe(404);
  });

  it("refuse si la mission appartient à un autre client", async () => {
    mockDb(AUTRE_CLIENT);
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });

    const res = await accepter(AUTRE_CLIENT);

    expect(res.status).toBe(403);
  });

  it("refuse si le statut n'est pas DEVIS_PROPOSE", async () => {
    mockDb(CLIENT);
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "EN_ATTENTE_DE_COTATION",
    });

    const res = await accepter();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/EN_ATTENTE_DE_COTATION/);
  });

  it("passe la mission en ACCEPTEE et crée le job Kaze", async () => {
    mockDb(CLIENT, (sql) => {
      if (/role = 'convoyeur'/i.test(sql)) return { rows: [] };
      if (/FROM missions WHERE id/i.test(sql)) return { rows: [] };
    });
    const queries = mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockResolvedValue({ id: "kaze-job-1" });

    const res = await accepter();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ACCEPTEE",
      kazeMissionId: "kaze-job-1",
    });
    expect(kazeService.createMission).toHaveBeenCalled();
    expect(queries.some((q) => /SET status = 'ACCEPTEE'/i.test(q.sql))).toBe(
      true,
    );
    expect(queries.some((q) => /SET kaze_mission_id/i.test(q.sql))).toBe(true);
  });

  it("accepte la mission localement même si Kaze est indisponible", async () => {
    mockDb(CLIENT, () => ({ rows: [] }));
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockRejectedValue(new Error("Kaze HS"));

    const res = await accepter();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTEE");
    expect(res.body.kazeMissionId).toBeNull();
  });

  it("notifie tous les convoyeurs de la mission disponible", async () => {
    const mission = { id: MISSION_ID, vehicle_plate: "AA-123-BB" };
    const convoyeurs = [
      { id: "c1", email: "c1@test.com", full_name: "C1", phone: "0612345678" },
      { id: "c2", email: "c2@test.com", full_name: "C2", phone: "0698765432" },
    ];
    mockDb(CLIENT, (sql) => {
      if (/role = 'convoyeur'/i.test(sql)) return { rows: convoyeurs };
      if (/FROM missions WHERE id/i.test(sql)) return { rows: [mission] };
    });
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockResolvedValue({ id: "kaze-job-1" });

    await accepter();
    await flushBackgroundTasks();

    expect(whatsappService.notifierMissionDisponible).toHaveBeenCalledWith(
      convoyeurs,
      mission,
    );
  });

  it("récupère le téléphone des convoyeurs à notifier", async () => {
    mockDb(CLIENT, (sql) => {
      // La mission doit exister : sans elle, il n'y a rien à annoncer
      // et les convoyeurs ne sont plus interrogés inutilement.
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
      if (/role = 'convoyeur'/i.test(sql)) return { rows: [] };
    });
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockResolvedValue({ id: "kaze-job-1" });

    await accepter();

    const requete = db.query.mock.calls.find(([sql]) =>
      /role = 'convoyeur'/i.test(sql),
    );
    expect(requete[0]).toMatch(/phone/i);
  });

  it("n'envoie aucune notification s'il n'y a pas de convoyeur", async () => {
    mockDb(CLIENT, (sql) => {
      if (/role = 'convoyeur'/i.test(sql)) return { rows: [] };
    });
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockResolvedValue({ id: "kaze-job-1" });

    await accepter();
    await flushBackgroundTasks();

    expect(whatsappService.notifierMissionDisponible).not.toHaveBeenCalled();
  });

  it("répond 200 même si la notification échoue", async () => {
    mockDb(CLIENT, (sql) => {
      if (/role = 'convoyeur'/i.test(sql))
        return { rows: [{ id: "c1", phone: "0612345678" }] };
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [{ id: MISSION_ID }] };
    });
    mockTransaction({
      id: MISSION_ID,
      client_id: CLIENT.id,
      status: "DEVIS_PROPOSE",
    });
    kazeService.createMission.mockResolvedValue({ id: "kaze-job-1" });
    whatsappService.notifierMissionDisponible.mockRejectedValue(
      new Error("WhatsApp indisponible"),
    );

    const res = await accepter();
    await flushBackgroundTasks();

    expect(res.status).toBe(200);
    expect(whatsappService.notifierMissionDisponible).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/missions/:id/annuler", () => {
  const annuler = (user = CLIENT) =>
    request(app)
      .post(`/api/missions/${MISSION_ID}/annuler`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

  const missionAvec = (extra) => ({
    id: MISSION_ID,
    client_id: CLIENT.id,
    ...extra,
  });

  it("retourne 404 si la mission n'existe pas", async () => {
    mockDb(CLIENT, () => ({ rows: [] }));
    const res = await annuler();
    expect(res.status).toBe(404);
  });

  it("interdit d'annuler la mission d'un autre client", async () => {
    mockDb(AUTRE_CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return { rows: [missionAvec({ status: "ACCEPTEE" })] };
    });

    const res = await annuler(AUTRE_CLIENT);

    expect(res.status).toBe(403);
  });

  it.each(["EN_ATTENTE_DE_COTATION", "DEVIS_PROPOSE", "ACCEPTEE", "ASSIGNEE"])(
    "autorise l'annulation depuis le statut %s",
    async (status) => {
      mockDb(CLIENT, (sql) => {
        if (/FROM missions WHERE id/i.test(sql))
          return { rows: [missionAvec({ status })] };
      });

      const res = await annuler();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ANNULEE");
    },
  );

  it.each(["EN_COURS", "LIVREE", "ANNULEE"])(
    "refuse l'annulation depuis le statut %s",
    async (status) => {
      mockDb(CLIENT, (sql) => {
        if (/FROM missions WHERE id/i.test(sql))
          return { rows: [missionAvec({ status })] };
      });

      const res = await annuler();

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(status);
    },
  );

  it("annule également le job côté Kaze", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [missionAvec({ status: "ACCEPTEE", kaze_mission_id: "kz-1" })],
        };
    });
    kazeService.cancelMission.mockResolvedValue(true);

    await annuler();

    expect(kazeService.cancelMission).toHaveBeenCalledWith("kz-1");
  });

  it("annule localement même si Kaze échoue", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [missionAvec({ status: "ACCEPTEE", kaze_mission_id: "kz-1" })],
        };
    });
    kazeService.cancelMission.mockRejectedValue(new Error("Kaze HS"));

    const res = await annuler();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ANNULEE");
  });

  it("n'appelle pas Kaze si la mission n'y est pas référencée", async () => {
    mockDb(CLIENT, (sql) => {
      if (/FROM missions WHERE id/i.test(sql))
        return {
          rows: [missionAvec({ status: "ACCEPTEE", kaze_mission_id: null })],
        };
    });

    await annuler();

    expect(kazeService.cancelMission).not.toHaveBeenCalled();
  });
});
