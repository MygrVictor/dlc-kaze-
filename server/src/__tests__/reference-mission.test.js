/**
 * Tests — références de missions Kaze (R.2890, R.2891…)
 */
jest.mock("../db", () => ({ query: jest.fn() }));

const db = require("../db");
const { referenceMission } = require("../services/reference-mission.service");

const MISSION = { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };

/** Base simulée : une séquence et une colonne kaze_reference. */
function baseSimulee({ prochain = 2890, existante = null } = {}) {
  let compteur = prochain;
  let stockee = existante;
  db.query.mockImplementation(async (sql, params) => {
    if (/SELECT kaze_reference FROM missions/i.test(sql))
      return { rows: [{ kaze_reference: stockee }] };
    if (/nextval\('mission_reference_seq'\)/i.test(sql))
      return { rows: [{ numero: String(compteur++) }] };
    if (/UPDATE missions SET kaze_reference/i.test(sql)) {
      if (stockee) return { rows: [] };
      stockee = params[0];
      return { rows: [{ kaze_reference: stockee }] };
    }
    return { rows: [] };
  });
  return { stockee: () => stockee };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("attribue le prochain numéro de la séquence, au format R.xxxx", async () => {
  const base = baseSimulee({ prochain: 2890 });
  await expect(referenceMission(MISSION)).resolves.toBe("R.2890");
  expect(base.stockee()).toBe("R.2890");
});

test("les missions suivantes se suivent", async () => {
  baseSimulee({ prochain: 2890 });
  await referenceMission({ id: "m1" });
  // Nouvelle mission : la colonne est vide pour elle.
  baseSimulee({ prochain: 2891 });
  await expect(referenceMission({ id: "m2" })).resolves.toBe("R.2891");
});

test("une mission renvoyée à Kaze garde son numéro", async () => {
  baseSimulee({ existante: "R.2895" });
  await expect(referenceMission(MISSION)).resolves.toBe("R.2895");
  expect(db.query).not.toHaveBeenCalledWith(
    expect.stringMatching(/nextval/),
  );
});

test("réutilise la référence déjà présente sur la ligne sans requête", async () => {
  await expect(
    referenceMission({ ...MISSION, kaze_reference: "R.2900" }),
  ).resolves.toBe("R.2900");
  expect(db.query).not.toHaveBeenCalled();
});

test("revient à l'ancienne référence si la base ne répond pas", async () => {
  db.query.mockRejectedValue(new Error("connexion perdue"));
  await expect(referenceMission(MISSION)).resolves.toBe("DLC-AAAAAAAA");
});
