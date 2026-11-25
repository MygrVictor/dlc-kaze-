import LogoClient from "./LogoClient";

/**
 * « Ils nous font confiance » : le mur des références et des assureurs.
 *
 * Un défilement de logos se lit mal (on ne s'arrête pas sur une enseigne
 * qui passe) et date vite. Ici, tous les noms sont visibles d'un coup, à
 * l'arrêt : une grille aux filets fins, en niveaux de gris, qui reprend sa
 * couleur au survol. C'est la preuve sociale qui légitime la suite.
 *
 * Pour ajouter une enseigne : déposer son logo dans
 * `client/public/images/clients/` puis compléter la liste ci-dessous.
 * Tant que le fichier n'est pas fourni, `LogoClient` affiche le nom en
 * toutes lettres, ce qui évite une case vide à l'écran.
 *
 * `echelle` est facultatif : il corrige les logos qui paraissent trop
 * petits à emprise égale, faute d'une marge blanche intégrée au fichier.
 */
const CLIENTS = [
  { nom: "GRDF", src: "/images/clients/grdf.webp" },
  { nom: "EQUANS", src: "/images/clients/equans.webp" },
  { nom: "Groupe GCA", src: "/images/clients/gca.webp" },
  { nom: "Groupe 2L Logistics", src: "/images/clients/2l-logistics.webp" },
  { nom: "La Coopérative Welcoop", src: "/images/clients/welcoop.webp" },
  { nom: "Land Rover", src: "/images/clients/land-rover.webp" },
  { nom: "Altacama", src: "/images/clients/altacama.webp" },
  {
    nom: "Saga Mercedes",
    src: "/images/clients/saga-mercedes.webp",
    echelle: 1.25,
  },
  { nom: "By My Car", src: "/images/clients/by-my-car.webp" },
  { nom: "Cristalens", src: "/images/clients/cristalens.webp" },
];

/**
 * Assureurs partenaires. La question qui suit « qui vous fait confiance ? »
 * est « et si mon véhicule est endommagé ? » : y répondre dans la foulée,
 * par des noms connus, lève l'objection avant qu'elle ne se formule.
 */
const ASSUREURS = [
  { nom: "Areas Assurances", src: "/images/assurance/areas.webp" },
  { nom: "Tetris Assurance", src: "/images/assurance/tetris.webp" },
  { nom: "Generali", src: "/images/assurance/generali.webp" },
];

export default function Confiance() {
  return (
    <section className="confiance" aria-labelledby="confiance-titre">
      <div className="confiance__contenu">
        <h2
          id="confiance-titre"
          className="display titre-geant titre-geant--moyen reveal"
        >
          Ils nous font confiance
        </h2>

        <ul className="confiance__logos reveal">
          {CLIENTS.map((client, i) => (
            <li key={client.nom} style={{ "--i": i }}>
              <LogoClient
                src={client.src}
                nom={client.nom}
                echelle={client.echelle}
              />
            </li>
          ))}
        </ul>

        <div className="confiance__assurance reveal">
          <div className="confiance__assurance-texte">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path
                d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6l7-3z"
                pathLength="1"
              />
              <path d="M9 12l2 2 4-4" pathLength="1" />
            </svg>
            <h3>Véhicules assurés pendant tout le trajet</h3>
          </div>
          <ul className="confiance__assureurs">
            {ASSUREURS.map((assureur) => (
              <li key={assureur.nom}>
                <LogoClient src={assureur.src} nom={assureur.nom} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
