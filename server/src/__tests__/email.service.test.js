/**
 * Tests unitaires — email.service
 *
 * Le service construit des emails HTML et les remet à Nodemailer. Deux
 * branches de configuration cohabitent : un transporteur SMTP réel quand
 * `SMTP_HOST` est défini, et un repli console en développement.
 */
jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));

jest.mock("resend", () => ({
  Resend: jest.fn(),
}));

const nodemailer = require("nodemailer");
const { Resend } = require("resend");

const MISSION = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AA-123-BB",
  departure_address: "10 rue de Rivoli, Paris",
  arrival_address: "1 place Bellecour, Lyon",
  price: 600,
  price_convoyeur: 400,
};

const ENV_INITIAL = { ...process.env };

let emailService;
let sendMail;
let consoleSpies;

/**
 * Recharge le service avec l'environnement souhaité. Le transporteur est
 * choisi au chargement du module : chaque configuration impose un rechargement.
 */
function chargerService(env = {}) {
  jest.resetModules();
  process.env = {
    ...ENV_INITIAL,
    CLIENT_URL: "https://app.dlc-kaze.fr",
    // Neutralisé par défaut : un .env local ne doit pas détourner les tests
    // vers Resend. Les suites concernées le réactivent explicitement.
    RESEND_API_KEY: undefined,
    ...env,
  };

  sendMail = jest.fn().mockResolvedValue({ messageId: "msg-1" });

  // `resetModules` ré-exécute la fabrique de `jest.mock` : la référence
  // obtenue au chargement du fichier devient obsolète, on la rebranche.
  nodemailer.createTransport = require("nodemailer").createTransport;
  nodemailer.createTransport.mockReturnValue({ sendMail });

  // eslint-disable-next-line global-require
  emailService = require("../services/email.service");
  return emailService;
}

/** Dernier message remis au transporteur. */
const dernierEnvoi = () => sendMail.mock.calls.at(-1)[0];

beforeEach(() => {
  jest.clearAllMocks();
  consoleSpies = [
    jest.spyOn(console, "log").mockImplementation(() => {}),
    jest.spyOn(console, "error").mockImplementation(() => {}),
  ];
  chargerService({ SMTP_HOST: "smtp.test.fr" });
});

afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  process.env = { ...ENV_INITIAL };
});

// ═════════════════════════════════════════════════════════════
describe("Configuration du transporteur", () => {
  it("crée un transporteur SMTP quand SMTP_HOST est défini", () => {
    chargerService({
      SMTP_HOST: "smtp.exemple.fr",
      SMTP_PORT: "587",
      SMTP_USER: "utilisateur",
      SMTP_PASS: "secret",
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.exemple.fr",
      port: 587,
      secure: false,
      auth: { user: "utilisateur", pass: "secret" },
    });
  });

  it("active TLS implicite sur le port 465", () => {
    chargerService({ SMTP_HOST: "smtp.exemple.fr", SMTP_PORT: "465" });

    expect(nodemailer.createTransport.mock.calls.at(-1)[0]).toMatchObject({
      port: 465,
      secure: true,
    });
  });

  it("retient le port 587 par défaut", () => {
    chargerService({ SMTP_HOST: "smtp.exemple.fr", SMTP_PORT: undefined });

    expect(nodemailer.createTransport.mock.calls.at(-1)[0].port).toBe(587);
  });

  it("bascule en mode console sans SMTP_HOST", async () => {
    chargerService({ SMTP_HOST: undefined });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();

    const res = await emailService.notifyAccountValidated(
      "client@test.com",
      "Client",
    );

    expect(res.messageId).toMatch(/^dev-/);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[DEV] Email non envoyé"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("client@test.com"),
    );
  });

  it("utilise l'expéditeur configuré", async () => {
    chargerService({
      SMTP_HOST: "smtp.test.fr",
      SMTP_FROM: "Support <support@dlc-kaze.fr>",
    });

    await emailService.notifyAccountValidated("c@t.fr", "Client");

    expect(dernierEnvoi().from).toBe("Support <support@dlc-kaze.fr>");
  });

  it("retombe sur un expéditeur par défaut", async () => {
    chargerService({
      SMTP_HOST: "smtp.test.fr",
      SMTP_FROM: undefined,
      EMAIL_FROM: undefined,
    });

    await emailService.notifyAccountValidated("c@t.fr", "Client");

    expect(dernierEnvoi().from).toBe("DLC Kaze <onboarding@resend.dev>");
  });

  it("privilégie EMAIL_FROM sur SMTP_FROM", async () => {
    chargerService({
      SMTP_HOST: "smtp.test.fr",
      SMTP_FROM: "Ancien <ancien@dlc-kaze.fr>",
      EMAIL_FROM: "Nouveau <bonjour@dlc-kaze.fr>",
    });

    await emailService.notifyAccountValidated("c@t.fr", "Client");

    expect(dernierEnvoi().from).toBe("Nouveau <bonjour@dlc-kaze.fr>");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Gabarit commun", () => {
  it("produit un document HTML complet", async () => {
    await emailService.notifyAccountValidated("c@t.fr", "Client");

    const { html } = dernierEnvoi();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("</html>");
  });

  it("affiche l'en-tête de marque et l'année courante en pied de page", async () => {
    await emailService.notifyAccountValidated("c@t.fr", "Client");

    const { html } = dernierEnvoi();
    expect(html).toContain("🚗 DLC Kaze");
    expect(html).toContain(`© ${new Date().getFullYear()} DLC Kaze`);
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyDevisPropose", () => {
  const envoyer = (price = 500, mission = MISSION) =>
    emailService.notifyDevisPropose("client@test.com", "Jean", mission, price);

  it("adresse l'email au client", async () => {
    await envoyer();

    expect(dernierEnvoi().to).toBe("client@test.com");
  });

  it("calcule le montant TTC à partir du HT", async () => {
    await envoyer(500);

    const { html, subject } = dernierEnvoi();
    expect(html).toContain("500.00 € HT");
    expect(html).toContain("600.00 € TTC");
    expect(subject).toContain("500.00 € HT");
  });

  it("accepte un prix transmis sous forme de chaîne", async () => {
    await envoyer("450");

    expect(dernierEnvoi().html).toContain("450.00 € HT");
  });

  it("détaille le véhicule et le trajet", async () => {
    await envoyer();

    const { html } = dernierEnvoi();
    expect(html).toContain("Renault Clio — AA-123-BB");
    expect(html).toContain("10 rue de Rivoli, Paris");
    expect(html).toContain("1 place Bellecour, Lyon");
  });

  it("affiche N/A à la place d'une plaque manquante", async () => {
    await envoyer(500, { ...MISSION, vehicle_plate: null });

    expect(dernierEnvoi().html).toContain("— N/A");
  });

  it("pointe vers la fiche mission du client", async () => {
    await envoyer();

    expect(dernierEnvoi().html).toContain(
      `https://app.dlc-kaze.fr/client/missions/${MISSION.id}`,
    );
  });

  it("retombe sur « Véhicule » dans l'objet quand la marque manque", async () => {
    await envoyer(500, { ...MISSION, vehicle_brand: null });

    expect(dernierEnvoi().subject).toContain("Véhicule");
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyMissionAssignee", () => {
  it("nomme le convoyeur assigné", async () => {
    await emailService.notifyMissionAssignee(
      "client@test.com",
      "Jean",
      MISSION,
      "Paul Convoyeur",
    );

    const { html, subject, to } = dernierEnvoi();
    expect(to).toBe("client@test.com");
    expect(html).toContain("Paul Convoyeur");
    expect(html).toContain("Convoyeur assigné");
    expect(subject).toMatch(/Mission en préparation/);
  });

  it("affiche le badge d'information", async () => {
    await emailService.notifyMissionAssignee("c@t.fr", "Jean", MISSION, "Paul");

    expect(dernierEnvoi().html).toContain("badge-info");
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyMissionEnCours", () => {
  it("annonce le convoyage en cours avec le badge d'avertissement", async () => {
    await emailService.notifyMissionEnCours("client@test.com", "Jean", MISSION);

    const { html, subject } = dernierEnvoi();
    expect(html).toContain("en cours de convoyage");
    expect(html).toContain("badge-warning");
    expect(html).toContain("10 rue de Rivoli, Paris → 1 place Bellecour, Lyon");
    expect(subject).toMatch(/Véhicule en cours de convoyage/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyMissionLivree", () => {
  it("confirme la livraison avec le badge de succès", async () => {
    await emailService.notifyMissionLivree("client@test.com", "Jean", MISSION);

    const { html, subject } = dernierEnvoi();
    expect(html).toContain("livré avec succès");
    expect(html).toContain("badge-success");
    expect(html).toContain("1 place Bellecour, Lyon");
    expect(subject).toMatch(/✅ Véhicule livré/);
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyNewRegistration", () => {
  const UTILISATEUR = {
    full_name: "Nouvelle Recrue",
    email: "recrue@test.com",
    role: "convoyeur",
  };

  it("alerte l'administrateur configuré", async () => {
    chargerService({
      SMTP_HOST: "smtp.test.fr",
      ADMIN_EMAIL: "patron@dlc-kaze.fr",
    });

    await emailService.notifyNewRegistration(UTILISATEUR);

    expect(dernierEnvoi().to).toBe("patron@dlc-kaze.fr");
  });

  it("retombe sur l'adresse admin par défaut", async () => {
    chargerService({ SMTP_HOST: "smtp.test.fr", ADMIN_EMAIL: undefined });

    await emailService.notifyNewRegistration(UTILISATEUR);

    expect(dernierEnvoi().to).toBe("admin@dlc-kaze.fr");
  });

  it("résume l'identité du nouvel inscrit", async () => {
    await emailService.notifyNewRegistration(UTILISATEUR);

    const { html, subject } = dernierEnvoi();
    expect(html).toContain("Nouvelle Recrue");
    expect(html).toContain("recrue@test.com");
    expect(html).toContain("convoyeur");
    expect(subject).toBe("Nouvelle inscription — Nouvelle Recrue (convoyeur)");
  });

  it("ajoute l'entreprise quand elle est renseignée", async () => {
    await emailService.notifyNewRegistration({
      ...UTILISATEUR,
      company: "Transports Durand",
    });

    expect(dernierEnvoi().html).toContain("Transports Durand");
  });

  it("masque la ligne entreprise quand elle est absente", async () => {
    await emailService.notifyNewRegistration(UTILISATEUR);

    expect(dernierEnvoi().html).not.toContain("Entreprise");
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyAccountCreated", () => {
  const envoyer = (role = "client") =>
    emailService.notifyAccountCreated(
      { full_name: "Jean Dupont", email: "jean@test.com", role },
      "MotDePasse#2026",
    );

  it("transmet les identifiants au nouvel utilisateur", async () => {
    await envoyer();

    const { to, html } = dernierEnvoi();
    expect(to).toBe("jean@test.com");
    expect(html).toContain("jean@test.com");
    expect(html).toContain("MotDePasse#2026");
  });

  it.each([
    ["convoyeur", "Convoyeur"],
    ["client", "Client"],
  ])("adapte le libellé de rôle pour %s", async (role, libelle) => {
    await envoyer(role);

    expect(dernierEnvoi().html).toContain(`<strong>${libelle}</strong>`);
  });

  it("invite à changer le mot de passe", async () => {
    await envoyer();

    expect(dernierEnvoi().html).toMatch(/changer votre mot de passe/i);
  });

  it("pointe vers la page de connexion", async () => {
    await envoyer();

    expect(dernierEnvoi().html).toContain("https://app.dlc-kaze.fr/login");
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyRegistrationReceived", () => {
  it("confirme la réception sans jamais divulguer de mot de passe", async () => {
    await emailService.notifyRegistrationReceived("client@test.com", "Jean");

    const { to, subject, html } = dernierEnvoi();
    expect(to).toBe("client@test.com");
    expect(subject).toBe("Inscription reçue — En attente de validation");
    expect(html).toContain("en attente de validation");
    expect(html).not.toMatch(/mot de passe/i);
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyAccountValidated", () => {
  it("annonce l'activation et oriente vers la création de mission", async () => {
    await emailService.notifyAccountValidated("client@test.com", "Jean");

    const { subject, html } = dernierEnvoi();
    expect(subject).toMatch(/Compte DLC Kaze validé/);
    expect(html).toContain("validé par un administrateur");
    expect(html).toContain("https://app.dlc-kaze.fr/client/nouvelle-mission");
  });
});

// ═════════════════════════════════════════════════════════════
describe("notifyMissionDisponible", () => {
  const CONVOYEURS = [
    { id: "c1", email: "c1@test.com", full_name: "Convoyeur 1" },
    { id: "c2", email: "c2@test.com", full_name: "Convoyeur 2" },
  ];

  it.each([[[]], [null], [undefined]])(
    "n'envoie rien pour une liste %p",
    async (liste) => {
      const res = await emailService.notifyMissionDisponible(liste, MISSION);

      expect(res).toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it("envoie un message individuel à chaque convoyeur", async () => {
    await emailService.notifyMissionDisponible(CONVOYEURS, MISSION);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map(([m]) => m.to)).toEqual([
      "c1@test.com",
      "c2@test.com",
    ]);
  });

  it("n'utilise ni copie ni copie cachée", async () => {
    await emailService.notifyMissionDisponible(CONVOYEURS, MISSION);

    sendMail.mock.calls.forEach(([message]) => {
      expect(message).not.toHaveProperty("cc");
      expect(message).not.toHaveProperty("bcc");
    });
  });

  it("met en avant la rémunération du convoyeur, pas le prix client", async () => {
    await emailService.notifyMissionDisponible([CONVOYEURS[0]], MISSION);

    const { html } = dernierEnvoi();
    expect(html).toContain("400 €");
    expect(html).not.toContain("600 €");
  });

  it("retombe sur le prix client si la rémunération n'est pas fixée", async () => {
    await emailService.notifyMissionDisponible([CONVOYEURS[0]], {
      ...MISSION,
      price_convoyeur: null,
    });

    expect(dernierEnvoi().html).toContain("600 €");
  });

  it("masque la ligne de rémunération quand aucun prix n'est fixé", async () => {
    await emailService.notifyMissionDisponible([CONVOYEURS[0]], {
      ...MISSION,
      price: null,
      price_convoyeur: null,
    });

    expect(dernierEnvoi().html).not.toContain("Rémunération");
  });

  it("oriente vers la liste des missions disponibles", async () => {
    await emailService.notifyMissionDisponible([CONVOYEURS[0]], MISSION);

    expect(dernierEnvoi().html).toContain(
      "https://app.dlc-kaze.fr/convoyeur/disponibles",
    );
  });

  it("poursuit l'envoi malgré l'échec d'un destinataire", async () => {
    sendMail
      .mockRejectedValueOnce(new Error("adresse rejetée"))
      .mockResolvedValueOnce({ messageId: "ok" });

    await expect(
      emailService.notifyMissionDisponible(CONVOYEURS, MISSION),
    ).resolves.toBeDefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("c1@test.com"),
      "adresse rejetée",
    );
  });
});

// ═════════════════════════════════════════════════════════════
//  Transporteur Resend
// ═════════════════════════════════════════════════════════════
describe("Transporteur Resend", () => {
  let envoyer;

  /** Recharge le service avec Resend actif. */
  function chargerAvecResend(env = {}, reponse = { data: { id: "re_1" } }) {
    jest.resetModules();
    process.env = {
      ...ENV_INITIAL,
      CLIENT_URL: "https://app.dlc-kaze.fr",
      RESEND_API_KEY: "re_cle_test",
      ...env,
    };

    envoyer = jest.fn().mockResolvedValue(reponse);

    // `resetModules` recrée les mocks : on rebranche la référence.
    const { Resend: ResendFrais } = require("resend");
    Resend.mockImplementation =
      ResendFrais.mockImplementation.bind(ResendFrais);
    ResendFrais.mockImplementation(() => ({ emails: { send: envoyer } }));

    // eslint-disable-next-line global-require
    return require("../services/email.service");
  }

  const charge = () => envoyer.mock.calls.at(-1)[0];

  it("est préféré à SMTP quand la clé est présente", async () => {
    // Le `beforeEach` global a déjà chargé la branche SMTP : on repart de zéro
    // pour n'observer que le chargement piloté par Resend.
    nodemailer.createTransport.mockClear();

    const service = chargerAvecResend({ SMTP_HOST: "smtp.test.fr" });

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("transmet un destinataire sous forme de tableau", async () => {
    const service = chargerAvecResend();

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(charge().to).toEqual(["c@t.fr"]);
  });

  it("utilise EMAIL_FROM comme expéditeur", async () => {
    const service = chargerAvecResend({
      EMAIL_FROM: "DLC Kaze <bonjour@dlc-kaze.fr>",
    });

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(charge().from).toBe("DLC Kaze <bonjour@dlc-kaze.fr>");
  });

  it("retombe sur le domaine de test de Resend sans expéditeur configuré", async () => {
    const service = chargerAvecResend({
      EMAIL_FROM: undefined,
      SMTP_FROM: undefined,
    });

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(charge().from).toBe("DLC Kaze <onboarding@resend.dev>");
  });

  it("transmet le sujet et le corps HTML", async () => {
    const service = chargerAvecResend();

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(charge().subject).toMatch(/validé/i);
    expect(charge().html).toContain("<!DOCTYPE html>");
  });

  it("n'ajoute pas de champ texte quand il est absent", async () => {
    const service = chargerAvecResend();

    await service.notifyAccountValidated("c@t.fr", "Client");

    expect(charge()).not.toHaveProperty("text");
  });

  it("retourne l'identifiant du message renvoyé par Resend", async () => {
    const service = chargerAvecResend({}, { data: { id: "re_abc" } });

    const resultat = await service.notifyAccountValidated("c@t.fr", "Client");

    expect(resultat.messageId).toBe("re_abc");
  });

  it("convertit une erreur Resend en exception explicite", async () => {
    const service = chargerAvecResend(
      {},
      { error: { message: "API key is invalid" } },
    );

    await expect(
      service.notifyAccountValidated("c@t.fr", "Client"),
    ).rejects.toThrow(/Resend : API key is invalid/);
  });

  it("sérialise une erreur Resend sans message", async () => {
    const service = chargerAvecResend({}, { error: { statusCode: 422 } });

    await expect(
      service.notifyAccountValidated("c@t.fr", "Client"),
    ).rejects.toThrow(/422/);
  });

  it("envoie un message par convoyeur pour une mission disponible", async () => {
    const service = chargerAvecResend();

    await service.notifyMissionDisponible(
      [{ email: "c1@test.com" }, { email: "c2@test.com" }],
      MISSION,
    );

    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(envoyer.mock.calls.map(([c]) => c.to)).toEqual([
      ["c1@test.com"],
      ["c2@test.com"],
    ]);
  });
});
