import { useEffect, useRef, useState } from "react";

/**
 * La page comme un trajet.
 *
 * Les repères « KM 0 · DÉPART », « KM 250 · QUI SOMMES-NOUS »… de la
 * vitrine annonçaient déjà une route : ce composant la trace. Une piste
 * accompagne le visiteur pendant qu'il défile, une voiture avance dessus
 * et un compteur affiche le kilomètre en cours. Chaque repère rencontré
 * s'allume, et le compteur tombe exactement sur son chiffre en passant.
 *
 * Les repères sont lus dans la page (attribut `data-km`), pas écrits ici :
 * ajouter une section avec un nouveau repère suffit à l'inscrire sur la
 * route.
 *
 * Tout ce qui bouge à chaque image passe par des variables CSS et par un
 * `textContent` : aucun rendu React pendant le défilement.
 */
export default function RouteDefilement() {
  const racine = useRef(null);
  const compteur = useRef(null);
  const [reperes, setReperes] = useState([]);

  useEffect(() => {
    const el = racine.current;
    if (!el) return undefined;

    let mesures = []; // { km, pos } triés par position
    let attente = 0;

    const mesurer = () => {
      const total = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      mesures = [...document.querySelectorAll("[data-km]")]
        .map((n) => ({
          km: Number(n.dataset.km),
          // Le repère compte comme « atteint » quand il passe à 40 % de
          // la hauteur de l'écran, pas quand il touche le bas.
          pos: Math.min(
            1,
            Math.max(
              0,
              (n.getBoundingClientRect().top +
                window.scrollY -
                window.innerHeight * 0.4) /
                total,
            ),
          ),
        }))
        .filter((m) => Number.isFinite(m.km))
        .sort((a, b) => a.pos - b.pos);
      setReperes(mesures);
      dessiner();
    };

    const kilometre = (p) => {
      if (mesures.length === 0) return 0;
      if (p <= mesures[0].pos) return 0;
      for (let i = 1; i < mesures.length; i++) {
        const a = mesures[i - 1];
        const b = mesures[i];
        if (p <= b.pos) {
          const t = (p - a.pos) / Math.max(0.0001, b.pos - a.pos);
          return a.km + (b.km - a.km) * t;
        }
      }
      // Après le dernier repère, la route continue un peu avant le pied
      // de page.
      const dernier = mesures[mesures.length - 1];
      const t = (p - dernier.pos) / Math.max(0.0001, 1 - dernier.pos);
      return dernier.km + 40 * t;
    };

    const dessiner = () => {
      attente = 0;
      const haut = window.scrollY;
      const total = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const p = Math.min(1, Math.max(0, haut / total));
      el.style.setProperty("--p", p.toFixed(4));
      // Parallaxe du hero : bornée, au-delà il n'est plus à l'écran.
      document.documentElement.style.setProperty(
        "--sy",
        String(Math.min(haut, 900)),
      );
      if (compteur.current) {
        compteur.current.textContent = String(
          Math.round(kilometre(p)),
        ).padStart(3, "0");
      }
      el.querySelectorAll("[data-repere]").forEach((n) => {
        n.classList.toggle(
          "route__repere--atteint",
          p >= Number(n.dataset.repere) - 0.0005,
        );
      });
    };

    const surDefilement = () => {
      if (!attente) attente = requestAnimationFrame(dessiner);
    };

    mesurer();
    window.addEventListener("scroll", surDefilement, { passive: true });
    window.addEventListener("resize", mesurer);
    // Les images et les polices changent la hauteur de la page après le
    // premier rendu : on remesure à ce moment-là.
    window.addEventListener("load", mesurer);
    const observateur =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(mesurer)
        : null;
    observateur?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", surDefilement);
      window.removeEventListener("resize", mesurer);
      window.removeEventListener("load", mesurer);
      observateur?.disconnect();
      if (attente) cancelAnimationFrame(attente);
      document.documentElement.style.removeProperty("--sy");
    };
  }, []);

  return (
    <div className="route" ref={racine} aria-hidden="true">
      <div className="route__piste" />
      <div className="route__fait" />
      {reperes.map((r) => (
        <span
          key={`${r.km}-${r.pos}`}
          className="route__repere"
          data-repere={r.pos.toFixed(4)}
          style={{ "--at": r.pos.toFixed(4) }}
        />
      ))}
      <div className="route__voiture">
        <svg viewBox="0 0 18 30" width="18" height="30">
          {/* Vue de dessus, l'avant vers le bas : elle descend la page. */}
          <rect
            x="1.5"
            y="1.5"
            width="15"
            height="27"
            rx="5"
            fill="var(--amber)"
            stroke="var(--asphalt)"
            strokeWidth="1.5"
          />
          <rect x="4" y="16" width="10" height="6" rx="1.5" fill="var(--asphalt)" />
          <rect x="4" y="6" width="10" height="4" rx="1.5" fill="var(--asphalt)" opacity="0.55" />
        </svg>
        <span className="route__km">
          KM <b ref={compteur}>000</b>
        </span>
      </div>
    </div>
  );
}
