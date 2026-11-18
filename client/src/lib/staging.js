// Vrai uniquement sur l'environnement de recette : le banc de test ne doit
// jamais apparaître en production.
export const ESTSTAGING =
  import.meta.env.VITE_ENV === "staging" ||
  (typeof window !== "undefined" &&
    (window.location.hostname.includes("staging") ||
      window.location.hostname === "localhost"));
