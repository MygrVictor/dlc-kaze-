import Odometre from "./Odometre";

/**
 * Le tableau de bord du hero : un cadran et deux compteurs kilométriques.
 *
 * Les trois chiffres de la vitrine (chauffeurs, véhicules, délais) se lisent
 * comme les instruments d'une voiture. À l'ouverture de la page, l'aiguille
 * balaie tout le cadran comme au démarrage d'un véhicule, les graduations
 * s'allument à son passage et les compteurs se posent.
 *
 * Seul le cadran porte une jauge : « 100 % » est une proportion, donc il a
 * un sens de la tracer. « 4 000 » et « 50 » sont des quantités, sans
 * maximum : elles n'ont pas de cadran, ce serait inventer une échelle.
 */

const CX = 150;
const CY = 150;
const RAYON = 130;
const DEBUT = -135; // degrés depuis le haut, sens horaire
const ETENDUE = 270;
const NB_GRADUATIONS = 54;

const point = (angle, rayon) => {
  const a = (angle * Math.PI) / 180;
  return [CX + rayon * Math.sin(a), CY - rayon * Math.cos(a)];
};

const [x1, y1] = point(DEBUT, RAYON);
const [x2, y2] = point(DEBUT + ETENDUE, RAYON);
const ARC = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RAYON} ${RAYON} 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
const LONGUEUR_ARC = (2 * Math.PI * RAYON * ETENDUE) / 360;

const GRADUATIONS = Array.from({ length: NB_GRADUATIONS + 1 }, (_, i) => ({
  i,
  angle: DEBUT + (ETENDUE * i) / NB_GRADUATIONS,
  longue: i % 6 === 0,
}));

export default function TableauDeBord() {
  return (
    <div className="tableau entree" style={{ "--d": "0.9s" }}>
      <div className="cadran">
        <svg viewBox="0 0 300 300" className="cadran__svg" aria-hidden="true">
          <path d={ARC} className="cadran__piste" />
          <path
            d={ARC}
            className="cadran__jauge"
            style={{ strokeDasharray: LONGUEUR_ARC, "--longueur": LONGUEUR_ARC }}
          />
          {GRADUATIONS.map(({ i, angle, longue }) => (
            <line
              key={i}
              className={`cadran__grad${longue ? " cadran__grad--longue" : ""}`}
              x1={CX}
              y1={CY - 116}
              x2={CX}
              y2={CY - (longue ? 98 : 107)}
              transform={`rotate(${angle} ${CX} ${CY})`}
              style={{ "--i": i }}
            />
          ))}
          <g
            className="cadran__aiguille"
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            <line x1={CX} y1={CY + 22} x2={CX} y2={CY - 96} />
          </g>
          <circle cx={CX} cy={CY} r="10" className="cadran__moyeu" />
        </svg>

        <div className="cadran__lecture">
          <Odometre
            valeur={100}
            suffixe=" %"
            declencheur="montage"
            delai={2.1}
            tuiles
          />
          <span className="cadran__legende">livrés dans les délais</span>
        </div>
      </div>

      <div className="tableau__compteurs">
        <div className="tableau__compteur">
          <Odometre
            valeur={4000}
            suffixe="+"
            declencheur="montage"
            delai={1.6}
            tuiles
          />
          <span>véhicules convoyés</span>
        </div>
        <div className="tableau__compteur">
          <Odometre
            valeur={50}
            suffixe="+"
            declencheur="montage"
            delai={1.9}
            tuiles
          />
          <span>chauffeurs partenaires</span>
        </div>
      </div>
    </div>
  );
}
