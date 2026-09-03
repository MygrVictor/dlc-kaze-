import LogoClient from "./LogoClient";

/**
 * Bandeau déroulant « Ils nous font confiance ».
 *
 * Placé juste sous le hero : un visiteur qui découvre la page voit les noms
 * qui nous font déjà confiance avant même de lire ce que nous savons faire.
 * C'est la preuve sociale qui légitime la suite de la lecture.
 *
 * Le défilement est purement décoratif. La liste est donc dupliquée pour
 * assurer une boucle sans coupure, et la copie est masquée aux lecteurs
 * d'écran afin de ne pas annoncer deux fois les mêmes marques.
 */

/**
 * Liste des partenaires affichés dans le bandeau.
 *
 * Pour ajouter une enseigne : déposer son logo dans
 * `client/public/images/clients/` puis compléter ce tableau. Tant que le
 * fichier n'est pas fourni, `LogoClient` affiche le nom en toutes lettres,
 * ce qui évite une case vide à l'écran.
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
 * Assureurs partenaires.
 *
 * Placés immédiatement sous les clients : la question qui suit « qui vous
 * fait confiance ? » est « et si mon véhicule est endommagé ? ». Y répondre
 * dans la foulée, par des noms connus, lève l'objection avant qu'elle ne se
 * formule. La rangée est fixe, et non défilante : trois logos se lisent
 * d'un coup d'œil, et le mouvement détournerait de la mention d'assurance.
 */
const ASSUREURS = [
  { nom: "Areas Assurances", src: "/images/assurance/areas.webp" },
  { nom: "Tetris Assurance", src: "/images/assurance/tetris.webp" },
  { nom: "Generali", src: "/images/assurance/generali.webp" },
];

export default function BandeauClients() {
  return (
    <section
      className="bandeau-clients"
      aria-labelledby="bandeau-clients-titre"
    >
      <p id="bandeau-clients-titre" className="bandeau-clients__titre">
        Ils nous font confiance
      </p>

      <div className="bandeau-clients__piste">
        <ul className="bandeau-clients__defile">
          {CLIENTS.map((client) => (
            <li key={client.nom}>
              <LogoClient
                src={client.src}
                nom={client.nom}
                echelle={client.echelle}
              />
            </li>
          ))}
        </ul>

        {/* Copie de secours : elle prend le relais quand la première sort
            du cadre, ce qui donne une boucle continue. */}
        <ul className="bandeau-clients__defile" aria-hidden="true">
          {CLIENTS.map((client) => (
            <li key={`${client.nom}-bis`}>
              <LogoClient
                src={client.src}
                nom={client.nom}
                echelle={client.echelle}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="bandeau-assureurs">
        <p className="bandeau-assureurs__titre">
          Véhicules assurés pendant tout le trajet
        </p>
        <ul className="bandeau-assureurs__liste">
          {ASSUREURS.map((assureur) => (
            <li key={assureur.nom}>
              <LogoClient src={assureur.src} nom={assureur.nom} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
