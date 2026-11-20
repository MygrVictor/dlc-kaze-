/**
 * Tests — notifications de l'application (push.service)
 *
 * Les convoyeurs reçoivent à la fois l'annonce Telegram et, s'ils l'ont
 * activée, une notification de l'application. Vérifié ici : ce qui part
 * (et ce qui ne part pas), le ménage des abonnements morts, et le fait
 * qu'une panne n'est jamais propagée à l'acceptation du devis.
 */
process.env.VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
jest.mock("../db", () => ({ query: jest.fn() }));

const webpush = require("web-push");
const db = require("../db");
const push = require("../services/push.service");

const MISSION = {
  id: "m1",
  departure_address: "12 rue de la Paix, 49000 Angers, France",
  arrival_address: "5 avenue Foch, 75116 Paris",
  vehicle_plate: "AS-494-DG",
  price_convoyeur: 180,
};

const ABONNES = [
  { endpoint: "https://push.example/a", p256dh: "k1", auth: "a1" },
  { endpoint: "https://push.example/b", p256dh: "k2", auth: "a2" },
];

function mockDb({ reglage = null, abonnes = ABONNES, retour = null } = {}) {
  db.query.mockImplementation(async (sql) => {
    if (/FROM app_settings/i.test(sql))
      return { rows: reglage === null ? [] : [{ value: reglage }] };
    if (/FROM push_subscriptions/i.test(sql)) return { rows: abonnes };
    if (/ordre_trajet = 2/i.test(sql)) return { rows: retour ? [retour] : [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
});

afterEach(() => jest.restoreAllMocks());

describe("composerNotification", () => {
  test("donne les villes et la rémunération, jamais la plaque", () => {
    const n = push.composerNotification(MISSION, "https://x/convoyeur/disponibles");
    expect(n.title).toBe("Nouvelle mission disponible");
    expect(n.body).toBe("Angers → Paris · 180 €");
    expect(n.url).toBe("https://x/convoyeur/disponibles");
    expect(n.tag).toBe("mission-m1");
    expect(JSON.stringify(n)).not.toContain("AS-494-DG");
    expect(JSON.stringify(n)).not.toContain("rue de la Paix");
  });

  test("signale l'urgence et la restitution", () => {
    expect(push.composerNotification({ ...MISSION, is_urgent: true }).title).toBe(
      "Mission urgente",
    );
    expect(
      push.composerNotification({ ...MISSION, restitution_retour_address: "Nantes" })
        .title,
    ).toMatch(/restitution/i);
  });
});

describe("abonnementValide", () => {
  test("accepte un abonnement de navigateur", () => {
    expect(
      push.abonnementValide({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "x", auth: "y" },
      }),
    ).toBe(true);
  });

  test("refuse un endpoint non https ou des clés absentes", () => {
    expect(
      push.abonnementValide({ endpoint: "http://interne:8080", keys: { p256dh: "x", auth: "y" } }),
    ).toBe(false);
    expect(push.abonnementValide({ endpoint: "https://a.b/c" })).toBe(false);
    expect(push.abonnementValide(null)).toBe(false);
  });
});

describe("annoncerMission", () => {
  test("envoie une notification à chaque abonné convoyeur validé", async () => {
    mockDb();
    const bilan = await push.annoncerMission(MISSION, "https://x/convoyeur/disponibles");

    expect(bilan).toEqual({ envoyees: 2, echecs: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const sql = db.query.mock.calls.find(([q]) => /push_subscriptions/.test(q))[0];
    expect(sql).toMatch(/role = 'convoyeur'/);
    expect(sql).toMatch(/is_validated = true/);
  });

  test("n'envoie rien quand l'admin a coupé les notifications", async () => {
    mockDb({ reglage: "false" });
    const bilan = await push.annoncerMission(MISSION);
    expect(bilan.envoyees).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test("n'annonce pas le retour d'une restitution, seulement l'aller", async () => {
    mockDb({ retour: { arrival_address: "Nantes", price_convoyeur: 120 } });
    await push.annoncerMission({ ...MISSION, paire_id: "p1", ordre_trajet: 2 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();

    await push.annoncerMission({ ...MISSION, paire_id: "p1", ordre_trajet: 1 });
    const charge = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
    expect(charge.title).toMatch(/restitution/i);
    expect(charge.body).toContain("300 €");
  });

  test("supprime un abonnement expiré (410) et continue avec les autres", async () => {
    mockDb();
    webpush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }))
      .mockResolvedValueOnce({ statusCode: 201 });

    const bilan = await push.annoncerMission(MISSION);

    expect(bilan).toEqual({ envoyees: 1, echecs: 1 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM push_subscriptions WHERE endpoint/),
      ["https://push.example/a"],
    );
  });

  test("ne lève jamais, même si la base tombe", async () => {
    db.query.mockRejectedValue(new Error("connexion perdue"));
    await expect(push.annoncerMission(MISSION)).resolves.toEqual({
      envoyees: 0,
      echecs: 0,
    });
  });
});
