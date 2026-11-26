/**
 * Le dessin du hero : un porte-voitures et une voiture conduite, côte à côte
 * sur la même route, tracés comme sur un plan technique.
 *
 * Drive Line Connect déplace des véhicules de deux façons : au volant
 * (convoyage, un convoyeur conduit le véhicule du client) et sur camion
 * (transport et affrètement, en lot ou à l'unité). Le hero montre les deux
 * d'un seul regard, à la même échelle, plutôt que de dire « convoyage » et
 * d'oublier la moitié du métier.
 *
 * Le dessin se trace au chargement (traits blancs pour le camion, jaune pour
 * la voiture conduite), puis les roues tournent et la chaussée défile. Au
 * défilement de la page, les véhicules partent vers la droite (voir
 * vitrine.css). Rien n'est animé sans `prefers-reduced-motion: no-preference`.
 *
 * Les formes sont des tracés (pas des images) : nets à toutes les tailles,
 * quelques ko, et chaque trait peut être animé. Les coordonnées sont en
 * unités du dessin (1200 × 250), le sol est à y = 215.
 */

/** Un trait qui peut se tracer : `pathLength=1` normalise sa longueur. */
const T = ({ d, ...reste }) => (
  <path className="t" pathLength="1" d={d} {...reste} />
);

function Roue({ cx, cy, r = 14, tourne = false }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className={tourne ? "roue roue--tourne" : "roue"}>
        <circle className="t" pathLength="1" r={r} />
        <circle className="t" pathLength="1" r={r * 0.36} />
        <T d={`M 0 ${-r} L 0 ${r} M ${-r * 0.87} ${-r * 0.5} L ${r * 0.87} ${r * 0.5} M ${-r * 0.87} ${r * 0.5} L ${r * 0.87} ${-r * 0.5}`} />
      </g>
    </g>
  );
}

/** Une voiture vue de côté, roulant vers la droite. Le sol est à y = 0. */
function Voiture({ x, y, echelle = 1, tourne = false, classe = "", delai = 0 }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${echelle})`}
      className={`voiture ${classe}`}
      style={{ "--d": `${delai}s` }}
    >
      <T d="M 10 -22 L 8 -34 Q 10 -41 24 -43 L 54 -46 L 70 -62 L 114 -62 L 142 -46 L 178 -40 Q 190 -37 190 -27 L 188 -22 L 165 -22 A 19 19 0 0 0 127 -22 L 65 -22 A 19 19 0 0 0 27 -22 Z" />
      <T d="M 72 -58 L 111 -58 L 134 -47 L 72 -47 Z M 94 -58 L 94 -47" />
      <T d="M 94 -47 L 94 -24 M 100 -40 L 110 -40" />
      <T className="t feu" d="M 181 -37 L 189 -34" />
      <Roue cx={46} cy={-15} tourne={tourne} />
      <Roue cx={146} cy={-15} tourne={tourne} />
    </g>
  );
}

export default function ScenePlan() {
  return (
    <svg
      className="plan__svg"
      viewBox="0 0 1200 250"
      role="img"
      aria-label="Dessin d'un camion porte-voitures chargé de six véhicules, suivi d'une voiture conduite par un convoyeur."
    >
      {/* La chaussée : ligne de sol et tirets qui défilent. */}
      <g className="plan__sol" style={{ "--d": "0s" }}>
        <T d="M 0 215 L 1200 215" />
        <path className="plan__tirets" d="M 0 233 L 1300 233" />
      </g>

      {/* Camion porte-voitures */}
      <g transform="translate(40 215)" className="camion">
        {/* Châssis et plateaux */}
        <g style={{ "--d": "0.3s" }}>
          <T d="M 0 -34 L 572 -34 M 0 -44 L 572 -44" />
          <T d="M 4 -58 L 566 -58 M 4 -126 L 540 -126" />
        </g>
        {/* Montants et traverse haute */}
        <g style={{ "--d": "0.6s" }}>
          <T d="M 2 -44 L 2 -184 M 188 -58 L 188 -184 M 376 -58 L 376 -184 M 568 -44 L 568 -184" />
          <T d="M 2 -184 L 568 -184" />
        </g>

        {/* Six véhicules chargés : trois par plateau */}
        {[10, 196, 382].map((vx, i) => (
          <Voiture key={`h${vx}`} x={vx} y={-126} echelle={0.9} classe="voiture--chargee" delai={0.9 + i * 0.18} />
        ))}
        {[10, 196, 382].map((vx, i) => (
          <Voiture key={`b${vx}`} x={vx} y={-58} echelle={0.9} classe="voiture--chargee" delai={1.25 + i * 0.18} />
        ))}

        {/* Cabine */}
        <g style={{ "--d": "1.3s" }}>
          <T d="M 586 -48 L 586 -164 L 664 -164 L 698 -120 L 706 -116 L 706 -48 Z" />
          <T d="M 640 -156 L 662 -156 L 690 -124 L 640 -124 Z M 598 -156 L 632 -156 L 632 -124 L 598 -124 Z" />
          <T d="M 632 -124 L 632 -50 M 700 -100 L 700 -60" />
          <T d="M 570 -44 L 586 -44 M 584 -38 L 712 -38" />
          <T className="t feu" d="M 702 -80 L 708 -80" />
        </g>

        {/* Roues du camion : tandem arrière, puis cabine */}
        <g style={{ "--d": "1.7s" }}>
          <Roue cx={84} cy={-19} r={19} tourne />
          <Roue cx={130} cy={-19} r={19} tourne />
          <Roue cx={610} cy={-19} r={19} tourne />
          <Roue cx={676} cy={-19} r={19} tourne />
        </g>
      </g>

      {/* La voiture conduite, en jaune : le convoyage */}
      <Voiture x={900} y={215} classe="voiture--conduite" tourne delai={1.5} />
    </svg>
  );
}
