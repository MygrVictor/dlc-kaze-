import { useEffect, useRef } from "react";

/**
 * Pile de panneaux qui se recouvrent au défilement (section des solutions).
 *
 * Les panneaux sont collants (`position: sticky`, voir vitrine.css) : chacun
 * reste accroché pendant que le suivant glisse par-dessus. Ce hook ajoute
 * ce que le CSS seul ne sait pas faire :
 *
 *  - `--recul` (0 à 1) sur chaque panneau recouvert : il rétrécit et
 *    s'assombrit à mesure que le suivant le couvre ;
 *  - la classe `panneau--vu` quand un panneau entre dans l'écran, qui
 *    déclenche le tracé de son icône et l'arrivée de son mot.
 *
 * Sous 900 px la pile est désactivée (panneaux empilés normalement) : sur
 * un écran de téléphone, des panneaux collants hauts de 500 px empêcheraient
 * de lire la suite.
 */
const DECALAGE = 22; // px, doit rester égal au pas de `top` dans vitrine.css

export default function usePile() {
  const ref = useRef(null);

  useEffect(() => {
    const racine = ref.current;
    if (!racine) return undefined;
    const panneaux = [...racine.querySelectorAll(".panneau")];

    const io = new IntersectionObserver(
      (entrees) => {
        entrees.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("panneau--vu");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    panneaux.forEach((p) => io.observe(p));

    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) return () => io.disconnect();

    let cadre = 0;
    const maj = () => {
      cadre = 0;
      const empile = window.matchMedia("(min-width: 901px)").matches;
      panneaux.forEach((p, i) => {
        if (!empile || i === panneaux.length - 1) {
          p.style.setProperty("--recul", "0");
          return;
        }
        const haut = parseFloat(getComputedStyle(p).top) || 0;
        const suivant = panneaux[i + 1].getBoundingClientRect().top;
        // 0 quand le suivant touche le bas du panneau, 1 quand il le
        // recouvre presque entièrement.
        const debut = haut + p.offsetHeight;
        const fin = haut + DECALAGE;
        const t = Math.min(1, Math.max(0, (debut - suivant) / (debut - fin)));
        p.style.setProperty("--recul", t.toFixed(3));
      });
    };
    const surDefilement = () => {
      if (!cadre) cadre = requestAnimationFrame(maj);
    };

    maj();
    window.addEventListener("scroll", surDefilement, { passive: true });
    window.addEventListener("resize", surDefilement);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", surDefilement);
      window.removeEventListener("resize", surDefilement);
      if (cadre) cancelAnimationFrame(cadre);
    };
  }, []);

  return ref;
}
