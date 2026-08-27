/**
 * Tests d'intégration — POST /api/auth/register (admin)
 * Couvre : garde d'autorisation, validations, génération de mot de passe
 * temporaire, auto-liaison Kaze, audit et email de bienvenue.
 */
const request = require("supertest");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/email.service", () => ({
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
  notifyNewRegistration: jest.fn().mockResolvedValue(undefined),
  notifyRegistrationReceived: jest.fn().mockResolvedValue(undefined),
  notifyNouvelleDemande: jest.fn().mockResolvedValue(undefined),
  notifyDemandeRecue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/kaze.service", () => ({
  getDriverByEmail: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/sync.service", () => ({ startSync: jest.fn() }));

const db = require("../db");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const kazeService = require("../services/kaze.service");
const app = require("./app.test-setup");

const ADMIN = {
  id: "admin-1",
  email: "admin@dlc.fr",
  full_name: "Admin DLC",
  role: "admin",
  is_validated: true,
};

const CLIENT = {
  id: "client-1",
  email: "client@dlc.fr",
  full_name: "Client",
  role: "client",
  is_validated: true,
};

const tokenPour = (user) =>
  jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

const estRechercheUtilisateur = (sql) => /FROM users WHERE id = \$1/i.test(sql);

/**
 * Installe une implémentation de db.query qui répond d'abord à la
 * recherche d'utilisateur du middleware `authenticate`, puis délègue.
 */
function mockDb(user, handler = () => ({ rows: [] })) {
  db.query.mockImplementation(async (sql, params) => {
    if (estRechercheUtilisateur(sql)) {
      return { rows: user ? [user] : [] };
    }
    return handler(sql, params) || { rows: [] };
  });
}

const LIGNE_CREEE = (surcharges = {}) => ({
  id: "new-uuid",
  email: "nouveau@test.com",
  full_name: "Nouveau Compte",
  role: "client",
  is_validated: true,
  created_at: "2025-01-01T00:00:00.000Z",
  ...surcharges,
});

/** Handler par défaut : email libre puis INSERT réussi. */
const handlerCreation =
  (ligne = LIGNE_CREEE()) =>
  (sql) => {
    if (/SELECT id FROM users WHERE email/i.test(sql)) return { rows: [] };
    if (/INSERT INTO users/i.test(sql)) return { rows: [ligne] };
    return { rows: [] };
  };

const creer = (corps, user = ADMIN) =>
  request(app)
    .post("/api/auth/register")
    .set("Authorization", `Bearer ${tokenPour(user)}`)
    .send(corps);

const CORPS_VALIDE = {
  email: "Nouveau@Test.com  ",
  fullName: "  Nouveau Compte  ",
  phone: "0600000000",
  company: "ACME",
  role: "client",
};

beforeEach(() => {
  jest.clearAllMocks();
  emailService.notifyAccountCreated.mockResolvedValue(undefined);
  kazeService.getDriverByEmail.mockResolvedValue(null);
  mockDb(ADMIN, handlerCreation());
});

// ──────────────────────────────────────────────────────────────
//  Garde d'accès
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — autorisation", () => {
  it("refuse sans token (401)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(CORPS_VALIDE);
    expect(res.status).toBe(401);
  });

  it("refuse un client authentifié (403)", async () => {
    mockDb(CLIENT, handlerCreation());
    const res = await creer(CORPS_VALIDE, CLIENT);
    expect(res.status).toBe(403);
  });

  it("n'insère rien quand l'appelant n'est pas admin", async () => {
    mockDb(CLIENT, handlerCreation());
    await creer(CORPS_VALIDE, CLIENT);
    const inserts = db.query.mock.calls.filter(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(inserts).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────
//  Validations
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — validations", () => {
  it("refuse sans email (400)", async () => {
    const res = await creer({ fullName: "Sans Email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatoires/i);
  });

  it("refuse sans nom complet (400)", async () => {
    const res = await creer({ email: "a@b.fr" });
    expect(res.status).toBe(400);
  });

  it("refuse un email malformé (400)", async () => {
    const res = await creer({ email: "pas-un-email", fullName: "Jean" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email invalide/i);
  });

  it("refuse un nom de plus de 100 caractères (400)", async () => {
    const res = await creer({
      email: "a@b.fr",
      fullName: "x".repeat(101),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100 caractères/i);
  });

  it("accepte un nom de exactement 100 caractères", async () => {
    const res = await creer({ email: "a@b.fr", fullName: "x".repeat(100) });
    expect(res.status).toBe(201);
  });

  it("refuse un email déjà utilisé (409)", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        return { rows: [{ id: "deja-la" }] };
      }
      return { rows: [] };
    });
    const res = await creer(CORPS_VALIDE);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/existe déjà/i);
  });

  it("refuse un mot de passe fourni trop faible (400)", async () => {
    const res = await creer({ ...CORPS_VALIDE, password: "faible" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.error).toBe(res.body.details[0]);
  });

  it("normalise l'email en minuscules et sans espaces", async () => {
    await creer(CORPS_VALIDE);
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][0]).toBe("nouveau@test.com");
  });

  it("supprime les espaces autour du nom complet", async () => {
    await creer(CORPS_VALIDE);
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][2]).toBe("Nouveau Compte");
  });

  it("stocke null pour téléphone et société absents", async () => {
    await creer({ email: "a@b.fr", fullName: "Jean" });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][3]).toBeNull();
    expect(insert[1][4]).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
//  Rôles
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — rôles", () => {
  it("retombe sur client si le rôle est absent", async () => {
    await creer({ email: "a@b.fr", fullName: "Jean" });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][5]).toBe("client");
  });

  it("retombe sur client si le rôle est interdit (admin)", async () => {
    await creer({ email: "a@b.fr", fullName: "Jean", role: "admin" });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][5]).toBe("client");
  });

  it("accepte le rôle convoyeur", async () => {
    await creer({
      email: "a@b.fr",
      fullName: "Jean",
      phone: "0612345678",
      role: "convoyeur",
    });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][5]).toBe("convoyeur");
  });

  it("valide automatiquement le compte créé par l'admin", async () => {
    await creer(CORPS_VALIDE);
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][6]).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
//  Mobile obligatoire pour les convoyeurs (notifications WhatsApp)
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — mobile du convoyeur", () => {
  const convoyeur = (phone) => ({
    email: "driver@test.com",
    fullName: "Marc Driver",
    role: "convoyeur",
    ...(phone === undefined ? {} : { phone }),
  });

  it("refuse un convoyeur sans téléphone (400)", async () => {
    const res = await creer(convoyeur());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile est obligatoire/i);
  });

  it("n'insère rien quand le mobile manque", async () => {
    await creer(convoyeur());
    expect(
      db.query.mock.calls.filter(([sql]) => /INSERT INTO users/i.test(sql)),
    ).toHaveLength(0);
  });

  it("refuse un fixe français (400)", async () => {
    const res = await creer(convoyeur("0145678901"));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile invalide/i);
  });

  it("refuse un numéro trop court", async () => {
    const res = await creer(convoyeur("0612"));
    expect(res.status).toBe(400);
  });

  it("accepte un mobile en 06", async () => {
    expect((await creer(convoyeur("0612345678"))).status).toBe(201);
  });

  it("accepte un mobile en 07", async () => {
    expect((await creer(convoyeur("0712345678"))).status).toBe(201);
  });

  it("accepte les séparateurs usuels", async () => {
    expect((await creer(convoyeur("06 12 34 56 78"))).status).toBe(201);
  });

  it("accepte la forme internationale", async () => {
    expect((await creer(convoyeur("+33 6 12 34 56 78"))).status).toBe(201);
  });

  it("n'exige pas de téléphone pour un client", async () => {
    const res = await creer({
      email: "client@test.com",
      fullName: "Jean Client",
      role: "client",
    });
    expect(res.status).toBe(201);
  });

  it("n'impose aucun format au téléphone d'un client", async () => {
    const res = await creer({
      email: "client@test.com",
      fullName: "Jean Client",
      phone: "0145678901",
      role: "client",
    });
    expect(res.status).toBe(201);
  });
});

// ──────────────────────────────────────────────────────────────
//  Mot de passe
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — mot de passe", () => {
  it("génère un mot de passe temporaire de 12 caractères", async () => {
    const res = await creer(CORPS_VALIDE);
    expect(res.status).toBe(201);
    expect(res.body.generatedPassword).toHaveLength(12);
  });

  it("le mot de passe généré contient les quatre familles de caractères", async () => {
    const res = await creer(CORPS_VALIDE);
    const mdp = res.body.generatedPassword;
    expect(mdp).toMatch(/[A-Z]/);
    expect(mdp).toMatch(/[a-z]/);
    expect(mdp).toMatch(/[0-9]/);
    expect(mdp).toMatch(/[!@#$%&*]/);
  });

  it("génère un mot de passe différent à chaque appel", async () => {
    const a = await creer(CORPS_VALIDE);
    const b = await creer(CORPS_VALIDE);
    expect(a.body.generatedPassword).not.toBe(b.body.generatedPassword);
  });

  it("réutilise le mot de passe fourni s'il est valide", async () => {
    const res = await creer({ ...CORPS_VALIDE, password: "Solide#2025x" });
    expect(res.status).toBe(201);
    expect(res.body.generatedPassword).toBe("Solide#2025x");
  });

  it("ne stocke jamais le mot de passe en clair en base", async () => {
    await creer({ ...CORPS_VALIDE, password: "Solide#2025x" });
    const insert = db.query.mock.calls.find(([sql]) =>
      /INSERT INTO users/i.test(sql),
    );
    expect(insert[1][1]).not.toBe("Solide#2025x");
    expect(insert[1][1]).toMatch(/^\$2[aby]\$/);
  });

  it("n'expose pas le hash dans la réponse", async () => {
    const res = await creer(CORPS_VALIDE);
    expect(res.body.user.password_hash).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────
//  Auto-liaison Kaze (convoyeurs)
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — auto-liaison Kaze", () => {
  const corpsConvoyeur = {
    email: "driver@test.com",
    fullName: "Marc Driver",
    phone: "0612345678",
    role: "convoyeur",
  };

  const ligneConvoyeur = () =>
    LIGNE_CREEE({
      id: "driver-uuid",
      email: "driver@test.com",
      role: "convoyeur",
    });

  it("ne consulte pas Kaze pour un client", async () => {
    await creer(CORPS_VALIDE);
    expect(kazeService.getDriverByEmail).not.toHaveBeenCalled();
  });

  it("lie le convoyeur au driver Kaze trouvé", async () => {
    kazeService.getDriverByEmail.mockResolvedValue({ id: "kaze-42" });
    mockDb(ADMIN, (sql) => {
      if (/SELECT id FROM users WHERE email/i.test(sql)) return { rows: [] };
      if (/INSERT INTO users/i.test(sql)) return { rows: [ligneConvoyeur()] };
      if (/kaze_driver_id = \$1/i.test(sql) && /SELECT/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await creer(corpsConvoyeur);
    expect(res.status).toBe(201);
    expect(res.body.user.kaze_driver_id).toBe("kaze-42");
    const update = db.query.mock.calls.find(([sql]) =>
      /UPDATE users SET kaze_driver_id/i.test(sql),
    );
    expect(update[1]).toEqual(["kaze-42", "driver-uuid"]);
  });

  it("ne lie pas si le driver Kaze est déjà rattaché à un autre compte", async () => {
    kazeService.getDriverByEmail.mockResolvedValue({ id: "kaze-42" });
    mockDb(ADMIN, (sql) => {
      if (/SELECT id FROM users WHERE email/i.test(sql)) return { rows: [] };
      if (/INSERT INTO users/i.test(sql)) return { rows: [ligneConvoyeur()] };
      if (/SELECT id FROM users WHERE kaze_driver_id/i.test(sql)) {
        return { rows: [{ id: "autre-user" }] };
      }
      return { rows: [] };
    });
    const res = await creer(corpsConvoyeur);
    expect(res.status).toBe(201);
    expect(res.body.user.kaze_driver_id).toBeUndefined();
    const update = db.query.mock.calls.find(([sql]) =>
      /UPDATE users SET kaze_driver_id/i.test(sql),
    );
    expect(update).toBeUndefined();
  });

  it("ne lie pas si Kaze ne renvoie aucun driver", async () => {
    kazeService.getDriverByEmail.mockResolvedValue(null);
    mockDb(ADMIN, handlerCreation(ligneConvoyeur()));
    const res = await creer(corpsConvoyeur);
    expect(res.status).toBe(201);
    expect(
      db.query.mock.calls.find(([sql]) =>
        /UPDATE users SET kaze_driver_id/i.test(sql),
      ),
    ).toBeUndefined();
  });

  it("ne lie pas si le driver Kaze n'a pas d'identifiant", async () => {
    kazeService.getDriverByEmail.mockResolvedValue({
      email: "driver@test.com",
    });
    mockDb(ADMIN, handlerCreation(ligneConvoyeur()));
    const res = await creer(corpsConvoyeur);
    expect(res.status).toBe(201);
    expect(res.body.user.kaze_driver_id).toBeUndefined();
  });

  it("crée le compte malgré une panne Kaze (non bloquant)", async () => {
    kazeService.getDriverByEmail.mockRejectedValue(new Error("Kaze HS"));
    mockDb(ADMIN, handlerCreation(ligneConvoyeur()));
    const res = await creer(corpsConvoyeur);
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe("driver-uuid");
  });
});

// ──────────────────────────────────────────────────────────────
//  Email de bienvenue & réponse
// ──────────────────────────────────────────────────────────────
describe("POST /api/auth/register — email et réponse", () => {
  it("envoie l'email de bienvenue avec le mot de passe en clair", async () => {
    const res = await creer(CORPS_VALIDE);
    expect(emailService.notifyAccountCreated).toHaveBeenCalledWith(
      expect.objectContaining({ email: "nouveau@test.com" }),
      res.body.generatedPassword,
    );
  });

  it("crée le compte même si l'email échoue", async () => {
    emailService.notifyAccountCreated.mockRejectedValue(new Error("SMTP HS"));
    const res = await creer(CORPS_VALIDE);
    expect(res.status).toBe(201);
  });

  it("retourne un message mentionnant le rôle créé", async () => {
    const res = await creer({
      email: "a@b.fr",
      fullName: "Jean",
      phone: "0612345678",
      role: "convoyeur",
    });
    expect(res.body.message).toMatch(/convoyeur/i);
  });

  it("retourne 201 avec l'utilisateur créé", async () => {
    const res = await creer(CORPS_VALIDE);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: "new-uuid", role: "client" });
  });

  it("propage une erreur SQL au middleware d'erreur (500)", async () => {
    mockDb(ADMIN, (sql) => {
      if (/SELECT id FROM users WHERE email/i.test(sql)) return { rows: [] };
      if (/INSERT INTO users/i.test(sql)) throw new Error("DB down");
      return { rows: [] };
    });
    const res = await creer(CORPS_VALIDE);
    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────
//  Cas résiduels : demande de contact et connexion
// ──────────────────────────────────────────────────────────────
describe("Routes publiques — cas résiduels", () => {
  const demander = (corps) =>
    request(app).post("/api/auth/demande").send(corps);

  const CORPS_CLIENT = {
    type: "client",
    company: "Garage Public",
    email: "public@test.com",
  };

  const LIGNE_DEMANDE = {
    id: "dem-uuid",
    type: "client",
    created_at: new Date(),
  };

  beforeEach(() => {
    emailService.notifyNouvelleDemande.mockResolvedValue(undefined);
    emailService.notifyDemandeRecue.mockResolvedValue(undefined);
    db.query.mockImplementation(async (sql) => {
      if (/INSERT INTO contact_requests/i.test(sql))
        return { rows: [LIGNE_DEMANDE] };
      return { rows: [] };
    });
  });

  it("refuse un nom de structure de plus de 150 caractères (400)", async () => {
    const res = await demander({ ...CORPS_CLIENT, company: "x".repeat(151) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/trop long/i);
  });

  it("refuse un message de plus de 2000 caractères (400)", async () => {
    const res = await demander({ ...CORPS_CLIENT, message: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2000/);
  });

  it("enregistre la demande malgré l'échec de l'email admin", async () => {
    emailService.notifyNouvelleDemande.mockRejectedValue(new Error("SMTP HS"));
    const res = await demander(CORPS_CLIENT);
    expect(res.status).toBe(201);
    expect(emailService.notifyDemandeRecue).toHaveBeenCalled();
  });

  it("enregistre la demande malgré l'échec de l'accusé de réception", async () => {
    emailService.notifyDemandeRecue.mockRejectedValue(new Error("SMTP HS"));
    const res = await demander(CORPS_CLIENT);
    expect(res.status).toBe(201);
  });

  it("n'envoie pas d'accusé de réception sans email", async () => {
    await demander({
      type: "client",
      company: "Garage Public",
      phone: "0145678901",
    });
    expect(emailService.notifyDemandeRecue).not.toHaveBeenCalled();
  });

  it("écrit dans contact_requests et jamais dans users", async () => {
    await demander(CORPS_CLIENT);
    const appels = db.query.mock.calls.map(([sql]) => sql);
    expect(
      appels.some((sql) => /INSERT INTO contact_requests/i.test(sql)),
    ).toBe(true);
    expect(appels.some((sql) => /INSERT INTO users/i.test(sql))).toBe(false);
  });

  it("propage une erreur SQL à l'enregistrement de la demande (500)", async () => {
    db.query.mockImplementation(async () => {
      throw new Error("DB down");
    });
    const res = await demander(CORPS_CLIENT);
    expect(res.status).toBe(500);
  });

  it("propage une erreur SQL à la connexion (500)", async () => {
    db.query.mockImplementation(async () => {
      throw new Error("DB down");
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "public@test.com", password: "Solide#2025x" });
    expect(res.status).toBe(500);
  });

  it("refuse une demande de convoyeur sans mobile (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile/i);
  });

  it("refuse une demande de convoyeur avec un fixe (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0145678901",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile invalide/i);
  });

  it("accepte une demande de convoyeur avec un mobile", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "73282932000074",
      rcCirculation: "oui",
    });
    expect(res.status).toBe(201);
  });

  // ── Qualification des candidatures convoyeur ──
  // Le formulaire filtre en amont les profils qui ne pourraient pas
  // convoyer, pour éviter des rappels sans issue.

  it("refuse une demande de convoyeur sans SIRET (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      rcCirculation: "oui",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/siret/i);
  });

  it("refuse un SIRET dont la clé de contrôle est fausse (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "12345678901234",
      rcCirculation: "oui",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/siret invalide/i);
  });

  it("refuse un SIREN à 9 chiffres saisi à la place du SIRET (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "732829320",
      rcCirculation: "oui",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/siret invalide/i);
  });

  it("refuse une demande sans réponse sur la RC Circulation (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "73282932000074",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rc circulation/i);
  });

  it("refuse un convoyeur sans RC Circulation ni démarche engagée (400)", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "73282932000074",
      rcCirculation: "non",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rc circulation/i);
  });

  // Un candidat ayant engagé ses démarches reste un bon profil : il sera
  // simplement rappelé plus tard, pas écarté.
  it("accepte un convoyeur dont la RC Circulation est en cours", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "73282932000074",
      rcCirculation: "en_cours",
    });
    expect(res.status).toBe(201);
  });

  it("accepte un SIRET saisi avec des espaces", async () => {
    const res = await demander({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "driver@test.com",
      phone: "0612345678",
      siret: "732 829 320 00074",
      rcCirculation: "oui",
      wGarage: true,
    });
    expect(res.status).toBe(201);
  });

  // Le SIRET n'a de sens que pour une candidature convoyeur : une demande
  // de rappel côté client ne doit pas se voir imposer ces contraintes.
  it("n'exige ni SIRET ni assurance pour une demande client", async () => {
    const res = await demander({
      type: "client",
      company: "ACME",
      firstName: "Camille",
      lastName: "Dupont",
      jobTitle: "Responsable logistique",
      phone: "0612345678",
    });
    expect(res.status).toBe(201);
  });
});
