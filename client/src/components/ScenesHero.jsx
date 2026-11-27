/**
 * Les trois scènes animées du hero : ce que fait Drive Line Connect.
 *
 *  1. Transport et affrètement : un porte-8 chargé de huit véhicules roule,
 *     le décor défile derrière lui.
 *  2. Convoyage : une voiture conduite par un convoyeur roule, le décor
 *     défile derrière.
 *  3. Remise des clés : le convoyeur tend les clés au client, qui les prend.
 *
 * Chaque scène boucle seule. Illustration à plat : aplats, ombres portées,
 * pas de dégradé ni de brillance. Les couleurs viennent de variables CSS
 * (voir vitrine.css) pour suivre le fond du hero.
 *
 * Mouvement : uniquement sous `prefers-reduced-motion: no-preference`. Sans
 * cela, chaque scène s'affiche dans sa pose finale (camion chargé, voiture
 * en route, clés remises).
 *
 * Repères : la scène 1 est dans un repère de 800 × 340, les deux autres de
 * 380 × 146. Dans chaque scène, le sol est à une ordonnée donnée et les
 * véhicules regardent vers la droite.
 */

/* ── Pièces communes ───────────────────────────────────────── */

/**
 * Dégradés partagés par les trois scènes. Ils sont définis une seule fois,
 * dans un SVG de taille nulle : `url(#…)` fonctionne d'un SVG à l'autre.
 * Les dégradés « volume » sont des voiles blanc → noir posés sur un aplat :
 * ils donnent du relief à n'importe quelle couleur sans la redéfinir.
 */
function Degrades() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dlc-vol" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="dlc-verre" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dlc-ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--ciel-haut)" }} />
          <stop offset="1" style={{ stopColor: "var(--ciel-bas)" }} />
        </linearGradient>
        <radialGradient id="dlc-soleil">
          <stop offset="0" stopColor="#ffe08a" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#ffd11a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#ffd11a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dlc-brume" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" style={{ stopColor: "var(--brume)", stopOpacity: 0.55 }} />
        </linearGradient>
        <linearGradient id="dlc-asphalte" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Roue({ cx, cy, r, classe = "" }) {
  const rayons = [0, 72, 144, 216, 288].map((a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `M 0 0 L ${(Math.cos(rad) * r * 0.64).toFixed(2)} ${(Math.sin(rad) * r * 0.64).toFixed(2)}`;
  });
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Le passage de roue, sinon la découpe laisse voir le fond. */}
      <circle r={r * 1.32} className="f-pneu" />
      <circle r={r} className="f-pneu" />
      <circle r={r * 0.9} className="s-flanc" />
      <g className={`roue ${classe}`.trim()}>
        <circle r={r * 0.66} className="f-jante" />
        <path d={rayons.join(" ")} className="s-pneu" />
        <circle r={r * 0.2} className="f-pneu" />
      </g>
      <circle r={r * 0.66} fill="url(#dlc-vol)" opacity="0.7" />
    </g>
  );
}

const CARROSSERIE =
  "M 8 -21 C 5 -25 5 -32 8 -38 C 10 -42 15 -44 24 -45 L 46 -48 C 52 -58 62 -64 76 -64 L 110 -64 C 124 -64 133 -57 143 -49 L 170 -45 C 184 -43 190 -38 190 -29 L 189 -21 L 166 -21 A 20 20 0 0 0 126 -21 L 66 -21 A 20 20 0 0 0 26 -21 Z";
const VITRE_AV = "M 50 -49 C 55 -57 63 -61 75 -61 L 93 -61 L 93 -49 Z";
const VITRE_AR = "M 97 -61 L 109 -61 C 120 -61 127 -56 135 -49 L 97 -49 Z";

/** Une voiture compacte de côté, vers la droite. Sol à y = 0, 190 de large. */
function Voiture({ couleur, classeRoue = "", conducteur = false }) {
  return (
    <g className={`voiture ${couleur}`}>
      <ellipse cx="98" cy="2" rx="96" ry="4" className="p-ombre" />
      <path className="f-c carrosserie" d={CARROSSERIE} />
      {/* Bas de caisse */}
      <path
        className="f-c-o"
        d="M 8.5 -27 L 190 -27 L 189 -21 L 166 -21 A 20 20 0 0 0 126 -21 L 66 -21 A 20 20 0 0 0 26 -21 L 8 -21 Z"
      />
      {/* Vitres */}
      <path className="f-vitre" d={VITRE_AV} />
      <path className="f-vitre" d={VITRE_AR} />
      {conducteur && (
        <g>
          {/* Le convoyeur au volant : épaule, tête et casquette jaune */}
          <path d="M 100 -49 C 101 -54 105 -56 110 -56 C 115 -56 119 -54 120 -49 Z" className="f-gilet-v" />
          <circle cx="110" cy="-55" r="5" className="f-peau" />
          <path d="M 104.6 -56.5 A 5.4 5.4 0 0 1 115.4 -56.5 Z" className="f-ambre" />
          <path d="M 114 -57 L 119.5 -55.8" className="s-ambre" />
        </g>
      )}
      <path className="v-verre" d={VITRE_AV} />
      <path className="v-verre" d={VITRE_AR} />
      <path d="M 78 -63.2 L 108 -63.2" className="s-reflet" />
      {/* Ligne de caisse, porte, poignée, rétroviseur */}
      <path d="M 12 -35 C 60 -39 130 -38 186 -34" className="s-reflet" />
      <path className="s-c-o" d="M 95 -48 L 95 -24 M 103 -41 L 112 -41" />
      <path className="f-c-o" d="M 133 -49 L 140 -53 C 142 -52 142 -48 140 -47 Z" />
      <path className="f-phare" d="M 176 -41 C 183 -41 189 -38 190 -33 L 179 -33 Z" />
      <path className="f-feu" d="M 7 -40 L 12 -41 L 12 -32 L 6 -33 Z" />
      {/* Relief : voile de lumière sur toute la caisse */}
      <path d={CARROSSERIE} fill="url(#dlc-vol)" />
      <Roue cx={46} cy={-15} r={15} classe={classeRoue} />
      <Roue cx={146} cy={-15} r={15} classe={classeRoue} />
    </g>
  );
}

/** Immeubles lointains : [x, hauteur, largeur]. La période est de 380. */
const IMMEUBLES = [
  [0, 54, 34], [40, 74, 28], [74, 46, 36], [116, 88, 30], [152, 60, 40],
  [198, 78, 26], [230, 50, 34], [270, 94, 32], [308, 64, 36], [350, 52, 30],
];

/** Une colline qui se raccorde à elle-même tous les 380 (défilement sans couture). */
const colline = (b, h, v) =>
  v === 0
    ? `M 0 ${b - h * 0.5} C 70 ${b - h * 1.3} 140 ${b - h} 200 ${b - h * 0.55} C 260 ${b - h * 0.1} 320 ${b - h * 0.2} 380 ${b - h * 0.5} L 380 ${b} L 0 ${b} Z`
    : `M 0 ${b - h * 0.3} C 50 ${b - h * 0.1} 110 ${b - h * 0.9} 170 ${b - h} C 240 ${b - h * 1.1} 310 ${b - h * 0.4} 380 ${b - h * 0.3} L 380 ${b} L 0 ${b} Z`;

function Arbre({ x, y, r }) {
  return (
    <g>
      <rect x={x - r * 0.12} y={y - r * 0.9} width={r * 0.24} height={r * 0.9} className="p-tronc" />
      <circle cx={x} cy={y - r * 1.3} r={r} className="p-feuillage" />
      <circle cx={x + r * 0.55} cy={y - r * 1.0} r={r * 0.7} className="p-feuillage" />
      <circle cx={x - r * 0.5} cy={y - r * 0.95} r={r * 0.62} className="p-feuillage" />
    </g>
  );
}

/**
 * Décor lointain : bâtiments arrondis dans la brume, deux collines, quelques
 * arbres. `base` est l'ordonnée du sol, `k` l'échelle, `tuiles` les décalages
 * à remplir (chaque tuile fait 380 de large).
 */
function Decor({ base, k, tuiles }) {
  return tuiles.map((dec) => (
    <g key={dec} transform={`translate(${dec} 0)`}>
      {IMMEUBLES.map(([x, h, l]) => (
        <rect key={x} x={x} y={base - h * k * 1.05} width={l} height={h * k * 1.05} rx={4 * k} className="p-loin" />
      ))}
      <rect x="0" y={base - 110 * k} width="380" height={110 * k} fill="url(#dlc-brume)" />
      <path className="p-colline" d={colline(base, 46 * k, 0)} />
      <path className="p-colline-pres" d={colline(base, 28 * k, 1)} />
      {[[54, 0.7], [100, 0.5], [262, 0.8], [330, 0.55]].map(([x, t]) => (
        <Arbre key={x} x={x} y={base - 3 * k} r={11 * k * t * 1.3} />
      ))}
    </g>
  ));
}

/** Fond d'une scène : ciel dégradé, décor lointain, chaussée. */
function Fond({ largeur, hauteur, sol, children }) {
  return (
    <>
      <rect width={largeur} height={hauteur} className="p-ciel" />
      {children}
      <rect y={sol} width={largeur} height={hauteur - sol} className="p-route" />
      <rect y={sol} width={largeur} height={hauteur - sol} fill="url(#dlc-asphalte)" />
      <path className="p-rive" d={`M 0 ${sol + 1} L ${largeur} ${sol + 1}`} />
    </>
  );
}

/* ── Scène 1 : le porte-8 ─────────────────────────────────── */

/** Les huit places : quatre par plateau, de l'arrière (gauche) vers l'avant. */
const PAS = 142;
const X_PLACE = (i) => 8 + i * PAS;
const Y_BAS = -62;
const Y_HAUT = -130;

const CABINE =
  "M 608 -50 L 608 -160 Q 608 -172 620 -172 L 676 -172 Q 686 -172 692 -164 L 718 -131 Q 728 -127 728 -114 L 728 -50 Z";

function Camion() {
  return (
    <g className="camion">
      <ellipse cx="363" cy="2" rx="374" ry="5" className="p-ombre" />

      {/* Châssis, bandeau de marque, plateaux, montants */}
      <rect x="0" y="-46" width="592" height="12" rx="4" className="f-acier" />
      <rect x="0" y="-41" width="592" height="2.5" className="f-ambre" />
      <rect x="158" y="-34" width="400" height="26" rx="8" className="f-marque" />
      <rect x="158" y="-34" width="400" height="26" rx="8" fill="url(#dlc-vol)" />
      <image href="/logo-mobilite.png" x="248" y="-32" width="160" height="22" preserveAspectRatio="xMidYMid meet" />
      <rect x="2" y="-62" width="588" height="6" rx="3" className="f-acier" />
      <rect x="2" y="-130" width="560" height="6" rx="3" className="f-acier" />
      {[0, 296, 586].map((px) => (
        <rect key={px} x={px} y="-196" width="6" height="150" rx="3" className="f-acier" />
      ))}
      <rect x="0" y="-196" width="592" height="7" rx="3.5" className="f-acier" />
      {/* Treillis du plateau haut, vérins de levage */}
      <path d="M 6 -189 L 150 -130 M 296 -189 L 150 -130 M 296 -189 L 440 -130 M 586 -189 L 440 -130" className="s-treillis" />
      <rect x="-4" y="-56" width="6" height="12" rx="3" className="f-feu" />
      <rect x="0" y="-62" width="592" height="6" rx="3" fill="url(#dlc-vol)" />
      <rect x="0" y="-196" width="592" height="7" rx="3.5" fill="url(#dlc-vol)" />

      {/* Huit véhicules chargés : quatre par plateau */}
      {["v-blanc", "v-gris", "v-bleu", "v-anthracite"].map((c, i) => (
        <g key={`h${i}`} transform={`translate(${X_PLACE(i)} ${Y_HAUT}) scale(0.8)`}>
          <Voiture couleur={c} />
        </g>
      ))}
      {["v-bleu", "v-blanc", "v-gris", "v-blanc"].map((c, i) => (
        <g key={`b${i}`} transform={`translate(${X_PLACE(i)} ${Y_BAS}) scale(0.8)`}>
          <Voiture couleur={c} />
        </g>
      ))}

      {/* La rampe : articulée à l'arrière du plateau bas */}
      <g transform={`translate(0 ${Y_BAS})`}>
        <g className="rampe">
          <path className="f-acier" d="M 0 0 L -146 61 Q -150 63 -148 68 L 0 6 Z" />
          <path className="f-ambre" d="M -148 62 L -128 53 L -128 58 L -148 68 Z" />
        </g>
      </g>

      {/* Tracteur : cheminée, réservoir, cabine arrondie */}
      <rect x="590" y="-206" width="6" height="156" rx="3" className="f-acier" />
      <rect x="640" y="-54" width="46" height="18" rx="9" className="f-acier" />
      <rect x="592" y="-50" width="18" height="8" rx="3" className="f-acier" />
      <path className="f-cab" d={CABINE} />
      <path d="M 608 -100 L 728 -100 L 728 -91 L 608 -91 Z" className="f-ambre" />
      {/* Déflecteur de toit */}
      <path d="M 612 -172 Q 618 -190 640 -190 L 664 -190 Q 676 -190 678 -176 L 676 -172 Z" className="f-cab-o" />
      <path className="f-vitre" d="M 620 -162 Q 620 -164 623 -164 L 648 -164 L 648 -126 L 620 -126 Z" />
      <path className="f-vitre" d="M 656 -164 L 676 -164 Q 681 -164 685 -158 L 710 -128 L 656 -128 Z" />
      <path className="v-verre" d="M 620 -162 Q 620 -164 623 -164 L 648 -164 L 648 -126 L 620 -126 Z" />
      <path className="v-verre" d="M 656 -164 L 676 -164 Q 681 -164 685 -158 L 710 -128 L 656 -128 Z" />
      <path className="s-cab-o" d="M 652 -128 L 652 -52 M 640 -112 L 647 -112" />
      {/* Rétroviseur, calandre, phare, pare-chocs */}
      <path d="M 704 -150 Q 712 -152 712 -142 L 712 -128" className="s-cab-o" />
      <rect x="718" y="-90" width="10" height="38" rx="3" className="f-pneu" />
      <path d="M 719 -84 L 727 -84 M 719 -76 L 727 -76 M 719 -68 L 727 -68 M 719 -60 L 727 -60" className="s-grille" />
      <path className="f-phare" d="M 721 -120 L 728 -120 L 728 -108 Q 722 -108 721 -114 Z" />
      <rect x="604" y="-46" width="134" height="9" rx="4.5" className="f-acier" />
      <path d={CABINE} fill="url(#dlc-vol)" />
      {/* Roues : tandem arrière, puis tracteur */}
      <Roue cx={84} cy={-19} r={19} classe="roue--camion" />
      <Roue cx={130} cy={-19} r={19} classe="roue--camion" />
      <Roue cx={634} cy={-19} r={19} classe="roue--camion" />
      <Roue cx={700} cy={-19} r={19} classe="roue--camion" />
    </g>
  );
}

function SceneTransport() {
  return (
    <svg className="scene__svg" viewBox="0 0 800 340" role="img"
      aria-label="Animation : un camion porte-8 arrive chargé de six véhicules, deux autres montent la rampe, la rampe se relève et le camion repart avec ses huit véhicules.">
      <Fond largeur={800} hauteur={340} sol={292}>
        {/* Le soleil bas, derrière le décor */}
        <circle cx="610" cy="120" r="130" fill="url(#dlc-soleil)" />
        {/* Quelques nuages, très lents */}
        <g className="nuages">
          {[0, 800].map((dec) => (
            <g key={dec} transform={`translate(${dec} 0)`} className="p-nuage">
              <ellipse cx="130" cy="52" rx="62" ry="12" />
              <circle cx="112" cy="44" r="15" />
              <circle cx="142" cy="40" r="19" />
              <ellipse cx="430" cy="82" rx="46" ry="9" />
              <circle cx="420" cy="76" r="11" />
              <circle cx="444" cy="73" r="13" />
              <ellipse cx="700" cy="46" rx="54" ry="11" />
              <circle cx="684" cy="39" r="13" />
              <circle cx="712" cy="36" r="16" />
            </g>
          ))}
        </g>
        {/* Décor : zone d'activité, collines, arbres */}
        <g className="defile-camion">
          <Decor base={292} k={1.1} tuiles={[0, 380, 760, 1140]} />
        </g>
      </Fond>
      <path className="p-tirets-fixes" d="M 0 316 L 800 316" />
      <g className="defile-bord">
        {[0, 380, 760].map((dec) => (
          <g key={dec} transform={`translate(${dec} 0)`}>
            <path d="M 70 292 L 70 232 Q 70 224 80 224 L 96 224" className="s-pres" />
            <rect x="92" y="221" width="12" height="6" rx="3" className="p-pres" />
            <path d="M 250 292 L 250 232 Q 250 224 260 224 L 276 224" className="s-pres" />
            <rect x="272" y="221" width="12" height="6" rx="3" className="p-pres" />
          </g>
        ))}
      </g>

      <g transform="translate(150 292) scale(0.86)">
        <g className="camion-roule">
          <Camion />
        </g>
      </g>
    </svg>
  );
}

/* ── Scène 2 : convoyage ──────────────────────────────────── */

function Skyline({ classe }) {
  return (
    <g className={classe}>
      <Decor base={128} k={0.62} tuiles={[0, 380]} />
    </g>
  );
}

function SceneConvoyage() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 146" role="img"
      aria-label="Animation : une voiture jaune conduite par un convoyeur roule sur la route, le décor défile.">
      <Fond largeur={380} hauteur={146} sol={128}>
        <Skyline classe="defile-loin" />
        <g className="defile-pres">
          {[0, 380].map((dec) => (
            <g key={dec} transform={`translate(${dec} 0)`}>
              <path d="M 40 128 L 40 88 Q 40 82 48 82 L 60 82" className="s-pres" />
              <rect x="56" y="80" width="9" height="4" rx="2" className="p-pres" />
              <Arbre x={150} y={128} r={11} />
              <path d="M 236 128 L 236 88 Q 236 82 244 82 L 256 82" className="s-pres" />
              <rect x="252" y="80" width="9" height="4" rx="2" className="p-pres" />
              <Arbre x={326} y={128} r={9} />
            </g>
          ))}
        </g>
      </Fond>
      <path className="p-tirets" d="M 0 138 L 450 138" />

      <g className="vitesse">
        <path d="M 22 100 L 70 100" />
        <path d="M 10 112 L 62 112" />
        <path d="M 30 90 L 68 90" />
      </g>

      <g className="voiture-bob">
        <g transform="translate(86 132) scale(1.05)">
          <Voiture couleur="v-ambre" classeRoue="roue--roule" conducteur />
        </g>
      </g>
    </svg>
  );
}

/* ── Scène 3 : remise des clés ────────────────────────────── */

function Cle({ classe = "" }) {
  return (
    <g className={`cle ${classe}`.trim()}>
      <circle cx="0" cy="-12" r="3.4" fill="none" stroke="#cfd3da" strokeWidth="1.8" />
      <rect x="-5.5" y="-8" width="11" height="17" rx="3.3" className="f-fob" />
      <circle cx="0" cy="-1" r="2" className="f-ambre" />
    </g>
  );
}

/**
 * Un personnage de face, tourné vers la droite (miroir pour regarder à
 * gauche). Le bras avant a un coude : l'épaule et le coude tournent
 * séparément, ce qui donne un geste naturel.
 */
function Personne({ peau, cheveux, veste, manches, pantalon, gilet = false, casquette = false, bras, cle }) {
  const [epaule, coude] = bras;
  const TORSE = "M -16 -97 Q -17 -106 -8 -107 L 9 -107 Q 18 -106 16 -97 L 15 -52 Q 0 -47 -15 -52 Z";
  return (
    <g>
      <ellipse cx="0" cy="1" rx="22" ry="3.6" className="p-ombre" />
      {/* Jambes et chaussures */}
      <path d="M -6 -54 L -8 -8 M 7 -54 L 9 -8" stroke={pantalon} strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M -18 -2 Q -18 -11 -8 -11 L 0 -11 L 0 -2 Q -9 -0.5 -18 -2 Z" fill="#12151d" />
      <path d="M 0 -2 L 0 -11 L 9 -11 Q 19 -11 19 -2 Q 9 -0.5 0 -2 Z" fill="#12151d" />
      <path d="M -17 -3.6 L 18 -3.6" className="s-reflet" />
      {/* Bras arrière, le long du corps */}
      <path d="M -12 -99 L -14 -62" stroke={manches} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="-14" cy="-58" r="4.8" fill={peau} />
      {/* Torse, ceinture, relief */}
      <path d={TORSE} fill={veste} />
      {gilet ? (
        <>
          <path d={TORSE} className="f-ambre" />
          <path d="M -15.5 -84 L 15.5 -84 M -15 -70 L 15 -70" className="s-blanc" />
          <path d="M 1 -107 L 1 -50" className="s-gilet" />
        </>
      ) : (
        <>
          <path d="M -4 -107 L 1 -93 L 6 -107 Z" className="f-chemise" />
          <path d="M 0 -99 L 2.8 -91 L 1 -74 L -1 -91 Z" className="f-cravate" />
          <path d="M -8 -107 L -1 -80 L -15 -97 Z M 10 -107 L 3 -80 L 17 -97 Z" className="s-revers" />
        </>
      )}
      <path d="M -15 -54 Q 0 -49 15 -54" className="s-ceinture" />
      <path d={TORSE} fill="url(#dlc-vol)" />
      {/* Cou et tête, sans visage : oreille, cheveux, ombre sous le menton */}
      <rect x="-3" y="-113" width="8" height="8" rx="3" fill={peau} />
      <path d="M -3 -106 Q 1 -102 5 -106 L 5 -109 L -3 -109 Z" fill="rgba(0,0,0,0.18)" />
      <ellipse cx="1" cy="-121" rx="10.5" ry="12" fill={peau} />
      <ellipse cx="-8.6" cy="-120" rx="2.2" ry="3.2" fill={peau} />
      <path d="M -11 -121 C -12 -134 10 -137 12 -122 C 6 -128 -3 -127 -11 -121 Z" fill={cheveux} />
      <ellipse cx="1" cy="-121" rx="10.5" ry="12" fill="url(#dlc-vol)" opacity="0.5" />
      {casquette && (
        <>
          <path d="M -11 -123 A 11.5 11.5 0 0 1 12 -123 Z" className="f-ambre" />
          <path d="M 10 -123 Q 18 -124 23 -120.5" className="s-ambre" />
        </>
      )}
      {/* Bras avant : épaule, puis coude */}
      <g transform="translate(11 -99)">
        <g className={epaule}>
          <path d="M 0 0 L 0 23" stroke={manches} strokeWidth="9.5" strokeLinecap="round" fill="none" />
          <g transform="translate(0 23)">
            <g className={coude}>
              <path d="M 0 0 L 0 21" stroke={manches} strokeWidth="9" strokeLinecap="round" fill="none" />
              <circle cx="0" cy="24" r="5" fill={peau} />
              <g transform="translate(0 25)">{cle}</g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

function SceneCles() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 146" role="img"
      aria-label="Animation : le convoyeur tend les clés au client, qui les prend et les lève.">
      <Fond largeur={380} hauteur={146} sol={132}>
        {/* Le point de remise : façade vitrée, auvent jaune arrondi, plante */}
        <rect x="24" y="30" width="332" height="102" rx="6" className="p-loin" />
        {[38, 112, 186, 260].map((x) => (
          <g key={x}>
            <rect x={x} y="48" width="60" height="84" rx="3" className="p-vitrage" />
            <rect x={x} y="48" width="60" height="84" rx="3" fill="url(#dlc-verre)" opacity="0.55" />
          </g>
        ))}
        <path d="M 16 30 L 364 30 L 356 42 Q 190 47 24 42 Z" className="f-ambre" />
        <path d="M 16 30 L 364 30 L 364 33 L 16 33 Z" fill="url(#dlc-vol)" />
        <g>
          <path d="M 340 132 L 344 114 L 356 114 L 360 132 Z" className="p-pres" />
          <path d="M 350 114 C 336 100 338 88 346 82 C 348 94 352 100 350 114 Z M 350 114 C 366 104 368 90 360 84 C 356 96 352 104 350 114 Z" className="p-feuillage" />
        </g>
      </Fond>

      <g transform="translate(168 132) scale(0.92)">
        <Personne
          peau="#f2c9a5" cheveux="#2b2e36" veste="#0b1d3a" manches="#0b1d3a"
          pantalon="#232632" gilet casquette bras={["epaule-a", "coude-a"]} cle={<Cle classe="cle--a" />}
        />
      </g>
      <g transform="translate(320 132) scale(-0.92 0.92)">
        <Personne
          peau="#c58c63" cheveux="#4a3524" veste="#0b5c73" manches="#0b5c73"
          pantalon="#3a3f4b" bras={["epaule-b", "coude-b"]} cle={<Cle classe="cle--b" />}
        />
      </g>

      {/* La clé qui passe d'une main à l'autre */}
      <g className="cle-vol">
        <Cle />
      </g>

      <g className="cles-valide">
        <circle cx="244" cy="18" r="11" className="f-ambre" />
        <path d="M 238 18 L 242.5 22.5 L 250.5 13.5" stroke="#12141c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/* ── Les trois scènes ─────────────────────────────────────── */

export default function ScenesHero() {
  return (
    <div className="scenes">
      <Degrades />
      <figure className="scene scene--grande">
        <div className="scene__cadre">
          <SceneTransport />
        </div>
        <figcaption>
          <strong>Transport et affrètement</strong>
          <span>Porte-8, en lot ou à l'unité</span>
        </figcaption>
      </figure>
      <figure className="scene scene--convoyage">
        <div className="scene__cadre">
          <SceneConvoyage />
        </div>
        <figcaption>
          <strong>Convoyage</strong>
          <span>Un convoyeur au volant, porte à porte</span>
        </figcaption>
      </figure>
      <figure className="scene">
        <div className="scene__cadre">
          <SceneCles />
        </div>
        <figcaption>
          <strong>Remise des clés</strong>
          <span>Une remise sécurisée au destinataire</span>
        </figcaption>
      </figure>
    </div>
  );
}
