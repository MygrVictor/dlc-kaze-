/**
 * Tests — réduction des photos avant envoi (compresserImage)
 *
 * jsdom ne dessine pas dans un canvas : on vérifie les cas où le fichier
 * doit rester intact (la règle la plus importante : réduire n'est jamais
 * une condition d'envoi) et le choix de ce qui est réduit.
 */
import { describe, it, expect } from "vitest";
import {
  compresserImage,
  doitReduire,
  SEUIL_OCTETS,
} from "../lib/compresserImage";

const fichier = (nom, type, taille) => {
  const f = new File(["x"], nom, { type });
  Object.defineProperty(f, "size", { value: taille });
  return f;
};

describe("doitReduire", () => {
  it("réduit une grosse photo", () => {
    expect(doitReduire(fichier("a.jpg", "image/jpeg", SEUIL_OCTETS + 1))).toBe(true);
    expect(doitReduire(fichier("a.png", "image/png", 6_000_000))).toBe(true);
  });

  it("laisse les PDF, quelle que soit leur taille", () => {
    expect(doitReduire(fichier("a.pdf", "application/pdf", 9_000_000))).toBe(false);
  });

  it("laisse les photos déjà légères", () => {
    expect(doitReduire(fichier("a.jpg", "image/jpeg", 300_000))).toBe(false);
  });

  it("ne plante pas sans fichier", () => {
    expect(doitReduire(null)).toBe(false);
  });
});

describe("compresserImage", () => {
  it("renvoie un PDF tel quel", async () => {
    const pdf = fichier("permis.pdf", "application/pdf", 7_000_000);
    expect(await compresserImage(pdf)).toBe(pdf);
  });

  it("renvoie une photo légère telle quelle", async () => {
    const photo = fichier("p.jpg", "image/jpeg", 200_000);
    expect(await compresserImage(photo)).toBe(photo);
  });

  it("renvoie l'original quand la réduction échoue", async () => {
    // Fichier volumineux mais illisible : jsdom ne sait pas le décoder.
    const photo = fichier("p.jpg", "image/jpeg", 5_000_000);
    expect(await compresserImage(photo, { delaiMs: 50 })).toBe(photo);
  });
});
