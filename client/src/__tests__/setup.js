import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Aucun test ne doit sortir sur le réseau. Le champ d'adresse interroge
// la Base Adresse Nationale dès la troisième frappe : sans ce garde-fou,
// toute saisie d'adresse dans un test déclenche un appel réel, et la
// suite devient tributaire d'un service externe — lente, et rouge le
// jour où la BAN est indisponible.
//
// La réponse par défaut est une liste vide : le champ reste utilisable,
// il ne propose simplement rien. Un test qui a besoin de suggestions
// remplace `global.fetch` pour son propre compte.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [] }),
  });
});
