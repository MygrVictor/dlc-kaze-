/**
 * Utilitaires de statut pour l'affichage.
 */

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

export const STATUS_COLORS = {
  EN_ATTENTE_DE_COTATION:
    "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  DEVIS_PROPOSE: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  DEVIS_REFUSE: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  ACCEPTEE: "bg-green-500/10 text-green-400 border border-green-500/20",
  ASSIGNEE: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  EN_COURS: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  LIVREE: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  ANNULEE: "bg-red-500/10 text-red-400 border border-red-500/20",
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
  ACCEPTEE: "marche",
  ASSIGNEE: "marche",
  EN_COURS: "marche",
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
