/**
 * Dépôt des justificatifs par un candidat convoyeur.
 *
 * C'est la seule route du service qui accepte un fichier d'un visiteur
 * anonyme. Ce que ces tests vérifient tient en une phrase : sans jeton
 * valide, rien n'entre — et rien ne reste sur le disque.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req, _res, next) => next()),
);

jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

jest.mock("../services/kaze.service", () => ({
  getDriver: jest.fn(),
  getDriverByEmail: jest.fn(),
  getDriverByPhone: jest.fn(),
  getMissionsByDriver: jest.fn(),
  fetchRecentJobs: jest.fn(),
  fetchJob: jest.fn(),
  assignDriver: jest.fn(),
  kazeJobToLocal: jest.fn(),
  createMission: jest.fn(),
  cancelMission: jest.fn(),
}));

jest.mock("../services/sync.service", () => ({
  startSync: jest.fn(),
  ensureKazeMission: jest.fn(),
}));

jest.mock("../services/email.service", () => ({
  notifyNouvelleDemande: jest.fn().mockResolvedValue(undefined),
  notifyDemandeRecue: jest.fn().mockResolvedValue(undefined),
  notifyMissionDisponible: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/devis.service", () => ({ generateDevisPDF: jest.fn() }));

const db = require("../db");
const app = require("./app.test-setup");

const UPLOAD_DIR = path.join(process.env.UPLOADS_DIR, "documents");
const DEMANDE_ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "a".repeat(64);

// Un PDF minimal mais authentique : Multer se fie au type MIME déclaré,
// on le déclare donc explicitement dans `attach`.
const FICHIER = Buffer.from("%PDF-1.4\n%%EOF\n");

/** Fichiers présents dans le dossier d'upload, pour détecter les résidus. */
const inventaire = () =>
  fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];

const DOCUMENTS_REQUIS = [
  "carte_identite",
  "carte_identite_verso",
  "permis",
  "permis_verso",
  "kbis",
  "rc_circulation",
  "rc_pro",
  "domicile",
];

/**
 * Ce que le disque garde d'une candidature.
 *
 * Multer écrit les fichiers avant que la route ne se prononce : c'est
 * une contrainte du middleware, pas un choix. Toute la question est donc
 * de savoir ce qu'il en reste une fois la requête tranchée — un dépôt
 * anonyme qui laisserait ses fichiers derrière lui offrirait un espace
 * de stockage gratuit à qui sait poster un formulaire.
 */
describe("Candidature convoyeur — sort des fichiers reçus", () => {
  let avant;

  beforeEach(() => {
    jest.clearAllMocks();
    avant = inventaire();
    db.transaction.mockImplementation((callback) =>
      callback({ query: (...args) => db.query(...args) }),
    );
    db.query.mockResolvedValue({
      rows: [{ id: DEMANDE_ID, type: "convoyeur", created_at: new Date() }],
    });
  });

  afterEach(() => {
    // Toute pièce écrite pendant un test est retirée : les tests ne
    // doivent pas laisser de fichiers derrière eux.
    for (const f of inventaire()) {
      if (!avant.includes(f)) fs.unlinkSync(path.join(UPLOAD_DIR, f));
    }
  });

  const candidater = ({ pieces = DOCUMENTS_REQUIS, ...champs } = {}) => {
    const req = request(app)
      .post("/api/auth/demande")
      .field("type", champs.type ?? "convoyeur")
      .field("firstName", "Jean")
      .field("lastName", "Convoy")
      .field("email", "jean@convoy.fr")
      .field("phone", "0612345678")
      .field("typeIdentite", "cni");
    if (champs.company) req.field("company", champs.company);
    for (const piece of pieces) {
      req.attach(piece, FICHIER, {
        filename: `${piece}.pdf`,
        contentType: "application/pdf",
      });
    }
    return req;
  };

  it("conserve les pièces d'une candidature acceptée", async () => {
    const res = await candidater();

    expect(res.status).toBe(201);
    expect(inventaire().length).toBe(avant.length + DOCUMENTS_REQUIS.length);
  });

  it("n'écrit rien en base tant qu'une pièce manque", async () => {
    const res = await candidater({
      pieces: DOCUMENTS_REQUIS.filter((d) => d !== "domicile"),
    });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("efface du disque les pièces d'un dossier incomplet", async () => {
    // Six fichiers ont bien été reçus ; refuser la candidature sans les
    // supprimer laisserait des orphelins que plus rien ne référence.
    await candidater({
      pieces: DOCUMENTS_REQUIS.filter((d) => d !== "domicile"),
    });

    expect(inventaire()).toEqual(avant);
  });

  it("efface les fichiers d'une candidature au téléphone invalide", async () => {
    const req = request(app)
      .post("/api/auth/demande")
      .field("type", "convoyeur")
      .field("firstName", "Jean")
      .field("lastName", "Convoy")
      .field("email", "jean@convoy.fr")
      .field("phone", "0145678901");
    for (const piece of DOCUMENTS_REQUIS) {
      req.attach(piece, FICHIER, {
        filename: `${piece}.pdf`,
        contentType: "application/pdf",
      });
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(inventaire()).toEqual(avant);
  });

  it("écarte les fichiers joints à une demande client", async () => {
    // Un client n'a aucune pièce à fournir : des fichiers joints ici
    // relèvent au mieux de l'erreur, au pire du dépôt opportuniste.
    const res = await candidater({
      type: "client",
      company: "Garage du Centre",
      pieces: ["carte_identite"],
    });

    expect(res.status).toBe(201);
    expect(inventaire()).toEqual(avant);
  });

  it("refuse un fichier déguisé en pièce justificative", async () => {
    const res = await request(app)
      .post("/api/auth/demande")
      .field("type", "convoyeur")
      .field("firstName", "Jean")
      .field("lastName", "Convoy")
      .field("email", "jean@convoy.fr")
      .field("phone", "0612345678")
      .field("typeIdentite", "cni")
      .attach("carte_identite", Buffer.from("<script>alert(1)</script>"), {
        filename: "piege.html",
        contentType: "text/html",
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(inventaire()).toEqual(avant);
  });

  it("rejette un champ de fichier inconnu", async () => {
    // Multer n'accepte que les noms qu'on lui a déclarés : un champ
    // inattendu est refusé avant même d'atteindre le disque.
    const res = await request(app)
      .post("/api/auth/demande")
      .field("type", "convoyeur")
      .field("firstName", "Jean")
      .field("lastName", "Convoy")
      .field("email", "jean@convoy.fr")
      .field("phone", "0612345678")
      .field("typeIdentite", "cni")
      .attach("attestation_fiscale", FICHIER, {
        filename: "autre.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(inventaire()).toEqual(avant);
  });
});

/**
 * Une candidature n'a que deux issues, et les pièces suivent chacune
 * d'elles : acceptée, elles rejoignent le dossier du convoyeur ;
 * supprimée, elles disparaissent du disque.
 */
describe("Sort des pièces selon l'issue de la candidature", () => {
  // Le middleware d'authentification relit le compte en base à chaque
  // requête : un jeton valide ne suffit pas, il faut que l'utilisateur
  // existe encore et ait toujours son rôle.
  const ADMIN = {
    rows: [
      {
        id: "admin-1",
        email: "admin@dlc.fr",
        full_name: "Admin",
        role: "admin",
        is_validated: true,
      },
    ],
  };

  const jetonAdmin = () =>
    jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET);

  beforeEach(() => jest.clearAllMocks());

  describe("Acceptation — POST /api/auth/register", () => {
    const compte = {
      email: "jean@convoy.fr",
      fullName: "Jean Convoy",
      // Obligatoire pour un convoyeur : c'est par WhatsApp qu'il est
      // alerté des missions.
      phone: "0612345678",
      role: "convoyeur",
      demandeId: DEMANDE_ID,
    };

    /**
     * Le routage des réponses se fait sur le contenu de la requête SQL :
     * l'ordre des appels varie selon les branches empruntées, s'y fier
     * rendrait le test cassant.
     */
    const brancher = (piecesEnAttente) => {
      db.query.mockImplementation((sql) => {
        if (sql.includes("FROM users WHERE id")) return Promise.resolve(ADMIN);
        if (sql.includes("SELECT id FROM users WHERE email"))
          return Promise.resolve({ rows: [] });
        if (sql.includes("INSERT INTO users"))
          return Promise.resolve({
            rows: [
              {
                id: "user-1",
                email: compte.email,
                full_name: compte.fullName,
                role: "convoyeur",
                is_validated: true,
                created_at: new Date(),
              },
            ],
          });
        if (sql.includes("FROM demande_documents dd"))
          return Promise.resolve({ rows: piecesEnAttente });
        return Promise.resolve({ rows: [] });
      });
    };

    it("transfère les pièces vers le dossier du convoyeur", async () => {
      brancher([
        {
          type: "permis",
          original_name: "permis.pdf",
          file_path: "/uploads/documents/a.pdf",
          mime_type: "application/pdf",
          demande_id: DEMANDE_ID,
        },
        {
          type: "carte_identite",
          original_name: "cni.pdf",
          file_path: "/uploads/documents/b.pdf",
          mime_type: "application/pdf",
          demande_id: DEMANDE_ID,
        },
      ]);

      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${jetonAdmin()}`)
        .send(compte);

      expect(res.status).toBe(201);
      expect(res.body.documentsRepris).toBe(2);

      const requetes = db.query.mock.calls.map((c) => c[0]);
      // Les pièces entrent dans le dossier définitif…
      expect(
        requetes.some((q) => q.includes("INSERT INTO convoyeur_documents")),
      ).toBe(true);
      // …et quittent la salle d'attente, qui n'a plus d'objet.
      expect(
        requetes.some((q) => q.includes("DELETE FROM demande_documents")),
      ).toBe(true);
    });

    it("marque la candidature convertie et la rattache au compte créé", async () => {
      brancher([
        {
          type: "permis",
          original_name: "permis.pdf",
          file_path: "/uploads/documents/a.pdf",
          mime_type: "application/pdf",
          demande_id: DEMANDE_ID,
        },
      ]);

      await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${jetonAdmin()}`)
        .send(compte);

      const maj = db.query.mock.calls.find(
        (c) =>
          c[0].includes("UPDATE contact_requests") &&
          c[0].includes("converted_user_id"),
      );
      expect(maj).toBeDefined();
      // Le compte créé est bien celui rattaché à la candidature.
      expect(maj[1]).toContain("user-1");
    });

    it("crée le compte même sans pièce en attente", async () => {
      brancher([]);

      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${jetonAdmin()}`)
        .send(compte);

      expect(res.status).toBe(201);
      expect(res.body.documentsRepris).toBe(0);
    });

    it("ne fait pas échouer la création si le transfert échoue", async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes("FROM users WHERE id")) return Promise.resolve(ADMIN);
        if (sql.includes("SELECT id FROM users WHERE email"))
          return Promise.resolve({ rows: [] });
        if (sql.includes("INSERT INTO users"))
          return Promise.resolve({
            rows: [
              {
                id: "user-1",
                email: compte.email,
                full_name: compte.fullName,
                role: "convoyeur",
                is_validated: true,
                created_at: new Date(),
              },
            ],
          });
        if (sql.includes("FROM demande_documents dd"))
          return Promise.reject(new Error("table absente"));
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${jetonAdmin()}`)
        .send(compte);

      // Mieux vaut redemander ses pièces au convoyeur que refuser
      // d'ouvrir son compte.
      expect(res.status).toBe(201);
      expect(res.body.documentsRepris).toBe(0);
    });
  });

  describe("Suppression — DELETE /api/admin/demandes/:id", () => {
    it("efface du disque les pièces de la candidature écartée", async () => {
      const fichier = "piece-a-effacer-test.pdf";
      fs.writeFileSync(path.join(UPLOAD_DIR, fichier), FICHIER);

      db.query.mockImplementation((sql) => {
        if (sql.includes("FROM users WHERE id")) return Promise.resolve(ADMIN);
        if (sql.includes("SELECT file_path FROM demande_documents"))
          return Promise.resolve({
            rows: [{ file_path: `/uploads/documents/${fichier}` }],
          });
        if (sql.includes("DELETE FROM contact_requests"))
          return Promise.resolve({ rows: [{ id: DEMANDE_ID }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .delete(`/api/admin/demandes/${DEMANDE_ID}`)
        .set("Authorization", `Bearer ${jetonAdmin()}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/1 document/);
      expect(fs.existsSync(path.join(UPLOAD_DIR, fichier))).toBe(false);
    });

    it("relève les chemins avant la suppression en cascade", async () => {
      const appels = [];
      db.query.mockImplementation((sql) => {
        if (sql.includes("FROM users WHERE id")) return Promise.resolve(ADMIN);
        appels.push(sql);
        if (sql.includes("DELETE FROM contact_requests"))
          return Promise.resolve({ rows: [{ id: DEMANDE_ID }] });
        return Promise.resolve({ rows: [] });
      });

      await request(app)
        .delete(`/api/admin/demandes/${DEMANDE_ID}`)
        .set("Authorization", `Bearer ${jetonAdmin()}`);

      // L'ordre n'est pas cosmétique : après la cascade, plus aucune
      // ligne ne dirait quels fichiers effacer.
      const lecture = appels.findIndex((s) =>
        s.includes("SELECT file_path FROM demande_documents"),
      );
      const suppression = appels.findIndex((s) =>
        s.includes("DELETE FROM contact_requests"),
      );
      expect(lecture).toBeGreaterThanOrEqual(0);
      expect(lecture).toBeLessThan(suppression);
    });

    it("répond 404 sur une demande inexistante", async () => {
      db.query.mockImplementation((sql) =>
        sql.includes("FROM users WHERE id")
          ? Promise.resolve(ADMIN)
          : Promise.resolve({ rows: [] }),
      );

      const res = await request(app)
        .delete(`/api/admin/demandes/${DEMANDE_ID}`)
        .set("Authorization", `Bearer ${jetonAdmin()}`);

      expect(res.status).toBe(404);
    });
  });
});
