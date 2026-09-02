import { Wallet, CalendarCheck, LifeBuoy, Map } from "lucide-react";

/**
 * Argumentaire de la page convoyeur.
 *
 * Le formulaire s'est allongé — SIRET, assurances, certification — et une
 * demande d'informations sans contrepartie visible décourage. Cette colonne
 * répond donc à la question que se pose le candidat au moment de saisir son
 * SIRET : qu'est-ce que j'y gagne ?
 */

const AVANTAGES = [
  {
    Icone: Wallet,
    titre: "Une rémunération attractive",
    texte:
      "Grille tarifaire claire annoncée avant chaque mission, et paiement sous 7 jours après validation. Aucune commission cachée.",
  },
  {
    Icone: CalendarCheck,
    titre: "Vous choisissez vos missions",
    texte:
      "Les missions disponibles vous sont proposées ; vous acceptez celles qui correspondent à vos trajets, vos horaires et vos distances.",
  },
  {
    Icone: LifeBuoy,
    titre: "Un accompagnement de bout en bout",
    texte:
      "Un interlocuteur joignable pendant vos convoyages, et une équipe qui prend le relais en cas d'imprévu sur la route.",
  },
  {
    Icone: Map,
    titre: "Un volume régulier",
    texte: "Des missions chaque semaine partout en France et en Europe.",
  },
];

export default function AvantagesConvoyeur() {
  return (
    <div className="demande-argumentaire">
      <span className="tag" style={{ color: "var(--teal)" }}>
        REJOIGNEZ LE RÉSEAU
      </span>
      <h2>Convoyer avec Drive Line Connect</h2>
      <p className="argumentaire-intro">
        Plus de 40 convoyeurs professionnels travaillent déjà avec nous.
      </p>

      <ul className="avantages-liste">
        {AVANTAGES.map(({ Icone, titre, texte }) => (
          <li key={titre}>
            <span className="avantage-icone">
              <Icone size={20} />
            </span>
            <div>
              <strong>{titre}</strong>
              <p>{texte}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="avantage-note">
        <strong>Prérequis</strong>
        <p>
          Une structure déclarée (SIRET) et une assurance RC Circulation en
          cours ou en cours d'obtention. Nous validons vos documents lors d'un
          pré-rendez-vous.
        </p>
      </div>
    </div>
  );
}
