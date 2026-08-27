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

/** Volume mensuel de convoyages sur les six derniers mois. */
const VOLUME_MENSUEL = [
  { mois: "Mar", valeur: 218 },
  { mois: "Avr", valeur: 264 },
  { mois: "Mai", valeur: 301 },
  { mois: "Juin", valeur: 347 },
  { mois: "Juil", valeur: 392 },
  { mois: "Août", valeur: 438 },
];

/** Répartition des missions par type de trajet. */
const REPARTITION = [
  { label: "Livraison client final", part: 42 },
  { label: "Transfert inter-sites", part: 31 },
  { label: "Retour de location", part: 18 },
  { label: "Convoyage international", part: 9 },
];

const CHIFFRES = [
  {
    Icone: TrendingUp,
    valeur: 3500,
    suffixe: "+",
    label: "Véhicules convoyés",
    detail: "Depuis le lancement",
  },
  {
    Icone: MapPin,
    valeur: 96,
    suffixe: "",
    label: "Départements desservis",
    detail: "France métropolitaine et Europe",
  },
  {
    Icone: Clock,
    valeur: 30,
    suffixe: " min",
    label: "Délai moyen de devis",
    detail: "Aux heures ouvrées",
  },
  {
    Icone: ShieldCheck,
    valeur: 98,
    suffixe: " %",
    label: "Livrés dans les délais",
    detail: "Sur les 12 derniers mois",
  },
];

export default function SectionChiffres() {
  const maxVolume = Math.max(...VOLUME_MENSUEL.map((m) => m.valeur));
  const premier = VOLUME_MENSUEL[0].valeur;
  const dernier = VOLUME_MENSUEL[VOLUME_MENSUEL.length - 1].valeur;
  const croissance = Math.round(((dernier - premier) / premier) * 100);

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
            Des ordres de grandeur plutôt que des promesses : voici ce que nous
            traitons réellement chaque mois.
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
              <h3>Convoyages par mois</h3>
              <span className="graphe-badge">+{croissance} % sur six mois</span>
            </div>

            <div className="histogramme">
              {VOLUME_MENSUEL.map(({ mois, valeur }) => (
                <div className="histo-colonne" key={mois}>
                  <span className="histo-valeur">{valeur}</span>
                  <div
                    className="histo-barre"
                    style={{ "--hauteur": `${(valeur / maxVolume) * 100}%` }}
                    role="img"
                    aria-label={`${mois} : ${valeur} convoyages`}
                  />
                  <span className="histo-mois">{mois}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="graphe-carte reveal">
            <div className="graphe-entete">
              <h3>Répartition des missions</h3>
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
