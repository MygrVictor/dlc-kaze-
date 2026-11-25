import { Link } from "react-router-dom";
import { useEffect } from "react";
import Confiance from "../components/Confiance";
import PareBrise from "../components/PareBrise";
import TableauDeBord from "../components/TableauDeBord";
import SectionChiffres from "../components/SectionChiffres";
import RouteDefilement from "../components/RouteDefilement";
import usePile from "../lib/usePile";
import "../vitrine.css";

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        // Les éléments d'une même grille entrent ensemble dans le viewport :
        // les décaler légèrement crée un effet de cascade plutôt qu'une
        // apparition en bloc, sans multiplier les observateurs.
        entries
          .filter((e) => e.isIntersecting)
          .forEach((e, rang) => {
            e.target.style.setProperty(
              "--reveal-delay",
              `${Math.min(rang, 5) * 0.09}s`,
            );
            e.target.classList.add("in");
            io.unobserve(e.target);
          });
      },
      { threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const HERO_IMGS = [
  "/images/hero/hero-1.webp",
  "/images/hero/hero-2.webp",
  "/images/hero/hero-3.webp",
  "/images/hero/hero-4.webp",
];

const Fleche = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/**
 * Repère kilométrique d'en-tête de section. Le `data-km` est lu par la
 * route qui accompagne le défilement (RouteDefilement).
 */
function Repere({ km, libelle, sombre = false, children }) {
  return (
    <div className="waypoint-label reveal" data-km={km}>
      <div
        className="waypoint"
        style={
          sombre
            ? { background: "var(--amber)", borderColor: "white" }
            : undefined
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={sombre ? "#12141C" : "var(--amber)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 22, height: 22 }}
        >
          {children}
        </svg>
      </div>
      <span className="tag" style={sombre ? { color: "var(--amber)" } : undefined}>
        {libelle}
      </span>
    </div>
  );
}

/**
 * Une ligne du titre du hero, lettre par lettre : chaque lettre monte
 * depuis le bas d'un masque, l'une après l'autre. Le texte lisible (pour
 * les lecteurs d'écran et les moteurs de recherche) est dans le `h1`.
 */
function Ligne({ texte, delai, accent = false }) {
  return (
    <span
      className={`hero-ligne${accent ? " hero-ligne--accent" : ""}`}
      aria-hidden="true"
    >
      {[...texte].map((c, i) => (
        <span
          key={i}
          className="lettre"
          style={{ "--d": `${(delai + i * 0.03).toFixed(3)}s` }}
        >
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}

/** Icône agrandie d'un panneau : son tracé se dessine à l'arrivée. */
function IconePanneau({ children }) {
  return (
    <svg
      className="panneau__icone"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function LandingPage() {
  useReveal();
  const pile = usePile();

  return (
    <div className="vitrine">
      <RouteDefilement />

      {/* ── HERO ──────────────────────────────── */}
      <section className="hero">
        <PareBrise images={HERO_IMGS} />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="hero-route" aria-hidden="true" />

        <div className="hero-grille">
          <div className="hero-texte">
            <p className="hero-sujet entree" style={{ "--d": "0.1s" }}>
              Convoyage de véhicules en France et en Europe
            </p>
            <h1 className="hero-titre display">
              <span className="sr-only">Votre mobilité. Notre priorité.</span>
              <Ligne texte="Votre mobilité." delai={0.2} />
              <Ligne texte="Notre priorité." delai={0.55} accent />
            </h1>
            <p className="hero-sub entree" style={{ "--d": "0.95s" }}>
              Drive Line Connect transfère vos véhicules partout en France et en
              Europe. Un interlocuteur unique, des conducteurs formés à nos
              procédures, une assurance et des délais garantis.
            </p>
            <div className="hero-ctas entree" style={{ "--d": "1.05s" }}>
              <a href="#solutions" className="btn-primary">
                Découvrez nos solutions
                <Fleche />
              </a>
              <Link to="/etre-rappele" className="btn-outline">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.9 2.2z" />
                </svg>
                Faites-vous rappeler
              </Link>
            </div>
            <p className="hero-note entree" style={{ "--d": "1.15s" }}>
              Rappel garanti sous 48 heures ouvrées par un expert convoyage.
            </p>
          </div>

          <TableauDeBord />
        </div>
      </section>

      <Confiance />

      {/* ── SOLUTIONS ─────────────────────────────── */}
      {/* Le CTA principal du hero pointe ici : « Découvrez nos solutions »
          doit atterrir sur ce que l'on sait faire, pas sur un formulaire. */}
      <span id="solutions" className="anchor-offset" aria-hidden="true" />
      <section id="services" className="solutions">
        <div className="solutions__contenu">
          <Repere km="0" libelle="KM 0 · DÉPART">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M22 12h-4M6 12H2" />
          </Repere>

          <h2 className="display titre-geant reveal">Nos solutions clients</h2>

          {/* Quatre repères avant le détail des prestations : ce sont les
              objections que soulève un donneur d'ordre avant même de
              regarder ce que nous faisons. */}
          <div className="services-reperes reveal">
            {[
              {
                titre: "Sécurité",
                texte: "Vos véhicules entre de bonnes mains",
                path: "M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6l7-3z",
              },
              {
                titre: "Réactivité",
                texte: "Disponibles 7j/7 et partout en France",
                path: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
              },
              {
                titre: "Couverture",
                texte: "France entière et Europe",
                path: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
              },
              {
                titre: "Experts",
                texte: "Une équipe et un réseau de convoyeurs qualifiés",
                path: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a3 3 0 100-6M15 20a6 6 0 016-6",
              },
            ].map((r) => (
              <div className="services-repere" key={r.titre}>
                <span className="services-repere__icone">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--asphalt)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={r.path} pathLength="1" />
                  </svg>
                </span>
                <div>
                  <div className="services-repere__titre">{r.titre}</div>
                  <p className="services-repere__texte">{r.texte}</p>
                </div>
              </div>
            ))}
          </div>

          <span id="entreprises" className="anchor-offset" aria-hidden="true" />

          {/* Les prestations se recouvrent au défilement : chaque panneau
              reste accroché pendant que le suivant passe par-dessus. */}
          <div className="pile" ref={pile}>
            <article className="panneau panneau--clair" style={{ "--i": 0 }}>
              <div className="panneau__texte">
                <h3>Livraison de véhicules</h3>
                <p>
                  Une livraison complète, du premier kilomètre à la remise
                  finale, en moins de 24 heures partout en France.
                </p>
                <ul className="panneau__puces">
                  <li>Suivi en temps réel</li>
                  <li>Remise des clés sécurisée</li>
                </ul>
              </div>
              <div className="panneau__visuel" aria-hidden="true">
                <IconePanneau>
                  <path
                    d="M3 12l2-6h11l3 6M3 12v6h2M20 12v6h-2M5 18a2 2 0 104 0 2 2 0 00-4 0zM15 18a2 2 0 104 0 2 2 0 00-4 0zM9 18h6"
                    pathLength="1"
                  />
                </IconePanneau>
                <span className="panneau__mot">24 H</span>
              </div>
            </article>

            <article className="panneau panneau--marine" style={{ "--i": 1 }}>
              <div className="panneau__texte">
                <h3>Transfert de véhicules</h3>
                <p>
                  Voitures, vans et camions transférés à travers toute
                  l'Europe.
                </p>
                <ul className="panneau__puces">
                  <li>Réseau européen</li>
                  <li>Transport sécurisé</li>
                </ul>
              </div>
              <div className="panneau__visuel" aria-hidden="true">
                <IconePanneau>
                  <path
                    d="M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14"
                    pathLength="1"
                  />
                </IconePanneau>
                <span className="panneau__mot">Europe</span>
              </div>
            </article>

            <article className="panneau panneau--ambre" style={{ "--i": 2 }}>
              <div className="panneau__texte">
                <h3>Transport de véhicules</h3>
                <p>
                  Véhicules roulants ou non roulants, transportés par camion en
                  lot ou à l'unité.
                </p>
                <ul className="panneau__puces">
                  <li>Solutions adaptées</li>
                  <li>Matériel récent et sécurisé</li>
                </ul>
              </div>
              <div className="panneau__visuel" aria-hidden="true">
                <IconePanneau>
                  <path
                    d="M3 16V7a1 1 0 011-1h9v10H3zM13 10h4l4 4v2h-8v-6z"
                    pathLength="1"
                  />
                  <circle cx="7" cy="18" r="2" pathLength="1" />
                  <circle cx="17" cy="18" r="2" pathLength="1" />
                </IconePanneau>
                <span className="panneau__mot">En lot</span>
              </div>
            </article>

            <aside className="panneau panneau--asphalte" style={{ "--i": 3 }}>
              <div className="panneau__texte">
                <p className="panneau__sujet">
                  Concessions, loueurs, gestionnaires de flottes, entreprises
                </p>
                <h3>Parlons de vos volumes</h3>
                <ul className="panneau__liste">
                  <li>Véhicules assurés porte à porte</li>
                  <li>Suivi de chaque mission en direct</li>
                  <li>Facturation centralisée</li>
                  <li>Interlocuteur unique dédié</li>
                  <li>Solutions sur mesure</li>
                </ul>
                <Link to="/etre-rappele" className="btn-primary btn-primary--grand">
                  Faites-vous rappeler
                  <Fleche />
                </Link>
                <p className="panneau__note">
                  Quinze minutes au téléphone. Réponse sous 48 h ouvrées, sans
                  engagement.
                </p>
              </div>
              <div className="panneau__visuel" aria-hidden="true">
                <IconePanneau>
                  <path
                    d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.9 2.2z"
                    pathLength="1"
                  />
                </IconePanneau>
                <span className="panneau__mot">48 H</span>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── PREUVES ────────────────────────────────── */}
      {/* Un grand compte vérifie le site avant d'accorder un rendez-vous :
          les noms qui nous font déjà confiance et des chiffres vérifiables
          pèsent plus lourd que n'importe quelle promesse marketing. */}
      <section id="references" className="references">
        <div className="references__contenu">
          <h2 className="display titre-geant titre-geant--moyen reveal">
            Ce qu'ils en disent
          </h2>

          <div className="temoignages reveal">
            <figure className="temoignage temoignage--vedette">
              <div className="temoignage-etoiles" aria-label="5 étoiles sur 5">
                ★★★★★
              </div>
              <blockquote>
                « DriveLineConnect est notre partenaire depuis près de six mois
                et nous sommes très satisfaits de cette collaboration. Son
                professionnalisme, son sens de l'écoute et sa réactivité font
                toute la différence au quotidien. Rien à redire : un partenaire
                fiable et efficace que je recommande vivement pour la gestion de
                flotte automobile. »
              </blockquote>
              <figcaption>
                <strong>GRDF</strong>
                <span>Avis Trustpilot</span>
              </figcaption>
            </figure>
            <figure className="temoignage">
              <div className="temoignage-etoiles" aria-label="5 étoiles sur 5">
                ★★★★★
              </div>
              <blockquote>
                « Driveline Connect est un très bon partenaire avec qui nous
                travaillons depuis décembre 2025. Les convoyages se font
                toujours dans les délais demandés par le client, nous n'avons
                jamais eu de mauvais retour de la part de nos collaborateurs
                quant à la qualité de leurs services. Je recommande à 100 %
                cette société de convoyage ! Nous sommes très satisfaits des
                services proposés et de leur réactivité par mail. »
              </blockquote>
              <figcaption>
                <strong>EQUANS</strong>
                <span>Avis Trustpilot</span>
              </figcaption>
            </figure>
            <figure className="temoignage">
              <div className="temoignage-etoiles" aria-label="5 étoiles sur 5">
                ★★★★★
              </div>
              <blockquote>
                « En partenariat avec DriveLineConnect depuis bientôt 3 ans. Je
                suis très satisfait de leur qualité de service et de leur
                réactivité, que ce soit pour la demande de prix, la gestion des
                imprévus ou tout simplement pour leurs délais de transport. Je
                recommande à 100 %. »
              </blockquote>
              <figcaption>
                <strong>Groupe 2L Logistics</strong>
                <span>Avis Trustpilot</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <SectionChiffres />

      {/* ── QUI SOMMES-NOUS ───────────────────────── */}
      <section id="about" className="about">
        <div className="about__contenu">
          <Repere km="250" libelle="KM 250 · QUI SOMMES-NOUS">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </Repere>
          <h2 className="display titre-geant titre-geant--moyen reveal">
            Qui sommes-nous ?
          </h2>
          <div className="about-grid">
            <div className="about-left reveal">
              <p>
                Drive Line Connect est un acteur spécialisé dans le convoyage et
                le transport de véhicules en France et en Europe.
              </p>
              <p>
                Nous accompagnons au quotidien les professionnels de
                l&apos;automobile, les gestionnaires de flottes et les
                entreprises dans leurs besoins de mobilité, du transfert
                ponctuel au déploiement de volumes importants.
              </p>
              <p>
                Notre force repose sur un réseau de convoyeurs professionnels,
                une organisation réactive et un suivi rigoureux de chaque
                mission, de la prise en charge du véhicule jusqu&apos;à la
                remise des clés.
              </p>
              <Link to="/etre-rappele" className="link-arrow">
                En savoir plus
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ width: 16, height: 16 }}
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
            <div className="reveal">
              <div className="feature-item">
                <div className="feature-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--teal)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 22, height: 22 }}
                  >
                    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a3 3 0 100-6M15 20a6 6 0 016-6" />
                  </svg>
                </div>
                <div>
                  <h4>Une organisation pensée pour les professionnels</h4>
                  <p>
                    Un interlocuteur unique, un suivi centralisé et des
                    procédures maîtrisées pour assurer chaque mission avec
                    efficacité et traçabilité.
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--teal)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 22, height: 22 }}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
                  </svg>
                </div>
                <div>
                  <h4>Une couverture nationale et européenne</h4>
                  <p>
                    Grâce à notre réseau de convoyeurs, nous répondons aussi
                    bien aux besoins ponctuels qu&apos;aux opérations
                    multi-sites et aux volumes récurrents, en France comme en
                    Europe.
                  </p>
                </div>
              </div>

              {/* La formule ferme la section : après avoir exposé le
                  fonctionnement, elle énonce la position. Sans elle, la
                  colonne s'arrête sur un dernier argument plutôt que sur
                  une intention. */}
              <p className="about-signature">
                Plus qu&apos;un prestataire, Drive Line Connect devient le
                partenaire mobilité de ses clients.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONVOYEUR : la route ───────────────────── */}
      {/* Le recrutement se fait au volant : la route file vers l'horizon
          sous le titre, les tirets viennent vers le visiteur. */}
      <section id="convoy" className="convoy">
        <div className="route3d" aria-hidden="true">
          <div className="route3d__plan">
            <span className="route3d__axe" />
          </div>
        </div>

        <div className="convoy__contenu">
          <Repere km="340" libelle="KM 340 · REJOIGNEZ LA ROUTE" sombre>
            <path d="M5 17h14M7 17v-5l2-5h6l2 5v5M9 12h6" />
            <circle cx="8" cy="17" r="1.5" />
            <circle cx="16" cy="17" r="1.5" />
          </Repere>
          <h2 className="display convoy__titre reveal">Devenez convoyeur</h2>
          <p className="convoy__desc reveal">
            En tant que convoyeur partenaire, accédez chaque mois à de
            nombreuses missions à travers l'Europe. Restez maître de votre
            emploi du temps, en choisissant les horaires et les missions qui
            vous conviennent.
          </p>
          <ul className="convoy__atouts reveal">
            <li>Missions régulières</li>
            <li>Paiement sous 15 jours</li>
            <li>France &amp; Europe</li>
          </ul>
          <Link
            to="/devenir-convoyeur"
            className="btn-primary btn-primary--grand reveal"
            style={{ display: "inline-flex" }}
          >
            Devenir convoyeur
            <Fleche />
          </Link>
        </div>
      </section>
    </div>
  );
}
