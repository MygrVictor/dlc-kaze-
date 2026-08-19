/**
 * Tests unitaires — sync.service
 *
 * Ce service matérialise le principe « Kaze est la source de vérité » :
 *   - `syncKazeStatuses` rapatrie périodiquement les statuts Kaze vers DLC ;
 *   - `ensureKazeMission` sert de filet de rattrapage quand la création du
 *     job Kaze a échoué au moment de l'acceptation du devis.
 */
jest.mock("../db", () => ({ query: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  fetchJob: jest.fn(),
  fetchJobs: jest.fn(),
  createMission: jest.fn(),
}));

const db = require("../db");
const kazeService = require("../services/kaze.service");
const syncService = require("../services/sync.service");

const MISSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Construit une erreur HTTP façon axios. */
const httpError = (status, message = "Erreur Kaze") => {
  const err = new Error(message);
  err.response = { status };
  return err;
};

/**
 * Prépare `db.query` : la première requête renvoie les missions liées,
 * les suivantes (UPDATE) sont enregistrées pour inspection.
 */
function mockMissionsLiees(missions) {
  const updates = [];
  db.query.mockImplementation(async (sql, params) => {
    if (/UPDATE missions/i.test(sql)) {
      updates.push({ sql, params });
      return { rows: [] };
    }
    return { rows: missions };
  });
  return updates;
}

let consoleSpies;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  kazeService.fetchJob.mockResolvedValue({ status: "waiting" });
  kazeService.fetchJobs.mockResolvedValue({
    data: [],
    meta: { total_pages: 1 },
  });
  kazeService.createMission.mockResolvedValue({ id: "kz-default" });
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  syncService.stopSync();
});

// ═════════════════════════════════════════════════════════════
describe("syncKazeStatuses — sélection des missions à vérifier", () => {
  it("ne considère que les missions liées et non terminées", async () => {
    let requete;
    db.query.mockImplementation(async (sql) => {
      requete = sql;
      return { rows: [] };
    });

    await syncService.syncKazeStatuses();

    expect(requete).toMatch(/kaze_mission_id IS NOT NULL/);
    expect(requete).toMatch(/status NOT IN \('LIVREE', 'ANNULEE'\)/);
  });

  it("n'interroge pas Kaze quand aucune mission n'est liée", async () => {
    mockMissionsLiees([]);

    await syncService.syncKazeStatuses();

    expect(kazeService.fetchJob).not.toHaveBeenCalled();
  });

  it("interroge Kaze pour chaque mission liée", async () => {
    mockMissionsLiees([
      { id: "m1", kaze_mission_id: "kz-1", status: "ASSIGNEE" },
      { id: "m2", kaze_mission_id: "kz-2", status: "ASSIGNEE" },
    ]);

    await syncService.syncKazeStatuses();

    expect(kazeService.fetchJob).toHaveBeenCalledTimes(2);
    expect(kazeService.fetchJob).toHaveBeenCalledWith("kz-1");
    expect(kazeService.fetchJob).toHaveBeenCalledWith("kz-2");
  });
});

// ═════════════════════════════════════════════════════════════
describe("syncKazeStatuses — transitions de statut", () => {
  it.each([
    ["started", "EN_COURS"],
    ["completed", "LIVREE"],
    ["cancelled", "ANNULEE"],
  ])("propage le statut Kaze « %s » en %s", async (kazeStatus, attendu) => {
    const updates = mockMissionsLiees([
      { id: MISSION_ID, kaze_mission_id: "kz-1", status: "ASSIGNEE" },
    ]);
    kazeService.fetchJob.mockResolvedValue({ status: kazeStatus });

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual([attendu, MISSION_ID]);
  });

  it.each(["waiting", "planned", "paused", "statut_inconnu"])(
    "ignore le statut Kaze non mappé « %s »",
    async (kazeStatus) => {
      const updates = mockMissionsLiees([
        { id: MISSION_ID, kaze_mission_id: "kz-1", status: "ASSIGNEE" },
      ]);
      kazeService.fetchJob.mockResolvedValue({ status: kazeStatus });

      await syncService.syncKazeStatuses();

      expect(updates).toHaveLength(0);
    },
  );

  it("n'écrit rien quand le statut local est déjà à jour", async () => {
    const updates = mockMissionsLiees([
      { id: MISSION_ID, kaze_mission_id: "kz-1", status: "EN_COURS" },
    ]);
    kazeService.fetchJob.mockResolvedValue({ status: "started" });

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(0);
  });

  it("ne modifie jamais updated_at lors d'une synchronisation", async () => {
    const updates = mockMissionsLiees([
      { id: MISSION_ID, kaze_mission_id: "kz-1", status: "ASSIGNEE" },
    ]);
    kazeService.fetchJob.mockResolvedValue({ status: "completed" });

    await syncService.syncKazeStatuses();

    expect(updates[0].sql).not.toMatch(/updated_at/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("syncKazeStatuses — résilience", () => {
  it("poursuit les autres missions si l'une d'elles échoue", async () => {
    const updates = mockMissionsLiees([
      { id: "m1", kaze_mission_id: "kz-1", status: "ASSIGNEE" },
      { id: "m2", kaze_mission_id: "kz-2", status: "ASSIGNEE" },
    ]);
    kazeService.fetchJob
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce({ status: "completed" });

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual(["LIVREE", "m2"]);
  });

  it("signale un job Kaze supprimé sans interrompre le cycle", async () => {
    mockMissionsLiees([
      { id: MISSION_ID, kaze_mission_id: "kz-1", status: "ASSIGNEE" },
    ]);
    kazeService.fetchJob.mockRejectedValue(httpError(404));

    await expect(syncService.syncKazeStatuses()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/introuvable \(404\)/),
    );
  });

  it("signale les erreurs transitoires sans interrompre la passe", async () => {
    // Ces erreurs étaient autrefois tues « pour éviter le spam », si bien
    // qu'une synchronisation entièrement en échec se concluait par un
    // message de succès. Le silence coûtait plus cher que le bruit.
    mockMissionsLiees([
      { id: MISSION_ID, kaze_mission_id: "kz-1", status: "ASSIGNEE" },
    ]);
    kazeService.fetchJob.mockRejectedValue(httpError(429));

    await expect(syncService.syncKazeStatuses()).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/1 mission\(s\) non vérifiée\(s\)/),
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("n'explose pas si la base est indisponible", async () => {
    db.query.mockRejectedValue(new Error("connexion perdue"));

    await expect(syncService.syncKazeStatuses()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "❌ Erreur sync Kaze:",
      "connexion perdue",
    );
  });

  it("empêche deux cycles de synchronisation concurrents", async () => {
    let resoudreRequete;
    db.query.mockImplementation(
      () => new Promise((resolve) => (resoudreRequete = resolve)),
    );

    const premier = syncService.syncKazeStatuses();
    const second = syncService.syncKazeStatuses();

    await second; // le second doit rendre la main immédiatement
    expect(db.query).toHaveBeenCalledTimes(1);

    resoudreRequete({ rows: [] });
    await premier;
  });

  it("libère le verrou après une erreur pour permettre le cycle suivant", async () => {
    db.query.mockRejectedValueOnce(new Error("panne"));
    await syncService.syncKazeStatuses();

    mockMissionsLiees([]);
    await syncService.syncKazeStatuses();

    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════
//  Récupération groupée
// ═════════════════════════════════════════════════════════════
describe("syncKazeStatuses — récupération groupée", () => {
  /** Génère n missions liées, toutes en ASSIGNEE. */
  const missions = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `mission-${i}`,
      kaze_mission_id: `kz-${i}`,
      status: "ASSIGNEE",
    }));

  /** Une page Kaze renvoyant les jobs fournis. */
  const page = (jobs, totalPages = 1) => ({
    data: jobs,
    meta: { total_pages: totalPages },
  });

  it("reste en mode unitaire sous le seuil", async () => {
    mockMissionsLiees(missions(5));

    await syncService.syncKazeStatuses();

    expect(kazeService.fetchJob).toHaveBeenCalledTimes(5);
    expect(kazeService.fetchJobs).not.toHaveBeenCalled();
  });

  it("bascule en mode groupé au-delà du seuil", async () => {
    mockMissionsLiees(missions(6));

    await syncService.syncKazeStatuses();

    expect(kazeService.fetchJob).not.toHaveBeenCalled();
    expect(kazeService.fetchJobs).toHaveBeenCalled();
  });

  it("n'interroge que les statuts porteurs d'une transition", async () => {
    mockMissionsLiees(missions(10));

    await syncService.syncKazeStatuses();

    const statuts = kazeService.fetchJobs.mock.calls.map((c) => c[0].status);
    expect(statuts.sort()).toEqual(["cancelled", "completed", "started"]);
  });

  it("ne fait que 3 appels réseau pour 200 missions", async () => {
    mockMissionsLiees(missions(200));

    await syncService.syncKazeStatuses();

    // Un appel par statut suivi, au lieu de 200 appels unitaires.
    expect(kazeService.fetchJobs).toHaveBeenCalledTimes(3);
  });

  it("applique les transitions détectées dans les pages", async () => {
    const updates = mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockImplementation(async ({ status }) =>
      status === "started"
        ? page([
            { id: "kz-0", status: "started" },
            { id: "kz-3", status: "started" },
          ])
        : page([]),
    );

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(1);
    expect(updates[0].params[0]).toBe("EN_COURS");
    expect(updates[0].params[1].sort()).toEqual(["mission-0", "mission-3"]);
  });

  it("groupe les écritures par statut cible", async () => {
    const updates = mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockImplementation(async ({ status }) => {
      if (status === "started") return page([{ id: "kz-0", status }]);
      if (status === "completed") return page([{ id: "kz-1", status }]);
      return page([]);
    });

    await syncService.syncKazeStatuses();

    // Deux statuts distincts → deux requêtes, pas une par mission.
    expect(updates).toHaveLength(2);
  });

  it("parcourt toutes les pages d'un statut", async () => {
    mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockImplementation(async ({ status, page: p }) =>
      status === "started"
        ? page([{ id: `kz-${p - 1}`, status: "started" }], 3)
        : page([]),
    );

    await syncService.syncKazeStatuses();

    const appelsStarted = kazeService.fetchJobs.mock.calls.filter(
      (c) => c[0].status === "started",
    );
    expect(appelsStarted.map((c) => c[0].page)).toEqual([1, 2, 3]);
  });

  it("ignore les missions absentes de l'index", async () => {
    const updates = mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockResolvedValue(
      page([{ id: "inconnu", status: "started" }]),
    );

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(0);
  });

  it("n'écrit rien quand le statut local est déjà à jour", async () => {
    const updates = mockMissionsLiees([
      ...missions(5),
      { id: "mission-x", kaze_mission_id: "kz-x", status: "EN_COURS" },
    ]);
    kazeService.fetchJobs.mockImplementation(async ({ status }) =>
      status === "started" ? page([{ id: "kz-x", status }]) : page([]),
    );

    await syncService.syncKazeStatuses();

    expect(updates).toHaveLength(0);
  });

  it("retombe en mode unitaire si la récupération groupée échoue", async () => {
    mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockRejectedValue(new Error("API indisponible"));

    await syncService.syncKazeStatuses();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/bascule en mode unitaire/),
    );
    expect(kazeService.fetchJob).toHaveBeenCalledTimes(6);
  });

  it("ne modifie jamais updated_at", async () => {
    const updates = mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockImplementation(async ({ status }) =>
      status === "completed" ? page([{ id: "kz-0", status }]) : page([]),
    );

    await syncService.syncKazeStatuses();

    expect(updates[0].sql).not.toMatch(/updated_at/);
  });

  it("tolère une page vide ou malformée", async () => {
    mockMissionsLiees(missions(6));
    kazeService.fetchJobs.mockResolvedValue({});

    await expect(syncService.syncKazeStatuses()).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════
describe("ensureKazeMission", () => {
  const mission = { id: MISSION_ID, vehicle_plate: "AA-123-BB" };

  it("retourne l'identifiant existant sans rappeler Kaze", async () => {
    const resultat = await syncService.ensureKazeMission({
      ...mission,
      kaze_mission_id: "kz-existant",
    });

    expect(resultat).toBe("kz-existant");
    expect(kazeService.createMission).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("crée le job Kaze manquant et persiste son identifiant", async () => {
    db.query.mockResolvedValue({ rows: [] });
    kazeService.createMission.mockResolvedValue({ id: "kz-nouveau" });

    const resultat = await syncService.ensureKazeMission(mission);

    expect(resultat).toBe("kz-nouveau");
    expect(kazeService.createMission).toHaveBeenCalledWith(mission);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/SET kaze_mission_id = \$1/),
      ["kz-nouveau", MISSION_ID],
    );
  });

  it("accepte la forme alternative mission_id de la réponse Kaze", async () => {
    db.query.mockResolvedValue({ rows: [] });
    kazeService.createMission.mockResolvedValue({ mission_id: "kz-alt" });

    const resultat = await syncService.ensureKazeMission(mission);

    expect(resultat).toBe("kz-alt");
  });

  it("retourne null si Kaze répond sans identifiant", async () => {
    kazeService.createMission.mockResolvedValue({});

    const resultat = await syncService.ensureKazeMission(mission);

    expect(resultat).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/sans ID/),
    );
  });

  it("retourne null et journalise si la création Kaze échoue", async () => {
    kazeService.createMission.mockRejectedValue(new Error("Kaze HS"));

    const resultat = await syncService.ensureKazeMission(mission);

    expect(resultat).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/échec création/),
      "Kaze HS",
    );
  });

  it("retourne null si la persistance en base échoue", async () => {
    kazeService.createMission.mockResolvedValue({ id: "kz-nouveau" });
    db.query.mockRejectedValue(new Error("colonne manquante"));

    const resultat = await syncService.ensureKazeMission(mission);

    expect(resultat).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
describe("startSync / stopSync", () => {
  const ENV_ORIGINAL = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers();
    db.query.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    syncService.stopSync();
    jest.useRealTimers();
    process.env = { ...ENV_ORIGINAL };
  });

  it("ne démarre pas si les identifiants Kaze sont absents", () => {
    delete process.env.KAZE_LOGIN;
    delete process.env.KAZE_PASSWORD;

    syncService.startSync();
    jest.advanceTimersByTime(120_000);

    expect(db.query).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/désactivée/),
    );
  });

  it("ne démarre pas si seul le login est configuré", () => {
    process.env.KAZE_LOGIN = "user";
    delete process.env.KAZE_PASSWORD;

    syncService.startSync();
    jest.advanceTimersByTime(120_000);

    expect(db.query).not.toHaveBeenCalled();
  });

  it("laisse 10 secondes au serveur avant le premier cycle", () => {
    process.env.KAZE_LOGIN = "user";
    process.env.KAZE_PASSWORD = "pass";

    syncService.startSync();

    jest.advanceTimersByTime(9_000);
    expect(db.query).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2_000);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("relance un cycle à chaque intervalle", async () => {
    process.env.KAZE_LOGIN = "user";
    process.env.KAZE_PASSWORD = "pass";

    // Un cycle ne se termine qu'après résolution des promesses : il faut vider
    // la file des microtâches entre chaque avance, sinon le verrou `isSyncing`
    // fait rendre la main aux cycles suivants.
    const cycle = async (ms) => {
      jest.advanceTimersByTime(ms);
      await Promise.resolve();
      await Promise.resolve();
    };

    syncService.startSync(30_000);

    await cycle(10_000); // premier cycle différé
    await cycle(30_000); // premier intervalle
    await cycle(30_000); // deuxième intervalle

    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it("annonce l'intervalle de polling en secondes", () => {
    process.env.KAZE_LOGIN = "user";
    process.env.KAZE_PASSWORD = "pass";

    syncService.startSync(45_000);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/toutes les 45s/),
    );
  });

  it("interrompt le polling", () => {
    process.env.KAZE_LOGIN = "user";
    process.env.KAZE_PASSWORD = "pass";

    syncService.startSync(30_000);
    jest.advanceTimersByTime(10_000);
    syncService.stopSync();
    jest.advanceTimersByTime(300_000);

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("reste sans effet si le polling n'a jamais démarré", () => {
    expect(() => syncService.stopSync()).not.toThrow();
  });
});
