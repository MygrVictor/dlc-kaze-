/**
 * Tests — Utilitaires frontend (utils.js)
 */
import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatPrice,
  villeDe,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_TON,
  TEINTES,
} from "../lib/utils";

describe("formatDate", () => {
  it("formate une date ISO valide en français", () => {
    const result = formatDate("2024-06-15T10:00:00.000Z");
    expect(result).toMatch(/juin/i);
    expect(result).toMatch(/2024/);
  });

  it("retourne — pour une valeur nulle", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("formatPrice", () => {
  it("formate un nombre en euros", () => {
    const result = formatPrice(1500);
    expect(result).toMatch(/1\s*500/);
    expect(result).toMatch(/€/);
  });

  it("retourne — pour une valeur nulle/undefined", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
    expect(formatPrice(0)).toBe("—");
  });
});

describe("STATUS_LABELS", () => {
  it("contient tous les statuts attendus", () => {
    const expectedStatuses = [
      "EN_ATTENTE_DE_COTATION",
      "DEVIS_PROPOSE",
      "ACCEPTEE",
      "ASSIGNEE",
      "EN_COURS",
      "LIVREE",
      "ANNULEE",
    ];
    expectedStatuses.forEach((status) => {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe("string");
    });
  });
});

describe("STATUS_COLORS", () => {
  it("contient une couleur pour chaque statut", () => {
    Object.keys(STATUS_LABELS).forEach((status) => {
      expect(STATUS_COLORS[status]).toBeDefined();
    });
  });

  it("chaque classe de statut correspond à son ton", () => {
    // Les deux tables décrivent la même chose : un statut dont la classe
    // et le ton divergent s'afficherait dans une couleur et se classerait
    // dans une autre (carte, légende).
    Object.keys(STATUS_LABELS).forEach((status) => {
      expect(STATUS_COLORS[status]).toBe(
        `at-statut at-statut--${STATUS_TON[status]}`,
      );
    });
  });

  it("n'utilise plus de violet : la palette tient en six teintes mates", () => {
    expect(Object.keys(TEINTES).sort()).toEqual(
      ["ambre", "bleu", "gris", "orange", "rouge", "vert"].sort(),
    );
  });
});

describe("villeDe", () => {
  it("extrait la ville après le code postal", () => {
    expect(villeDe("12 rue Garibaldi, 69006 Lyon")).toBe("Lyon");
    expect(villeDe("5 rue Crébillon, 44000 Nantes")).toBe("Nantes");
  });

  it("garde les villes composées en entier", () => {
    expect(villeDe("3 rue X, 95290 L'Isle-Adam")).toBe("L'Isle-Adam");
  });

  it("sans code postal, retient le dernier segment", () => {
    expect(villeDe("Gare de Lyon, Paris")).toBe("Paris");
    expect(villeDe("Marseille")).toBe("Marseille");
  });

  it("renvoie un tiret quand il n'y a pas d'adresse", () => {
    expect(villeDe("")).toBe("—");
    expect(villeDe(null)).toBe("—");
    expect(villeDe(undefined)).toBe("—");
  });
});
