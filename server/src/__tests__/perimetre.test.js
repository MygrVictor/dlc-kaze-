/**
 * Périmètre de visibilité — comptes rattachés
 *
 * Ces tests portent sur la règle de sécurité elle-même, indépendamment
 * des routes qui la consomment. Un régression ici ne produirait pas
 * une erreur visible mais une fuite silencieuse de données entre
 * clients : c'est le pire mode de défaillance possible, et celui que
 * les tests de routes — qui simulent la base — ne peuvent pas voir.
 */
jest.mock("../db", () => ({ query: jest.fn(), transaction: jest.fn() }));

const db = require("../db");
const {
  perimetreClient,
  peutConsulter,
  estTitulaire,
} = require("../db/perimetre");

const SIEGE = { id: "siege", role: "client" };
const FILIALE = { id: "filiale", role: "client" };
const CONVOYEUR = { id: "convoyeur", role: "convoyeur" };
const ADMIN = { id: "admin", role: "admin" };

beforeEach(() => jest.clearAllMocks());

describe("perimetreClient", () => {
  it("réduit un client sans rattachement à lui-même", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(perimetreClient(FILIALE)).resolves.toEqual([FILIALE.id]);
  });

  it("ajoute les entités rattachées à un siège", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "nord" }, { id: "sud" }] });

    await expect(perimetreClient(SIEGE)).resolves.toEqual([
      SIEGE.id,
      "nord",
      "sud",
    ]);
  });

  it("place toujours le compte lui-même en tête", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "nord" }] });

    const perimetre = await perimetreClient(SIEGE);

    expect(perimetre[0]).toBe(SIEGE.id);
  });

  it.each([
    ["convoyeur", CONVOYEUR],
    ["administrateur", ADMIN],
  ])("n'élargit pas le périmètre d'un %s", async (_nom, utilisateur) => {
    db.query.mockResolvedValue({ rows: [{ id: "quelqu-un-d-autre" }] });

    const perimetre = await perimetreClient(utilisateur);

    // La route des factures sert clients et convoyeurs : un élargissement
    // aveugle ouvrirait les relevés des convoyeurs les uns aux autres.
    expect(perimetre).toEqual([utilisateur.id]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("ne remonte que les comptes de rôle client", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await perimetreClient(SIEGE);

    // Des missions techniques sont rattachées au premier administrateur
    // lors d'une assignation Kaze sans équivalent local : elles ne
    // doivent jamais tomber dans le périmètre d'un groupe.
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/role = 'client'/i);
  });

  it("ne descend pas au-delà d'un niveau", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "nord" }] });

    await perimetreClient(SIEGE);

    // Une seule requête : aucun parcours récursif, donc aucun risque de
    // boucle infinie si un cycle de rattachement était créé en base.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("tolère un utilisateur absent sans lever d'exception", async () => {
    await expect(perimetreClient(null)).resolves.toEqual([]);
    await expect(perimetreClient(undefined)).resolves.toEqual([]);
  });
});

describe("peutConsulter", () => {
  it("autorise un compte sur ses propres données sans interroger la base", async () => {
    await expect(peutConsulter(FILIALE, FILIALE.id)).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("autorise un siège sur une de ses entités", async () => {
    db.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    await expect(peutConsulter(SIEGE, "nord")).resolves.toBe(true);
  });

  it("refuse un client sur les données d'un tiers", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(peutConsulter(FILIALE, "un-concurrent")).resolves.toBe(false);
  });

  it("refuse le sens inverse : une entité ne voit pas son siège", async () => {
    db.query.mockResolvedValue({ rows: [] });

    await peutConsulter(FILIALE, SIEGE.id);

    // La requête cherche bien `id = cible AND parent_id = demandeur`,
    // jamais l'inverse.
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/id = \$1 AND parent_id = \$2/i);
    expect(params).toEqual([SIEGE.id, FILIALE.id]);
  });

  it.each([
    ["convoyeur", CONVOYEUR],
    ["administrateur", ADMIN],
  ])("refuse à un %s le périmètre d'un tiers", async (_nom, utilisateur) => {
    await expect(peutConsulter(utilisateur, "quelqu-un")).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("refuse sur des entrées vides plutôt que d'ouvrir", async () => {
    await expect(peutConsulter(null, "cible")).resolves.toBe(false);
    await expect(peutConsulter(SIEGE, null)).resolves.toBe(false);
    await expect(peutConsulter(SIEGE, undefined)).resolves.toBe(false);
  });
});

describe("estTitulaire", () => {
  it("reconnaît le titulaire direct", () => {
    expect(estTitulaire(FILIALE, FILIALE.id)).toBe(true);
  });

  it("refuse le siège sur les données de son entité", () => {
    // Consulter l'activité d'une entité est une chose ; défaire une
    // opération qu'elle a engagée en est une autre.
    expect(estTitulaire(SIEGE, "nord")).toBe(false);
  });

  it("refuse sur des entrées vides", () => {
    expect(estTitulaire(null, "cible")).toBe(false);
    expect(estTitulaire(SIEGE, null)).toBe(false);
  });
});
