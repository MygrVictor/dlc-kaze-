/**
 * Tests unitaires — lundiDeLaSemaine
 *
 * Règle métier : toute mission est datée du lundi de la semaine **en cours**,
 * jamais du lundi suivant, même lorsque cette date est déjà passée.
 */
const { lundiDeLaSemaine } = require("../lib/dates");

/** Format lisible pour les assertions : « 2026-08-10 ». */
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

describe("lundiDeLaSemaine", () => {
  // Semaine de référence : lundi 10 août 2026 → dimanche 16 août 2026.
  it("renvoie le jour même quand la référence est un lundi", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 10, 14, 30)))).toBe(
      "2026-08-10",
    );
  });

  it("recule au lundi depuis un mardi", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 11)))).toBe("2026-08-10");
  });

  it("recule au lundi depuis un jeudi", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 13)))).toBe("2026-08-10");
  });

  it("recule au lundi depuis un samedi", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 15)))).toBe("2026-08-10");
  });

  it("rattache le dimanche à la semaine écoulée, pas au lendemain", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 16)))).toBe("2026-08-10");
  });

  it("ne renvoie jamais le lundi suivant", () => {
    const jeudi = new Date(2026, 7, 13);
    expect(lundiDeLaSemaine(jeudi).getTime()).toBeLessThan(jeudi.getTime());
  });

  it("remet l'heure à minuit", () => {
    const lundi = lundiDeLaSemaine(new Date(2026, 7, 13, 23, 59, 59, 999));
    expect([
      lundi.getHours(),
      lundi.getMinutes(),
      lundi.getSeconds(),
      lundi.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("franchit correctement un changement de mois", () => {
    // Mercredi 2 septembre 2026 → lundi 31 août 2026
    expect(iso(lundiDeLaSemaine(new Date(2026, 8, 2)))).toBe("2026-08-31");
  });

  it("franchit correctement un changement d'année", () => {
    // Vendredi 1er janvier 2027 → lundi 28 décembre 2026
    expect(iso(lundiDeLaSemaine(new Date(2027, 0, 1)))).toBe("2026-12-28");
  });

  it("gère une année bissextile", () => {
    // Mardi 1er mars 2028 → lundi 28 février 2028 (2028 est bissextile)
    expect(iso(lundiDeLaSemaine(new Date(2028, 2, 1)))).toBe("2028-02-28");
  });

  it("accepte une chaîne de caractères", () => {
    expect(iso(lundiDeLaSemaine("2026-08-13T10:00:00"))).toBe("2026-08-10");
  });

  it("accepte un horodatage numérique", () => {
    expect(iso(lundiDeLaSemaine(new Date(2026, 7, 13).getTime()))).toBe(
      "2026-08-10",
    );
  });

  it("utilise la date du jour par défaut", () => {
    const attendu = lundiDeLaSemaine(new Date());
    expect(iso(lundiDeLaSemaine())).toBe(iso(attendu));
  });

  it("retourne toujours un lundi", () => {
    // Une semaine entière : chaque jour doit produire un lundi.
    for (let jour = 10; jour <= 16; jour += 1) {
      expect(lundiDeLaSemaine(new Date(2026, 7, jour)).getDay()).toBe(1);
    }
  });

  it("ne modifie pas la date fournie", () => {
    const origine = new Date(2026, 7, 13, 12, 0, 0);
    const copie = new Date(origine);
    lundiDeLaSemaine(origine);
    expect(origine.getTime()).toBe(copie.getTime());
  });

  it("refuse une date invalide", () => {
    expect(() => lundiDeLaSemaine("pas-une-date")).toThrow(TypeError);
    expect(() => lundiDeLaSemaine(new Date("invalide"))).toThrow(/invalide/i);
  });
});
