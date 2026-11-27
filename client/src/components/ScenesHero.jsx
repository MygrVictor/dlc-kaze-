/**
 * Les trois scènes animées du hero : ce que fait Drive Line Connect.
 *
 *  1. Transport et affrètement : un porte-8 arrive chargé de six véhicules,
 *     deux autres montent la rampe et prennent leur place, la rampe se
 *     relève, le camion repart avec ses huit véhicules.
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
      <g className={`roue ${classe}`.trim()}>
        <circle r={r * 0.66} className="f-jante" />
        <path d={rayons.join(" ")} className="s-pneu" />
        <circle r={r * 0.2} className="f-pneu" />
      </g>
    </g>
  );
}

/** Une voiture compacte de côté, vers la droite. Sol à y = 0, 190 de large. */
function Voiture({ couleur, classeRoue = "", conducteur = false }) {
  return (
    <g className={`voiture ${couleur}`}>
      <ellipse cx="98" cy="2" rx="96" ry="4" className="p-ombre" />
      <path
        className="f-c carrosserie"
        d="M 8 -21 C 5 -25 5 -32 8 -38 C 10 -42 15 -44 24 -45 L 46 -48 C 52 -58 62 -64 76 -64 L 110 -64 C 124 -64 133 -57 143 -49 L 170 -45 C 184 -43 190 -38 190 -29 L 189 -21 L 166 -21 A 20 20 0 0 0 126 -21 L 66 -21 A 20 20 0 0 0 26 -21 Z"
      />
      {/* Bas de caisse */}
      <path
        className="f-c-o"
        d="M 8.5 -27 L 190 -27 L 189 -21 L 166 -21 A 20 20 0 0 0 126 -21 L 66 -21 A 20 20 0 0 0 26 -21 L 8 -21 Z"
      />
      {/* Vitres */}
      <path className="f-vitre" d="M 50 -49 C 55 -57 63 -61 75 -61 L 93 -61 L 93 -49 Z" />
      <path className="f-vitre" d="M 97 -61 L 109 -61 C 120 -61 127 -56 135 -49 L 97 -49 Z" />
      {conducteur && (
        <g>
          {/* Le convoyeur au volant : tête et casquette jaune */}
          <circle cx="110" cy="-54.5" r="4.8" className="f-peau" />
          <path d="M 105 -56 A 5 5 0 0 1 115 -56 Z" className="f-ambre" />
          <path d="M 114 -56.5 L 119 -55.5" className="s-ambre" />
        </g>
      )}
      <path d="M 78 -63.2 L 108 -63.2" className="s-reflet" />
      <path className="s-c-o" d="M 95 -48 L 95 -24 M 103 -41 L 112 -41" />
      <path className="f-c-o" d="M 133 -49 L 139 -52 L 141 -47 Z" />
      <path className="f-phare" d="M 178 -40 C 184 -40 189 -37 190 -33 L 181 -33 Z" />
      <path className="f-feu" d="M 7 -40 L 12 -41 L 12 -32 L 6 -33 Z" />
      <Roue cx={46} cy={-15} r={15} classe={classeRoue} />
      <Roue cx={146} cy={-15} r={15} classe={classeRoue} />
    </g>
  );
}

/** Immeubles : [x, hauteur, largeur]. La période est de 380. */
const IMMEUBLES = [
  [0, 54, 34], [40, 74, 28], [74, 46, 36], [116, 88, 30], [152, 60, 40],
  [198, 78, 26], [230, 50, 34], [270, 94, 32], [308, 64, 36], [350, 52, 30],
];

/** Fond d'une scène : ciel, décor lointain, sol. */
function Fond({ largeur, hauteur, sol, children }) {
  return (
    <>
      <rect width={largeur} height={hauteur} className="p-ciel" />
      {children}
      <rect y={sol} width={largeur} height={hauteur - sol} className="p-route" />
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

function Camion() {
  return (
    <g className="camion">
      <ellipse cx="363" cy="2" rx="374" ry="5" className="p-ombre" />

      {/* Châssis, bandeau de marque, plateaux, montants */}
      <rect x="0" y="-46" width="592" height="12" className="f-acier" />
      <rect x="0" y="-41" width="592" height="2.5" className="f-ambre" />
      <rect x="158" y="-34" width="400" height="26" rx="3" className="f-marque" />
      <image href="/logo-mobilite.png" x="248" y="-32" width="160" height="22" preserveAspectRatio="xMidYMid meet" />
      <rect x="2" y="-62" width="588" height="6" className="f-acier" />
      <rect x="2" y="-130" width="560" height="6" className="f-acier" />
      {[0, 296, 586].map((px) => (
        <rect key={px} x={px} y="-196" width="6" height="150" className="f-acier" />
      ))}
      <rect x="0" y="-196" width="592" height="7" className="f-acier" />
      <rect x="-3" y="-52" width="5" height="8" className="f-feu" />

      {/* Plateau haut : quatre véhicules */}
      {["v-blanc", "v-gris", "v-bleu", "v-anthracite"].map((c, i) => (
        <g key={`h${i}`} transform={`translate(${X_PLACE(i)} ${Y_HAUT}) scale(0.8)`}>
          <Voiture couleur={c} />
        </g>
      ))}
      {/* Plateau bas : deux véhicules à l'avant, les deux places arrière attendent */}
      {["v-gris", "v-blanc"].map((c, i) => (
        <g key={`b${i}`} transform={`translate(${X_PLACE(i + 2)} ${Y_BAS}) scale(0.8)`}>
          <Voiture couleur={c} />
        </g>
      ))}

      {/* Les deux véhicules qui montent : leur place finale est celle de la
          pose au repos, leur trajet est décrit en CSS (charge-7, charge-8). */}
      <g className="charge-7">
        <g transform={`translate(${X_PLACE(1)} ${Y_BAS}) scale(0.8)`}>
          <Voiture couleur="v-bleu" classeRoue="roue--c7" />
        </g>
      </g>
      <g className="charge-8">
        <g transform={`translate(${X_PLACE(0)} ${Y_BAS}) scale(0.8)`}>
          <Voiture couleur="v-blanc" classeRoue="roue--c8" />
        </g>
      </g>

      {/* La rampe : articulée à l'arrière du plateau bas */}
      <g transform={`translate(0 ${Y_BAS})`}>
        <g className="rampe">
          <path className="f-acier" d="M 0 0 L -148 62 L -148 68 L 0 6 Z" />
          <path className="f-ambre" d="M -148 62 L -128 53 L -128 58 L -148 68 Z" />
        </g>
      </g>

      {/* Tracteur : pot d'échappement, réservoir, cabine */}
      <rect x="590" y="-206" width="6" height="156" className="f-acier" />
      <rect x="640" y="-54" width="46" height="18" rx="6" className="f-acier" />
      <rect x="592" y="-50" width="18" height="8" className="f-acier" />
      <path className="f-cab" d="M 606 -50 L 606 -170 L 686 -170 L 720 -124 L 728 -120 L 728 -50 Z" />
      <rect x="606" y="-100" width="122" height="9" className="f-ambre" />
      <path className="f-vitre" d="M 662 -162 L 684 -162 L 714 -128 L 662 -128 Z M 618 -162 L 654 -162 L 654 -128 L 618 -128 Z" />
      <path className="s-cab-o" d="M 656 -128 L 656 -52 M 642 -112 L 650 -112" />
      <rect x="720" y="-86" width="8" height="34" className="f-pneu" />
      <path d="M 720 -80 L 728 -80 M 720 -72 L 728 -72 M 720 -64 L 728 -64" className="s-cab-o" />
      <rect x="722" y="-118" width="6" height="9" className="f-phare" />
      <path className="s-cab-o" d="M 698 -150 L 706 -156 L 706 -134" />
      <rect x="604" y="-46" width="132" height="8" rx="2" className="f-acier" />

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
        {/* Quelques nuages, très lents */}
        <g className="nuages">
          {[0, 800].map((dec) => (
            <g key={dec} transform={`translate(${dec} 0)`}>
              <rect x="70" y="34" width="120" height="22" rx="11" className="p-nuage" />
              <rect x="104" y="22" width="64" height="22" rx="11" className="p-nuage" />
              <rect x="380" y="64" width="96" height="18" rx="9" className="p-nuage" />
              <rect x="404" y="54" width="50" height="18" rx="9" className="p-nuage" />
              <rect x="640" y="30" width="110" height="20" rx="10" className="p-nuage" />
              <rect x="668" y="19" width="56" height="20" rx="10" className="p-nuage" />
            </g>
          ))}
        </g>
        {/* Décor : les bâtiments de la zone d'activité */}
        <g className="p-loin-fixe">
          {[0, 380, 760].map((dec) =>
            IMMEUBLES.map(([x, h, l]) => (
              <rect key={`${dec}-${x}`} x={x + dec} y={292 - h * 1.1} width={l} height={h * 1.1} className="p-loin" />
            )),
          )}
        </g>
      </Fond>
      <path className="p-tirets-fixes" d="M 0 316 L 800 316" />

      <g className="camion-anim">
        <g transform="translate(150 292) scale(0.86)">
          <Camion />
        </g>
      </g>
    </svg>
  );
}

/* ── Scène 2 : convoyage ──────────────────────────────────── */

function Skyline({ classe, echelle = 1 }) {
  return (
    <g className={classe}>
      {[0, 380].map((dec) => (
        <g key={dec} transform={`translate(${dec} 0)`}>
          {IMMEUBLES.map(([x, h, l]) => (
            <rect key={x} x={x} y={128 - h * echelle} width={l} height={h * echelle} className="p-loin" />
          ))}
        </g>
      ))}
    </g>
  );
}

function SceneConvoyage() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 146" role="img"
      aria-label="Animation : une voiture jaune conduite par un convoyeur roule sur la route, le décor défile.">
      <Fond largeur={380} hauteur={146} sol={128}>
        <Skyline classe="defile-loin" echelle={0.7} />
        <g className="defile-pres">
          {[0, 380].map((dec) => (
            <g key={dec} transform={`translate(${dec} 0)`}>
              <rect x="40" y="86" width="3" height="42" className="p-pres" />
              <path d="M 41 88 L 58 88" className="s-pres" />
              <circle cx="150" cy="112" r="13" className="p-pres" />
              <rect x="148" y="119" width="4" height="9" className="p-pres" />
              <rect x="236" y="86" width="3" height="42" className="p-pres" />
              <path d="M 237 88 L 254 88" className="s-pres" />
              <circle cx="326" cy="114" r="11" className="p-pres" />
              <rect x="324" y="120" width="4" height="8" className="p-pres" />
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
  return (
    <g>
      <ellipse cx="0" cy="1" rx="21" ry="3.6" className="p-ombre" />
      {/* Jambes et chaussures */}
      <path d="M -6 -54 L -8 -7 M 7 -54 L 9 -7" stroke={pantalon} strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M -17 -3 Q -17 -10 -8 -10 L 0 -10 L 0 -3 Z" fill="#12151d" />
      <path d="M -1 -3 L -1 -10 L 9 -10 Q 18 -10 18 -3 Z" fill="#12151d" />
      {/* Bras arrière, le long du corps */}
      <path d="M -12 -99 L -14 -62" stroke={manches} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="-14" cy="-58" r="4.8" fill={peau} />
      {/* Torse */}
      <path d="M -16 -97 Q -17 -106 -8 -107 L 9 -107 Q 18 -106 16 -97 L 15 -52 Q 0 -47 -15 -52 Z" fill={veste} />
      {gilet ? (
        <>
          <path d="M -16 -97 Q -17 -106 -8 -107 L 9 -107 Q 18 -106 16 -97 L 15 -52 Q 0 -47 -15 -52 Z" className="f-ambre" />
          <path d="M -15.5 -84 L 15.5 -84 M -15 -70 L 15 -70" className="s-blanc" />
          <path d="M 1 -107 L 1 -50" className="s-gilet" />
        </>
      ) : (
        <>
          <path d="M -4 -107 L 1 -93 L 6 -107 Z" className="f-chemise" />
          <path d="M 0 -99 L 2.8 -91 L 1 -74 L -1 -91 Z" className="f-cravate" />
        </>
      )}
      {/* Cou et tête, sans visage */}
      <rect x="-3" y="-112" width="8" height="7" fill={peau} />
      <ellipse cx="1" cy="-121" rx="10.5" ry="12" fill={peau} />
      <path d="M -10 -123 A 10.5 12 0 0 1 12 -123 Q 5 -131 -10 -123 Z" fill={cheveux} />
      {casquette && (
        <>
          <path d="M -10 -123 A 10.5 11 0 0 1 12 -123 Z" className="f-ambre" />
          <path d="M 10 -123 L 22 -120.5" className="s-ambre" />
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
        {/* Le point de remise : une façade vitrée, un auvent jaune */}
        <rect x="24" y="30" width="332" height="102" className="p-loin" />
        <rect x="24" y="30" width="332" height="9" className="f-ambre" />
        {[38, 112, 186, 260].map((x) => (
          <rect key={x} x={x} y="48" width="60" height="84" className="p-vitrage" />
        ))}
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
