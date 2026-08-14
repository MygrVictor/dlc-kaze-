/**
 * Tests — Utilitaires frontend (utils.js)
 */
import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatPrice,
  STATUS_LABELS,
  STATUS_COLORS,
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
});
