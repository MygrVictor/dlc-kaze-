import { useEffect, useRef, useState } from "react";

/**
 * Compteur kilométrique : chaque chiffre est un tambour qui tourne.
 *
 * Un compteur qui s'incrémente est un décor de tableau de bord ; un
 * tambour qui défile jusqu'à son chiffre, c'est un compteur de voiture.
 * Le chiffre des unités fait plusieurs tours, celui des milliers à peine
 * un : l'ensemble se pose de droite à gauche, comme le mécanisme réel.
 *
 * Seul le résultat final est lu par les lecteurs d'écran : les tambours
 * sont masqués, la valeur est portée par l'étiquette de l'ensemble.
 *
 * @param {number} valeur       nombre entier à afficher
 * @param {string} [suffixe]    « + », « %»… affiché après les tambours
 * @param {number} [delai]      secondes avant le départ
 * @param {"visible"|"montage"} [declencheur]
 *        « visible » : au passage dans l'écran (par défaut) ;
 *        « montage » : dès l'affichage de la page (hero).
 * @param {boolean} [tuiles]    chaque chiffre dans sa tuile sombre
 */
const TOURS_MAX = 4;

export default function Odometre({
  valeur,
  suffixe = "",
  delai = 0,
  declencheur = "visible",
  tuiles = false,
  className = "",
}) {
  const racine = useRef(null);
  const [lance, setLance] = useState(false);

  useEffect(() => {
    // Sans mouvement : la valeur est posée tout de suite.
    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) {
      setLance(true);
      return undefined;
    }

    if (declencheur === "montage") {
      const t = setTimeout(() => setLance(true), delai * 1000);
      return () => clearTimeout(t);
    }

    const noeud = racine.current;
    if (!noeud) return undefined;
    let t;
    const io = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          t = setTimeout(() => setLance(true), delai * 1000);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(noeud);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [delai, declencheur]);

  const texte = Math.round(valeur).toLocaleString("fr-FR");
  const caracteres = [...texte];
  const nbChiffres = caracteres.filter((c) => /\d/.test(c)).length;

  let rang = -1;
  return (
    <span
      ref={racine}
      className={`odo${tuiles ? " odo--tuiles" : ""}${lance ? " odo--lance" : ""} ${className}`.trim()}
      role="img"
      aria-label={`${texte}${suffixe}`}
    >
      {caracteres.map((c, i) => {
        if (!/\d/.test(c)) {
          return <span key={i} className="odo__sep" aria-hidden="true" />;
        }
        rang += 1;
        const chiffre = Number(c);
        const tours = Math.min(nbChiffres - rang, TOURS_MAX);
        const cible = tours * 10 + chiffre;
        return (
          <span key={i} className="odo__tambour" aria-hidden="true">
            <span
              className="odo__bande"
              style={{
                "--cible": cible,
                "--retard": `${(rang * 0.09).toFixed(2)}s`,
              }}
            >
              {Array.from({ length: cible + 1 }, (_, k) => (
                <span key={k}>{k % 10}</span>
              ))}
            </span>
          </span>
        );
      })}
      {suffixe && (
        <span className="odo__suffixe" aria-hidden="true">
          {suffixe.replace(/^ /, " ")}
        </span>
      )}
    </span>
  );
}
