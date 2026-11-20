/**
 * Tests — logique de la carte des missions (lib/carte.js)
 */
import { describe, it, expect } from "vitest";
import {
  STATUTS_CARTE,
  PHASES,
  PRIORITE,
  phaseDeStatut,
  phaseDeKaze,
  depuis,
  gpsPerime,
  GPS_PERIME_MINUTES,
  actionDe,
  lienMission,
  referenceDe,
} from "../lib/carte";
import { STATUS_TON, STATUS_COLORS, TEINTES } from "../lib/utils";

describe("phaseDeStatut", () => {
  it.each([
    ["EN_ATTENTE_DE_COTATION", "A_TRAITER"],
    ["DEVIS_PROPOSE", "A_TRAITER"],
    ["DEVIS_REFUSE", "A_TRAITER"],
    ["ACCEPTEE", "PLANIFIEE"],
    ["ASSIGNEE", "PLANIFIEE"],
    ["EN_COURS", "EN_COURS"],
    ["LIVREE", "TERMINEE"],
  ])("%s → %s", (statut, phase) => {
    expect(phaseDeStatut(statut)).toBe(phase);
  });

  it("range un statut inconnu parmi les missions à traiter", () => {
    expect(phaseDeStatut("???")).toBe("A_TRAITER");
  });
});

describe("phaseDeKaze", () => {
  it("considère terminés les jobs complétés ou annulés", () => {
    expect(phaseDeKaze({ kaze_status: "completed" })).toBe("TERMINEE");
    expect(phaseDeKaze({ kaze_status: "cancelled" })).toBe("TERMINEE");
  });

  it("met en route un job démarré, même sans nom de convoyeur", () => {
    expect(phaseDeKaze({ kaze_status: "started" })).toBe("EN_COURS");
  });

  it("un job démarré prime sur la simple affectation", () => {
    expect(
      phaseDeKaze({ kaze_status: "started", performer_name: "Paul" }),
    ).toBe("EN_COURS");
  });

  it("un convoyeur affecté sans démarrage = acceptée / assignée", () => {
    expect(
      phaseDeKaze({ kaze_status: "assigned", performer_name: "Paul" }),
    ).toBe("PLANIFIEE");
  });

  it("sans convoyeur ni démarrage, le job reste à traiter", () => {
    expect(phaseDeKaze({ kaze_status: "waiting" })).toBe("A_TRAITER");
  });
});

describe("cohérence des couleurs", () => {
  it("chaque phase a une couleur propre, aucune n'est partagée", () => {
    const couleurs = Object.values(PHASES).map((p) => p.color);
    expect(new Set(couleurs).size).toBe(couleurs.length);
  });

  it("toutes les couleurs de phase viennent de la palette TEINTES", () => {
    const palette = Object.values(TEINTES);
    for (const phase of Object.values(PHASES)) {
      expect(palette).toContain(phase.color);
    }
  });

  it("l'ordre de priorité couvre exactement les phases", () => {
    expect([...PRIORITE].sort()).toEqual(Object.keys(PHASES).sort());
  });

  // Une phase de la carte et le badge du même statut doivent dire la même
  // chose : « acceptée » ne peut pas être bleue sur la carte et d'un autre
  // ton dans la liste. Ce test relie les deux systèmes.
  const TONS_PAR_PHASE = {
    A_TRAITER: ["attente", "action", "echec"],
    PLANIFIEE: ["planifie"],
    EN_COURS: ["encours"],
    TERMINEE: ["fini"],
  };

  it.each([...STATUTS_CARTE, "DEVIS_REFUSE"])(
    "le badge de %s est du ton de sa phase sur la carte",
    (statut) => {
      const phase = phaseDeStatut(statut);
      expect(TONS_PAR_PHASE[phase]).toContain(STATUS_TON[statut]);
    },
  );

  it("« acceptée / assignée » et « en cours » ne partagent plus le même ton", () => {
    expect(STATUS_TON.ASSIGNEE).toBe(STATUS_TON.ACCEPTEE);
    expect(STATUS_TON.EN_COURS).not.toBe(STATUS_TON.ASSIGNEE);
    expect(STATUS_COLORS.EN_COURS).not.toBe(STATUS_COLORS.ASSIGNEE);
  });
});

describe("depuis", () => {
  const maintenant = new Date("2026-11-20T12:00:00Z").getTime();
  const ilYa = (minutes) =>
    new Date(maintenant - minutes * 60000).toISOString();

  it("« à l'instant » sous la minute, et pour une horloge en avance", () => {
    expect(depuis(ilYa(0), maintenant)).toBe("à l'instant");
    expect(depuis(ilYa(-5), maintenant)).toBe("à l'instant");
  });

  it("minutes, heures, puis jours", () => {
    expect(depuis(ilYa(12), maintenant)).toBe("il y a 12 min");
    expect(depuis(ilYa(180), maintenant)).toBe("il y a 3 h");
    expect(depuis(ilYa(60 * 24 * 3), maintenant)).toBe("il y a 3 j");
  });

  it("renvoie une chaîne vide pour une date illisible", () => {
    expect(depuis("pas une date", maintenant)).toBe("");
  });
});

describe("gpsPerime", () => {
  const maintenant = new Date("2026-11-20T12:00:00Z").getTime();
  const ilYa = (minutes) =>
    new Date(maintenant - minutes * 60000).toISOString();

  it("une position récente n'est pas périmée", () => {
    expect(gpsPerime(ilYa(5), maintenant)).toBe(false);
    expect(gpsPerime(ilYa(GPS_PERIME_MINUTES - 1), maintenant)).toBe(false);
  });

  it("au-delà de 2 h, elle l'est", () => {
    expect(gpsPerime(ilYa(GPS_PERIME_MINUTES + 1), maintenant)).toBe(true);
  });

  it("sans date, ou avec une date illisible, on ne peut pas la garantir", () => {
    expect(gpsPerime(null, maintenant)).toBe(true);
    expect(gpsPerime(undefined, maintenant)).toBe(true);
    expect(gpsPerime("n'importe quoi", maintenant)).toBe(true);
  });
});

describe("actionDe", () => {
  it("propose de coter une mission en attente de cotation", () => {
    expect(actionDe("EN_ATTENTE_DE_COTATION")).toEqual({
      action: "coter",
      libelle: "Coter",
    });
  });

  it("propose de recoter après un devis refusé", () => {
    expect(actionDe("DEVIS_REFUSE")).toEqual({
      action: "coter",
      libelle: "Recoter",
    });
  });

  it("propose d'assigner une mission acceptée", () => {
    expect(actionDe("ACCEPTEE")?.action).toBe("assigner");
  });

  it.each(["DEVIS_PROPOSE", "ASSIGNEE", "EN_COURS", "LIVREE"])(
    "ne propose rien pour %s : la main n'est pas à l'exploitant",
    (statut) => {
      expect(actionDe(statut)).toBeNull();
    },
  );
});

describe("lienMission / referenceDe", () => {
  it("construit le lien de la page Missions", () => {
    expect(lienMission("abc")).toBe("/admin/missions?mission=abc");
    expect(lienMission("abc", "coter")).toBe(
      "/admin/missions?mission=abc&action=coter",
    );
  });

  it("encode l'identifiant pour qu'il ne casse pas l'adresse", () => {
    expect(lienMission("a b&c")).toBe("/admin/missions?mission=a%20b%26c");
  });

  it("référence = DLC- + 8 premiers caractères en majuscules, comme Kaze", () => {
    expect(referenceDe("7980a1e9-d299-4ec1-b390-f553d10c063b")).toBe(
      "DLC-7980A1E9",
    );
  });
});
