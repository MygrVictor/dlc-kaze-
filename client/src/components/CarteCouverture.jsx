import { useEffect, useRef, useState } from "react";

/**
 * Carte de la couverture : la France en points, et des trajets d'exemple.
 *
 * « 101 départements desservis » se comprend mieux sur une carte que dans
 * un chiffre. Le territoire est dessiné en points (une trame régulière
 * coupée par le contour du pays), puis quatre trajets sont tracés entre
 * des villes, avec un véhicule qui les parcourt.
 *
 * Le contour est volontairement simplifié (une soixantaine de points) :
 * une carte en points tolère l'approximation, et un fichier géographique
 * complet alourdirait la page pour un détail que personne ne verrait.
 *
 * Les points naissent par anneaux, du centre vers les bords ; chaque
 * anneau est un groupe animé d'un seul bloc, pas neuf cents animations.
 */

// ── Projection ───────────────────────────────────────────────
const LAT_MAX = 51.2;
const LON_MIN = -5.3;
const K = 96;
const COS = Math.cos((46.5 * Math.PI) / 180);
const projeter = ([lat, lon]) => [
  (lon - LON_MIN) * COS * K,
  (LAT_MAX - lat) * K,
];
const LARGEUR = Math.round((9.8 - LON_MIN) * COS * K);
const HAUTEUR = Math.round((LAT_MAX - 41.2) * K);

// ── Contours (latitude, longitude) ───────────────────────────
const FRANCE = [
  [51.05, 2.37], [50.77, 2.87], [50.71, 3.18], [50.35, 3.6], [50.28, 4.1],
  [50.13, 4.83], [49.6, 5.35], [49.5, 5.95], [49.45, 6.37], [49.15, 7.0],
  [49.05, 7.6], [48.97, 8.22], [48.6, 7.8], [47.95, 7.55], [47.58, 7.59],
  [47.38, 7.0], [46.95, 6.85], [46.45, 6.45], [46.15, 6.05], [45.95, 6.9],
  [45.55, 7.05], [45.1, 7.05], [44.4, 6.9], [44.1, 7.35], [43.78, 7.5],
  [43.55, 6.95], [43.15, 6.55], [43.1, 5.9], [43.3, 5.3], [43.4, 4.6],
  [43.55, 4.1], [43.2, 3.1], [42.7, 3.03], [42.43, 3.17], [42.45, 2.5],
  [42.5, 1.7], [42.8, 0.65], [42.8, 0.0], [43.0, -0.7], [43.3, -1.4],
  [43.4, -1.78], [43.55, -1.55], [44.2, -1.25], [44.65, -1.25],
  [45.55, -1.05], [46.15, -1.2], [46.45, -1.85], [47.25, -2.25],
  [47.5, -3.0], [47.8, -3.7], [48.0, -4.7], [48.38, -4.8], [48.7, -4.3],
  [48.75, -3.5], [48.65, -2.8], [48.65, -2.0], [48.65, -1.55],
  [48.8, -1.6], [49.35, -1.85], [49.7, -1.9], [49.7, -1.3], [49.4, -1.1],
  [49.35, -0.5], [49.3, 0.15], [49.5, 0.15], [49.75, 0.45], [49.95, 1.1],
  [50.2, 1.6], [50.7, 1.6], [50.95, 1.85],
].map(projeter);

const CORSE = [
  [43.0, 9.4], [42.55, 9.55], [41.9, 9.4], [41.4, 9.2], [41.6, 8.75],
  [42.15, 8.6], [42.55, 8.6], [42.95, 9.0],
].map(projeter);

const dedans = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      c = !c;
    }
  }
  return c;
};

// ── Villes et trajets d'exemple ──────────────────────────────
const VILLES = {
  Paris: { pos: [48.86, 2.35], nom: [14, -12, "start"] },
  Lille: { pos: [50.63, 3.06], nom: [-14, -10, "end"] },
  Lyon: { pos: [45.76, 4.84], nom: [16, 6, "start"] },
  Bordeaux: { pos: [44.84, -0.58], nom: [-16, 6, "end"] },
  Marseille: { pos: [43.3, 5.37], nom: [16, 8, "start"] },
  Bruxelles: { pos: [50.85, 4.35], nom: [16, -8, "start"] },
};
export const TRAJETS = [
  ["Paris", "Lyon"],
  ["Lille", "Bordeaux"],
  ["Lyon", "Marseille"],
  ["Paris", "Bruxelles"],
];

const centre = [LARGEUR * 0.5, HAUTEUR * 0.52];
const arc = (a, b) => {
  const [x1, y1] = projeter(VILLES[a].pos);
  const [x2, y2] = projeter(VILLES[b].pos);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  // Le trajet s'écarte du centre du pays : il se lit comme un vol, pas
  // comme un trait posé sur les points.
  let nx = -dy / dist;
  let ny = dx / dist;
  if ((mx + nx - centre[0]) ** 2 + (my + ny - centre[1]) ** 2 <
      (mx - nx - centre[0]) ** 2 + (my - ny - centre[1]) ** 2) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + nx * dist * 0.22;
  const cy = my + ny * dist * 0.22;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};
const CHEMINS = TRAJETS.map(([a, b]) => arc(a, b));

// ── Trame de points, rangée par rangée, regroupée en anneaux ──
const PAS = 21;
const [ORIGINE_X, ORIGINE_Y] = projeter(VILLES.Paris.pos);
const NB_ANNEAUX = 12;
const ANNEAUX = Array.from({ length: NB_ANNEAUX }, () => []);
for (let y = 12, rang = 0; y < HAUTEUR; y += PAS * 0.866, rang++) {
  for (let x = 12 + (rang % 2 ? PAS / 2 : 0); x < LARGEUR; x += PAS) {
    if (dedans([x, y], FRANCE) || dedans([x, y], CORSE)) {
      const d = Math.hypot(x - ORIGINE_X, y - ORIGINE_Y);
      ANNEAUX[Math.min(NB_ANNEAUX - 1, Math.floor(d / 85))].push([x, y]);
    }
  }
}

export default function CarteCouverture() {
  const racine = useRef(null);
  const [vue, setVue] = useState(false);
  const [roule, setRoule] = useState(false);

  useEffect(() => {
    const reduit = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduit) {
      setVue(true);
      return undefined;
    }
    const noeud = racine.current;
    if (!noeud) return undefined;
    let t;
    const io = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          setVue(true);
          // Les véhicules partent quand les trajets sont tracés.
          t = setTimeout(() => setRoule(true), 3200);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(noeud);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div className={`carte${vue ? " carte--vue" : ""}`} ref={racine}>
      <svg
        className="carte__svg"
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        role="img"
        aria-label="Carte de France en points avec quatre trajets d'exemple : Paris–Lyon, Lille–Bordeaux, Lyon–Marseille et Paris–Bruxelles."
      >
        {ANNEAUX.map((points, b) => (
          <g key={b} className="carte__anneau" style={{ "--b": b }}>
            {points.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="4.4" />
            ))}
          </g>
        ))}

        {CHEMINS.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength="1"
            className="carte__trajet"
            style={{ "--t": i }}
          />
        ))}

        {Object.entries(VILLES).map(([nom, v], i) => {
          const [x, y] = projeter(v.pos);
          const [dx, dy, ancre] = v.nom;
          return (
            <g key={nom} className="carte__ville" style={{ "--v": i }}>
              <circle className="carte__pulse" cx={x} cy={y} r="9" />
              <circle className="carte__point" cx={x} cy={y} r="7" />
              <text x={x + dx} y={y + dy} textAnchor={ancre} className="carte__nom">
                {nom}
              </text>
            </g>
          );
        })}

        {roule &&
          CHEMINS.map((d, i) => (
            <circle key={d} r="8" className="carte__vehicule">
              <animateMotion
                dur={`${4.2 + i * 0.8}s`}
                repeatCount="indefinite"
                path={d}
                begin={`${i * 0.5}s`}
              />
            </circle>
          ))}
      </svg>
    </div>
  );
}
