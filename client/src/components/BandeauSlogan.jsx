import { useEffect, useRef } from "react";

/**
 * La phrase qui résume le métier, lue au rythme du défilement.
 *
 * Un bandeau qui défile se lit mal : on le dépasse avant la fin de la
 * phrase. Ici, c'est l'inverse. La phrase tient en grand sur l'écran,
 * l'écran reste en place le temps du défilement, et chaque mot s'allume à
 * son tour pendant qu'une voiture avance sur la route en dessous. Le
 * visiteur ne peut pas la dépasser sans la lire : elle avance avec lui.
 *
 * Tous les mots restent lisibles avant leur tour (atténués, pas cachés),
 * et sans JavaScript ou avec `prefers-reduced-motion`, la phrase est
 * affichée entière, sans écran fixe.
 */
const MOTS = ["Du", "premier", "kilomètre", "à", "la", "remise", "des", "clés"];

export default function BandeauSlogan() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) return undefined;

    el.classList.add("slogan--lie");
    let cadre = 0;

    const maj = () => {
      cadre = 0;
      const nav = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--nav-h"),
      );
      const r = el.getBoundingClientRect();
      // 0 quand la scène se fige sous la barre de navigation, 1 quand elle
      // se libère.
      const course = Math.max(1, r.height - (window.innerHeight - (nav || 0)));
      const p = Math.min(1, Math.max(0, (nav - r.top) / course));
      el.style.setProperty("--p", p.toFixed(4));
    };
    const surDefilement = () => {
      if (!cadre) cadre = requestAnimationFrame(maj);
    };

    maj();
    window.addEventListener("scroll", surDefilement, { passive: true });
    window.addEventListener("resize", surDefilement);
    return () => {
      window.removeEventListener("scroll", surDefilement);
      window.removeEventListener("resize", surDefilement);
      if (cadre) cancelAnimationFrame(cadre);
    };
  }, []);

  return (
    <section
      className="slogan"
      ref={ref}
      style={{ "--n": MOTS.length }}
      aria-label="Du premier kilomètre à la remise des clés"
    >
      <div className="slogan__scene">
        <p className="slogan__texte display" aria-hidden="true">
          {MOTS.map((mot, i) => (
            <span key={mot + i} className="slogan__mot" style={{ "--i": i }}>
              {mot}{" "}
            </span>
          ))}
        </p>

        <div className="slogan__route" aria-hidden="true">
          <span className="slogan__piste" />
          <span className="slogan__fait" />
          <span className="slogan__voiture">
            <svg viewBox="0 0 18 30" width="18" height="30">
              <rect
                x="1.5"
                y="1.5"
                width="15"
                height="27"
                rx="5"
                fill="var(--asphalt)"
                stroke="var(--asphalt)"
                strokeWidth="1.5"
              />
              <rect x="4" y="16" width="10" height="6" rx="1.5" fill="var(--amber)" />
              <rect x="4" y="6" width="10" height="4" rx="1.5" fill="var(--amber)" opacity="0.55" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  );
}
