jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../services/geocoding.service", () => ({
  geocodeDepuisCache: jest.fn(),
  geocode: jest.fn().mockResolvedValue(null),
}));

const db = require("../db");
const { geocodeDepuisCache } = require("../services/geocoding.service");
const {
  statistiquesClient,
  clePeriode,
  listerPeriodes,
} = require("../services/statistiques-client.service");

const PARIS = { lat: 48.8566, lng: 2.3522 };
const LYON = { lat: 45.764, lng: 4.8357 };

beforeEach(() => {
  jest.clearAllMocks();
  geocodeDepuisCache.mockResolvedValue(
    new Map([
      ["Paris", PARIS],
      ["Lyon", LYON],
    ]),
  );
});

describe("clePeriode", () => {
  it("regroupe par lundi, mois et année", () => {
    expect(clePeriode("2026-10-29T10:00:00Z", "semaine")).toBe("2026-10-26");
    expect(clePeriode("2026-10-26T10:00:00Z", "semaine")).toBe("2026-10-26");
    expect(clePeriode("2026-10-29T10:00:00Z", "mois")).toBe("2026-10");
    expect(clePeriode("2026-10-29T10:00:00Z", "annee")).toBe("2026");
  });
});

describe("listerPeriodes", () => {
  it("inclut les périodes vides", () => {
    expect(
      listerPeriodes(new Date("2026-01-15Z"), new Date("2026-04-02Z"), "mois"),
    ).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
});

describe("statistiquesClient", () => {
  it("compte les convoyages par mois et estime les km des livrés", async () => {
    const missions = [
      {
        status: "LIVREE",
        date_ref: "2026-02-10T08:00:00Z",
        departure_address: "Paris",
        arrival_address: "Lyon",
      },
      {
        status: "ASSIGNEE",
        date_ref: "2026-02-20T08:00:00Z",
        departure_address: "Paris",
        arrival_address: "Lyon",
      },
      {
        status: "LIVREE",
        date_ref: "2026-03-05T08:00:00Z",
        departure_address: "Paris",
        arrival_address: "Inconnue",
      },
    ];
    db.query.mockImplementation(async () => ({
      rows: missions.map((m) => ({ ...m })),
    }));

    const stats = await statistiquesClient(
      ["c1"],
      { debut: "2026-01-01", fin: "2026-03-31", granularite: "mois" },
      new Date("2026-03-31T12:00:00Z"),
    );

    expect(stats.series.map((p) => [p.periode, p.convoyages])).toEqual([
      ["2026-01", 0],
      ["2026-02", 2],
      ["2026-03", 1],
    ]);
    expect(stats.periode.convoyages).toBe(3);
    expect(stats.periode.livres).toBe(2);
    expect(stats.periode.km_non_calcules).toBe(1);
    // Paris–Lyon : ~392 km à vol d'oiseau × 1,22.
    expect(stats.periode.km_total).toBeGreaterThan(450);
    expect(stats.periode.km_total).toBeLessThan(500);
    expect(stats.annee.km_moyen_par_mois).toBe(
      Math.round(stats.annee.km_total / 3),
    );
    // Le périmètre est transmis tel quel à la requête.
    expect(db.query.mock.calls[0][1][0]).toEqual(["c1"]);
  });

  it("retombe sur l'année en cours par mois si les paramètres sont invalides", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const stats = await statistiquesClient(
      ["c1"],
      { debut: "n'importe quoi", granularite: "siecle" },
      new Date("2026-10-28T12:00:00Z"),
    );
    expect(stats.debut).toBe("2026-01-01");
    expect(stats.fin).toBe("2026-10-28");
    expect(stats.granularite).toBe("mois");
    expect(stats.series).toHaveLength(10);
  });
});
