/**
 * Tests unitaires — geocoding.service
 *
 * Le service convertit une adresse en coordonnées via la Base Adresse
 * Nationale, avec repli sur Nominatim pour l'étranger et cache
 * PostgreSQL. Les appels réseau et l'horloge sont simulés.
 *
 * Le point sensible couvert ici est l'ordre des fournisseurs : Nominatim
 * interdit l'usage commercial systématique, il ne doit jamais redevenir
 * le chemin principal.
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

/** Réponse Nominatim minimale (repli). */
const reponseNominatim = (lat, lon) => ({ data: [{ lat, lon }] });

/** Réponse BAN minimale — GeoJSON, coordonnées en [lng, lat]. */
const reponseBan = (lat, lng, score = 0.9) => ({
  data: {
    features: [
      { geometry: { coordinates: [lng, lat] }, properties: { score } },
    ],
  },
});

/** Réponse BAN sans résultat. */
const banVide = () => ({ data: { features: [] } });

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
describe("geocode — appel à la Base Adresse Nationale", () => {
  it("retourne les coordonnées issues du GeoJSON", async () => {
    axios.get.mockResolvedValue(reponseBan(48.8566, 2.3522));

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    // GeoJSON ordonne [lng, lat] : l'inversion est le piège classique.
    expect(res).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it("interroge la BAN en premier, jamais Nominatim", async () => {
    axios.get.mockResolvedValue(reponseBan(48.85, 2.35));

    await avecTimers(geocodingService.geocode("Paris, France"));

    const [url] = axios.get.mock.calls[0];
    expect(url).toContain("api-adresse.data.gouv.fr");
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("passe l'adresse en paramètre et borne le nombre de résultats", async () => {
    axios.get.mockResolvedValue(reponseBan(48.85, 2.35));

    await avecTimers(geocodingService.geocode("10 rue de l'Église, Paris"));

    expect(axios.get.mock.calls[0][1]).toMatchObject({
      params: { q: "10 rue de l'Église, Paris", limit: 1 },
      timeout: 10000,
    });
  });

  it("écarte une correspondance au score trop faible", async () => {
    // La BAN répond toujours quelque chose : sans seuil, une saisie
    // farfelue serait localisée au hasard.
    axios.get
      .mockResolvedValueOnce(reponseBan(48.85, 2.35, 0.1))
      .mockResolvedValueOnce(reponseNominatim("47.21", "-1.55"));

    const res = await avecTimers(geocodingService.geocode("Zzz qqq vvv"));

    expect(res).toEqual({ lat: 47.21, lng: -1.55 });
  });

  it("ignore un résultat aux coordonnées inexploitables", async () => {
    axios.get
      .mockResolvedValueOnce({
        data: { features: [{ geometry: {}, properties: { score: 0.9 } }] },
      })
      .mockResolvedValueOnce({ data: [] });

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    expect(res).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
describe("geocode — repli Nominatim et échecs", () => {
  it("court-circuite la BAN pour une adresse explicitement étrangère", async () => {
    // La BAN répondrait « Grand-Place Bruxelles » par une voie française
    // homonyme, au score indiscernable d'une vraie adresse.
    axios.get.mockResolvedValueOnce(reponseNominatim("50.85", "4.35"));

    const res = await avecTimers(
      geocodingService.geocode("Grand-Place, Bruxelles, Belgique"),
    );

    expect(res).toEqual({ lat: 50.85, lng: 4.35 });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][0]).toContain("nominatim");
  });

  it("bascule sur Nominatim quand la BAN ne trouve rien", async () => {
    axios.get
      .mockResolvedValueOnce(banVide())
      .mockResolvedValueOnce(reponseNominatim("50.85", "4.35"));

    const res = await avecTimers(
      geocodingService.geocode("Lieu introuvable 44000 Nantes"),
    );

    expect(res).toEqual({ lat: 50.85, lng: 4.35 });
    expect(axios.get.mock.calls[1][0]).toContain("nominatim");
  });

  it("s'identifie auprès de Nominatim et restreint les pays", async () => {
    axios.get
      .mockResolvedValueOnce(banVide())
      .mockResolvedValueOnce(reponseNominatim("50.85", "4.35"));

    await avecTimers(geocodingService.geocode("Lieu introuvable 44000 Nantes"));

    const [url, options] = axios.get.mock.calls[1];
    expect(url).toMatch(/limit=1/);
    expect(url).toMatch(/countrycodes=fr,be,lu,ch,de,es,it,nl,pt,gb/);
    expect(options).toMatchObject({
      timeout: 10000,
      headers: expect.objectContaining({
        "User-Agent": expect.stringContaining("DLC-Kaze"),
      }),
    });
  });

  it("bascule sur Nominatim si la BAN est injoignable", async () => {
    // Une panne du service public ne doit pas priver l'application de
    // géocodage.
    axios.get
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce(reponseNominatim("48.85", "2.35"));

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    expect(res).toEqual({ lat: 48.85, lng: 2.35 });
  });

  it("retourne null quand les deux fournisseurs échouent", async () => {
    axios.get
      .mockResolvedValueOnce(banVide())
      .mockResolvedValueOnce({ data: [] });

    const res = await avecTimers(
      geocodingService.geocode("Adresse totalement inconnue"),
    );

    expect(res).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/introuvable/),
    );
  });

  it("retourne null si les deux fournisseurs sont injoignables", async () => {
    axios.get.mockRejectedValue(new Error("ETIMEDOUT"));

    const res = await avecTimers(geocodingService.geocode("Paris, France"));

    expect(res).toBeNull();
  });

  it("ne met rien en cache lorsque le géocodage a échoué", async () => {
    axios.get
      .mockResolvedValueOnce(banVide())
      .mockResolvedValueOnce({ data: [] });

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
      .mockResolvedValueOnce(reponseBan(48.85, 2.35))
      .mockResolvedValueOnce(reponseBan(45.76, 4.83));

    const res = await avecTimers(
      geocodingService.geocodeBatch(["Paris, France", "Lyon, France"]),
    );

    expect(res).toBeInstanceOf(Map);
    expect(res.get("Paris, France")).toEqual({ lat: 48.85, lng: 2.35 });
    expect(res.get("Lyon, France")).toEqual({ lat: 45.76, lng: 4.83 });
  });

  it("dédoublonne les adresses avant de les géocoder", async () => {
    axios.get.mockResolvedValue(reponseBan(48.85, 2.35));

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
