/**
 * Les trois scènes animées du hero : ce que fait Drive Line Connect.
 *
 *  1. Transport et affrètement : un porte-voitures, et une voiture qui monte
 *     la rampe pour prendre sa place sur le plateau.
 *  2. Convoyage : une voiture conduite par un convoyeur, sur la route, le
 *     décor qui défile derrière.
 *  3. Remise des clés : le convoyeur tend les clés au client, qui les prend.
 *
 * Chaque scène boucle seule. Illustration à plat : aplats, ombres portées,
 * pas de dégradé ni de brillance. Les couleurs viennent de variables CSS
 * (voir vitrine.css) pour suivre le fond du hero.
 *
 * Mouvement : uniquement sous `prefers-reduced-motion: no-preference`. Sans
 * cela, chaque scène s'affiche dans sa pose finale (voiture chargée, voiture
 * en route, clés remises).
 *
 * Les coordonnées de chaque scène sont dans un repère de 380 × 260.
 */

/* ── Pièces communes ───────────────────────────────────────── */

function Roue({ cx, cy, r, classe = "" }) {
  const rayons = [0, 72, 144, 216, 288].map((a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `M 0 0 L ${(Math.cos(rad) * r * 0.62).toFixed(2)} ${(Math.sin(rad) * r * 0.62).toFixed(2)}`;
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

/** Une voiture de côté, vers la droite. Le sol est à y = 0, 190 de large. */
function Voiture({ couleur, classeRoue = "", conducteur = false }) {
  return (
    <g className={`voiture ${couleur}`}>
      <ellipse cx="98" cy="2" rx="96" ry="4" className="p-ombre" />
      <path
        className="f-c carrosserie"
        d="M 10 -22 L 8 -34 Q 10 -41 24 -43 L 54 -46 L 70 -62 L 114 -62 L 142 -46 L 178 -40 Q 190 -37 190 -27 L 188 -22 L 165 -22 A 19 19 0 0 0 127 -22 L 65 -22 A 19 19 0 0 0 27 -22 Z"
      />
      <path
        className="f-c-o"
        d="M 9.5 -27 L 189.5 -27 L 188 -22 L 165 -22 A 19 19 0 0 0 127 -22 L 65 -22 A 19 19 0 0 0 27 -22 L 10 -22 Z"
      />
      <path className="f-vitre" d="M 72 -58 L 111 -58 L 134 -47 L 72 -47 Z" />
      {conducteur && (
        <g>
          {/* Le convoyeur au volant : tête et casquette jaune */}
          <circle cx="106" cy="-52.5" r="4.6" className="f-peau" />
          <path d="M 101 -54 A 5 5 0 0 1 111 -54 Z" className="f-ambre" />
          <path d="M 110 -54.5 L 115 -53.5" className="s-ambre" />
        </g>
      )}
      <path className="f-c" d="M 92.5 -58.5 L 96 -58.5 L 96 -46.5 L 92.5 -46.5 Z" />
      <path className="s-c-o" d="M 94 -46 L 94 -28 M 100 -40 L 110 -40" />
      <path className="f-phare" d="M 180 -38 L 189 -35 L 189 -31 L 181 -32 Z" />
      <path className="f-feu" d="M 8 -35 L 11.5 -35 L 11.5 -29 L 8.5 -29 Z" />
      <Roue cx={46} cy={-15} r={14} classe={classeRoue} />
      <Roue cx={146} cy={-15} r={14} classe={classeRoue} />
    </g>
  );
}

/** Fond d'une scène : ciel et sol. */
function Fond({ children }) {
  return (
    <>
      <rect width="380" height="260" className="p-ciel" />
      {children}
      <rect y="214" width="380" height="46" className="p-route" />
      <path className="p-rive" d="M 0 215 L 380 215" />
    </>
  );
}

/** Immeubles : [x, hauteur, largeur]. La période est de 380. */
const IMMEUBLES = [
  [0, 54, 34], [40, 74, 28], [74, 46, 36], [116, 88, 30], [152, 60, 40],
  [198, 78, 26], [230, 50, 34], [270, 94, 32], [308, 64, 36], [350, 52, 30],
];

function Skyline({ classe }) {
  return (
    <g className={classe}>
      {[0, 380].map((dec) => (
        <g key={dec} transform={`translate(${dec} 0)`}>
          {IMMEUBLES.map(([x, h, l]) => (
            <rect key={x} x={x} y={214 - h} width={l} height={h} className="p-loin" />
          ))}
        </g>
      ))}
    </g>
  );
}

/* ── Scène 1 : transport et affrètement ───────────────────── */

function SceneTransport() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 260" role="img"
      aria-label="Animation : une voiture monte la rampe d'un camion porte-voitures et prend sa place sur le plateau.">
      <Fond>
        <g className="p-loin-fixe">
          {IMMEUBLES.map(([x, h, l]) => (
            <rect key={x} x={x} y={214 - h * 0.8} width={l} height={h * 0.8} className="p-loin" />
          ))}
        </g>
      </Fond>

      {/* L'arrière du camion : plateaux, montants, châssis */}
      <ellipse cx="260" cy="216" rx="150" ry="4" className="p-ombre" />
      <rect x="120" y="165" width="270" height="10" className="f-acier" />
      <rect x="120" y="168" width="270" height="2.5" className="f-ambre" />
      <rect x="126" y="155" width="254" height="5" className="f-acier" />
      <rect x="126" y="88" width="254" height="5" className="f-acier" />
      <rect x="124" y="30" width="5" height="140" className="f-acier" />
      <rect x="282" y="30" width="5" height="140" className="f-acier" />
      <rect x="124" y="30" width="262" height="6" className="f-acier" />

      {/* Véhicules déjà chargés */}
      <g transform="translate(140 88) scale(0.7)">
        <Voiture couleur="v-gris" />
      </g>
      <g transform="translate(292 88) scale(0.7)">
        <Voiture couleur="v-anthracite" />
      </g>
      <g transform="translate(292 155) scale(0.7)">
        <Voiture couleur="v-blanc" />
      </g>

      {/* La rampe */}
      <path className="f-acier" d="M 10 217 L 128 156 L 136 156 L 136 162 L 22 220 Z" />

      <Roue cx={190} cy={199} r={16} />
      <Roue cx={232} cy={199} r={16} />

      {/* La voiture qui monte */}
      <g className="charge-anim">
        <g transform="translate(140 155) scale(0.7)">
          <Voiture couleur="v-bleu" classeRoue="roue--charge" />
        </g>
      </g>
    </svg>
  );
}

/* ── Scène 2 : convoyage ──────────────────────────────────── */

function SceneConvoyage() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 260" role="img"
      aria-label="Animation : une voiture jaune conduite par un convoyeur roule sur la route, le décor défile.">
      <Fond>
        <Skyline classe="defile-loin" />
        {/* Réverbères et arbres, plus près : ils défilent plus vite. */}
        <g className="defile-pres">
          {[0, 380].map((dec) => (
            <g key={dec} transform={`translate(${dec} 0)`}>
              <rect x="40" y="150" width="3" height="64" className="p-pres" />
              <path d="M 41 152 L 62 152" className="s-pres" />
              <circle cx="140" cy="186" r="20" className="p-pres" />
              <rect x="138" y="196" width="4" height="18" className="p-pres" />
              <rect x="226" y="150" width="3" height="64" className="p-pres" />
              <path d="M 227 152 L 248 152" className="s-pres" />
              <circle cx="318" cy="190" r="16" className="p-pres" />
              <rect x="316" y="198" width="4" height="16" className="p-pres" />
            </g>
          ))}
        </g>
      </Fond>

      <path className="p-tirets" d="M 0 238 L 450 238" />

      {/* Les filets de vitesse derrière la voiture */}
      <g className="vitesse">
        <path d="M 20 214 L 72 214" />
        <path d="M 8 226 L 64 226" />
        <path d="M 28 200 L 70 200" />
      </g>

      <g className="voiture-bob">
        <g transform="translate(72 250) scale(1.3)">
          <Voiture couleur="v-ambre" classeRoue="roue--roule" conducteur />
        </g>
      </g>
    </svg>
  );
}

/* ── Scène 3 : remise des clés ────────────────────────────── */

/** Un personnage de face, tourné vers la droite (miroir pour regarder à gauche). */
function Personne({ peau, cheveux, veste, manches, pantalon, gilet = false, casquette = false, bras, cle }) {
  return (
    <g>
      <ellipse cx="0" cy="1" rx="22" ry="4" className="p-ombre" />
      {/* Jambes et chaussures */}
      <path d="M -6 -52 L -7 -7 M 6 -52 L 7 -7" stroke={pantalon} strokeWidth="11" strokeLinecap="round" fill="none" />
      <ellipse cx="-8" cy="-3" rx="9" ry="4.5" fill="#12151d" />
      <ellipse cx="9" cy="-3" rx="9" ry="4.5" fill="#12151d" />
      {/* Bras arrière, le long du corps */}
      <path d="M -13 -94 L -15 -60" stroke={manches} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="-15" cy="-56" r="5" fill={peau} />
      {/* Torse */}
      <rect x="-16" y="-104" width="32" height="56" rx="13" fill={veste} />
      {gilet && (
        <>
          <rect x="-16" y="-104" width="32" height="56" rx="13" className="f-ambre" />
          <rect x="-16" y="-82" width="32" height="4" className="f-blanc" />
          <rect x="-16" y="-70" width="32" height="4" className="f-blanc" />
        </>
      )}
      {/* Tête */}
      <circle cx="1" cy="-119" r="11.5" fill={peau} />
      <path d="M -10.5 -121 A 11.5 11.5 0 0 1 12.5 -121 Q 4 -127 -10.5 -121 Z" fill={cheveux} />
      {casquette && (
        <>
          <path d="M -10.5 -122 A 11.5 11.5 0 0 1 12.5 -122 Z" className="f-ambre" />
          <path d="M 11 -122 L 22 -119.5" className="s-ambre" />
        </>
      )}
      {/* Bras avant : il pivote depuis l'épaule */}
      <g transform="translate(12 -94)">
        <g className={bras}>
          <path d="M 0 0 L 0 40" stroke={manches} strokeWidth="9.5" strokeLinecap="round" fill="none" />
          <circle cx="0" cy="43" r="5.5" fill={peau} />
          {cle}
        </g>
      </g>
    </g>
  );
}

function Cle({ classe = "" }) {
  return (
    <g className={`cle ${classe}`.trim()}>
      <circle cx="0" cy="-12" r="3.6" fill="none" stroke="#cfd3da" strokeWidth="2" />
      <rect x="-6" y="-8" width="12" height="18" rx="3.5" className="f-fob" />
      <circle cx="0" cy="-1" r="2.2" className="f-ambre" />
    </g>
  );
}

function SceneCles() {
  return (
    <svg className="scene__svg" viewBox="0 0 380 260" role="img"
      aria-label="Animation : le convoyeur tend les clés au client, qui les prend et les lève.">
      <Fond>
        {/* Le point de remise : une façade vitrée, un auvent jaune */}
        <rect x="36" y="74" width="308" height="140" className="p-loin" />
        <rect x="36" y="74" width="308" height="12" className="f-ambre" />
        {[56, 122, 188, 254].map((x) => (
          <rect key={x} x={x} y="100" width="58" height="114" className="p-vitrage" />
        ))}
      </Fond>

      <g transform="translate(112 214)">
        <Personne
          peau="#f2c9a5" cheveux="#2b2e36" veste="#0b1d3a" manches="#0b1d3a"
          pantalon="#232632" gilet casquette bras="bras-a" cle={<Cle classe="cle--a" />}
        />
      </g>
      <g transform="translate(268 214) scale(-1 1)">
        <Personne
          peau="#c58c63" cheveux="#4a3524" veste="#0b5c73" manches="#0b5c73"
          pantalon="#3a3f4b" bras="bras-b" cle={<Cle classe="cle--b" />}
        />
      </g>

      {/* La clé qui passe d'une main à l'autre */}
      <g className="cle-vol">
        <Cle />
      </g>

      {/* Validation et étincelles */}
      <g className="cles-valide">
        <circle cx="190" cy="58" r="17" className="f-ambre" />
        <path d="M 181 58 L 188 65 L 200 51" stroke="#12141c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/* ── Les trois scènes ─────────────────────────────────────── */

export default function ScenesHero() {
  return (
    <div className="scenes">
      <figure className="scene">
        <div className="scene__cadre">
          <SceneTransport />
        </div>
        <figcaption>
          <strong>Transport et affrètement</strong>
          <span>Porte-voitures, en lot ou à l'unité</span>
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
