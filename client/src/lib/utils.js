/**
 * Utilitaires de statut pour l'affichage.
 */

/**
 * Palette des statuts — source unique pour les badges (index.css) et la
 * carte (AdminMap). Teintes de la charte et tons mats, en aplats : pas de
 * fonds translucides lumineux ni de halos.
 *
 *  ambre    : à traiter (le devis à signer en aplat, la cotation en contour)
 *  bleu     : acceptée / assignée — calée, pas encore partie
 *  sarcelle : en cours — le véhicule roule (teal de la charte)
 *  vert     : livrée
 *  rouge    : refusée / annulée
 *  gris     : historique sur la carte
 */
export const TEINTES = {
  ambre: "#e6b800",
  bleu: "#2f5b94",
  sarcelle: "#0e7490",
  vert: "#2f6b55",
  rouge: "#a33a3a",
  gris: "#64748b",
};

export const STATUS_LABELS = {
  EN_ATTENTE_DE_COTATION: "En attente de cotation",
  DEVIS_PROPOSE: "Devis proposé",
  DEVIS_REFUSE: "Devis refusé",
  ACCEPTEE: "Acceptée",
  ASSIGNEE: "Assignée",
  EN_COURS: "En cours",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

// Les teintes d'origine (bg-yellow-500/10…) n'ont jamais été visibles :
// la règle `.dash .badge` d'index.css, plus spécifique qu'un utilitaire
// Tailwind, les écrasait toutes en gris. Chaque statut reçoit désormais
// la classe de son « ton » (voir STATUS_TON plus bas), stylée dans
// index.css pour les deux thèmes.
export const STATUS_COLORS = {
  EN_ATTENTE_DE_COTATION: "at-statut at-statut--attente",
  DEVIS_PROPOSE: "at-statut at-statut--action",
  DEVIS_REFUSE: "at-statut at-statut--echec",
  ACCEPTEE: "at-statut at-statut--planifie",
  ASSIGNEE: "at-statut at-statut--planifie",
  EN_COURS: "at-statut at-statut--encours",
  LIVREE: "at-statut at-statut--fini",
  ANNULEE: "at-statut at-statut--echec",
};

/**
 * Classe de statut, regroupée par ce qu'elle réclame du lecteur.
 *
 * `STATUS_COLORS` donne une teinte propre à chacun des huit statuts.
 * Huit couleurs de même intensité ne hiérarchisent rien : un devis à
 * signer, qui attend une décision, s'y affiche avec le même poids
 * qu'une mission livrée depuis des mois.
 *
 * Ici un seul statut est mis en avant — celui qui demande une action.
 * Le libellé, lui, reste distinct pour les huit : on perd la couleur,
 * pas l'information.
 *
 * `DEVIS_PROPOSE` est volontairement la seule « action » : c'est le
 * seul état où la plateforme attend quelque chose du client.
 */
export const STATUS_TON = {
  EN_ATTENTE_DE_COTATION: "attente",
  DEVIS_PROPOSE: "action",
  DEVIS_REFUSE: "echec",
  // Acceptée et assignée : la mission est calée mais n'a pas démarré.
  // En cours : le véhicule roule. Deux situations que l'exploitation
  // doit distinguer d'un coup d'œil — mêmes couleurs que sur la carte.
  ACCEPTEE: "planifie",
  ASSIGNEE: "planifie",
  EN_COURS: "encours",
  LIVREE: "fini",
  ANNULEE: "echec",
};

/** Classe CSS complète pour un statut donné. */
export const classeStatut = (statut) =>
  `at-statut at-statut--${STATUS_TON[statut] || "attente"}`;

export const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatPrice = (price) => {
  if (!price) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(price);
};

/**
 * Ville d'une adresse postale française (« 12 rue X, 69007 Lyon » → « Lyon »).
 * À défaut de code postal, le dernier segment de l'adresse.
 */
export function villeDe(adresse) {
  const texte = String(adresse || "").trim();
  if (!texte) return "—";
  const apresCodePostal = texte.match(/\b\d{5}\s+([^,]+)/);
  if (apresCodePostal) return apresCodePostal[1].trim();
  const segments = texte.split(",").map((x) => x.trim()).filter(Boolean);
  return segments[segments.length - 1] || texte;
}
