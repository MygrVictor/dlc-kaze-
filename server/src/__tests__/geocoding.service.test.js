/**
 * Tests unitaires — geocoding.service
 *
 * Le service convertit une adresse en coordonnées via Nominatim, avec un
 * cache PostgreSQL et un rate-limit de 1,1 s imposé par l'usage gratuit
 * de l'API. Les appels réseau et l'horloge sont simulés.
 */
jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../db", () => ({ query: jest.fn() }));

const axios = require("axios");
const db = require("../db");

/**
 * Le module mémorise l'instant du dernier appel et la création de la table
 * dans son état interne : chaque test le recharge à neuf.
 *
 * NB : `jest.resetModules()` ré-exécute les fabriques de `jest.mock`, qui
 * produisent alors de *nouvelles* fonctions simulées. Les références obtenues
 * ci-dessus deviendraient obsolètes : on les rebranche à chaque test.
 */
let geocodingService;

/** Réponse Nominatim minimale. */
const reponseNominatim = (lat, lon) => ({ data: [{ lat, lon }] });

let consoleSpies;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick"] });

  geocodingService = require("../services/geocoding.service");

  // Rebranche les mocks du registre fraîchement réinitialisé.
  const axiosRecharge = require("axios");
  const dbRecharge = require("../db");
  axios.get = axiosRecharge.get;
  db.query = dbRecharge.query;

  db.query.mockResolvedValue({ rows: [] });
  consoleSpies = [
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
});

/**
 * Exécute une promesse en laissant les timers factices s'écouler :
 * le rate-limiter attend jusqu'à 1,1 s avant chaque appel réseau.
 */
async function avecTimers(promesse) {
  const p = promesse;
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    jest.advanceTimersByTime(2_000);
  }
  return p;
}

// ═════════════════════════════════════════════════════════════
describe("geocode — validation de l'entrée", () => {
  it.each([null, undefined, "", "   ", "ab"])(
    "retourne null pour l'adresse %p sans appeler le réseau",
    async (adresse) => {
      const res = await geocodingService.geocode(adresse);

      expect(res).toBeNull();
      expect(axios.get).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    },
  );
});

// ═════════════════════════════════════════════════════════════
describe("geocode — cache PostgreSQL", () => {
  it("crée la table de cache au premier appel", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("Paris, France"));

    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/CREATE TABLE IF NOT EXISTS geocode_cache/),
    );
  });

  it("ne recrée pas la table aux appels suivants", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("Paris, France"));
    db.query.mockClear();
    await avecTimers(geocodingService.geocode("Lyon, France"));

    expect(
      db.query.mock.calls.filter(([sql]) => /CREATE TABLE/i.test(sql)),
    ).toHaveLength(0);
  });

  it("sert le résultat depuis le cache sans appeler Nominatim", async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT lat, lng FROM geocode_cache/i.test(sql))
        return { rows: [{ lat: "45.76", lng: "4.83" }] };
      return { rows: [] };
    });

    const res = await avecTimers(geocodingService.geocode("Lyon, France"));

    expect(res).toEqual({ lat: 45.76, lng: 4.83 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("normalise l'adresse avant de calculer la clé de cache", async () => {
    const clefs = [];
    db.query.mockImplementation(async (sql, params) => {
      if (/SELECT lat, lng FROM geocode_cache/i.test(sql))
        clefs.push(params[0]);
      return { rows: [] };
    });
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("  PARIS,   France "));
    await avecTimers(geocodingService.geocode("paris, france"));

    expect(clefs[0]).toBe(clefs[1]);
  });

  it("mémorise le résultat en base sans écraser une entrée existante", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.8566", "2.3522"));

    await avecTimers(geocodingService.geocode("Paris, France"));

    const insertion = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO geocode_cache/i.test(sql),
    );
    expect(insertion[0]).toMatch(/ON CONFLICT \(address_hash\) DO NOTHING/);
    expect(insertion[1].slice(1)).toEqual(["Paris, France", 48.8566, 2.3522]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("geocode — appel Nominatim", () => {
  it("retourne les coordonnées converties en nombres", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.8566", "2.3522"));

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    expect(res).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it("restreint la recherche aux pays desservis et à un seul résultat", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("Paris, France"));

    const [url] = axios.get.mock.calls[0];
    expect(url).toMatch(/limit=1/);
    expect(url).toMatch(/countrycodes=fr,be,lu,ch,de,es,it,nl,pt,gb/);
  });

  it("encode l'adresse dans l'URL", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("10 rue de l'Église, Paris"));

    expect(axios.get.mock.calls[0][0]).toContain(
      encodeURIComponent("10 rue de l'Église, Paris"),
    );
  });

  it("s'identifie auprès de Nominatim et borne le délai d'attente", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(geocodingService.geocode("Paris, France"));

    expect(axios.get.mock.calls[0][1]).toMatchObject({
      timeout: 10000,
      headers: expect.objectContaining({
        "User-Agent": expect.stringContaining("DLC-Kaze"),
      }),
    });
  });
});

// ═════════════════════════════════════════════════════════════
describe("geocode — repli et échecs", () => {
  it("réessaie sur les deux derniers mots quand l'adresse complète échoue", async () => {
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce(reponseNominatim("47.21", "-1.55"));

    const res = await avecTimers(
      geocodingService.geocode("Lieu-dit introuvable 44000 Nantes"),
    );

    expect(res).toEqual({ lat: 47.21, lng: -1.55 });
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls[1][0]).toContain(
      encodeURIComponent("44000 Nantes"),
    );
  });

  it("ne tente pas de repli sur une adresse d'un seul mot", async () => {
    axios.get.mockResolvedValue({ data: [] });

    const res = await avecTimers(geocodingService.geocode("Zzzzzz"));

    expect(res).toBeNull();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("retourne null quand le repli échoue aussi", async () => {
    axios.get.mockResolvedValue({ data: [] });

    const res = await avecTimers(
      geocodingService.geocode("Adresse totalement inconnue"),
    );

    expect(res).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/introuvable/),
    );
  });

  it("retourne null si Nominatim est injoignable", async () => {
    axios.get.mockRejectedValue(new Error("ETIMEDOUT"));

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    expect(res).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/Erreur géocodage/),
      "ETIMEDOUT",
    );
  });

  it("ne met rien en cache lorsque le géocodage a échoué", async () => {
    axios.get.mockResolvedValue({ data: [] });

    await avecTimers(geocodingService.geocode("Adresse inconnue ici"));

    expect(
      db.query.mock.calls.filter(([sql]) =>
        /INSERT INTO geocode_cache/i.test(sql),
      ),
    ).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════
describe("geocodeBatch", () => {
  it("retourne une Map indexée par adresse", async () => {
    axios.get
      .mockResolvedValueOnce(reponseNominatim("48.85", "2.35"))
      .mockResolvedValueOnce(reponseNominatim("45.76", "4.83"));

    const res = await avecTimers(
      geocodingService.geocodeBatch(["Paris, France", "Lyon, France"]),
    );

    expect(res).toBeInstanceOf(Map);
    expect(res.get("Paris, France")).toEqual({ lat: 48.85, lng: 2.35 });
    expect(res.get("Lyon, France")).toEqual({ lat: 45.76, lng: 4.83 });
  });

  it("dédoublonne les adresses avant de les géocoder", async () => {
    axios.get.mockResolvedValue(reponseNominatim("48.85", "2.35"));

    await avecTimers(
      geocodingService.geocodeBatch([
        "Paris, France",
        "  Paris, France  ",
        "Paris, France",
      ]),
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("ignore les valeurs vides ou nulles", async () => {
    const res = await avecTimers(
      geocodingService.geocodeBatch([null, "", undefined]),
    );

    expect(res.size).toBe(0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("n'inscrit pas les adresses non géocodées dans le résultat", async () => {
    axios.get.mockResolvedValue({ data: [] });

    const res = await avecTimers(
      geocodingService.geocodeBatch(["Adresse inconnue ici"]),
    );

    expect(res.size).toBe(0);
  });

  it("retourne une Map vide pour un lot vide", async () => {
    const res = await geocodingService.geocodeBatch([]);

    expect(res.size).toBe(0);
  });
});
