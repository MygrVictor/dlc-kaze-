import { useEffect, useRef } from "react";

/**
 * Rafraîchissement périodique économe.
 *
 * Les tableaux de bord convoyeur interrogeaient le serveur toutes les 15 à
 * 30 secondes, sans jamais s'arrêter. Multiplié par le nombre de convoyeurs
 * connectés, cela représentait l'essentiel du trafic de l'API — pour, la
 * plupart du temps, s'entendre répondre que rien n'avait changé.
 *
 * Ce crochet corrige deux gaspillages :
 *
 *  1. il suspend le sondage lorsque l'onglet passe en arrière-plan. Un
 *     convoyeur qui laisse la page ouverte toute la journée sur son
 *     téléphone ne consomme plus rien tant qu'il ne la regarde pas ;
 *  2. il relance immédiatement une lecture au retour sur l'onglet, ce qui
 *     rend l'information *plus* fraîche qu'avant, alors même que l'intervalle
 *     est allongé — l'utilisateur n'attend plus la fin du cycle en cours.
 *
 * @param {Function} rappel   fonction de rafraîchissement (idéalement mémoïsée)
 * @param {number}   periode  intervalle en millisecondes
 * @param {boolean}  actif    permet de désactiver le sondage
 */
export default function useSondage(rappel, periode = 60000, actif = true) {
  // La référence évite de relancer le minuteur à chaque rendu si l'appelant
  // n'a pas mémoïsé sa fonction, tout en appelant toujours la plus récente.
  const rappelRef = useRef(rappel);
  rappelRef.current = rappel;

  useEffect(() => {
    if (!actif) return undefined;

    let minuteur = null;

    const arreter = () => {
      if (minuteur !== null) {
        clearInterval(minuteur);
        minuteur = null;
      }
    };

    const demarrer = () => {
      arreter();
      minuteur = setInterval(() => rappelRef.current(), periode);
    };

    const surVisibilite = () => {
      if (document.visibilityState === "visible") {
        // Retour sur l'onglet : on ne fait pas attendre l'utilisateur.
        rappelRef.current();
        demarrer();
      } else {
        arreter();
      }
    };

    if (document.visibilityState === "visible") demarrer();
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [periode, actif]);
}
