/**
 * Tests unitaires — devis.service
 *
 * Le service produit un document PDFKit. Deux angles complémentaires :
 *  1. un document simulé qui enregistre chaque fragment de texte, pour
 *     vérifier le *contenu métier* (calcul de TVA, libellés, sections
 *     conditionnelles) sans dépendre du rendu ;
 *  2. une génération réelle, pour garantir qu'un PDF valide sort bien du
 *     service et qu'il ne lève pas sur des données partielles.
 */

/**
 * Document PDFKit simulé : toutes les méthodes de style sont chaînables et
 * `text()` accumule les fragments écrits.
 */
const fragments = [];
const rectanglesRemplis = [];
let infoDocument;

jest.mock("pdfkit", () =>
  jest.fn().mockImplementation(function FauxPDFDocument(options) {
    infoDocument = options.info;
    const doc = {
      page: { width: 595, height: 842 },
      options,
    };
    const chainables = [
      "fontSize",
      "font",
      "fillColor",
      "strokeColor",
      "lineWidth",
      "moveTo",
      "lineTo",
      "stroke",
      "end",
      "pipe",
    ];
    chainables.forEach((nom) => {
      doc[nom] = jest.fn(() => doc);
    });
    doc.rect = jest.fn(() => ({
      fill: jest.fn((couleur) => {
        rectanglesRemplis.push(couleur);
        return doc;
      }),
    }));
    doc.text = jest.fn((contenu) => {
      fragments.push(String(contenu));
      return doc;
    });
    doc.heightOfString = jest.fn(() => 12);
    return doc;
  }),
);

const { generateDevisPDF } = require("../services/devis.service");

const MISSION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const missionMinimale = () => ({
  id: MISSION_ID,
  departure_address: "10 rue de Rivoli, Paris",
  arrival_address: "1 place Bellecour, Lyon",
  price: 600,
});

const CLIENT = {
  full_name: "Client Test",
  email: "client@test.com",
  phone: "0600000000",
  company: "DLC SARL",
};

/** Concatène tout le texte écrit dans le document. */
const texte = () => fragments.join("\n");

beforeEach(() => {
  fragments.length = 0;
  rectanglesRemplis.length = 0;
  infoDocument = undefined;
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════
describe("En-tête et métadonnées", () => {
  it("configure le document en A4 avec des marges de 50", () => {
    const doc = generateDevisPDF(missionMinimale(), CLIENT);

    expect(doc.options.size).toBe("A4");
    expect(doc.options.margins).toEqual({
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
    });
  });

  it("renseigne les métadonnées PDF avec la référence du devis", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(infoDocument).toMatchObject({
      Title: "Devis Mission AAAAAAAA",
      Author: "DLC Kaze — Convoyage Automobile",
      Subject: "Devis de mission de convoyage",
    });
  });

  it("affiche le numéro de devis dérivé des 8 premiers caractères de l'id", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain("DEV-AAAAAAAA");
  });

  it("affiche l'identité de l'entreprise", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain("DLC KAZE");
    expect(texte()).toContain("Convoyage Automobile Professionnel");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Bloc client", () => {
  it("affiche toutes les coordonnées disponibles", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain("Client Test");
    expect(texte()).toContain("client@test.com");
    expect(texte()).toContain("0600000000");
    expect(texte()).toContain("DLC SARL");
  });

  it("remplace un nom absent par un tiret", () => {
    generateDevisPDF(missionMinimale(), { email: "c@t.fr" });

    expect(fragments).toContain("—");
  });

  it("omet le téléphone et la société quand ils ne sont pas renseignés", () => {
    generateDevisPDF(missionMinimale(), {
      full_name: "Sans Extra",
      email: "c@t.fr",
    });

    expect(texte()).not.toContain("0600000000");
    expect(texte()).not.toContain("DLC SARL");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Bloc véhicule", () => {
  it("n'affiche aucune ligne véhicule si aucune donnée n'est fournie", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).not.toContain("Marque / Modèle");
    expect(texte()).not.toContain("Plaque");
  });

  it("agrège la marque et le modèle sur une seule ligne", () => {
    generateDevisPDF(
      { ...missionMinimale(), vehicle_brand: "Renault", vehicle_model: "Clio" },
      CLIENT,
    );

    expect(texte()).toContain("Marque / Modèle");
    expect(fragments).toContain("Renault Clio");
  });

  it("tolère un modèle absent sans laisser d'espace superflu", () => {
    generateDevisPDF(
      { ...missionMinimale(), vehicle_brand: "Peugeot" },
      CLIENT,
    );

    expect(fragments).toContain("Peugeot");
  });

  it.each([
    ["essence", "Essence"],
    ["diesel", "Diesel"],
    ["electrique", "Électrique"],
    ["hybride", "Hybride"],
    ["hybride_rechargeable", "Hybride rechargeable"],
    ["gpl", "GPL"],
  ])("traduit l'énergie « %s » en « %s »", (code, libelle) => {
    generateDevisPDF({ ...missionMinimale(), vehicle_energy: code }, CLIENT);

    expect(fragments).toContain(libelle);
  });

  it("conserve une énergie inconnue telle quelle", () => {
    generateDevisPDF(
      { ...missionMinimale(), vehicle_energy: "hydrogene" },
      CLIENT,
    );

    expect(fragments).toContain("hydrogene");
  });

  it.each([
    ["neuf", "Neuf"],
    ["occasion", "Occasion"],
    ["accidente", "Accidenté"],
    ["non_roulant", "Non roulant"],
  ])("traduit l'état « %s » en « %s »", (code, libelle) => {
    generateDevisPDF({ ...missionMinimale(), vehicle_state: code }, CLIENT);

    expect(fragments).toContain(libelle);
  });

  it("affiche le nombre de jeux de clés, y compris zéro", () => {
    generateDevisPDF({ ...missionMinimale(), vehicle_keys: 0 }, CLIENT);

    expect(fragments).toContain("0 jeu(x)");
  });

  it("omet la ligne des clés quand la valeur est nulle", () => {
    generateDevisPDF({ ...missionMinimale(), vehicle_keys: null }, CLIENT);

    expect(texte()).not.toContain("jeu(x)");
  });

  it("affiche la plaque, le VIN et la finition", () => {
    generateDevisPDF(
      {
        ...missionMinimale(),
        vehicle_plate: "AA-123-BB",
        vehicle_vin: "VF1TEST0000000001",
        vehicle_finish: "GT Line",
      },
      CLIENT,
    );

    expect(fragments).toContain("AA-123-BB");
    expect(fragments).toContain("VF1TEST0000000001");
    expect(fragments).toContain("GT Line");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Trajet", () => {
  it("affiche les deux adresses et les intitulés d'étape", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain("● ENLÈVEMENT (DÉPART)");
    expect(texte()).toContain("10 rue de Rivoli, Paris");
    expect(texte()).toContain("● LIVRAISON (ARRIVÉE)");
    expect(texte()).toContain("1 place Bellecour, Lyon");
  });

  it("formate les dates en français", () => {
    generateDevisPDF(
      { ...missionMinimale(), departure_date: "2026-08-12T09:30:00Z" },
      CLIENT,
    );

    expect(texte()).toMatch(/Date : 12 août 2026/);
  });

  it("associe le contact et son téléphone", () => {
    generateDevisPDF(
      {
        ...missionMinimale(),
        departure_contact_name: "Alys",
        departure_contact_phone: "0251788871",
      },
      CLIENT,
    );

    expect(fragments).toContain("Contact : Alys — 0251788871");
  });

  it("affiche le contact seul lorsque le téléphone manque", () => {
    generateDevisPDF(
      { ...missionMinimale(), arrival_contact_name: "Ludovic" },
      CLIENT,
    );

    expect(fragments).toContain("Contact : Ludovic");
  });

  it("reporte les instructions de départ", () => {
    generateDevisPDF(
      { ...missionMinimale(), departure_instructions: "Code portail 1234" },
      CLIENT,
    );

    expect(fragments).toContain("Instructions : Code portail 1234");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Services additionnels", () => {
  it("masque la section quand aucun service n'est retenu", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).not.toContain("SERVICES ADDITIONNELS");
  });

  it.each([
    ["service_wash_exterior", "Lavage extérieur"],
    ["service_clean_interior", "Nettoyage intérieur"],
    ["service_refuel", "Plein de carburant"],
    ["service_handover", "Mise en main du véhicule"],
  ])("liste le service %s", (champ, libelle) => {
    generateDevisPDF({ ...missionMinimale(), [champ]: true }, CLIENT);

    expect(texte()).toContain("SERVICES ADDITIONNELS");
    expect(fragments).toContain(`✓  ${libelle}`);
  });

  it("reporte chaque service en ligne « inclus » dans le tableau de prix", () => {
    generateDevisPDF(
      {
        ...missionMinimale(),
        service_wash_exterior: true,
        service_refuel: true,
      },
      CLIENT,
    );

    expect(fragments).toContain("   └ Lavage extérieur");
    expect(fragments).toContain("   └ Plein de carburant");
    expect(fragments.filter((f) => f === "inclus")).toHaveLength(4);
  });
});

// ═════════════════════════════════════════════════════════════
describe("Sections optionnelles", () => {
  it("affiche le contact d'urgence quand il est renseigné", () => {
    generateDevisPDF(
      { ...missionMinimale(), emergency_phone: "0669583430" },
      CLIENT,
    );

    expect(fragments).toContain("Contact d'urgence : 0669583430");
  });

  it("masque les commentaires quand il n'y en a pas", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).not.toContain("COMMENTAIRES");
  });

  it("affiche les commentaires du client", () => {
    generateDevisPDF(
      { ...missionMinimale(), comments: "Livraison délicate" },
      CLIENT,
    );

    expect(texte()).toContain("COMMENTAIRES");
    expect(fragments).toContain("Livraison délicate");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Tableau de prix et TVA", () => {
  it("décompose un prix TTC de 600 € en 500 € HT et 100 € de TVA", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(fragments).toContain("500.00 €");
    expect(fragments).toContain("100.00 €");
    expect(fragments).toContain("600.00 €");
  });

  it("affiche le total TTC formaté en euros", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toMatch(/600,00\s\u00a0?€|600,00.€/);
  });

  it("mentionne un taux de TVA de 20 %", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain("TVA (20%)");
    expect(texte()).toContain("Total HT");
    expect(texte()).toContain("TOTAL TTC");
  });

  it("arrondit correctement un montant non rond", () => {
    generateDevisPDF({ ...missionMinimale(), price: 450 }, CLIENT);

    expect(fragments).toContain("375.00 €");
    expect(fragments).toContain("75.00 €");
  });

  it("affiche des tirets quand aucun prix n'est fixé", () => {
    generateDevisPDF({ ...missionMinimale(), price: null }, CLIENT);

    expect(fragments).toContain("— €");
  });

  it("décrit la prestation avec le véhicule et le trajet", () => {
    generateDevisPDF(
      { ...missionMinimale(), vehicle_brand: "Renault", vehicle_model: "Clio" },
      CLIENT,
    );

    expect(fragments).toContain(
      "Convoyage Renault Clio — 10 rue de Rivoli, Paris → 1 place Bellecour, Lyon",
    );
  });

  it("accepte un prix transmis sous forme de chaîne", () => {
    generateDevisPDF({ ...missionMinimale(), price: "600" }, CLIENT);

    expect(fragments).toContain("500.00 €");
  });
});

// ═════════════════════════════════════════════════════════════
describe("Mentions légales", () => {
  it("indique la durée de validité du devis", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toContain(
      "Ce devis est valable 30 jours à compter de sa date d'émission.",
    );
  });

  it("rappelle les conditions de paiement et les pénalités de retard", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(texte()).toMatch(/Conditions de paiement/);
    expect(texte()).toMatch(/Pénalités de retard/);
  });

  it("clôt le document par un bandeau de couleur", () => {
    generateDevisPDF(missionMinimale(), CLIENT);

    expect(rectanglesRemplis).toContain("#6366f1");
  });
});

// ═════════════════════════════════════════════════════════════
// Génération réelle : le mock de pdfkit est levé pour cette section.
// ═════════════════════════════════════════════════════════════
describe("Génération réelle d'un PDF", () => {
  let genererReel;

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.unmock("pdfkit");
      jest.resetModules();
      // eslint-disable-next-line global-require
      genererReel = require("../services/devis.service").generateDevisPDF;
    });
  });

  /** Collecte le flux PDFKit dans un Buffer. */
  const enBuffer = (doc) =>
    new Promise((resolve, reject) => {
      const morceaux = [];
      doc.on("data", (c) => morceaux.push(c));
      doc.on("end", () => resolve(Buffer.concat(morceaux)));
      doc.on("error", reject);
      doc.end();
    });

  it("produit un fichier PDF valide et non vide", async () => {
    const buffer = await enBuffer(genererReel(missionMinimale(), CLIENT));

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(-6).toString()).toMatch(/%%EOF/);
  });

  it("génère un document complet sans lever d'exception", async () => {
    const missionComplete = {
      ...missionMinimale(),
      vehicle_brand: "Renault",
      vehicle_model: "Clio",
      vehicle_plate: "AA-123-BB",
      vehicle_vin: "VF1TEST0000000001",
      vehicle_finish: "GT Line",
      vehicle_energy: "diesel",
      vehicle_state: "occasion",
      vehicle_keys: 2,
      departure_date: "2026-08-12T09:30:00Z",
      departure_contact_name: "Alys",
      departure_contact_phone: "0251788871",
      departure_instructions: "Code portail 1234",
      arrival_date: "2026-08-13T17:00:00Z",
      arrival_contact_name: "Ludovic",
      arrival_contact_phone: "0631793544",
      service_wash_exterior: true,
      service_clean_interior: true,
      service_refuel: true,
      emergency_phone: "0669583430",
      comments: "Livraison délicate, prévoir un créneau.",
    };

    const buffer = await enBuffer(genererReel(missionComplete, CLIENT));

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("supporte une mission sans prix ni données véhicule", async () => {
    const buffer = await enBuffer(
      genererReel({ ...missionMinimale(), price: null }, { email: "c@t.fr" }),
    );

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
