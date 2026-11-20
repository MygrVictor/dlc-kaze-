/**
 * Logique pure de la carte des missions (AdminMap.jsx), isolée pour être
 * testée : phases d'exploitation, ancienneté des positions GPS, action à
 * proposer selon le statut, liens vers une mission.
 */
import { TEINTES } from "./utils";

/** Statuts chargés par la carte : le tri par phase se fait ensuite en mémoire. */
export const STATUTS_CARTE = [
  "EN_ATTENTE_DE_COTATION",
  "DEVIS_PROPOSE",
  "ACCEPTEE",
  "ASSIGNEE",
  "EN_COURS",
  "LIVREE",
];

// ── Phases d'exploitation ──────────────────────────────────
// Huit statuts à l'écran ne se lisent pas d'un coup d'œil. Ce qui
// intéresse l'exploitant sur une carte tient en quatre questions :
// qu'est-ce qui attend une action de ma part, qu'est-ce qui est calé mais
// n'a pas démarré, qu'est-ce qui roule, qu'est-ce qui est derrière moi.
// Les statuts fins restent dans la fiche. Couleurs : palette TEINTES,
// la même que les badges de statut du reste de l'application.
export const PHASES = {
  A_TRAITER: {
    label: "À traiter",
    aide: "À coter ou devis en attente de réponse",
    color: TEINTES.ambre,
  },
  PLANIFIEE: {
    label: "Acceptées / assignées",
    aide: "Calées, pas encore parties",
    color: TEINTES.bleu,
  },
  EN_COURS: {
    label: "En cours",
    aide: "Le convoyeur est en route",
    color: TEINTES.orange,
  },
  TERMINEE: {
    label: "Terminées",
    aide: "Livrées sur la période",
    color: TEINTES.gris,
  },
};

/** Ordre d'urgence : sert au tri de la liste et à la couleur des groupes. */
export const PRIORITE = ["A_TRAITER", "PLANIFIEE", "EN_COURS", "TERMINEE"];

/** Phase d'une mission DLC, déduite de son statut. */
export function phaseDeStatut(status) {
  if (status === "LIVREE") return "TERMINEE";
  if (status === "EN_COURS") return "EN_COURS";
  if (status === "ACCEPTEE" || status === "ASSIGNEE") return "PLANIFIEE";
  return "A_TRAITER";
}

/** Même lecture pour un job Kaze, dont les statuts sont en anglais. */
export function phaseDeKaze(job) {
  if (job.kaze_status === "completed" || job.kaze_status === "cancelled")
    return "TERMINEE";
  if (job.kaze_status === "started") return "EN_COURS";
  if (job.performer_name) return "PLANIFIEE";
  return "A_TRAITER";
}

// ── Positions GPS des convoyeurs ───────────────────────────
/** Au-delà, une position n'est plus présentée comme actuelle. */
export const GPS_PERIME_MINUTES = 120;

/** « il y a 12 min », « il y a 3 h », « il y a 2 j ». */
export function depuis(date, maintenant = Date.now()) {
  const minutes = Math.round((maintenant - new Date(date).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 48 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} j`;
}

/** Vrai si la position est trop ancienne — ou sans date, donc invérifiable. */
export function gpsPerime(date, maintenant = Date.now()) {
  if (!date) return true;
  const age = (maintenant - new Date(date).getTime()) / 60000;
  return !Number.isFinite(age) || age > GPS_PERIME_MINUTES;
}

// ── Actions et liens ───────────────────────────────────────
/** Action à proposer selon le statut : ce qu'on attend de l'exploitant. */
export function actionDe(status) {
  if (status === "EN_ATTENTE_DE_COTATION")
    return { action: "coter", libelle: "Coter" };
  if (status === "DEVIS_REFUSE") return { action: "coter", libelle: "Recoter" };
  if (status === "ACCEPTEE")
    return { action: "assigner", libelle: "Assigner un convoyeur" };
  return null;
}

/** Lien direct vers une mission de l'administration (voir AdminMissions). */
export const lienMission = (id, action) =>
  `/admin/missions?mission=${encodeURIComponent(id)}${
    action ? `&action=${action}` : ""
  }`;

/** Référence affichée, la même que celle que Kaze donne à nos missions. */
export const referenceDe = (id) =>
  `DLC-${String(id).slice(0, 8).toUpperCase()}`;
