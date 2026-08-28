import { Link } from "react-router-dom";
import { useEffect } from "react";
import RappelForm from "../components/RappelForm";

/**
 * Page « Faites-vous rappeler ».
 *
 * Le formulaire occupait auparavant le pied de la page d'accueil, où il
 * était concurrencé par tout ce qui l'entourait. Isolé sur sa propre page,
 * il devient la seule action possible : le visiteur qui arrive ici a déjà
 * décidé de nous parler, il ne reste qu'à ne pas le distraire.
 *
 * C'est aussi une adresse que l'on peut communiquer telle quelle — en
 * signature de courriel, dans une campagne ou sur une carte de visite —
 * ce qu'une ancre en bas de page ne permettait pas.
 */
export default function EtreRappelePage() {
  // Un visiteur qui suit un lien depuis le bas de la page d'accueil
  // arriverait sinon à mi-hauteur, la position de défilement étant
  // conservée d'une route à l'autre.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="page-rappel">
      <div className="page-rappel__inner">
        <div className="page-rappel__intro">
          <div className="waypoint-label">
            <div className="waypoint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--amber)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 22, height: 22 }}
              >
                <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <span className="tag">DESTINATION · VOUS</span>
          </div>

          <h1
            className="display"
            style={{
              fontSize: "clamp(36px,5vw,56px)",
              textTransform: "uppercase",
              color: "var(--navy)",
              marginBottom: 20,
            }}
          >
            Parlons de vos convoyages
          </h1>
          <div className="rule" />

          <p className="page-rappel__chapo">
            Un échange de quinze minutes suffit à cadrer vos volumes, vos
            trajets récurrents et vos délais. Vous repartez avec une grille
            tarifaire adaptée, sans engagement.
          </p>

          <ul className="rappel-points">
            <li>
              <span className="rappel-puce">1</span>
              <div>
                <strong>Vous laissez vos coordonnées</strong>
                <p>Deux minutes, aucune création de compte requise.</p>
              </div>
            </li>
            <li>
              <span className="rappel-puce">2</span>
              <div>
                <strong>Un expert vous rappelle sous 48 h</strong>
                <p>
                  Un interlocuteur unique, qui connaît votre dossier de bout en
                  bout.
                </p>
              </div>
            </li>
            <li>
              <span className="rappel-puce">3</span>
              <div>
                <strong>Vous recevez une proposition chiffrée</strong>
                <p>
                  Tout compris : carburant, péages et manutention du véhicule.
                </p>
              </div>
            </li>
          </ul>

          <p className="rappel-alt">
            Vous êtes convoyeur professionnel ?{" "}
            <Link to="/devenir-convoyeur">Rejoignez notre réseau →</Link>
          </p>
        </div>

        <div className="page-rappel__form">
          <RappelForm />
        </div>
      </div>
    </main>
  );
}
