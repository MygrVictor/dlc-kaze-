/**
 * Tests unitaires — kaze.service, couche HTTP
 *
 * Complète `kaze.service.test.js` (helpers purs) en couvrant les échanges
 * réseau : authentification, résilience (retry, circuit breaker), pagination,
 * cache, et création de mission.
 *
 * Chaque test recharge le module pour repartir d'un état interne vierge
 * (jeton, cache des missions récentes, compteur du circuit breaker).
 */
jest.mock("axios");
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../services/geocoding.service", () => ({ geocode: jest.fn() }));

const ENV_INITIAL = { ...process.env };

let axios;
let db;
let geocodingService;
let kaze;
let client;
let consoleSpies;

/** Réponse d'authentification Kaze nominale. */
const reponseLogin = {
  data: {
    token: "jeton-constant",
    jwt: { access_token: "jwt-abc" },
    sign_in_count: 42,
  },
};

/** Construit une erreur Axios porteuse d'un statut HTTP. */
function erreurHttp(status, data = {}) {
  const err = new Error(`HTTP ${status}`);
  err.response = { status, data };
  return err;
}

/**
 * Recharge le service avec un client Axios simulé. Les intercepteurs sont
 * capturés puis appliqués manuellement pour vérifier l'injection du jeton.
 */
function chargerService(env = {}) {
  jest.resetModules();
  process.env = {
    ...ENV_INITIAL,
    KAZE_LOGIN: "compte@dlc-kaze.fr",
    KAZE_PASSWORD: "secret",
    KAZE_TARGET_ID: "target-1",
    ...env,
  };

  axios = require("axios");
  db = require("../db");
  geocodingService = require("../services/geocoding.service");

  client = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  axios.create = jest.fn(() => client);
  axios.post = jest.fn().mockResolvedValue(reponseLogin);

  // eslint-disable-next-line global-require
  kaze = require("../services/kaze.service");
  return kaze;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
  chargerService();
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  jest.useRealTimers();
  process.env = { ...ENV_INITIAL };
});

/**
 * Laisse s'écouler les temporisations de backoff exponentiel (1 s puis 2 s).
 * L'avance est volontairement minimale : dépasser la fenêtre de repos de
 * 60 s du circuit breaker fausserait les tests de résilience.
 *
 * Le résultat est capturé *avant* d'avancer l'horloge, sans quoi un rejet
 * survenant pendant l'avance serait signalé comme non géré.
 */
async function avecBackoff(promesse) {
  const resultat = promesse.then(
    (valeur) => () => valeur,
    (erreur) => () => {
      throw erreur;
    },
  );
  await jest.advanceTimersByTimeAsync(4_000);
  return (await resultat)();
}

/** Page de résultats Kaze. */
const page = (donnees, totalPages = 1) => ({
  data: {
    data: donnees,
    meta: { total_pages: totalPages, total_count: donnees.length },
  },
});

// ═════════════════════════════════════════════════════════════
describe("authenticate", () => {
  it("échoue sans identifiants configurés", async () => {
    chargerService({ KAZE_LOGIN: undefined, KAZE_PASSWORD: undefined });

    await expect(kaze.authenticate()).rejects.toThrow(
      /KAZE_LOGIN et KAZE_PASSWORD/,
    );
  });

  it("soumet les identifiants au point d'entrée de connexion", async () => {
    await kaze.authenticate();

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/login$/),
      { user: { login: "compte@dlc-kaze.fr", password: "secret" } },
      expect.objectContaining({ timeout: 15000 }),
    );
  });

  it("joint la clé API quand elle est configurée", async () => {
    chargerService({ KAZE_API_KEY: "cle-api-123" });

    await kaze.authenticate();

    expect(axios.post.mock.calls[0][1].user.api_key).toBe("cle-api-123");
  });

  it("réutilise le jeton constant obtenu lors d'une connexion précédente", async () => {
    await kaze.authenticate();
    // Force l'expiration pour provoquer une seconde authentification.
    jest.advanceTimersByTime(61 * 60 * 1000);
    await kaze.authenticate();

    expect(axios.post.mock.calls[1][1].user.api_key).toBe("jeton-constant");
  });

  it("ne se ré-authentifie pas tant que le jeton est valide", async () => {
    await kaze.authenticate();
    await kaze.authenticate();
    await kaze.authenticate();

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("se ré-authentifie une fois le jeton proche de l'expiration", async () => {
    await kaze.authenticate();
    jest.advanceTimersByTime(56 * 60 * 1000);

    await kaze.authenticate();

    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("traduit un échec de connexion en erreur explicite", async () => {
    axios.post.mockRejectedValue(
      erreurHttp(401, { message: "Identifiants invalides" }),
    );

    await expect(kaze.authenticate()).rejects.toThrow(
      /Kaze auth échouée: Identifiants invalides/,
    );
  });

  it("retombe sur le message d'erreur brut sans détail serveur", async () => {
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(kaze.authenticate()).rejects.toThrow(
      /Kaze auth échouée: ECONNREFUSED/,
    );
  });
});

// ═════════════════════════════════════════════════════════════
describe("Intercepteurs Axios", () => {
  it("injecte le jeton porteur dans chaque requête", async () => {
    const [interceptRequete] = client.interceptors.request.use.mock.calls[0];
    const config = { headers: {} };

    await interceptRequete(config);

    expect(config.headers.Authorization).toBe("Bearer jwt-abc");
  });

  it("journalise puis propage les erreurs de réponse", () => {
    const [, interceptErreur] = client.interceptors.response.use.mock.calls[0];
    const err = {
      config: { method: "get", url: "/jobs" },
      response: { status: 500, data: "boom" },
    };

    expect(() => interceptErreur(err)).toThrow();
    expect(console.error).toHaveBeenCalledWith(
      "❌ Kaze API:",
      "GET",
      "/jobs",
      500,
      "boom",
    );
  });

  it("laisse passer les réponses réussies", () => {
    const [interceptSucces] = client.interceptors.response.use.mock.calls[0];
    const reponse = { status: 200 };

    expect(interceptSucces(reponse)).toBe(reponse);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Résilience — retry et circuit breaker", () => {
  it("réessaie après une erreur serveur puis réussit", async () => {
    client.get
      .mockRejectedValueOnce(erreurHttp(500))
      .mockResolvedValueOnce(page([{ id: "j1" }]));

    const res = await avecBackoff(kaze.fetchJobs());

    expect(client.get).toHaveBeenCalledTimes(2);
    expect(res.data).toHaveLength(1);
  });

  it("abandonne après trois tentatives infructueuses", async () => {
    client.get.mockRejectedValue(erreurHttp(503));

    await expect(avecBackoff(kaze.fetchJobs())).rejects.toThrow();
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it("ne réessaie pas sur une erreur client 4xx", async () => {
    client.get.mockRejectedValue(erreurHttp(404));

    await expect(avecBackoff(kaze.fetchJob("inconnu"))).rejects.toThrow();
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("réessaie malgré tout sur un 429 (quota dépassé)", async () => {
    client.get.mockRejectedValue(erreurHttp(429));

    await expect(avecBackoff(kaze.fetchJobs())).rejects.toThrow();
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it("invalide le jeton et retente immédiatement après un 401", async () => {
    client.get
      .mockRejectedValueOnce(erreurHttp(401))
      .mockResolvedValueOnce(page([]));

    await avecBackoff(kaze.fetchJobs());

    // La reprise est immédiate (pas de backoff) et la requête aboutit.
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("JWT expiré"),
    );
  });

  it("ouvre le circuit après cinq échecs consécutifs", async () => {
    client.get.mockRejectedValue(erreurHttp(500));

    for (let i = 0; i < 5; i += 1) {
      await expect(avecBackoff(kaze.fetchJobs())).rejects.toThrow();
    }

    expect(kaze.getKazeHealth().circuitBreaker.open).toBe(true);
    await expect(kaze.fetchJobs()).rejects.toThrow(/Circuit breaker ouvert/);
  });

  it("referme partiellement le circuit après la fenêtre de repos", async () => {
    client.get.mockRejectedValue(erreurHttp(500));
    for (let i = 0; i < 5; i += 1) {
      await expect(avecBackoff(kaze.fetchJobs())).rejects.toThrow();
    }

    jest.advanceTimersByTime(61_000);

    expect(kaze.getKazeHealth().circuitBreaker.open).toBe(false);
  });

  it("remet le compteur à zéro après un succès", async () => {
    client.get
      .mockRejectedValueOnce(erreurHttp(500))
      .mockResolvedValueOnce(page([]));

    await avecBackoff(kaze.fetchJobs());

    expect(kaze.getKazeHealth().circuitBreaker.failures).toBe(0);
  });

  it("ne pénalise pas le circuit sur une erreur métier 4xx", async () => {
    client.get.mockRejectedValue(erreurHttp(422));

    await expect(kaze.fetchJobs()).rejects.toThrow();

    expect(kaze.getKazeHealth().circuitBreaker.failures).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════
describe("getKazeHealth", () => {
  it("expose l'état du circuit et du jeton", async () => {
    await kaze.authenticate();

    const sante = kaze.getKazeHealth();

    expect(sante.circuitBreaker).toEqual({
      open: false,
      failures: 0,
      threshold: 5,
    });
    expect(sante.token.hasJwt).toBe(true);
    expect(sante.token.expiresAt).toEqual(expect.any(String));
  });

  it("signale l'absence de jeton avant toute authentification", () => {
    expect(kaze.getKazeHealth().token).toEqual({
      hasJwt: false,
      expiresAt: null,
    });
  });
});

// ═════════════════════════════════════════════════════════════
describe("fetchJobs", () => {
  it("applique la pagination par défaut", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchJobs();

    expect(client.get).toHaveBeenCalledWith("/jobs", {
      params: { page: 1, per_page: 100 },
    });
  });

  it("transmet un statut unique en filtre", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchJobs({ status: "assigned" });

    expect(client.get.mock.calls[0][1].params["filter[status]"]).toBe(
      "assigned",
    );
  });

  it("concatène plusieurs statuts", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchJobs({ status: ["waiting", "assigned"] });

    expect(client.get.mock.calls[0][1].params["filter[status]"]).toBe(
      "waiting,assigned",
    );
  });

  it("respecte une pagination explicite", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchJobs({ page: 3, perPage: 25 });

    expect(client.get.mock.calls[0][1].params).toMatchObject({
      page: 3,
      per_page: 25,
    });
  });
});

// ═════════════════════════════════════════════════════════════
describe("fetchAllJobs", () => {
  it("parcourt les cinq statuts et toutes leurs pages", async () => {
    client.get.mockImplementation(async (_url, { params }) => {
      // Deux pages pour chaque statut.
      return page([{ id: `${params["filter[status]"]}-${params.page}` }], 2);
    });

    const jobs = await kaze.fetchAllJobs();

    // 5 statuts × 2 pages
    expect(client.get).toHaveBeenCalledTimes(10);
    expect(jobs).toHaveLength(10);
  });
});

// ═════════════════════════════════════════════════════════════
describe("fetchRecentJobs", () => {
  const jobRecent = (id) => ({
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const jobAncien = (id) => ({
    id,
    created_at: new Date("2020-01-01").toISOString(),
  });

  it("ne conserve que les missions dans la fenêtre demandée", async () => {
    client.get.mockResolvedValue(
      page([jobRecent("recent"), jobAncien("vieux")]),
    );

    const jobs = await kaze.fetchRecentJobs(60);

    expect(jobs.map((j) => j.id)).toEqual(["recent"]);
  });

  it("dédoublonne les missions présentes sous plusieurs statuts", async () => {
    client.get.mockResolvedValue(page([jobRecent("doublon")]));

    const jobs = await kaze.fetchRecentJobs();

    expect(jobs).toHaveLength(1);
  });

  it("conserve la version la plus récente d'un doublon", async () => {
    const ancien = {
      id: "x",
      created_at: new Date().toISOString(),
      updated_at: new Date("2026-01-01").toISOString(),
      titre: "ancien",
    };
    const recent = {
      id: "x",
      created_at: new Date().toISOString(),
      updated_at: new Date("2026-08-01").toISOString(),
      titre: "recent",
    };
    let appel = 0;
    client.get.mockImplementation(async () => {
      appel += 1;
      return page([appel === 1 ? ancien : recent]);
    });

    const jobs = await kaze.fetchRecentJobs();

    expect(jobs[0].titre).toBe("recent");
  });

  it("ignore les entrées dépourvues d'identifiant", async () => {
    client.get.mockResolvedValue(
      page([{ created_at: new Date().toISOString() }]),
    );

    const jobs = await kaze.fetchRecentJobs();

    expect(jobs).toHaveLength(0);
  });

  it("sert le cache pendant cinq minutes", async () => {
    client.get.mockResolvedValue(page([jobRecent("j1")]));

    await kaze.fetchRecentJobs();
    const appelsInitiaux = client.get.mock.calls.length;
    await kaze.fetchRecentJobs();

    expect(client.get).toHaveBeenCalledTimes(appelsInitiaux);
  });

  it("interrompt la pagination des statuts clos dès qu'une page est trop ancienne", async () => {
    client.get.mockImplementation(async (_url, { params }) => {
      const statut = params["filter[status]"];
      if (["completed", "cancelled"].includes(statut))
        return page([jobAncien(`${statut}-1`)], 5);
      return page([], 1);
    });

    await kaze.fetchRecentJobs();

    const appelsClos = client.get.mock.calls.filter(([, cfg]) =>
      ["completed", "cancelled"].includes(cfg.params["filter[status]"]),
    );
    // Une seule page consultée par statut clos, au lieu des cinq annoncées.
    expect(appelsClos).toHaveLength(2);
  });

  it("purge le cache après une assignation", async () => {
    client.get.mockResolvedValue(page([jobRecent("j1")]));
    await kaze.fetchRecentJobs();
    const avant = client.get.mock.calls.length;

    client.put.mockResolvedValue({});
    await kaze.assignDriver("job-1", "driver-1");
    await kaze.fetchRecentJobs();

    expect(client.get.mock.calls.length).toBeGreaterThan(avant);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Lectures simples", () => {
  it("fetchJob interroge la fiche demandée", async () => {
    client.get.mockResolvedValue({ data: { id: "j1" } });

    const res = await kaze.fetchJob("j1");

    expect(client.get).toHaveBeenCalledWith("/jobs/j1");
    expect(res.id).toBe("j1");
  });

  it("fetchUsers pagine les performers", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchUsers({ page: 2, perPage: 50 });

    expect(client.get).toHaveBeenCalledWith("/users", {
      params: { page: 2, per_page: 50 },
    });
  });

  it("fetchInvoices applique les valeurs par défaut", async () => {
    client.get.mockResolvedValue(page([]));

    await kaze.fetchInvoices();

    expect(client.get).toHaveBeenCalledWith("/invoices", {
      params: { page: 1, per_page: 100 },
    });
  });

  it("fetchJobWorkflows liste les modèles de workflow", async () => {
    client.get.mockResolvedValue({ data: { data: [] } });

    await kaze.fetchJobWorkflows();

    expect(client.get).toHaveBeenCalledWith("/job_workflows");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Recherche de convoyeurs", () => {
  it("getDriver interroge la fiche performer", async () => {
    client.get.mockResolvedValue({ data: { id: "d1" } });

    const res = await kaze.getDriver("d1");

    expect(client.get).toHaveBeenCalledWith("/users/d1");
    expect(res.id).toBe("d1");
  });

  it("getDriverByEmail compare sans tenir compte de la casse", async () => {
    client.get.mockResolvedValue(page([{ id: "d1", email: "Jean@Kaze.SO" }]));

    const res = await kaze.getDriverByEmail("jean@kaze.so");

    expect(res.id).toBe("d1");
  });

  it("getDriverByEmail retourne null sans correspondance exacte", async () => {
    client.get.mockResolvedValue(page([{ id: "d1", email: "autre@kaze.so" }]));

    expect(await kaze.getDriverByEmail("jean@kaze.so")).toBeNull();
  });

  it("getDriverByEmail retourne null sur une réponse vide", async () => {
    client.get.mockResolvedValue(page([]));

    expect(await kaze.getDriverByEmail("jean@kaze.so")).toBeNull();
  });

  it("getDriverByPhone refuse un numéro vide", async () => {
    expect(await kaze.getDriverByPhone("")).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("getDriverByPhone reconnaît les formats internationaux", async () => {
    client.get.mockResolvedValue(page([{ id: "d1", phone: "+33612345678" }]));

    const res = await kaze.getDriverByPhone("0612345678");

    expect(res.id).toBe("d1");
  });

  it("getDriverByPhone parcourt les pages si le filtre serveur est ignoré", async () => {
    client.get
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([{ id: "autre", phone: "0699999999" }], 2))
      .mockResolvedValueOnce(page([{ id: "cible", phone: "0612345678" }], 2));

    const res = await kaze.getDriverByPhone("0612345678");

    expect(res.id).toBe("cible");
  });

  it("getDriverByPhone abandonne après la dernière page", async () => {
    client.get.mockResolvedValue(page([{ id: "x", phone: "0600000000" }], 1));

    expect(await kaze.getDriverByPhone("0612345678")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
describe("getMissionsByDriver", () => {
  it("filtre sur le performer et les statuts actifs", async () => {
    client.get.mockResolvedValue(page([{ id: "j1", status: "started" }]));

    const res = await kaze.getMissionsByDriver("d1");

    expect(client.get).toHaveBeenCalledWith("/jobs", {
      params: {
        "filter[performer_id]": "d1",
        "filter[status]": "assigned,started",
        per_page: 100,
      },
    });
    expect(res.missions[0].status).toBe("EN_COURS");
  });

  it("tolère une réponse sans données", async () => {
    client.get.mockResolvedValue({ data: {} });

    const res = await kaze.getMissionsByDriver("d1");

    expect(res.missions).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Assignation de convoyeur", () => {
  it("utilise l'endpoint dédié aux performers", async () => {
    client.put.mockResolvedValue({});

    const res = await kaze.assignDriver("job-1", "driver-1");

    expect(client.put).toHaveBeenCalledWith(
      "/jobs/job-1/performers/driver-1.json",
    );
    expect(res).toBe(true);
  });

  it("n'emprunte jamais la mise à jour générique du job", async () => {
    client.put.mockResolvedValue({});

    await kaze.assignDriver("job-1", "driver-1");

    expect(client.put).not.toHaveBeenCalledWith(
      "/jobs/job-1",
      expect.anything(),
    );
  });

  it("désassigne via le même endpoint dédié", async () => {
    client.delete.mockResolvedValue({});

    const res = await kaze.unassignDriver("job-1", "driver-1");

    expect(client.delete).toHaveBeenCalledWith(
      "/jobs/job-1/performers/driver-1.json",
    );
    expect(res).toBe(true);
  });

  it("liste les performers éligibles", async () => {
    client.get.mockResolvedValue({ data: [{ id: "d1" }] });

    const res = await kaze.listAvailablePerformers("job-1");

    expect(client.get).toHaveBeenCalledWith("/jobs/job-1/performers.json");
    expect(res).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════
describe("updateMissionStatus", () => {
  it("refuse un statut local inconnu", async () => {
    await expect(kaze.updateMissionStatus("j1", "INEXISTANT")).rejects.toThrow(
      /Statut local inconnu/,
    );
    expect(client.put).not.toHaveBeenCalled();
  });

  it.each([
    ["EN_COURS", "started"],
    ["LIVREE", "completed"],
    ["ANNULEE", "cancelled"],
    ["ASSIGNEE", "assigned"],
    ["ACCEPTEE", "waiting"],
  ])("traduit %s en %s", async (local, kazeStatut) => {
    client.put.mockResolvedValue({ data: {} });

    await kaze.updateMissionStatus("j1", local);

    expect(client.put).toHaveBeenCalledWith("/jobs/j1", {
      job: { status: kazeStatut },
    });
  });
});

// ═════════════════════════════════════════════════════════════
describe("updateKazeJob et cancelMission", () => {
  it("met à jour les champs libres d'un job", async () => {
    client.put.mockResolvedValue({ data: { id: "j1" } });

    await kaze.updateKazeJob("j1", { title: "Nouveau" });

    expect(client.put).toHaveBeenCalledWith("/jobs/j1", {
      job: { title: "Nouveau" },
    });
  });

  it("supprime le job pour annuler la mission", async () => {
    client.delete.mockResolvedValue({ data: { ok: true } });

    await kaze.cancelMission("j1");

    expect(client.delete).toHaveBeenCalledWith("/jobs/j1");
  });
});

// ═════════════════════════════════════════════════════════════
describe("testConnection", () => {
  it("rend compte d'une connexion opérationnelle", async () => {
    client.get.mockResolvedValue({
      data: { data: [], meta: { total_count: 7 } },
    });

    const res = await kaze.testConnection();

    expect(res).toMatchObject({
      connected: true,
      authenticated: true,
      totalAssignedJobs: 7,
    });
  });

  it("rend compte d'un échec sans lever d'exception", async () => {
    axios.post.mockRejectedValue(new Error("réseau coupé"));

    const res = await kaze.testConnection();

    expect(res.connected).toBe(false);
    expect(res.error).toMatch(/réseau coupé/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("createMission", () => {
  const MISSION = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    client_id: "client-1",
    vehicle_plate: "AA-123-BB",
    vehicle_brand: "Renault",
    departure_address: "10 rue de Rivoli, Paris",
    arrival_address: "1 place Bellecour, Lyon",
  };

  /**
   * Gabarit de workflow minimal reproduisant la structure Kaze : un nœud
   * racine, une étape « Signature Client » et quelques widgets.
   */
  const gabarit = () => ({
    workflow: {
      type: "template_workflow",
      children: [
        {
          type: "template_job_info",
          children: [],
        },
        {
          id: "e319864c-907d-42ce-b406-579a59666e19",
          type: "template_signature",
          label: "Signature Client",
          children: [],
        },
      ],
    },
  });

  beforeEach(() => {
    client.get.mockResolvedValue({ data: gabarit() });
    client.post.mockResolvedValue({ data: { id: "kz-cree" } });
    db.query.mockResolvedValue({ rows: [] });
    geocodingService.geocode.mockResolvedValue(null);
  });

  it("crée le job sur le workflow de convoyage", async () => {
    const res = await kaze.createMission(MISSION);

    expect(client.post).toHaveBeenCalledWith(
      "/job_workflows/16fcd561-f3b8-4a20-9f05-5bd3b7edb279/job.json",
      expect.objectContaining({ target_id: "target-1" }),
    );
    expect(res.id).toBe("kz-cree");
  });

  it("transmet la cible configurée dans le payload", async () => {
    chargerService({ KAZE_TARGET_ID: "target-perso" });
    client.get.mockResolvedValue({ data: gabarit() });
    client.post.mockResolvedValue({ data: { id: "kz" } });
    db.query.mockResolvedValue({ rows: [] });
    geocodingService.geocode.mockResolvedValue(null);

    await kaze.createMission(MISSION);

    expect(client.post.mock.calls[0][1].target_id).toBe("target-perso");
  });

  it("résout l'email du client en base quand il n'est pas fourni", async () => {
    db.query.mockResolvedValue({ rows: [{ email: "client@test.com" }] });

    await kaze.createMission(MISSION);

    expect(db.query).toHaveBeenCalledWith(
      "SELECT email FROM users WHERE id = $1",
      ["client-1"],
    );
  });

  it("poursuit la création si la base est indisponible", async () => {
    db.query.mockRejectedValue(new Error("base injoignable"));

    await expect(kaze.createMission(MISSION)).resolves.toBeDefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("email client"),
      "base injoignable",
    );
  });

  it("géocode les deux adresses", async () => {
    geocodingService.geocode.mockResolvedValue({ lat: 48.85, lng: 2.35 });

    await kaze.createMission(MISSION);

    expect(geocodingService.geocode).toHaveBeenCalledWith(
      "10 rue de Rivoli, Paris",
    );
    expect(geocodingService.geocode).toHaveBeenCalledWith(
      "1 place Bellecour, Lyon",
    );
  });

  it("se replie sur Paris lorsque le géocodage échoue", async () => {
    geocodingService.geocode.mockRejectedValue(new Error("Nominatim HS"));

    await expect(kaze.createMission(MISSION)).resolves.toBeDefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("erreur géocodage départ"),
      "Nominatim HS",
    );
  });

  it("met en cache le gabarit de workflow", async () => {
    await kaze.createMission(MISSION);
    const appelsGabarit = client.get.mock.calls.length;
    await kaze.createMission(MISSION);

    expect(client.get.mock.calls.length).toBe(appelsGabarit);
  });

  it("configure le récapitulatif de fin de mission sur la signature client", async () => {
    await kaze.createMission({
      ...MISSION,
      client_email: "client@test.com",
    });

    const payload = client.post.mock.calls[0][1];
    const signature = JSON.stringify(payload).includes("client@test.com");
    expect(signature).toBe(true);
  });

  /** Adresses configurées pour le récapitulatif de fin dans le payload. */
  const destinatairesRecap = () => {
    const trouves = [];
    JSON.stringify(client.post.mock.calls[0][1], (cle, valeur) => {
      if (cle === "email_addresses") trouves.push(valeur);
      return valeur;
    });
    return trouves;
  };

  it("adresse le récapitulatif au client, pas au contact de livraison", async () => {
    // Le PV, les photos et les réserves sont opposables à celui qui
    // paie. Le contact d'arrivée a le véhicule sous les yeux quand le
    // mail partirait : il n'en a aucun usage.
    await kaze.createMission({
      ...MISSION,
      client_email: "compte-client@test.com",
      arrival_contact_email: "livraison@test.com",
    });

    expect(destinatairesRecap()).toContain("compte-client@test.com");
    expect(destinatairesRecap()).not.toContain("livraison@test.com");
  });

  it("préfère l'adresse de récapitulatif choisie à la création", async () => {
    // Le client peut router le récapitulatif ailleurs que sur la boîte
    // de son compte — vers sa comptabilité, par exemple.
    await kaze.createMission({
      ...MISSION,
      client_email: "compte-client@test.com",
      recap_email: "compta@entreprise.fr",
    });

    expect(destinatairesRecap()).toContain("compta@entreprise.fr");
    expect(destinatairesRecap()).not.toContain("compte-client@test.com");
  });

  it("avertit lorsqu'aucun email ne permet d'envoyer le récapitulatif", async () => {
    await kaze.createMission(MISSION);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("récap de fin de mission non configuré"),
    );
  });

  describe("observations transmises à Kaze", () => {
    /** Widget « Observations » du workflow CONVOYAGE. */
    const gabaritObs = () => ({
      workflow: {
        type: "template_workflow",
        children: [
          {
            id: "job-info-1",
            type: "template_job_info",
            children: [
              {
                id: "42ba4f33-0b59-4bea-a2e9-8f449fb8edf0",
                type: "widget_text",
                children: [],
              },
            ],
          },
        ],
      },
    });

    const observations = () =>
      client.post.mock.calls[0][1].data["job-info-1"][
        "42ba4f33-0b59-4bea-a2e9-8f449fb8edf0"
      ].data;

    beforeEach(() => {
      client.get.mockResolvedValue({ data: gabaritObs() });
    });

    it("transmet les commentaires du client tels quels", async () => {
      await kaze.createMission({ ...MISSION, comments: "Portail code 1234" });

      expect(observations()).toBe("Portail code 1234");
    });

    it("annonce la mise en main en tête des observations", async () => {
      await kaze.createMission({
        ...MISSION,
        service_handover: true,
        comments: "Portail code 1234",
      });

      expect(observations()).toBe(
        "Mise en main du véhicule demandée.\nPortail code 1234",
      );
    });

    it("annonce la mise en main même sans commentaire", async () => {
      await kaze.createMission({ ...MISSION, service_handover: true });

      expect(observations()).toBe("Mise en main du véhicule demandée.");
    });

    it("n'invente pas d'observations quand rien n'est demandé", async () => {
      await kaze.createMission(MISSION);

      expect(observations()).toBe("");
    });
  });

  describe("dates transmises à Kaze", () => {
    const { lundiDeLaSemaine } = require("../lib/dates");

    // Le gabarit du bloc parent ne porte pas d'identifiant sur le nœud
    // template_job_info : sans id, la sérialisation du payload ignore
    // l'étape. On en fournit donc un ici, ainsi que les widgets de plage.
    const gabaritDate = () => ({
      workflow: {
        type: "template_workflow",
        children: [
          {
            id: "job-info-1",
            type: "template_job_info",
            children: [
              {
                id: "320d66e9-2fa9-4b49-a46f-e28ce05ea971",
                type: "widget_text",
                children: [],
              },
              {
                id: "3e23e9d6-5673-4eb9-b25e-96c954bf3bd9",
                type: "widget_text",
                children: [],
              },
            ],
          },
        ],
      },
    });

    beforeEach(() => {
      client.get.mockResolvedValue({ data: gabaritDate() });
    });

    it("date le job au lundi de la semaine en cours", async () => {
      await kaze.createMission(MISSION);

      const lundi = lundiDeLaSemaine();
      const debut = new Date(lundi).setHours(8, 0, 0, 0);
      const fin = new Date(lundi).setHours(18, 0, 0, 0);

      const brut = JSON.stringify(client.post.mock.calls[0][1]);
      expect(brut).toContain(String(debut));
      expect(brut).toContain(String(fin));
    });

    it("ignore les dates stockées en base sur la mission", async () => {
      await kaze.createMission({
        ...MISSION,
        departure_date: "2020-01-15T09:00:00.000Z",
        arrival_date: "2020-01-17T09:00:00.000Z",
      });

      const brut = JSON.stringify(client.post.mock.calls[0][1]);
      expect(brut).not.toContain(
        String(new Date("2020-01-15T09:00:00.000Z").getTime()),
      );
      expect(brut).not.toContain(
        String(new Date("2020-01-17T09:00:00.000Z").getTime()),
      );
    });

    it("ne transmet jamais la date souhaitée par le client", async () => {
      const souhaitee = "2030-06-12T10:00:00.000Z";

      await kaze.createMission({
        ...MISSION,
        desired_delivery_date: souhaitee,
      });

      const brut = JSON.stringify(client.post.mock.calls[0][1]);
      expect(brut).not.toContain(String(new Date(souhaitee).getTime()));
      expect(brut).not.toContain("2030");
    });

    it("affiche la plage de mission sur le lundi courant", async () => {
      await kaze.createMission(MISSION);

      const lundi = lundiDeLaSemaine();
      const jj = String(lundi.getDate()).padStart(2, "0");
      const mm = String(lundi.getMonth() + 1).padStart(2, "0");

      const brut = JSON.stringify(client.post.mock.calls[0][1]);
      expect(brut).toContain(`Le ${jj}/${mm} à 08h00`);
      expect(brut).toContain(`Le ${jj}/${mm} à 18h00`);
    });
  });
});
