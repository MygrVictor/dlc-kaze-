import { useEffect, useRef } from "react";

/**
 * Bandeau jaune : la phrase défile avec le défilement de la page.
 *
 * Le mouvement répond au visiteur : la bande glisse quand il descend, elle
 * s'arrête quand il s'arrête, et elle s'incline légèrement sous l'effet de
 * la vitesse, puis se redresse. Rien ne bouge tout seul.
 *
 * Décoratif : la phrase figure déjà dans la section des solutions, la lire
 * deux fois n'apporterait rien aux lecteurs d'écran.
 */
const PHRASE = "Du premier kilomètre à la remise des clés";

export default function BandeauSlogan() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) return undefined;

    let derniere = window.scrollY;
    let vitesse = 0;
    let cadre = 0;

    const rendre = () => {
      cadre = 0;
      const y = window.scrollY;
      vitesse += (y - derniere - vitesse) * 0.2; // lissage
      derniere = y;

      const r = el.getBoundingClientRect();
      const ecart = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.setProperty("--x", `${(-ecart * 0.55).toFixed(1)}px`);
      el.style.setProperty(
        "--inclinaison",
        `${Math.max(-7, Math.min(7, vitesse * -0.3)).toFixed(2)}deg`,
      );
      // Tant que la bande est inclinée, on continue pour la redresser.
      if (Math.abs(vitesse) > 0.05) cadre = requestAnimationFrame(rendre);
    };
    const surDefilement = () => {
      if (!cadre) cadre = requestAnimationFrame(rendre);
    };

    rendre();
    window.addEventListener("scroll", surDefilement, { passive: true });
    window.addEventListener("resize", surDefilement);
    return () => {
      window.removeEventListener("scroll", surDefilement);
      window.removeEventListener("resize", surDefilement);
      if (cadre) cancelAnimationFrame(cadre);
    };
  }, []);

  return (
    <div className="slogan" ref={ref} aria-hidden="true">
      <div className="slogan__piste">
        {Array.from({ length: 6 }, (_, k) => (
          <span className="slogan__unite" key={k}>
            {PHRASE}
            <i className="slogan__tiret" />
          </span>
        ))}
      </div>
    </div>
  );
}
