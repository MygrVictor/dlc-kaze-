/**
 * Catalogue des types de véhicules — copie client.
 *
 * ⚠️ Ce fichier est le miroir de server/src/lib/vehicules.js. La liste
 * est dupliquée pour que le formulaire de création n'ait pas à faire un
 * appel réseau supplémentaire avant de pouvoir s'afficher. Un test
 * serveur (vehicules.test.js) compare les deux fichiers et échoue si
 * l'un des deux part à la dérive.
 *
 * Toute modification ici doit être reportée à l'identique côté serveur.
 */

export const CLASSE_PEAGE = {
  LEGER: "1",
  INTERMEDIAIRE: "2",
  POIDS_LOURD: "3",
};

export const SEUIL_UTILITAIRE_M3 = 12;

export const TYPES_VEHICULE = [
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

const PAR_CODE = new Map(TYPES_VEHICULE.map((t) => [t.code, t]));

/** Retrouve un type par son code. */
export function trouverType(code) {
  if (!code) return null;
  return PAR_CODE.get(String(code).trim()) || null;
}

/** Classe de péage : "1", "2" ou "3". */
export function classeDePeage(code) {
  const type = trouverType(code);
  return type ? type.classePeage : CLASSE_PEAGE.LEGER;
}

/** Le véhicule dépasse-t-il 12 m³ ? */
export function estUtilitaire12m3(code) {
  const type = trouverType(code);
  if (!type || type.volumeM3 == null) return "NON";
  return type.volumeM3 >= SEUIL_UTILITAIRE_M3 ? "OUI" : "NON";
}

/** Libellé lisible, ou le code brut si le type est inconnu. */
export function libelle(code) {
  const type = trouverType(code);
  return type ? type.label : code || "";
}

/** Types regroupés par catégorie, dans l'ordre du catalogue. */
export function parCategorie() {
  const groupes = [];
  for (const type of TYPES_VEHICULE) {
    let groupe = groupes.find((g) => g.categorie === type.categorie);
    if (!groupe) {
      groupe = { categorie: type.categorie, types: [] };
      groupes.push(groupe);
    }
    groupe.types.push(type);
  }
  return groupes;
}
