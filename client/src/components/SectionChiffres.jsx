import Odometre from "./Odometre";
import CarteCouverture from "./CarteCouverture";
import { TrendingUp, MapPin, Clock, ShieldCheck } from "lucide-react";

/**
 * Section « Drive Line Connect en chiffres ».
 *
 * Un grand compte consulte le site avant d'accorder un rendez-vous : il y
 * cherche des ordres de grandeur, pas un discours. Cette section remplace
 * donc les affirmations qualitatives par des données vérifiables — volume,
 * couverture, délais — présentées de façon à être saisies en un coup d'œil.
 *
 * Les graphiques sont construits en CSS et en SVG plutôt qu'avec une
 * bibliothèque : une carte en points et quatre barres ne justifient pas
 * d'alourdir le bundle d'une page d'accueil, dont le temps de chargement
 * est lui-même un argument commercial.
 */

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
  return (
    <section id="chiffres" className="chiffres-section">
      <div className="chiffres__contenu">
        <div className="waypoint-label reveal" data-km="180">
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
            KM 180 · NOS CHIFFRES
          </span>
        </div>

        <div className="section-head section-head--gauche reveal">
          <h2 className="display titre-geant titre-geant--moyen">
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
          {CHIFFRES.map(({ Icone, valeur, suffixe, label }) => (
            <div className="chiffre-carte reveal" key={label}>
              <span className="chiffre-icone">
                <Icone size={20} />
              </span>
              <Odometre
                className="chiffre-valeur"
                valeur={valeur}
                suffixe={suffixe}
                tuiles
              />
              <div className="chiffre-label">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Graphiques ── */}
        <div className="chiffres-graphes">
          <div className="graphe-carte reveal">
            <div className="graphe-entete">
              <h3>Où nous intervenons</h3>
              <span className="graphe-badge">101 départements</span>
            </div>

            <CarteCouverture />

            <p className="graphe-note">
              France entière et Europe. Trajets donnés à titre d'exemple.
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
