import { useCallback, useEffect, useState } from "react";

/**
 * Fond du hero : les photos défilent comme vues à travers un pare-brise,
 * et c'est un essuie-glace qui amène la suivante.
 *
 * Un balai ambre balaie l'écran d'un côté à l'autre en pivotant depuis le
 * bas ; derrière lui, la nouvelle photo apparaît. Il revient dans l'autre
 * sens à la photo suivante. À l'ouverture de la page, le même geste
 * découvre la première photo : c'est le « contact » du site.
 *
 * Le balayage est un masque conique dont l'angle (`--a`) est animé en CSS
 * (voir vitrine.css). Sans prise en charge de `@property`, l'angle saute
 * en fin d'animation : la photo change sans balayage, rien ne se casse.
 * Avec `prefers-reduced-motion`, aucune animation ne joue et la photo
 * s'affiche directement.
 *
 * Tout ce composant est décoratif (`aria-hidden`), à l'exception des
 * boutons de choix de photo.
 */
export default function PareBrise({ images, intervalle = 6500 }) {
  const [etat, setEtat] = useState({ actif: 0, precedent: null, n: 0 });

  const aller = useCallback(
    (suivant) =>
      setEtat((e) =>
        suivant === e.actif
          ? e
          : { actif: suivant, precedent: e.actif, n: e.n + 1 },
      ),
    [],
  );

  useEffect(() => {
    // Le minuteur repart à chaque changement : un choix manuel ne déclenche
    // pas un second balayage quelques instants plus tard.
    const t = setTimeout(
      () => aller((etat.actif + 1) % images.length),
      intervalle,
    );
    return () => clearTimeout(t);
  }, [etat.n, etat.actif, images.length, intervalle, aller]);

  const sens = etat.n % 2 === 0 ? "aller" : "retour";

  return (
    <>
      <div className="pare-brise" aria-hidden="true">
        {etat.precedent !== null && (
          <div
            className="pare-brise__photo pare-brise__photo--fin"
            style={{ backgroundImage: `url(${images[etat.precedent]})` }}
          />
        )}
        <div key={etat.n} className={`pare-brise__scene pare-brise__scene--${sens}`}>
          <div className="pare-brise__masque">
            <div
              className="pare-brise__photo"
              style={{
                backgroundImage: `url(${images[etat.actif]})`,
                "--duree": `${intervalle}ms`,
              }}
            />
          </div>
          <span className="pare-brise__balai" />
        </div>
      </div>

      <div className="pare-brise__reperes">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => aller(i)}
            aria-label={`Photo ${i + 1} sur ${images.length}`}
            aria-current={i === etat.actif ? "true" : undefined}
            className="pare-brise__repere"
          >
            {i === etat.actif && (
              <span
                key={etat.n}
                className="pare-brise__avance"
                style={{ "--duree": `${intervalle}ms` }}
              />
            )}
          </button>
        ))}
      </div>
    </>
  );
}
