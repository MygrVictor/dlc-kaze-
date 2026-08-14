/**
 * Tests unitaires — pricing.service
 *
 * Couvre le calcul de devis automatique : géocodage, distance
 * haversine, résolution de la grille tarifaire, multiplicateurs
 * véhicule, suppléments services, TVA et part convoyeur.
 */
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../services/geocoding.service", () => ({ geocode: jest.fn() }));

const db = require("../db");
const { geocode } = require("../services/geocoding.service");
const pricing = require("../services/pricing.service");

// Coordonnées réelles utilisées dans les scénarios
const PARIS = { lat: 48.8566, lng: 2.3522 };
const LYON = { lat: 45.764, lng: 4.8357 };

/** Règle tarifaire par défaut renvoyée par la grille. */
const RULE = {
  id: 3,
  vehicle_type: "default",
  distance_min_km: 151,
  distance_max_km: 300,
  base_price: "90",
  price_per_km: "0.92",
  convoyeur_ratio: "0.70",
  min_price: "180",
};

/**
 * Prépare les réponses DB pour un appel à computeAutomaticQuote.
 * ensurePricingTables() n'exécute ses requêtes qu'au premier appel
 * (flag tablesReady), on branche donc la résolution de règle sur
 * la détection du SELECT tariff_grid.
 */
function mockDb(rule = RULE) {
  db.query.mockImplementation((sql) => {
    if (/FROM tariff_grid/i.test(sql) && /SELECT \*/i.test(sql)) {
      return Promise.resolve({ rows: rule ? [rule] : [] });
    }
    if (/COUNT\(\*\)/i.test(sql)) {
      return Promise.resolve({ rows: [{ count: 4 }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  geocode.mockReset();
});

describe("computeAutomaticQuote — géocodage", () => {
  it("rejette avec 400 si l'adresse de départ est introuvable", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(null).mockResolvedValueOnce(LYON);

    await expect(
      pricing.computeAutomaticQuote({
        adresse_depart: "Adresse inconnue",
        adresse_arrivee: "Lyon",
        type_vehicule: "berline",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejette avec 400 si l'adresse d'arrivée est introuvable", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(null);

    await expect(
      pricing.computeAutomaticQuote({
        adresse_depart: "Paris",
        adresse_arrivee: "Adresse inconnue",
        type_vehicule: "berline",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("computeAutomaticQuote — distance", () => {
  it("applique le facteur routier de 1.22 à la distance à vol d'oiseau", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
    });

    // Paris → Lyon ≈ 392 km à vol d'oiseau, ×1.22 ≈ 478 km
    expect(quote.distance_km).toBeGreaterThan(470);
    expect(quote.distance_km).toBeLessThan(485);
  });

  it("applique un plancher de 5 km sur les trajets très courts", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(PARIS);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Paris",
      type_vehicule: "berline",
    });

    expect(quote.distance_km).toBe(5);
  });
});

describe("computeAutomaticQuote — type de véhicule", () => {
  const cases = [
    ["citadine", "citadine", 1],
    ["city", "citadine", 1],
    ["berline", "berline", 1],
    ["sedan", "berline", 1],
    ["SUV", "suv", 1.1],
    ["4x4", "suv", 1.1],
    ["utilitaire", "utilitaire", 1.25],
    ["van", "utilitaire", 1.25],
    ["camionnette", "utilitaire", 1.25],
    ["prestige", "prestige", 1.35],
    ["luxe", "prestige", 1.35],
    ["type-inconnu", "berline", 1],
    [undefined, "berline", 1],
  ];

  it.each(cases)(
    "normalise « %s » en « %s » avec un multiplicateur de %s",
    async (input, expectedType, expectedMultiplier) => {
      mockDb();
      geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

      const quote = await pricing.computeAutomaticQuote({
        adresse_depart: "Paris",
        adresse_arrivee: "Lyon",
        type_vehicule: input,
      });

      expect(quote.vehicle_type).toBe(expectedType);
      expect(quote.breakdown.vehicle_multiplier).toBe(expectedMultiplier);
    },
  );
});

describe("computeAutomaticQuote — suppléments services", () => {
  it("n'ajoute aucun supplément sans service demandé", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
    });

    expect(quote.breakdown.services_total).toBe(0);
    expect(quote.breakdown.services).toEqual([]);
  });

  it("facture 25 € pour le lavage extérieur", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
      services: { service_wash_exterior: true },
    });

    expect(quote.breakdown.services_total).toBe(25);
    expect(quote.breakdown.services).toEqual([
      { code: "service_wash_exterior", amount: 25 },
    ]);
  });

  it("cumule les trois services pour 80 €", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
      services: {
        service_wash_exterior: true,
        service_clean_interior: true,
        service_refuel: true,
      },
    });

    expect(quote.breakdown.services_total).toBe(80);
    expect(quote.breakdown.services).toHaveLength(3);
  });
});

describe("computeAutomaticQuote — tarification", () => {
  it("calcule prix HT, TTC et part convoyeur de façon cohérente", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
    });

    const expectedHT = Math.round((90 + 0.92 * quote.distance_km) * 100) / 100;

    expect(quote.price_ht).toBeCloseTo(expectedHT, 2);
    expect(quote.price_ttc).toBeCloseTo(
      Math.round(quote.price_ht * 1.2 * 100) / 100,
      2,
    );
    expect(quote.price_convoyeur_ht).toBeCloseTo(
      Math.round(quote.price_ht * 0.7 * 100) / 100,
      2,
    );
  });

  it("applique le prix plancher de la règle si le calcul est inférieur", async () => {
    mockDb({
      ...RULE,
      base_price: "10",
      price_per_km: "0.01",
      min_price: "180",
    });
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(PARIS);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Paris",
      type_vehicule: "berline",
    });

    expect(quote.price_ht).toBe(180);
  });

  it("expose le détail du calcul dans breakdown", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    const quote = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
    });

    expect(quote.breakdown).toMatchObject({
      fixed: 90,
      tariff_rule_id: RULE.id,
      convoyeur_ratio: 0.7,
      vat_rate: 0.2,
    });
    expect(quote.breakdown.variable).toBeGreaterThan(0);
  });

  it("rejette avec 422 si aucune règle tarifaire ne correspond", async () => {
    mockDb(null);
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);

    await expect(
      pricing.computeAutomaticQuote({
        adresse_depart: "Paris",
        adresse_arrivee: "Lyon",
        type_vehicule: "berline",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("majore le prix pour un utilitaire par rapport à une berline", async () => {
    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);
    const berline = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "berline",
    });

    mockDb();
    geocode.mockResolvedValueOnce(PARIS).mockResolvedValueOnce(LYON);
    const utilitaire = await pricing.computeAutomaticQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      type_vehicule: "utilitaire",
    });

    expect(utilitaire.price_ht).toBeGreaterThan(berline.price_ht);
  });
});

describe("storeQuote", () => {
  it("insère le devis et retourne la ligne créée", async () => {
    const created = { id: "quote-1", price_ht: 500 };
    db.query.mockImplementation((sql) => {
      if (/INSERT INTO partner_quotes/i.test(sql)) {
        return Promise.resolve({ rows: [created] });
      }
      if (/COUNT\(\*\)/i.test(sql)) {
        return Promise.resolve({ rows: [{ count: 4 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await pricing.storeQuote({
      reference_vente: "REF-1",
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      result: {
        vehicle_type: "berline",
        distance_km: 478,
        price_ht: 500,
        price_ttc: 600,
        price_convoyeur_ht: 350,
        breakdown: { fixed: 90 },
      },
    });

    expect(result).toEqual(created);
    const insertCall = db.query.mock.calls.find((c) =>
      /INSERT INTO partner_quotes/i.test(c[0]),
    );
    expect(insertCall[1][0]).toBe("REF-1");
    // breakdown doit être sérialisé en JSON
    expect(typeof insertCall[1][8]).toBe("string");
  });

  it("accepte une référence de vente absente", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "quote-2" }] });

    await pricing.storeQuote({
      adresse_depart: "Paris",
      adresse_arrivee: "Lyon",
      result: {
        vehicle_type: "berline",
        distance_km: 10,
        price_ht: 100,
        price_ttc: 120,
        price_convoyeur_ht: 70,
        breakdown: {},
      },
    });

    const insertCall = db.query.mock.calls.find((c) =>
      /INSERT INTO partner_quotes/i.test(c[0]),
    );
    expect(insertCall[1][0]).toBeNull();
  });
});

describe("getValidQuoteById", () => {
  it("retourne le devis s'il est valide et non consommé", async () => {
    const quote = { id: "quote-1" };
    db.query.mockResolvedValue({ rows: [quote] });

    await expect(pricing.getValidQuoteById("quote-1")).resolves.toEqual(quote);
  });

  it("retourne null si le devis est expiré ou déjà consommé", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(pricing.getValidQuoteById("quote-x")).resolves.toBeNull();
  });
});

describe("markQuoteConsumed", () => {
  it("marque le devis comme consommé", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await pricing.markQuoteConsumed("quote-1");

    const call = db.query.mock.calls.find((c) =>
      /UPDATE partner_quotes/i.test(c[0]),
    );
    expect(call).toBeDefined();
    expect(call[1]).toEqual(["quote-1"]);
  });
});
