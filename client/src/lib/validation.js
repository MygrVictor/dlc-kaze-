/**
 * Validation des coordonnées saisies dans les formulaires.
 *
 * Ces contrôles reproduisent ceux du serveur pour éviter un aller-retour
 * réseau sur une faute évidente, et surtout pour désigner le champ fautif :
 * une erreur renvoyée après l'envoi oblige l'utilisateur à relire tout un
 * formulaire pour retrouver ce qui cloche.
 *
 * Le serveur reste seul juge. Ce qui est écrit ici guide la saisie ; ce
 * qui est écrit là-bas protège les données.
 */

export const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vrai si la saisie est une adresse électronique plausible. */
export function emailValide(saisie) {
  const brut = String(saisie || "").trim();
  return brut.length > 0 && brut.length <= 254 && EMAIL_VALIDE.test(brut);
}

/**
 * Découpe commune aux deux contrôles de téléphone.
 *
 * L'ordre compte. Le préfixe « 00 » désigne un indicatif de sortie
 * international, mais le retirer avant d'avoir éprouvé la forme nationale
 * amputait « 0000000000 » de ses deux premiers chiffres : le numéro
 * échappait alors au contrôle des dix chiffres et passait au seul motif
 * de sa longueur. La forme nationale est donc examinée en premier.
 */
function analyser(saisie) {
  const brut = String(saisie || "").trim();
  if (!brut) return null;

  const international = brut.startsWith("+");
  const chiffres = brut.replace(/\D/g, "");
  if (!chiffres) return null;

  const national =
    !international && chiffres.length === 10 && chiffres.startsWith("0");

  return { chiffres, international, national };
}

/** Vrai si aucune numérotation n'attribue cette suite (0000000000, 1111…). */
const repetitionUniforme = (chiffres) => /^(\d)\1+$/.test(chiffres);

/**
 * Vrai si le numéro est joignable, fixe ou mobile.
 *
 * Le contact d'un garage, d'une concession ou d'un service logistique est
 * le plus souvent un fixe : l'exclure obligerait à saisir un numéro faux
 * pour passer, exactement le contournement qu'on cherche à éviter.
 *
 * Les numéros en 08 sont écartés : ce sont des services payants sur
 * lesquels on ne joint personne.
 */
export function telephoneValide(saisie) {
  const analyse = analyser(saisie);
  if (!analyse) return false;

  let { chiffres } = analyse;
  if (analyse.national) return /^0[1-79]\d{8}$/.test(chiffres);

  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  if (chiffres.startsWith("33")) {
    return /^[1-79]\d{8}$/.test(chiffres.slice(2).replace(/^0/, ""));
  }

  if (repetitionUniforme(chiffres)) return false;
  return chiffres.length >= 8 && chiffres.length <= 15;
}

/**
 * Vrai si le numéro est un mobile.
 *
 * Plus strict que `telephoneValide` : les convoyeurs sont prévenus de
 * leurs missions par WhatsApp, qui n'aboutit pas sur un fixe.
 */
export function mobileValide(saisie) {
  const analyse = analyser(saisie);
  if (!analyse) return false;

  let { chiffres } = analyse;
  if (analyse.national) return /^0[67]\d{8}$/.test(chiffres);

  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  if (chiffres.startsWith("33")) {
    return /^[67]\d{8}$/.test(chiffres.slice(2).replace(/^0/, ""));
  }

  if (repetitionUniforme(chiffres)) return false;
  return chiffres.length >= 8 && chiffres.length <= 15;
}
