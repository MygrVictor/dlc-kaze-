/**
 * Catalogue des types de véhicules.
 *
 * Le type conditionne deux choses concrètes : la classe de péage
 * facturée et la façon dont le véhicule se conduit. Ces tests
 * verrouillent les deux, ainsi que la synchronisation entre la copie
 * serveur et la copie client du catalogue.
 */
const fs = require("fs");
const path = require("path");

const {
  TYPES_VEHICULE,
  CLASSE_PEAGE,
  SEUIL_UTILITAIRE_M3,
  trouverType,
  classeDePeage,
  estUtilitaire12m3,
  libelle,
  segmentTarifaire,
} = require("../lib/vehicules");

// ═════════════════════════════════════════════════════════════
describe("Intégrité du catalogue", () => {
  it("n'expose aucun code en double", () => {
    const codes = TYPES_VEHICULE.map((t) => t.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("renseigne tous les champs sur chaque type", () => {
    for (const type of TYPES_VEHICULE) {
      expect(type.code).toBeTruthy();
      expect(type.label).toBeTruthy();
      expect(type.categorie).toBeTruthy();
      expect(type.tarification).toBeTruthy();
      expect(["1", "2", "3"]).toContain(type.classePeage);
    }
  });

  it("n'attribue que des segments tarifaires connus", () => {
    const segments = ["citadine", "berline", "suv", "utilitaire", "prestige"];

    for (const type of TYPES_VEHICULE) {
      expect(segments).toContain(type.tarification);
    }
  });

  it("propose l'ensemble des gabarits L1H1 → L4H3 courants", () => {
    const codes = TYPES_VEHICULE.map((t) => t.code);

    for (const gabarit of [
      "L1H1",
      "L1H2",
      "L2H1",
      "L2H2",
      "L2H3",
      "L3H2",
      "L3H3",
      "L4H2",
      "L4H3",
    ]) {
      expect(codes).toContain(gabarit);
    }
  });

  it("déclare un volume croissant avec le gabarit", () => {
    const volume = (code) => trouverType(code).volumeM3;

    expect(volume("L1H1")).toBeLessThan(volume("L2H2"));
    expect(volume("L2H2")).toBeLessThan(volume("L3H3"));
    expect(volume("L3H3")).toBeLessThan(volume("L4H3"));
  });
});

// ═════════════════════════════════════════════════════════════
describe("classeDePeage", () => {
  it("classe les véhicules légers en classe 1", () => {
    for (const code of ["citadine", "berline", "break", "suv", "prestige"]) {
      expect(classeDePeage(code)).toBe(CLASSE_PEAGE.LEGER);
    }
  });

  it("classe les toits bas en classe 1", () => {
    expect(classeDePeage("L1H1")).toBe("1");
    expect(classeDePeage("L2H1")).toBe("1");
  });

  it("classe les toits rehaussés et hauts en classe 2", () => {
    for (const code of ["L1H2", "L2H2", "L2H3", "L3H2", "L3H3", "L4H3"]) {
      expect(classeDePeage(code)).toBe("2");
    }
  });

  it("classe le poids lourd en classe 3", () => {
    expect(classeDePeage("poids_lourd")).toBe("3");
  });

  it("rabat un type inconnu en classe 1 sans lever d'erreur", () => {
    expect(classeDePeage("Berline")).toBe("1");
    expect(classeDePeage("n'importe quoi")).toBe("1");
  });

  it("tolère une valeur absente", () => {
    expect(classeDePeage(null)).toBe("1");
    expect(classeDePeage(undefined)).toBe("1");
    expect(classeDePeage("")).toBe("1");
  });
});

// ═════════════════════════════════════════════════════════════
describe("estUtilitaire12m3", () => {
  it("répond OUI dès que le volume atteint le seuil", () => {
    expect(SEUIL_UTILITAIRE_M3).toBe(12);
    expect(estUtilitaire12m3("L2H2")).toBe("OUI");
  });

  it("répond OUI pour tous les gabarits au-delà du seuil", () => {
    for (const code of ["L2H3", "L3H2", "L3H3", "L4H2", "L4H3"]) {
      expect(estUtilitaire12m3(code)).toBe("OUI");
    }
  });

  it("répond NON pour les petits gabarits", () => {
    for (const code of ["fourgonnette", "L1H1", "L1H2", "L2H1"]) {
      expect(estUtilitaire12m3(code)).toBe("NON");
    }
  });

  it("répond NON pour un véhicule léger sans volume déclaré", () => {
    expect(estUtilitaire12m3("berline")).toBe("NON");
    expect(estUtilitaire12m3("suv")).toBe("NON");
  });

  it("répond NON pour un type inconnu", () => {
    expect(estUtilitaire12m3("Utilitaire")).toBe("NON");
    expect(estUtilitaire12m3(null)).toBe("NON");
  });
});

// ═════════════════════════════════════════════════════════════
describe("segmentTarifaire", () => {
  it("range tous les fourgons dans le segment utilitaire", () => {
    for (const code of ["L1H1", "L2H2", "L4H3", "plateau_benne"]) {
      expect(segmentTarifaire(code)).toBe("utilitaire");
    }
  });

  it("conserve les segments des véhicules légers", () => {
    expect(segmentTarifaire("citadine")).toBe("citadine");
    expect(segmentTarifaire("suv")).toBe("suv");
    expect(segmentTarifaire("prestige")).toBe("prestige");
  });

  it("assimile break et monospace à une berline", () => {
    expect(segmentTarifaire("break")).toBe("berline");
    expect(segmentTarifaire("monospace")).toBe("berline");
  });

  it("retombe sur berline pour un type inconnu", () => {
    expect(segmentTarifaire("inconnu")).toBe("berline");
  });
});

// ═════════════════════════════════════════════════════════════
describe("libelle", () => {
  it("rend le libellé lisible d'un gabarit", () => {
    expect(libelle("L2H2")).toContain("L2H2");
    expect(libelle("L2H2")).toContain("12 m³");
  });

  it("restitue le code brut pour un type inconnu", () => {
    expect(libelle("Break historique")).toBe("Break historique");
  });

  it("rend une chaîne vide pour une valeur absente", () => {
    expect(libelle(null)).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════
//  Synchronisation serveur ↔ client
// ═════════════════════════════════════════════════════════════
describe("Copie client du catalogue", () => {
  const fichierClient = path.join(
    __dirname,
    "../../../client/src/lib/vehicules.js",
  );

  /**
   * Extrait la liste des types du fichier client sans l'exécuter :
   * c'est un module ES, que Jest ne peut pas charger tel quel ici.
   */
  const typesClient = () => {
    const source = fs.readFileSync(fichierClient, "utf8");
    const codes = [...source.matchAll(/code:\s*"([^"]+)"/g)].map((m) => m[1]);
    const classes = [
      ...source.matchAll(/classePeage:\s*CLASSE_PEAGE\.(\w+)/g),
    ].map((m) => m[1]);
    const volumes = [...source.matchAll(/volumeM3:\s*(null|\d+)/g)].map((m) =>
      m[1] === "null" ? null : Number(m[1]),
    );
    return { codes, classes, volumes };
  };

  it("liste exactement les mêmes codes, dans le même ordre", () => {
    expect(typesClient().codes).toEqual(TYPES_VEHICULE.map((t) => t.code));
  });

  it("déclare les mêmes classes de péage", () => {
    const nomDeClasse = { 1: "LEGER", 2: "INTERMEDIAIRE", 3: "POIDS_LOURD" };

    expect(typesClient().classes).toEqual(
      TYPES_VEHICULE.map((t) => nomDeClasse[t.classePeage]),
    );
  });

  it("déclare les mêmes volumes", () => {
    expect(typesClient().volumes).toEqual(
      TYPES_VEHICULE.map((t) => t.volumeM3),
    );
  });

  it("partage le même seuil de 12 m³", () => {
    const source = fs.readFileSync(fichierClient, "utf8");

    expect(source).toContain(`SEUIL_UTILITAIRE_M3 = ${SEUIL_UTILITAIRE_M3}`);
  });
});
