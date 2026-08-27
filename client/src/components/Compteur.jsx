import { useEffect, useRef, useState } from "react";

/**
 * Nombre qui s'incrémente lorsqu'il entre dans le champ de vision.
 *
 * Un chiffre déjà affiché à l'arrivée passe inaperçu ; le voir défiler
 * attire l'œil au moment précis où le visiteur atteint la section. Le
 * compte à rebours ne démarre donc qu'à l'intersection, et une seule fois :
 * rejouer l'animation à chaque passage donnerait un site nerveux.
 *
 * L'amortissement (easing) évite l'effet compteur kilométrique : la
 * progression ralentit à l'approche de la valeur finale, ce qui rend le
 * chiffre lisible avant même la fin de l'animation.
 */
export default function Compteur({
  valeur,
  suffixe = "",
  prefixe = "",
  duree = 1400,
  decimales = 0,
  className,
}) {
  const [affiche, setAffiche] = useState(0);
  const ref = useRef(null);
  const lance = useRef(false);

  useEffect(() => {
    const noeud = ref.current;
    if (!noeud) return;

    // Respecter le réglage système : une animation de chiffres est du
    // décor, elle n'a pas à s'imposer à qui l'a désactivée.
    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) {
      setAffiche(valeur);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entree) => {
          if (!entree.isIntersecting || lance.current) return;
          lance.current = true;
          io.unobserve(entree.target);

          const debut = performance.now();
          const animer = (maintenant) => {
            const avancement = Math.min((maintenant - debut) / duree, 1);
            // easeOutCubic
            const amorti = 1 - Math.pow(1 - avancement, 3);
            setAffiche(valeur * amorti);
            if (avancement < 1) requestAnimationFrame(animer);
          };
          requestAnimationFrame(animer);
        });
      },
      { threshold: 0.4 },
    );

    io.observe(noeud);
    return () => io.disconnect();
  }, [valeur, duree]);

  const rendu =
    decimales > 0
      ? affiche.toFixed(decimales).replace(".", ",")
      : Math.round(affiche).toLocaleString("fr-FR");

  return (
    <span ref={ref} className={className}>
      {prefixe}
      {rendu}
      {suffixe}
    </span>
  );
}
