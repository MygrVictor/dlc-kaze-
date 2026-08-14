/**
 * Tests unitaires — kaze.service
 *
 * Couvre les helpers purs (construction du payload workflow,
 * formatage téléphone/date, navigation dans l'arbre de widgets),
 * les transformations job/user Kaze → DLC, et les appels HTTP
 * d'assignation de performer.
 */
jest.mock("axios");
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../services/geocoding.service", () => ({
  geocode: jest.fn().mockResolvedValue({ lat: 48.8566, lng: 2.3522 }),
}));

const axios = require("axios");

// Le service crée son client axios au require : on prépare l'instance
const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};
axios.create.mockReturnValue(mockClient);
axios.post = jest.fn();

const kaze = require("../services/kaze.service");
const {
  buildWorkflowJobDataPayload,
  formatPhone,
  formatDateSlot,
  findNode,
  setWidgetData,
  normalizePhoneDigits,
} = kaze._internal;

beforeEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
//  formatPhone
// ──────────────────────────────────────────────────────────────
describe("formatPhone", () => {
  it("convertit un numéro français 0X en indicatif 33", () => {
    expect(formatPhone("0612345678")).toBe(33612345678);
  });

  it("conserve un numéro déjà au format 33", () => {
    expect(formatPhone("33612345678")).toBe(33612345678);
  });

  it("ignore les espaces et séparateurs", () => {
    expect(formatPhone("06 12 34 56 78")).toBe(33612345678);
    expect(formatPhone("06.12.34.56.78")).toBe(33612345678);
    expect(formatPhone("+33 6 12 34 56 78")).toBe(33612345678);
  });

  it("retourne 33 par défaut si le numéro est absent", () => {
    expect(formatPhone(null)).toBe(33);
    expect(formatPhone("")).toBe(33);
    expect(formatPhone(undefined)).toBe(33);
  });

  it("retourne un entier, jamais une chaîne (exigence API Kaze)", () => {
    expect(typeof formatPhone("0612345678")).toBe("number");
  });
});

// ──────────────────────────────────────────────────────────────
//  normalizePhoneDigits
// ──────────────────────────────────────────────────────────────
describe("normalizePhoneDigits", () => {
  it("réduit tous les formats au même identifiant à 9 chiffres", () => {
    const expected = "612345678";
    expect(normalizePhoneDigits("0612345678")).toBe(expected);
    expect(normalizePhoneDigits("+33612345678")).toBe(expected);
    expect(normalizePhoneDigits("33612345678")).toBe(expected);
    expect(normalizePhoneDigits("33 6 12 34 56 78")).toBe(expected);
  });

  it("retourne null si le numéro est vide ou sans chiffre", () => {
    expect(normalizePhoneDigits(null)).toBeNull();
    expect(normalizePhoneDigits("")).toBeNull();
    expect(normalizePhoneDigits("abc")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
//  formatDateSlot
// ──────────────────────────────────────────────────────────────
describe("formatDateSlot", () => {
  it("formate une date en « Le JJ/MM à HHhMM »", () => {
    const date = new Date(2026, 7, 5, 14, 30);
    expect(formatDateSlot(date)).toBe("Le 05/08 à 14h30");
  });

  it("complète les chiffres avec un zéro initial", () => {
    const date = new Date(2026, 0, 3, 9, 5);
    expect(formatDateSlot(date)).toBe("Le 03/01 à 09h05");
  });

  it("retourne une chaîne vide si la date est absente", () => {
    expect(formatDateSlot(null)).toBe("");
    expect(formatDateSlot(undefined)).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────
//  findNode / setWidgetData
// ──────────────────────────────────────────────────────────────
describe("findNode", () => {
  const tree = {
    id: "root",
    children: [
      { id: "a", type: "template_job_info" },
      {
        id: "b",
        type: "template_blank",
        children: [{ id: "c", type: "widget_text" }],
      },
    ],
  };

  it("trouve un nœud par identifiant, même imbriqué", () => {
    expect(findNode(tree, { id: "c" })).toMatchObject({ id: "c" });
  });

  it("trouve un nœud par type", () => {
    expect(findNode(tree, { type: "template_job_info" })).toMatchObject({
      id: "a",
    });
  });

  it("retourne null si le nœud n'existe pas", () => {
    expect(findNode(tree, { id: "inexistant" })).toBeNull();
  });
});

describe("setWidgetData", () => {
  it("écrit la donnée dans le widget ciblé", () => {
    const tree = { children: [{ id: "immat", type: "widget_text" }] };
    setWidgetData(tree, "immat", "AA-123-BB");
    expect(tree.children[0].data).toBe("AA-123-BB");
  });

  it("ne lève pas d'erreur si le widget est absent", () => {
    const tree = { children: [] };
    expect(() => setWidgetData(tree, "inconnu", "x")).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────
//  buildWorkflowJobDataPayload
//
//  Régression : les étapes template_signature portent la config
//  d'envoi du mail récapitulatif de fin de mission. Elles étaient
//  auparavant ignorées, ce qui supprimait silencieusement l'email
//  du destinataire.
// ──────────────────────────────────────────────────────────────
describe("buildWorkflowJobDataPayload", () => {
  it("ajoute target_id et performer_id quand ils sont fournis", () => {
    const payload = buildWorkflowJobDataPayload(
      { children: [] },
      { targetId: "target-1", performerId: "perf-1" },
    );
    expect(payload.target_id).toBe("target-1");
    expect(payload.performer_id).toBe("perf-1");
  });

  it("omet target_id et performer_id quand ils sont absents", () => {
    const payload = buildWorkflowJobDataPayload({ children: [] });
    expect(payload).not.toHaveProperty("target_id");
    expect(payload).not.toHaveProperty("performer_id");
  });

  it("sérialise les champs d'une étape template_job_info", () => {
    const workflow = {
      children: [
        {
          id: "step-info",
          type: "template_job_info",
          job_title: "Livraison AA-123-BB",
          job_reference: "DLC-ABCD1234",
          job_due_date: 1700000000000,
          job_address: "10 Rue de Rivoli, Paris",
          job_location: "48.85,2.35",
          performer_estimation: 480,
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["step-info"]["step-info"]).toMatchObject({
      job_title: "Livraison AA-123-BB",
      job_reference: "DLC-ABCD1234",
      job_address: "10 Rue de Rivoli, Paris",
      performer_estimation: 480,
    });
  });

  it("sérialise les champs d'une étape template_navigation", () => {
    const workflow = {
      children: [
        {
          id: "start_navigation",
          type: "template_navigation",
          address: "Paris",
          location: "48.85,2.35",
          place_id: "48.85,2.35",
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["start_navigation"]["start_navigation"]).toEqual({
      address: "Paris",
      location: "48.85,2.35",
      place_id: "48.85,2.35",
    });
  });

  it("sérialise les widgets texte imbriqués dans des sections", () => {
    const workflow = {
      children: [
        {
          id: "step-1",
          type: "template_blank",
          children: [
            {
              type: "section",
              children: [
                { id: "immat", type: "widget_text", data: "AA-123-BB" },
                { id: "model", type: "widget_text", data: "Clio" },
              ],
            },
          ],
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["step-1"]["immat"]).toEqual({ data: "AA-123-BB" });
    expect(payload.data["step-1"]["model"]).toEqual({ data: "Clio" });
  });

  it("sérialise un widget_address avec sa localisation", () => {
    const workflow = {
      children: [
        {
          id: "step-1",
          type: "template_blank",
          children: [
            {
              id: "start_address",
              type: "widget_address",
              data: "10 Rue de Rivoli",
              location: "48.85,2.35",
              place_id: "48.85,2.35",
            },
          ],
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["step-1"]["start_address"]).toEqual({
      data: "10 Rue de Rivoli",
      location: "48.85,2.35",
      place_id: "48.85,2.35",
    });
  });

  it("ignore les widgets sans donnée", () => {
    const workflow = {
      children: [
        {
          id: "step-1",
          type: "template_blank",
          children: [{ id: "vide", type: "widget_text" }],
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);
    expect(payload.data).toEqual({});
  });

  it("sérialise la config email d'une étape template_signature", () => {
    const workflow = {
      children: [
        {
          id: "sig-client",
          type: "template_signature",
          notify_when_completed: true,
          email_send: true,
          email_link: true,
          email_subject: "Convoyage AA-123-BB",
          email_body: "Livraison véhicule effectuée.",
          email_addresses: "client@example.com",
          email_provider_logo: true,
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["sig-client"]["sig-client"]).toMatchObject({
      email_send: true,
      email_addresses: "client@example.com",
      email_subject: "Convoyage AA-123-BB",
      notify_when_completed: true,
    });
  });

  it("sérialise la config email d'une étape template_blank", () => {
    const workflow = {
      children: [
        {
          id: "cmr",
          type: "template_blank",
          email_send: false,
          sms_send: false,
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["cmr"]["cmr"]).toMatchObject({
      email_send: false,
      sms_send: false,
    });
  });

  it("fusionne config email et widgets dans une même étape", () => {
    const workflow = {
      children: [
        {
          id: "cmr",
          type: "template_blank",
          email_send: true,
          email_addresses: "a@b.fr",
          children: [{ id: "note", type: "widget_text", data: "Test" }],
        },
      ],
    };

    const payload = buildWorkflowJobDataPayload(workflow);

    expect(payload.data["cmr"]["cmr"]).toMatchObject({ email_send: true });
    expect(payload.data["cmr"]["note"]).toEqual({ data: "Test" });
  });

  it("ignore les étapes sans identifiant", () => {
    const workflow = { children: [{ type: "template_blank" }] };
    expect(buildWorkflowJobDataPayload(workflow).data).toEqual({});
  });

  it("tolère un workflow sans enfants", () => {
    expect(buildWorkflowJobDataPayload({}).data).toEqual({});
  });
});

// ──────────────────────────────────────────────────────────────
//  kazeJobToLocal
// ──────────────────────────────────────────────────────────────
describe("kazeJobToLocal", () => {
  it("traduit les statuts Kaze en statuts DLC", () => {
    expect(kaze.kazeJobToLocal({ status: "waiting" }).status).toBe(
      kaze.KAZE_TO_LOCAL_STATUS.waiting,
    );
    expect(kaze.kazeJobToLocal({ status: "completed" }).status).toBe(
      kaze.KAZE_TO_LOCAL_STATUS.completed,
    );
  });

  it("conserve le statut brut si non mappé", () => {
    const local = kaze.kazeJobToLocal({ status: "statut_inconnu" });
    expect(local.status).toBe("statut_inconnu");
    expect(local.kaze_status).toBe("statut_inconnu");
  });

  it("extrait latitude et longitude depuis la localisation", () => {
    const local = kaze.kazeJobToLocal({
      work_order_address: { location: "48.8566,2.3522", address: "Paris" },
    });
    expect(local.latitude).toBeCloseTo(48.8566);
    expect(local.longitude).toBeCloseTo(2.3522);
    expect(local.address).toBe("Paris");
  });

  it("retourne des coordonnées nulles sans localisation", () => {
    const local = kaze.kazeJobToLocal({});
    expect(local.latitude).toBeNull();
    expect(local.longitude).toBeNull();
  });

  it("extrait les adresses de départ et d'arrivée depuis les étapes", () => {
    const local = kaze.kazeJobToLocal({
      steps: [
        { id: "start_navigation", address: "Paris" },
        { id: "end_navigation", address: "Lyon" },
      ],
    });
    expect(local.departure_address).toBe("Paris");
    expect(local.arrival_address).toBe("Lyon");
  });

  it("expose les informations du performer", () => {
    const local = kaze.kazeJobToLocal({
      performer: { id: "p-1", name: "Victor Maso", phone: "0612345678" },
    });
    expect(local.performer_id).toBe("p-1");
    expect(local.performer_name).toBe("Victor Maso");
    expect(local.performer_phone).toBe("0612345678");
  });

  it("convertit les dates en objets Date", () => {
    const local = kaze.kazeJobToLocal({
      due_date: "2026-08-05T10:00:00Z",
      created_at: "2026-08-01T10:00:00Z",
    });
    expect(local.due_date).toBeInstanceOf(Date);
    expect(local.created_at).toBeInstanceOf(Date);
    expect(local.start_date).toBeNull();
  });

  it("conserve le job brut pour le débogage", () => {
    const job = { id: "job-1", status: "waiting" };
    expect(kaze.kazeJobToLocal(job).raw).toBe(job);
  });
});

// ──────────────────────────────────────────────────────────────
//  kazeUserToLocal
// ──────────────────────────────────────────────────────────────
describe("kazeUserToLocal", () => {
  it("mappe les champs principaux du performer", () => {
    const local = kaze.kazeUserToLocal({
      id: "u-1",
      user_name: "Victor Maso",
      email: "victor@example.com",
      phone: "0612345678",
      roles: ["performer"],
    });

    expect(local).toMatchObject({
      kaze_user_id: "u-1",
      name: "Victor Maso",
      email: "victor@example.com",
      phone: "0612345678",
      roles: ["performer"],
    });
  });

  it("extrait la position GPS du performer", () => {
    const local = kaze.kazeUserToLocal({
      performer: { location: "48.8566,2.3522", rating: 4.5 },
    });
    expect(local.latitude).toBeCloseTo(48.8566);
    expect(local.longitude).toBeCloseTo(2.3522);
    expect(local.rating).toBe(4.5);
  });

  it("marque l'utilisateur comme désactivé si disabled_at est présent", () => {
    expect(kaze.kazeUserToLocal({ disabled_at: "2026-01-01" }).disabled).toBe(
      true,
    );
    expect(kaze.kazeUserToLocal({}).disabled).toBe(false);
  });

  it("mappe les informations de l'appareil quand elles existent", () => {
    const local = kaze.kazeUserToLocal({
      device: {
        device_name: "iPhone 15",
        platform: "ios",
        app_version: "2.1.0",
        app_status: "active",
      },
    });
    expect(local.device).toEqual({
      name: "iPhone 15",
      platform: "ios",
      app_version: "2.1.0",
      app_status: "active",
    });
  });

  it("retourne un device nul si absent", () => {
    expect(kaze.kazeUserToLocal({}).device).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
//  Mapping des statuts
// ──────────────────────────────────────────────────────────────
describe("Mapping des statuts Kaze ↔ DLC", () => {
  it("mappe les statuts Kaze vers DLC", () => {
    expect(kaze.KAZE_TO_LOCAL_STATUS).toMatchObject({
      assigned: "ASSIGNEE",
      started: "EN_COURS",
      completed: "LIVREE",
    });
  });

  it("mappe les statuts DLC vers Kaze", () => {
    expect(kaze.LOCAL_TO_KAZE_STATUS).toMatchObject({
      ASSIGNEE: "assigned",
      EN_COURS: "started",
      LIVREE: "completed",
    });
  });
});

// ──────────────────────────────────────────────────────────────
//  Assignation de performer
//
//  Régression : l'endpoint générique PUT /jobs/:id ne prenait pas
//  en compte l'assignation. Il faut impérativement passer par
//  l'endpoint dédié performers.
// ──────────────────────────────────────────────────────────────
describe("assignDriver", () => {
  it("appelle l'endpoint dédié performers", async () => {
    mockClient.put.mockResolvedValue({ status: 204, data: null });

    await kaze.assignDriver("job-1", "driver-1");

    expect(mockClient.put).toHaveBeenCalledWith(
      "/jobs/job-1/performers/driver-1.json",
    );
  });

  it("n'utilise jamais l'endpoint générique PUT /jobs/:id", async () => {
    mockClient.put.mockResolvedValue({ status: 204, data: null });

    await kaze.assignDriver("job-1", "driver-1");

    const url = mockClient.put.mock.calls[0][0];
    expect(url).not.toBe("/jobs/job-1");
    expect(url).toContain("/performers/");
  });
});

describe("unassignDriver", () => {
  it("appelle DELETE sur l'endpoint performers", async () => {
    mockClient.delete.mockResolvedValue({ status: 204, data: null });

    await kaze.unassignDriver("job-1", "driver-1");

    expect(mockClient.delete).toHaveBeenCalledWith(
      "/jobs/job-1/performers/driver-1.json",
    );
  });
});

describe("listAvailablePerformers", () => {
  it("récupère la liste des performers éligibles", async () => {
    mockClient.get.mockResolvedValue({ data: { data: [{ id: "p-1" }] } });

    const result = await kaze.listAvailablePerformers("job-1");

    expect(mockClient.get).toHaveBeenCalledWith("/jobs/job-1/performers.json");
    expect(result).toEqual({ data: [{ id: "p-1" }] });
  });
});

// ──────────────────────────────────────────────────────────────
//  getKazeHealth
// ──────────────────────────────────────────────────────────────
describe("getKazeHealth", () => {
  it("expose l'état du circuit breaker et du token", () => {
    const health = kaze.getKazeHealth();
    expect(health).toHaveProperty("circuitBreaker.open");
    expect(health).toHaveProperty("circuitBreaker.failures");
    expect(health).toHaveProperty("token.hasJwt");
  });
});
