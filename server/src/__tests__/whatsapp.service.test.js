/**
 * Tests unitaires — whatsapp.service
 *
 * Le service notifie les convoyeurs via l'API Cloud de Meta. Deux branches
 * de configuration cohabitent : envoi réel quand `WHATSAPP_TOKEN` et
 * `WHATSAPP_PHONE_ID` sont définis, repli console sinon.
 */
jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn() }));

const axios = require("axios");

const ENV_INITIAL = { ...process.env };

const MISSION = {
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AA-123-BB",
  departure_address: "10 rue de Rivoli, Paris",
  arrival_address: "1 place Bellecour, Lyon",
  price: 600,
  price_convoyeur: 400,
};

const CONVOYEUR = { phone: "0612345678", full_name: "Marc Convoyeur" };

let service;
let consoleSpies;

/**
 * Recharge le service avec l'environnement souhaité. Le fournisseur est
 * déterminé au chargement du module : chaque configuration impose un
 * rechargement.
 */
function chargerService(env = {}) {
  jest.resetModules();
  process.env = {
    ...ENV_INITIAL,
    WHATSAPP_TOKEN: "jeton-test",
    WHATSAPP_PHONE_ID: "111222333",
    ...env,
  };

  // `resetModules` ré-exécute la fabrique de `jest.mock` : les références
  // obtenues au chargement du fichier deviennent obsolètes, on les rebranche.
  const axiosFrais = require("axios");
  axios.post = axiosFrais.post;
  axios.get = axiosFrais.get;
  axios.post.mockResolvedValue({ data: { messages: [{ id: "wamid.1" }] } });
  axios.get.mockResolvedValue({ data: {} });

  // eslint-disable-next-line global-require
  service = require("../services/whatsapp.service");
  return service;
}

/** Corps de la dernière requête envoyée à Meta. */
const dernierEnvoi = () => axios.post.mock.calls.at(-1)[1];

/** Valeurs des paramètres du template du dernier envoi. */
const derniersParametres = () =>
  dernierEnvoi().template.components[0].parameters.map((p) => p.text);

beforeEach(() => {
  jest.clearAllMocks();
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
  chargerService();
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  process.env = { ...ENV_INITIAL };
});

// ═════════════════════════════════════════════════════════════
describe("normaliserNumero", () => {
  it("convertit un mobile français national en international", () => {
    expect(service.normaliserNumero("0612345678")).toBe("33612345678");
  });

  it("accepte les séparateurs usuels", () => {
    expect(service.normaliserNumero("06 12 34 56 78")).toBe("33612345678");
    expect(service.normaliserNumero("06.12.34.56.78")).toBe("33612345678");
    expect(service.normaliserNumero("06-12-34-56-78")).toBe("33612345678");
  });

  it("retire le préfixe « + » d'un numéro international", () => {
    expect(service.normaliserNumero("+33 6 12 34 56 78")).toBe("33612345678");
  });

  it("traite « 00 » comme un indicatif de sortie", () => {
    expect(service.normaliserNumero("0033612345678")).toBe("33612345678");
  });

  it("conserve un numéro déjà international sans préfixe", () => {
    expect(service.normaliserNumero("33612345678")).toBe("33612345678");
  });

  it("retire le zéro national conservé après l'indicatif", () => {
    expect(service.normaliserNumero("+330638872575")).toBe("33638872575");
    expect(service.normaliserNumero("00330638872575")).toBe("33638872575");
    expect(service.normaliserNumero("330638872575")).toBe("33638872575");
  });

  it("accepte un numéro étranger", () => {
    expect(service.normaliserNumero("+32 470 12 34 56")).toBe("32470123456");
  });

  it("ignore les espaces de bord", () => {
    expect(service.normaliserNumero("  0612345678  ")).toBe("33612345678");
  });

  it("refuse une valeur absente", () => {
    expect(service.normaliserNumero(null)).toBeNull();
    expect(service.normaliserNumero(undefined)).toBeNull();
    expect(service.normaliserNumero("")).toBeNull();
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    expect(service.normaliserNumero(612345678)).toBeNull();
    expect(service.normaliserNumero({})).toBeNull();
  });

  it("refuse un texte sans aucun chiffre", () => {
    expect(service.normaliserNumero("appelez-moi")).toBeNull();
  });

  it("refuse un numéro trop court", () => {
    expect(service.normaliserNumero("+33 6 12")).toBeNull();
    expect(service.normaliserNumero("0612345")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
describe("estActif", () => {
  it("est actif quand jeton et numéro sont configurés", () => {
    expect(chargerService().estActif()).toBe(true);
  });

  it("est inactif sans jeton", () => {
    expect(chargerService({ WHATSAPP_TOKEN: undefined }).estActif()).toBe(
      false,
    );
  });

  it("est inactif sans identifiant de numéro", () => {
    expect(chargerService({ WHATSAPP_PHONE_ID: undefined }).estActif()).toBe(
      false,
    );
  });
});

// ═════════════════════════════════════════════════════════════
describe("envoyerTemplate", () => {
  it("cible l'API Cloud du numéro configuré", async () => {
    await service.envoyerTemplate("33612345678", ["A"]);

    expect(axios.post.mock.calls[0][0]).toBe(
      "https://graph.facebook.com/v21.0/111222333/messages",
    );
  });

  it("respecte la version d'API configurée", async () => {
    const s = chargerService({ WHATSAPP_API_VERSION: "v19.0" });
    await s.envoyerTemplate("33612345678", ["A"]);

    expect(axios.post.mock.calls[0][0]).toContain("/v19.0/");
  });

  it("envoie un message de type template", async () => {
    await service.envoyerTemplate("33612345678", ["A"]);

    expect(dernierEnvoi()).toMatchObject({
      messaging_product: "whatsapp",
      to: "33612345678",
      type: "template",
    });
  });

  it("utilise le template et la langue par défaut", async () => {
    await service.envoyerTemplate("33612345678", ["A"]);

    expect(dernierEnvoi().template.name).toBe("mission_disponible");
    expect(dernierEnvoi().template.language.code).toBe("fr");
  });

  it("respecte un template et une langue personnalisés", async () => {
    const s = chargerService({
      WHATSAPP_TEMPLATE: "alerte_mission",
      WHATSAPP_TEMPLATE_LANG: "fr_FR",
    });
    await s.envoyerTemplate("33612345678", ["A"]);

    expect(dernierEnvoi().template.name).toBe("alerte_mission");
    expect(dernierEnvoi().template.language.code).toBe("fr_FR");
  });

  it("transmet les variables comme paramètres texte", async () => {
    await service.envoyerTemplate("33612345678", ["Marc", "Clio"]);

    expect(dernierEnvoi().template.components[0]).toEqual({
      type: "body",
      parameters: [
        { type: "text", text: "Marc" },
        { type: "text", text: "Clio" },
      ],
    });
  });

  it("authentifie la requête avec le jeton", async () => {
    await service.envoyerTemplate("33612345678", ["A"]);

    expect(axios.post.mock.calls[0][2].headers.Authorization).toBe(
      "Bearer jeton-test",
    );
  });

  it("borne la durée de la requête", async () => {
    await service.envoyerTemplate("33612345678", ["A"]);

    expect(axios.post.mock.calls[0][2].timeout).toBe(10_000);
  });

  it("retourne l'identifiant du message", async () => {
    const resultat = await service.envoyerTemplate("33612345678", ["A"]);

    expect(resultat.messageId).toBe("wamid.1");
  });

  it("n'appelle pas Meta en mode dev", async () => {
    const s = chargerService({ WHATSAPP_TOKEN: undefined });

    const resultat = await s.envoyerTemplate("33612345678", ["A"]);

    expect(axios.post).not.toHaveBeenCalled();
    expect(resultat.messageId).toMatch(/^dev-/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifierMissionDisponible", () => {
  it("ne fait rien sans destinataire", async () => {
    expect(await service.notifierMissionDisponible([], MISSION)).toEqual({
      envoyes: 0,
      ignores: 0,
      echecs: 0,
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("tolère une liste absente", async () => {
    expect(await service.notifierMissionDisponible(null, MISSION)).toEqual({
      envoyes: 0,
      ignores: 0,
      echecs: 0,
    });
  });

  it("envoie un message par convoyeur", async () => {
    await service.notifierMissionDisponible(
      [CONVOYEUR, { phone: "0698765432", full_name: "Léa" }],
      MISSION,
    );

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls.map(([, corps]) => corps.to)).toEqual([
      "33612345678",
      "33698765432",
    ]);
  });

  it("compose le véhicule à partir de la marque, du modèle et de la plaque", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(derniersParametres()[1]).toBe("Renault Clio AA-123-BB");
  });

  it("transmet les adresses de départ et d'arrivée", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(derniersParametres()[2]).toBe("10 rue de Rivoli, Paris");
    expect(derniersParametres()[3]).toBe("1 place Bellecour, Lyon");
  });

  it("annonce la rémunération du convoyeur, jamais le prix client", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(derniersParametres()[4]).toBe("400 €");
    expect(derniersParametres().join(" ")).not.toContain("600");
  });

  it("retombe sur le prix global sans rémunération dédiée", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], {
      ...MISSION,
      price_convoyeur: null,
    });

    expect(derniersParametres()[4]).toBe("600 €");
  });

  it("indique « à définir » quand aucun prix n'est fixé", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], {
      ...MISSION,
      price: null,
      price_convoyeur: null,
    });

    expect(derniersParametres()[4]).toBe("à définir");
  });

  it("personnalise le message avec le nom du convoyeur", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(derniersParametres()[0]).toBe("Marc Convoyeur");
  });

  it("retombe sur un libellé générique sans nom", async () => {
    await service.notifierMissionDisponible([{ phone: "0612345678" }], MISSION);

    expect(derniersParametres()[0]).toBe("Convoyeur");
  });

  it("neutralise les retours à la ligne des adresses", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], {
      ...MISSION,
      departure_address: "10 rue de Rivoli\n75004 Paris",
    });

    expect(derniersParametres()[2]).toBe("10 rue de Rivoli 75004 Paris");
  });

  it("tronque une adresse trop longue", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], {
      ...MISSION,
      arrival_address: "a".repeat(120),
    });

    const arrivee = derniersParametres()[3];
    expect(arrivee).toHaveLength(60);
    expect(arrivee.endsWith("…")).toBe(true);
  });

  it("remplace un champ vide par un tiret", async () => {
    await service.notifierMissionDisponible([CONVOYEUR], {
      ...MISSION,
      departure_address: "   ",
    });

    expect(derniersParametres()[2]).toBe("—");
  });

  it("ignore un convoyeur sans numéro exploitable", async () => {
    const bilan = await service.notifierMissionDisponible(
      [{ full_name: "Sans Numéro" }, CONVOYEUR],
      MISSION,
    );

    expect(bilan).toEqual({ envoyes: 1, ignores: 1, echecs: 0 });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("signale en console le convoyeur ignoré", async () => {
    await service.notifierMissionDisponible(
      [{ full_name: "Sans Numéro" }],
      MISSION,
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Sans Numéro"),
    );
  });

  it("poursuit l'envoi malgré l'échec d'un destinataire", async () => {
    axios.post
      .mockRejectedValueOnce(new Error("réseau indisponible"))
      .mockResolvedValueOnce({ data: { messages: [{ id: "wamid.2" }] } });

    const bilan = await service.notifierMissionDisponible(
      [CONVOYEUR, { phone: "0698765432" }],
      MISSION,
    );

    expect(bilan).toEqual({ envoyes: 1, ignores: 0, echecs: 1 });
  });

  it("détaille l'erreur renvoyée par Meta", async () => {
    axios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: { message: "Template does not exist", code: 132001 },
        },
      },
    });

    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("33612345678"),
      "Template does not exist (code 132001)",
    );
  });

  it("privilégie le message destiné à l'utilisateur", async () => {
    axios.post.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: "Generic error",
            error_user_msg: "Numéro non inscrit sur WhatsApp",
            code: 131026,
          },
        },
      },
    });

    await service.notifierMissionDisponible([CONVOYEUR], MISSION);

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      "Numéro non inscrit sur WhatsApp (code 131026)",
    );
  });
});

// ═════════════════════════════════════════════════════════════
describe("verifierConfiguration", () => {
  it("signale l'absence de configuration", async () => {
    const s = chargerService({ WHATSAPP_TOKEN: undefined });

    expect(await s.verifierConfiguration()).toEqual({
      actif: false,
      message: "Aucun identifiant WhatsApp configuré.",
    });
  });

  it("retourne les informations du numéro expéditeur", async () => {
    axios.get.mockResolvedValue({
      data: {
        display_phone_number: "+33 6 11 22 33 44",
        verified_name: "DLC Kaze",
        quality_rating: "GREEN",
      },
    });

    expect(await service.verifierConfiguration()).toEqual({
      actif: true,
      numero: "+33 6 11 22 33 44",
      nom: "DLC Kaze",
      qualite: "GREEN",
    });
  });

  it("interroge l'API avec le jeton configuré", async () => {
    await service.verifierConfiguration();

    expect(axios.get.mock.calls[0][0]).toContain("/v21.0/111222333");
    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer jeton-test",
    );
  });

  it("remonte une erreur d'authentification sans lever d'exception", async () => {
    axios.get.mockRejectedValue({
      response: { data: { error: { message: "Invalid access token" } } },
    });

    const etat = await service.verifierConfiguration();

    expect(etat.actif).toBe(true);
    expect(etat.erreur).toBe("Invalid access token");
  });

  it("retombe sur le message brut hors réponse Meta", async () => {
    axios.get.mockRejectedValue(new Error("timeout"));

    expect((await service.verifierConfiguration()).erreur).toBe("timeout");
  });
});
