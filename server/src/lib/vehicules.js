/**
 * Catalogue des types de véhicules — DLC Kaze
 *
 * Le type ne sert pas seulement à décrire le véhicule : il conditionne
 * deux contraintes opérationnelles réelles.
 *
 *   1. La classe de péage. En France, la hauteur et le PTAC déterminent
 *      la classe facturée aux barrières :
 *        - Classe 1 : hauteur ≤ 2 m et PTAC ≤ 3,5 t
 *        - Classe 2 : hauteur > 2 m et ≤ 3 m, PTAC ≤ 3,5 t
 *        - Classe 3 : PTAC > 3,5 t ou hauteur > 3 m (2 essieux)
 *      Un L1H1 et un L3H3 ne coûtent donc pas le même trajet.
 *
 *   2. La conduite. Un fourgon L4H3 ne se conduit ni ne se gare comme
 *      une citadine : le convoyeur doit le savoir avant d'accepter.
 *
 * Les codes L1→L4 (longueur) et H1→H3 (hauteur) sont la nomenclature
 * constructeur standard des fourgons (Master, Transit, Sprinter…).
 *
 * ⚠️ Ce catalogue est dupliqué dans client/src/lib/vehicules.js pour que
 * le formulaire n'ait pas à faire d'appel réseau. Un test
 * (vehicules.test.js) vérifie que les deux fichiers restent identiques.
 */

/** Classes de péage françaises. */
const CLASSE_PEAGE = {
  LEGER: "1",
  INTERMEDIAIRE: "2",
  POIDS_LOURD: "3",
};

/**
 * Seuil au-delà duquel Kaze considère le véhicule comme un utilitaire
 * volumineux (widget « Véhicule utilitaire ≥ 12 m³ »).
 */
const SEUIL_UTILITAIRE_M3 = 12;

const TYPES_VEHICULE = [
  // ── Véhicules légers ────────────────────────────────────────
  {
    code: "citadine",
    label: "Citadine",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "citadine",
  },
  {
    code: "berline",
    label: "Berline",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "berline",
  },
  {
    code: "break",
    label: "Break",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "berline",
  },
  {
    code: "monospace",
    label: "Monospace",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "berline",
  },
  {
    code: "coupe_cabriolet",
    label: "Coupé / Cabriolet",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "berline",
  },
  {
    code: "suv",
    label: "SUV / 4x4",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "suv",
  },
  {
    code: "prestige",
    label: "Prestige / Sportive",
    categorie: "Véhicule léger",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: null,
    tarification: "prestige",
  },

  // ── Utilitaires : gabarit longueur / hauteur ────────────────
  {
    code: "fourgonnette",
    label: "Fourgonnette (Kangoo, Berlingo…)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: 4,
    tarification: "utilitaire",
  },
  {
    code: "L1H1",
    label: "Fourgon L1H1 — court, toit bas (≈ 8 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: 8,
    tarification: "utilitaire",
  },
  {
    code: "L1H2",
    label: "Fourgon L1H2 — court, toit rehaussé (≈ 10 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 10,
    tarification: "utilitaire",
  },
  {
    code: "L2H1",
    label: "Fourgon L2H1 — moyen, toit bas (≈ 10 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.LEGER,
    volumeM3: 10,
    tarification: "utilitaire",
  },
  {
    code: "L2H2",
    label: "Fourgon L2H2 — moyen, toit rehaussé (≈ 12 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 12,
    tarification: "utilitaire",
  },
  {
    code: "L2H3",
    label: "Fourgon L2H3 — moyen, toit haut (≈ 13 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 13,
    tarification: "utilitaire",
  },
  {
    code: "L3H2",
    label: "Fourgon L3H2 — long, toit rehaussé (≈ 15 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 15,
    tarification: "utilitaire",
  },
  {
    code: "L3H3",
    label: "Fourgon L3H3 — long, toit haut (≈ 17 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 17,
    tarification: "utilitaire",
  },
  {
    code: "L4H2",
    label: "Fourgon L4H2 — extra-long, toit rehaussé (≈ 17 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 17,
    tarification: "utilitaire",
  },
  {
    code: "L4H3",
    label: "Fourgon L4H3 — extra-long, toit haut (≈ 20 m³)",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: 20,
    tarification: "utilitaire",
  },
  {
    code: "plateau_benne",
    label: "Plateau / Benne",
    categorie: "Utilitaire",
    classePeage: CLASSE_PEAGE.INTERMEDIAIRE,
    volumeM3: null,
    tarification: "utilitaire",
  },
  {
    code: "poids_lourd",
    label: "Poids lourd > 3,5 t",
    categorie: "Poids lourd",
    classePeage: CLASSE_PEAGE.POIDS_LOURD,
    volumeM3: null,
    tarification: "utilitaire",
  },
];

/** Index par code, pour les recherches. */
const PAR_CODE = new Map(TYPES_VEHICULE.map((t) => [t.code, t]));

/**
 * Retrouve un type par son code, insensible à la casse.
 * @returns {Object|null}
 */
function trouverType(code) {
  if (!code) return null;
  return (
    PAR_CODE.get(String(code).trim()) ||
    PAR_CODE.get(String(code).trim().toUpperCase()) ||
    null
  );
}

/**
 * Classe de péage d'un type de véhicule.
 *
 * Un type inconnu (mission historique saisie avec l'ancienne liste)
 * est prudemment ramené en classe 1 plutôt que de faire échouer la
 * mission : la classe n'est qu'une information, pas un blocage.
 *
 * @returns {string} "1", "2" ou "3".
 */
function classeDePeage(code) {
  const type = trouverType(code);
  return type ? type.classePeage : CLASSE_PEAGE.LEGER;
}

/**
 * Le véhicule dépasse-t-il le seuil des 12 m³ attendu par Kaze ?
 * @returns {"OUI"|"NON"}
 */
function estUtilitaire12m3(code) {
  const type = trouverType(code);
  if (!type || type.volumeM3 == null) return "NON";
  return type.volumeM3 >= SEUIL_UTILITAIRE_M3 ? "OUI" : "NON";
}

/** Libellé lisible d'un type, ou le code brut si inconnu. */
function libelle(code) {
  const type = trouverType(code);
  return type ? type.label : code || "";
}

/**
 * Ramène un type au segment tarifaire correspondant, pour la grille
 * de prix (citadine / berline / suv / utilitaire / prestige).
 */
function segmentTarifaire(code) {
  const type = trouverType(code);
  return type ? type.tarification : "berline";
}

module.exports = {
  TYPES_VEHICULE,
  CLASSE_PEAGE,
  SEUIL_UTILITAIRE_M3,
  trouverType,
  classeDePeage,
  estUtilitaire12m3,
  libelle,
  segmentTarifaire,
};
