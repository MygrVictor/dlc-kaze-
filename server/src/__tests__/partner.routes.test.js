/**
 * Tests d'intégration — API partenaire (Interenchères)
 *
 * Surface exposée à l'extérieur : l'authentification par clé API et les
 * deux points d'entrée de tarification puis de commande.
 */
const request = require("supertest");
const express = require("express");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/pricing.service", () => ({
  computeAutomaticQuote: jest.fn(),
  storeQuote: jest.fn(),
  getValidQuoteById: jest.fn(),
}));

jest.mock("bcryptjs", () => ({ hash: jest.fn() }));

const db = require("../db");
const bcrypt = require("bcryptjs");
const pricingService = require("../services/pricing.service");
const { errorHandler } = require("../middleware/error.middleware");

const CLE_PROD = "cle-production-abcdef";
const CLE_SANDBOX = "cle-bac-a-sable-123456";

/**
 * Construit une app minimale montant l'API partenaire. Le routeur lit les
 * clés dans l'environnement *à chaque requête* : on peut donc les modifier
 * entre les tests sans recharger le module.
 */
function creerApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/partner", require("../routes/partner.routes"));
  app.use(errorHandler);
  return app;
}

let app;
let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INTERENCHERES_API_KEY = CLE_PROD;
  process.env.INTERENCHERES_API_KEY_SANDBOX = CLE_SANDBOX;
  app = creerApp();
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  delete process.env.INTERENCHERES_API_KEY;
  delete process.env.INTERENCHERES_API_KEY_SANDBOX;
});

/** Requête authentifiée avec la clé de production. */
const avecCle = (req, cle = CLE_PROD) =>
  req.set("Authorization", `Bearer ${cle}`);

// ═════════════════════════════════════════════════════════════
describe("authenticatePartnerApiKey", () => {
  const appeler = (headers = {}) => {
    const req = request(app).post("/api/partner/devis").send({});
    Object.entries(headers).forEach(([k, v]) => req.set(k, v));
    return req;
  };

  it("retourne 503 quand aucune clé n'est configurée", async () => {
    delete process.env.INTERENCHERES_API_KEY;
    delete process.env.INTERENCHERES_API_KEY_SANDBOX;

    const res = await appeler({ Authorization: `Bearer ${CLE_PROD}` });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/non configurée/i);
  });

  it("refuse une requête sans en-tête Authorization", async () => {
    const res = await appeler();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Clé API invalide.");
  });

  it("refuse une clé inconnue", async () => {
    const res = await appeler({ Authorization: "Bearer clé-pirate" });

    expect(res.status).toBe(401);
  });

  it("refuse un en-tête sans schéma", async () => {
    const res = await appeler({ Authorization: CLE_PROD });

    expect(res.status).toBe(401);
  });

  it("refuse une clé vide après le schéma", async () => {
    const res = await appeler({ Authorization: "Bearer " });

    expect(res.status).toBe(401);
  });

  it("accepte la clé de production", async () => {
    pricingService.computeAutomaticQuote.mockResolvedValue({ breakdown: {} });
    pricingService.storeQuote.mockResolvedValue({ id: "q1" });

    const res = await avecCle(request(app).post("/api/partner/devis")).send({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
    });

    expect(res.status).toBe(201);
  });

  it("accepte la clé bac à sable", async () => {
    pricingService.computeAutomaticQuote.mockResolvedValue({ breakdown: {} });
    pricingService.storeQuote.mockResolvedValue({ id: "q1" });

    const res = await avecCle(
      request(app).post("/api/partner/devis"),
      CLE_SANDBOX,
    ).send({ adresse_depart: "Paris", adresse_arrivee: "Lyon" });

    expect(res.status).toBe(201);
  });

  it("accepte la clé bac à sable même si la clé de production est absente", async () => {
    delete process.env.INTERENCHERES_API_KEY;
    pricingService.computeAutomaticQuote.mockResolvedValue({ breakdown: {} });
    pricingService.storeQuote.mockResolvedValue({ id: "q1" });

    const res = await avecCle(
      request(app).post("/api/partner/devis"),
      CLE_SANDBOX,
    ).send({ adresse_depart: "Paris", adresse_arrivee: "Lyon" });

    expect(res.status).toBe(201);
  });

  it("n'accepte pas une clé tronquée", async () => {
    const res = await appeler({
      Authorization: `Bearer ${CLE_PROD.slice(0, -1)}`,
    });

    expect(res.status).toBe(401);
  });

  it("protège aussi le point d'entrée des commandes", async () => {
    const res = await request(app).post("/api/partner/commandes").send({});

    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/partner/devis", () => {
  const demander = (body) =>
    avecCle(request(app).post("/api/partner/devis")).send(body);

  const resultatTarif = {
    vehicle_type: "berline",
    distance_km: 465,
    price_ht: 500,
    price_ttc: 600,
    price_convoyeur_ht: 300,
    breakdown: { base: 400, distance: 100 },
  };

  it.each([
    [{ adresse_arrivee: "Lyon" }],
    [{ adresse_depart: "Paris" }],
    [{}],
    [undefined],
  ])("exige les deux adresses (%p)", async (body) => {
    const res = await demander(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/adresse_depart et adresse_arrivee/);
    expect(pricingService.computeAutomaticQuote).not.toHaveBeenCalled();
  });

  it("calcule puis mémorise le devis", async () => {
    pricingService.computeAutomaticQuote.mockResolvedValue(resultatTarif);
    pricingService.storeQuote.mockResolvedValue({
      id: "quote-1",
      expires_at: "2026-09-01",
    });

    const res = await demander({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
      reference_vente: "VENTE-42",
      services: { refuel: true },
    });

    expect(res.status).toBe(201);
    expect(pricingService.computeAutomaticQuote).toHaveBeenCalledWith({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
      services: { refuel: true },
    });
    expect(pricingService.storeQuote).toHaveBeenCalledWith({
      reference_vente: "VENTE-42",
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      result: resultatTarif,
    });
  });

  it("retourne le détail tarifaire complet", async () => {
    pricingService.computeAutomaticQuote.mockResolvedValue(resultatTarif);
    pricingService.storeQuote.mockResolvedValue({
      id: "quote-1",
      expires_at: "2026-09-01",
    });

    const res = await demander({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      reference_vente: "VENTE-42",
    });

    expect(res.body).toEqual({
      quote_id: "quote-1",
      reference_vente: "VENTE-42",
      vehicle_type: "berline",
      distance_km: 465,
      price_ht: 500,
      price_ttc: 600,
      price_convoyeur_ht: 300,
      expires_at: "2026-09-01",
      breakdown: { base: 400, distance: 100 },
    });
  });

  it("normalise une référence de vente absente à null", async () => {
    pricingService.computeAutomaticQuote.mockResolvedValue(resultatTarif);
    pricingService.storeQuote.mockResolvedValue({ id: "quote-1" });

    const res = await demander({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
    });

    expect(res.body.reference_vente).toBeNull();
  });

  it("transmet l'échec du calcul au gestionnaire d'erreurs", async () => {
    pricingService.computeAutomaticQuote.mockRejectedValue(
      new Error("Distance introuvable"),
    );

    const res = await demander({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Distance introuvable");
  });
});

// ═════════════════════════════════════════════════════════════
describe("POST /api/partner/commandes", () => {
  const commander = (body) =>
    avecCle(request(app).post("/api/partner/commandes")).send(body);

  const DEVIS = {
    id: "quote-1",
    vehicle_type: "berline",
    adresse_depart: "10 rue de Rivoli, Paris",
    adresse_arrivee: "1 place Bellecour, Lyon",
    price_ht: 500,
    price_convoyeur_ht: 300,
  };

  const CLIENT = { email: "Acheteur@Test.COM  ", full_name: "Jean Acheteur" };

  const corpsValide = (extra = {}) => ({
    quote_id: "quote-1",
    client: CLIENT,
    ...extra,
  });

  /**
   * Simule la transaction : `requetes` collecte les appels SQL et
   * `utilisateurExistant` détermine si le client est déjà connu.
   */
  function mockTransaction({ utilisateurExistant = null } = {}) {
    const requetes = [];
    db.transaction.mockImplementation(async (callback) => {
      const trx = {
        query: jest.fn(async (sql, params) => {
          requetes.push({ sql, params });
          if (/SELECT id FROM users WHERE email/i.test(sql))
            return { rows: utilisateurExistant ? [utilisateurExistant] : [] };
          if (/INSERT INTO users/i.test(sql))
            return { rows: [{ id: "nouveau-client" }] };
          if (/INSERT INTO missions/i.test(sql))
            return {
              rows: [
                {
                  id: "mission-1",
                  status: "DEVIS_PROPOSE",
                  price: 500,
                  price_convoyeur: 300,
                },
              ],
            };
          return { rows: [] };
        }),
      };
      return callback(trx);
    });
    return requetes;
  }

  it("exige un quote_id", async () => {
    const res = await commander({ client: CLIENT });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quote_id/);
  });

  it.each([
    [{ full_name: "Sans email" }],
    [{ email: "sans@nom.fr" }],
    [{}],
    [undefined],
  ])("exige l'email et le nom du client (%p)", async (client) => {
    const res = await commander({ quote_id: "quote-1", client });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/client\.email et client\.full_name/);
  });

  it("tolère un corps de requête absent", async () => {
    const res = await avecCle(request(app).post("/api/partner/commandes"));

    expect(res.status).toBe(400);
  });

  it("retourne 404 si le devis est expiré, inconnu ou déjà consommé", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(null);

    const res = await commander(corpsValide());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/expiré ou déjà consommé/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("crée un compte client avec un mot de passe aléatoire haché", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    bcrypt.hash.mockResolvedValue("hash-simule");
    const requetes = mockTransaction();

    const res = await commander(
      corpsValide({ client: { ...CLIENT, phone: "0600000000" } }),
    );

    expect(res.status).toBe(201);
    const creation = requetes.find(({ sql }) => /INSERT INTO users/i.test(sql));
    expect(creation.params).toEqual([
      "acheteur@test.com",
      "hash-simule",
      "Jean Acheteur",
      "0600000000",
    ]);
    // Le mot de passe est bien aléatoire et jamais transmis par le partenaire.
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);
    expect(bcrypt.hash.mock.calls[0][0]).toHaveLength(48);
  });

  it("normalise l'email avant de rechercher le client", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    bcrypt.hash.mockResolvedValue("hash");
    const requetes = mockTransaction();

    await commander(corpsValide());

    const recherche = requetes.find(({ sql }) =>
      /SELECT id FROM users WHERE email/i.test(sql),
    );
    expect(recherche.params).toEqual(["acheteur@test.com"]);
  });

  it("réutilise un compte client existant sans en recréer un", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({
      utilisateurExistant: { id: "client-connu" },
    });

    await commander(corpsValide());

    expect(requetes.some(({ sql }) => /INSERT INTO users/i.test(sql))).toBe(
      false,
    );
    expect(bcrypt.hash).not.toHaveBeenCalled();
    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[0]).toBe("client-connu");
  });

  it("reprend les adresses et les tarifs du devis, jamais ceux de la requête", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({
      utilisateurExistant: { id: "client-connu" },
    });

    await commander(
      corpsValide({
        adresse_depart: "Adresse falsifiée",
        price: 1,
      }),
    );

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[5]).toBe("10 rue de Rivoli, Paris");
    expect(mission.params[9]).toBe("1 place Bellecour, Lyon");
    expect(mission.params[14]).toBe(500);
    expect(mission.params[15]).toBe(300);
  });

  it("crée la mission directement au statut DEVIS_PROPOSE", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({
      utilisateurExistant: { id: "c" },
    });

    const res = await commander(corpsValide());

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.sql).toMatch(/'DEVIS_PROPOSE'/);
    expect(res.body.status).toBe("DEVIS_PROPOSE");
  });

  it("retombe sur le client comme contact de départ et d'arrivée", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(
      corpsValide({ client: { ...CLIENT, phone: "0600000000" } }),
    );

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[7]).toBe("Jean Acheteur");
    expect(mission.params[8]).toBe("0600000000");
    expect(mission.params[11]).toBe("Jean Acheteur");
    expect(mission.params[12]).toBe("0600000000");
  });

  it("privilégie les contacts explicitement fournis", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(
      corpsValide({
        departure_contact_name: "Alys",
        departure_contact_phone: "0251788871",
        arrival_contact_name: "Ludovic",
        arrival_contact_phone: "0631793544",
      }),
    );

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params.slice(7, 9)).toEqual(["Alys", "0251788871"]);
    expect(mission.params.slice(11, 13)).toEqual(["Ludovic", "0631793544"]);
  });

  it("trace la référence de vente dans les commentaires", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(corpsValide({ reference_vente: "VENTE-42" }));

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[13]).toBe("Interenchères ref: VENTE-42");
  });

  it("privilégie un commentaire explicite sur la référence de vente", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(
      corpsValide({ reference_vente: "VENTE-42", comments: "Urgent" }),
    );

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[13]).toBe("Urgent");
  });

  it("laisse les commentaires vides sans référence de vente", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(corpsValide());

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params[13]).toBeNull();
  });

  it("reporte les caractéristiques du véhicule quand elles sont fournies", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(
      corpsValide({
        vehicle: { plate: "AA-123-BB", brand: "Renault", model: "Clio" },
      }),
    );

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params.slice(1, 5)).toEqual([
      "AA-123-BB",
      "Renault",
      "Clio",
      "berline",
    ]);
  });

  it("tolère l'absence totale de bloc véhicule", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(corpsValide());

    const mission = requetes.find(({ sql }) =>
      /INSERT INTO missions/i.test(sql),
    );
    expect(mission.params.slice(1, 4)).toEqual([null, null, null]);
  });

  it("consomme le devis pour interdire toute réutilisation", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    const requetes = mockTransaction({ utilisateurExistant: { id: "c" } });

    await commander(corpsValide());

    const consommation = requetes.find(({ sql }) =>
      /UPDATE partner_quotes SET consumed_at/i.test(sql),
    );
    expect(consommation.params).toEqual(["quote-1"]);
  });

  it("retourne l'identifiant et la tarification de la mission créée", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    mockTransaction({ utilisateurExistant: { id: "c" } });

    const res = await commander(corpsValide());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      mission_id: "mission-1",
      status: "DEVIS_PROPOSE",
      price_ht: 500,
      price_convoyeur_ht: 300,
      message: "Commande créée avec tarification automatique.",
    });
  });

  it("propage l'échec de la transaction au gestionnaire d'erreurs", async () => {
    pricingService.getValidQuoteById.mockResolvedValue(DEVIS);
    db.transaction.mockRejectedValue(new Error("deadlock détecté"));

    const res = await commander(corpsValide());

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("deadlock détecté");
  });
});
