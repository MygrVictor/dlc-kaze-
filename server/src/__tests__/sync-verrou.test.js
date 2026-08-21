/**
 * Tests unitaires — verrou de synchronisation inter-processus.
 *
 * `isSyncing` ne protège que le processus courant. Or le serveur web et
 * le cron `scripts/sync-once.js` sont deux processus distincts qui
 * écriraient les mêmes lignes en même temps. Le verrou consultatif
 * PostgreSQL est la seule protection réellement partagée : ces tests
 * vérifient qu'il est bien demandé, et surtout respecté.
 */
jest.mock("../db", () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock("../services/kaze.service", () => ({
  fetchJob: jest.fn(),
  fetchJobs: jest.fn(),
  createMission: jest.fn(),
}));

const db = require("../db");
const syncService = require("../services/sync.service");

/**
 * Simule `db.transaction` en fournissant un client dont
 * `pg_try_advisory_xact_lock` renvoie `obtenu`.
 */
function mockVerrou(obtenu) {
  const requetes = [];

  db.transaction.mockImplementation(async (callback) =>
    callback({
      query: async (sql, params) => {
        requetes.push({ sql, params });
        return { rows: [{ obtenu }] };
      },
    }),
  );

  return requetes;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Verrou de synchronisation inter-processus", () => {
  test("demande un verrou consultatif avant de synchroniser", async () => {
    const requetes = mockVerrou(true);
    db.query.mockResolvedValue({ rows: [] });

    await syncService.syncKazeStatuses();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(requetes[0].sql).toMatch(/pg_try_advisory_xact_lock/);
  });

  test("n'interroge pas la base si le verrou est déjà pris", async () => {
    mockVerrou(false);

    await syncService.syncKazeStatuses();

    // Aucune lecture des missions : la passe est abandonnée immédiatement.
    expect(db.query).not.toHaveBeenCalled();
  });

  test("libère le garde intra-processus même si le verrou est refusé", async () => {
    mockVerrou(false);
    await syncService.syncKazeStatuses();

    // Une passe ignorée ne doit pas bloquer les passes suivantes :
    // sans libération d'`isSyncing`, la sync ne repartirait jamais.
    mockVerrou(true);
    db.query.mockResolvedValue({ rows: [] });
    await syncService.syncKazeStatuses();

    expect(db.query).toHaveBeenCalled();
  });

  test("ne laisse pas remonter une erreur de transaction", async () => {
    db.transaction.mockRejectedValue(new Error("connexion perdue"));

    // Le cron ne doit pas mourir sur un incident base : il retentera
    // dans cinq minutes.
    await expect(syncService.syncKazeStatuses()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "❌ Erreur sync Kaze:",
      "connexion perdue",
    );
  });
});
