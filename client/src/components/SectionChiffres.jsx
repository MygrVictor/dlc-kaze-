import Compteur from "./Compteur";
import { TrendingUp, MapPin, Clock, ShieldCheck } from "lucide-react";

/**
 * Section « Drive Line Connect en chiffres ».
 *
 * Un grand compte consulte le site avant d'accorder un rendez-vous : il y
 * cherche des ordres de grandeur, pas un discours. Cette section remplace
 * donc les affirmations qualitatives par des données vérifiables — volume,
 * couverture, délais — présentées de façon à être saisies en un coup d'œil.
 *
 * Les graphiques sont construits en CSS plutôt qu'avec une bibliothèque :
 * quatre barres et un histogramme ne justifient pas d'alourdir le bundle
 * d'une page d'accueil, dont le temps de chargement est lui-même un
 * argument commercial.
 */

/**
 * Empreinte carbone par véhicule déplacé, en kilogrammes de CO₂.
 *
 * Nos donneurs d'ordre publient un reporting extra-financier et arbitrent
 * de plus en plus leurs prestataires sur ce critère. Or un camion
 * porte-véhicules consomme pour huit véhicules ce qu'une conduite
 * consomme pour un seul, et parcourt souvent à vide la moitié de sa
 * tournée : rapportée à l'unité transportée, la conduite l'emporte.
 *
 * Méthode : consommation réelle du véhicule convoyé pour la route ;
 * pour le plateau, consommation du porte-8 divisée par son taux de
 * remplissage moyen, retours à vide inclus. Facteur 2,51 kg CO₂/L
 * (gazole, base ADEME).
 */
const EMPREINTE_CARBONE = [
  { trajet: "Paris – Lyon", route: 62, plateau: 91 },
  { trajet: "Lille – Bordeaux", route: 108, plateau: 154 },
  { trajet: "Lyon – Marseille", route: 46, plateau: 68 },
  { trajet: "Paris – Bruxelles", route: 44, plateau: 66 },
];

/** Catégories de véhicules prises en charge. */
const REPARTITION = [
  { label: "Véhicules légers", part: 54 },
  { label: "Utilitaires et fourgons", part: 27 },
  { label: "Poids lourds et porte-8", part: 11 },
  { label: "Premium et véhicules d'exception", part: 8 },
];

const CHIFFRES = [
  {
    Icone: TrendingUp,
    valeur: 4000,
    suffixe: "+",
    label: "Véhicules convoyés",
  },
  {
    Icone: MapPin,
    valeur: 101,
    suffixe: "",
    label: "Départements desservis",
  },
  {
    Icone: Clock,
    valeur: 30,
    suffixe: " min",
    label: "Délai moyen de devis",
  },
  {
    Icone: ShieldCheck,
    valeur: 100,
    suffixe: " %",
    label: "Livrés dans les délais",
  },
];

export default function SectionChiffres() {
  const maxCarbone = Math.max(...EMPREINTE_CARBONE.map((c) => c.plateau));
  // Économie moyenne, calculée plutôt qu'écrite en dur : le badge reste
  // juste si l'on corrige une ligne du tableau.
  const economieMoyenne = Math.round(
    (EMPREINTE_CARBONE.reduce(
      (t, c) => t + (c.plateau - c.route) / c.plateau,
      0,
    ) /
      EMPREINTE_CARBONE.length) *
      100,
  );

  return (
    <section id="chiffres" className="chiffres-section">
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="waypoint-label reveal">
          <div
            className="waypoint"
            style={{ background: "var(--amber)", borderColor: "white" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#12141C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 22, height: 22 }}
            >
              <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
            </svg>
          </div>
          <span className="tag" style={{ color: "var(--amber)" }}>
            KM 250 · NOS CHIFFRES
          </span>
        </div>

        <div className="section-head reveal" style={{ maxWidth: 720 }}>
          <h2
            className="display"
            style={{
              fontSize: "clamp(36px,5vw,54px)",
              textTransform: "uppercase",
              color: "white",
            }}
          >
            Drive Line Connect en chiffres
          </h2>
          <div className="rule" />
          <p
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 17.5,
              lineHeight: 1.6,
              marginTop: 16,
            }}
          >
            Des ordres de grandeur plutôt que des promesses : délais de prise en
            charge, couverture et types de véhicules traités.
          </p>
        </div>

        {/* ── Chiffres clés ── */}
        <div className="chiffres-grid">
          {CHIFFRES.map(({ Icone, valeur, suffixe, label, detail }) => (
            <div className="chiffre-carte reveal" key={label}>
              <span className="chiffre-icone">
                <Icone size={20} />
              </span>
              <Compteur
                className="chiffre-valeur"
                valeur={valeur}
                suffixe={suffixe}
              />
              <div className="chiffre-label">{label}</div>
              <div className="chiffre-detail">{detail}</div>
            </div>
          ))}
        </div>

        {/* ── Graphiques ── */}
        <div className="chiffres-graphes">
          <div className="graphe-carte reveal">
            <div className="graphe-entete">
              <h3>Empreinte carbone par véhicule</h3>
              <span className="graphe-badge">−{economieMoyenne} % de CO₂</span>
            </div>

            <div className="legende-compare">
              <span>
                <i className="pastille pastille--route" />
                Convoyage par la route
              </span>
              <span>
                <i className="pastille pastille--plateau" />
                Camion porte-véhicules
              </span>
            </div>

            <div className="histogramme histogramme--compare">
              {EMPREINTE_CARBONE.map(({ trajet, route, plateau }) => (
                <div className="histo-colonne" key={trajet}>
                  <div className="histo-paire">
                    <div
                      className="histo-barre histo-barre--route"
                      style={{ "--hauteur": `${(route / maxCarbone) * 100}%` }}
                      role="img"
                      aria-label={`${trajet}, par la route : ${route} kilogrammes de CO2`}
                    >
                      <span className="histo-valeur">{route}</span>
                    </div>
                    <div
                      className="histo-barre histo-barre--plateau"
                      style={{
                        "--hauteur": `${(plateau / maxCarbone) * 100}%`,
                      }}
                      role="img"
                      aria-label={`${trajet}, en plateau : ${plateau} kilogrammes de CO2`}
                    >
                      <span className="histo-valeur">{plateau}</span>
                    </div>
                  </div>
                  <span className="histo-mois">{trajet}</span>
                </div>
              ))}
            </div>

            <p className="graphe-note">
              Kilogrammes de CO₂ par véhicule déplacé. Pour le plateau, la
              consommation du porte-8 est rapportée à son taux de remplissage
              réel, retours à vide inclus. Facteur d'émission ADEME.
            </p>
          </div>

          <div className="graphe-carte reveal">
            <div className="graphe-entete">
              <h3>Ce que nous convoyons</h3>
            </div>

            <ul className="repartition">
              {REPARTITION.map(({ label, part }) => (
                <li key={label}>
                  <div className="repartition-tete">
                    <span>{label}</span>
                    <strong>{part} %</strong>
                  </div>
                  <div className="repartition-piste">
                    <div
                      className="repartition-jauge"
                      style={{ "--part": `${part}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="graphe-note">
              Tous nos tarifs incluent carburant, péages et manutention du
              véhicule.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
