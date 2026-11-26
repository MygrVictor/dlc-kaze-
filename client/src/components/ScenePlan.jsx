/**
 * L'illustration du hero : un porte-voitures chargé de six véhicules, et une
 * voiture conduite qui le double, sur une route à deux voies.
 *
 * Drive Line Connect déplace des véhicules de deux façons : sur camion
 * (transport et affrètement, en lot ou à l'unité) et au volant (convoyage,
 * un convoyeur conduit le véhicule du client). Le hero montre les deux d'un
 * seul regard, à la même échelle.
 *
 * Illustration à plat : des aplats, une ombre portée, des vitres et des
 * pneus, sans dégradé ni brillance. Les couleurs viennent de variables CSS
 * (voir vitrine.css), ce qui permet d'adapter le dessin au fond du hero. La
 * voiture conduite est la seule en jaune : c'est elle que la légende
 * « Convoyage » désigne.
 *
 * Mouvement : le camion, puis la voiture, entrent dans la scène en roulant ;
 * ensuite les roues tournent et la chaussée défile. Au défilement de la page,
 * l'ensemble repart vers la droite. Rien n'est animé sans
 * `prefers-reduced-motion: no-preference`.
 *
 * Les coordonnées sont en unités du dessin (1200 × 264).
 */

function Roue({ cx, cy, r }) {
  const rayons = [0, 72, 144, 216, 288].map((a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `M 0 0 L ${(Math.cos(rad) * r * 0.62).toFixed(2)} ${(Math.sin(rad) * r * 0.62).toFixed(2)}`;
  });
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* L'ombre du passage de roue, sinon la découpe laisse voir le fond. */}
      <circle r={r * 1.32} className="f-pneu" />
      <circle r={r} className="f-pneu" />
      <g className="roue">
        <circle r={r * 0.66} className="f-jante" />
        <path d={rayons.join(" ")} className="s-pneu" />
        <circle r={r * 0.2} className="f-pneu" />
      </g>
    </g>
  );
}

/** Une voiture vue de côté, roulant vers la droite. Le sol est à y = 0. */
function Voiture({ x, y, echelle = 1, couleur }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${echelle})`} className={`voiture ${couleur}`}>
      <ellipse cx="98" cy="2" rx="96" ry="4" className="plan__ombre" />
      <path
        className="f-c carrosserie"
        d="M 10 -22 L 8 -34 Q 10 -41 24 -43 L 54 -46 L 70 -62 L 114 -62 L 142 -46 L 178 -40 Q 190 -37 190 -27 L 188 -22 L 165 -22 A 19 19 0 0 0 127 -22 L 65 -22 A 19 19 0 0 0 27 -22 Z"
      />
      {/* Bas de caisse, plus sombre */}
      <path
        className="f-c-o"
        d="M 9.5 -27 L 189.5 -27 L 188 -22 L 165 -22 A 19 19 0 0 0 127 -22 L 65 -22 A 19 19 0 0 0 27 -22 L 10 -22 Z"
      />
      {/* Vitres et montant central */}
      <path className="f-vitre" d="M 72 -58 L 111 -58 L 134 -47 L 72 -47 Z" />
      <path className="f-c" d="M 92.5 -58.5 L 96 -58.5 L 96 -46.5 L 92.5 -46.5 Z" />
      <path className="s-c-o" d="M 94 -46 L 94 -28 M 100 -40 L 110 -40" />
      {/* Feux */}
      <path className="f-phare" d="M 180 -38 L 189 -35 L 189 -31 L 181 -32 Z" />
      <path className="f-feu" d="M 8 -35 L 11.5 -35 L 11.5 -29 L 8.5 -29 Z" />
      <Roue cx={46} cy={-15} r={14} />
      <Roue cx={146} cy={-15} r={14} />
    </g>
  );
}

const COULEURS_CHARGEMENT = [
  "v-blanc", "v-gris", "v-bleu",
  "v-anthracite", "v-blanc", "v-gris",
];

export default function ScenePlan() {
  return (
    <svg
      className="plan__svg"
      viewBox="0 0 1200 264"
      role="img"
      aria-label="Illustration d'un camion porte-voitures chargé de six véhicules, doublé par une voiture conduite par un convoyeur."
    >
      {/* La route : deux voies, séparées par des tirets qui défilent. */}
      <rect x="0" y="208" width="1200" height="50" className="plan__route" />
      <path className="plan__rive" d="M 0 209 L 1200 209 M 0 257 L 1200 257" />
      <path className="plan__tirets" d="M 0 235 L 1300 235" />

      {/* Camion porte-voitures, sur la voie du haut */}
      <g className="camion-anim">
        <g transform="translate(40 230)">
          <ellipse cx="360" cy="2" rx="372" ry="5" className="plan__ombre" />

          {/* Châssis, plateaux, montants */}
          <rect x="0" y="-46" width="572" height="12" className="f-acier" />
          <rect x="0" y="-41" width="572" height="3" className="f-ambre" />
          <rect x="2" y="-60" width="566" height="6" className="f-acier" />
          <rect x="2" y="-128" width="540" height="6" className="f-acier" />
          {[0, 186, 374, 566].map((px) => (
            <rect key={px} x={px} y="-190" width="6" height="144" className="f-acier" />
          ))}
          <rect x="0" y="-190" width="572" height="7" className="f-acier" />

          {/* Six véhicules chargés, trois par plateau */}
          {[0, 1, 2].map((i) => (
            <Voiture key={`h${i}`} x={12 + i * 184} y={-128} echelle={0.88} couleur={COULEURS_CHARGEMENT[i]} />
          ))}
          {[0, 1, 2].map((i) => (
            <Voiture key={`b${i}`} x={12 + i * 184} y={-60} echelle={0.88} couleur={COULEURS_CHARGEMENT[i + 3]} />
          ))}

          {/* Cabine */}
          <rect x="570" y="-50" width="18" height="8" className="f-acier" />
          <path className="f-cab" d="M 586 -50 L 586 -168 L 664 -168 L 700 -122 L 708 -118 L 708 -50 Z" />
          <rect x="586" y="-98" width="122" height="9" className="f-ambre" />
          <path className="f-vitre" d="M 642 -160 L 662 -160 L 692 -126 L 642 -126 Z M 598 -160 L 634 -160 L 634 -126 L 598 -126 Z" />
          <path className="s-cab-o" d="M 636 -126 L 636 -52 M 598 -62 L 626 -62" />
          <rect x="700" y="-84" width="8" height="30" className="f-pneu" />
          <rect x="702" y="-114" width="6" height="8" className="f-phare" />
          <rect x="584" y="-46" width="130" height="8" rx="2" className="f-acier" />

          {/* Roues : tandem de la remorque, puis tracteur */}
          <Roue cx={84} cy={-19} r={19} />
          <Roue cx={130} cy={-19} r={19} />
          <Roue cx={610} cy={-19} r={19} />
          <Roue cx={676} cy={-19} r={19} />
        </g>
      </g>

      {/* La voiture conduite, en jaune, sur la voie du bas : le convoyage */}
      <g className="voiture-anim">
        <Voiture x={880} y={254} echelle={1.08} couleur="v-ambre" />
      </g>
    </svg>
  );
}
