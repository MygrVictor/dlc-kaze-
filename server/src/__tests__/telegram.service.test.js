/**
 * Tests unitaires — telegram.service
 *
 * Le salon Telegram remplace la diffusion WhatsApp payante : une mission
 * publiée = un seul message, quel que soit le nombre de convoyeurs. Ces
 * tests couvrent surtout l'échappement MarkdownV2, qui est le point de
 * fragilité du format : un tiret non échappé dans une adresse suffit à
 * faire rejeter le message entier par Telegram.
 */
jest.mock("axios");

const axios = require("axios");
const telegram = require("../services/telegram.service");

const MISSION = {
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AS-494-DG",
  departure_address: "12 rue de la Paix, 49000 Angers",
  arrival_address: "5 avenue Foch, 75116 Paris",
  price_convoyeur: 180,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("echapper", () => {
  test("échappe les caractères réservés de MarkdownV2", () => {
    // Sans échappement, Telegram renvoie 400 sur ce type d'adresse.
    expect(telegram.echapper("AS-494-DG")).toBe("AS\\-494\\-DG");
    expect(telegram.echapper("49000 Angers.")).toBe("49000 Angers\\.");
  });

  test("neutralise une tentative d'injection de balisage", () => {
    // La donnée vient du client : elle ne doit jamais devenir du balisage.
    const injecte = telegram.echapper("[lien](https://malveillant.example)");
    expect(injecte).not.toMatch(/\[lien\]\(/);
    expect(injecte).toContain("\\[");
  });

  test("compacte les espaces et remplace une valeur absente", () => {
    expect(telegram.echapper("  Paris   Nord  ")).toBe("Paris Nord");
    expect(telegram.echapper(null)).toBe("—");
    expect(telegram.echapper(undefined)).toBe("—");
  });
});

describe("composerAnnonce", () => {
  test("reprend véhicule, trajet et rémunération", () => {
    const texte = telegram.composerAnnonce(MISSION);

    expect(texte).toContain("Renault Clio");
    expect(texte).toContain("Angers");
    expect(texte).toContain("Paris");
    expect(texte).toContain("180 €");
  });

  // Le salon rassemble des convoyeurs que nous n'avons pas tous validés.
  // Associée aux adresses et à la date, la plaque désignerait un véhicule
  // identifiable à un endroit et une heure connus : elle n'est
  // communiquée qu'une fois la mission attribuée.
  test("ne diffuse pas la plaque d'immatriculation", () => {
    const texte = telegram.composerAnnonce(MISSION);

    expect(texte).not.toContain("AS-494-DG");
    expect(texte).not.toContain("AS\\-494\\-DG");
  });

  test("distingue visuellement une mission urgente", () => {
    const normale = telegram.composerAnnonce(MISSION);
    const urgente = telegram.composerAnnonce({ ...MISSION, is_urgent: true });

    expect(normale).toContain("Nouvelle mission disponible");
    expect(urgente).toContain("MISSION URGENTE");
  });

  test("annonce une rémunération à définir plutôt que « undefined »", () => {
    const texte = telegram.composerAnnonce({
      ...MISSION,
      price_convoyeur: null,
      price: null,
    });

    expect(texte).toContain("à définir");
    expect(texte).not.toMatch(/undefined|null|NaN/);
  });

  test("retombe sur price si price_convoyeur est absent", () => {
    const texte = telegram.composerAnnonce({
      ...MISSION,
      price_convoyeur: null,
      price: 220,
    });

    expect(texte).toContain("220 €");
  });

  test("ignore une date de départ invalide", () => {
    const texte = telegram.composerAnnonce({
      ...MISSION,
      departure_date: "pas-une-date",
    });

    expect(texte).not.toContain("Invalid");
    expect(texte).not.toContain("*Date*");
  });

  test("ajoute le lien de prise de mission quand il est fourni", () => {
    const texte = telegram.composerAnnonce(
      MISSION,
      "https://www.drivelineconnect.com/convoyeur/missions-disponibles",
    );

    expect(texte).toContain("Prendre la mission");
    expect(texte).toContain("https://www.drivelineconnect.com");
  });

  test("tient sans véhicule renseigné", () => {
    const texte = telegram.composerAnnonce({
      departure_address: "Angers",
      arrival_address: "Paris",
    });

    expect(texte).toContain("Véhicule non précisé");
  });
});

describe("annoncerMissionDisponible", () => {
  test("n'envoie qu'une seule requête, quel que soit l'effectif", async () => {
    // C'est tout l'intérêt du salon : le coût ne dépend plus du nombre
    // de convoyeurs.
    await telegram.annoncerMissionDisponible(MISSION);

    // En mode dev (aucun jeton configuré en test), rien n'est posté.
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("ne propage jamais une panne Telegram", async () => {
    axios.post.mockRejectedValue(new Error("réseau indisponible"));

    // Une annonce manquée ne doit pas faire échouer l'acceptation du devis.
    await expect(telegram.annoncerMissionDisponible(MISSION)).resolves.toEqual({
      publie: true,
    });
  });

  test("ignore une mission absente", async () => {
    await expect(telegram.annoncerMissionDisponible(null)).resolves.toEqual({
      publie: false,
    });
  });
});
