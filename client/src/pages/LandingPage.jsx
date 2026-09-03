import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import BandeauClients from "../components/BandeauClients";
import SectionChiffres from "../components/SectionChiffres";
import Compteur from "../components/Compteur";

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

export default function LandingPage() {
  useReveal();

  const HERO_IMGS = [
    "/images/hero/hero-1.webp",
    "/images/hero/hero-2.webp",
    "/images/hero/hero-3.webp",
    "/images/hero/hero-4.webp",
  ];
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setSlide((s) => (s + 1) % HERO_IMGS.length),
      4500,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {/* ── HERO ──────────────────────────────── */}
      <section
        className="hero"
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* Carousel slides in background */}
        {HERO_IMGS.map((src, i) => (
          <div
            key={src}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${src})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: i === slide ? 0.52 : 0,
              transition: "opacity 1.2s ease",
              zIndex: 0,
            }}
            aria-hidden="true"
          />
        ))}
        {/* Gradient overlay so text stays readable */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(18,20,28,0.52) 0%, rgba(18,20,28,0.35) 60%, rgba(18,20,28,0.62) 100%)",
            zIndex: 1,
          }}
          aria-hidden="true"
        />
        {/* Dots indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
            zIndex: 10,
          }}
        >
          {HERO_IMGS.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              style={{
                width: i === slide ? 22 : 8,
                height: 8,
                borderRadius: 9999,
                background:
                  i === slide ? "var(--amber)" : "rgba(255,255,255,0.35)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: 0,
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        {/* Content above carousel */}
        <div className="hero-inner" style={{ position: "relative", zIndex: 2 }}>
          <div className="eyebrow reveal">
            CONVOYAGE DE VÉHICULES · FRANCE &amp; EUROPE
          </div>
          <h1
            className="display reveal"
            style={{
              fontSize: "clamp(52px,8vw,96px)",
              textTransform: "uppercase",
              color: "white",
              marginBottom: 26,
            }}
          >
            Votre mobilité.
            <br />
            <span style={{ color: "var(--amber)" }}>Notre priorité.</span>
          </h1>
          <p className="hero-sub reveal">
            Drive Line Connect transfert vos véhicules partout en France et en
            Europe. Un interlocuteur unique, des conducteurs formés à nos
            procédures, une assurance et des délais garantis.
          </p>
          <div className="hero-ctas reveal">
            <a href="#solutions" className="btn-primary">
              Découvrez nos solutions
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
          <p className="hero-note reveal">
            Rappel garanti sous 48 heures ouvrées par un expert convoyage.
          </p>
          <div className="stat-strip reveal">
            <div className="stat">
              <Compteur className="num" valeur={50} suffixe="+" />
              <div className="label">chauffeurs partenaires</div>
            </div>
            <div className="stat">
              <Compteur className="num" valeur={4000} suffixe="+" />
              <div className="label">Véhicules convoyés</div>
            </div>
            <div className="stat">
              <Compteur className="num" valeur={100} suffixe=" %" />
              <div className="label">Livrés dans les délais</div>
            </div>
          </div>
        </div>
      </section>

      <BandeauClients />

      {/* ── SERVICES ──────────────────────────────── */}
      {/* Le CTA principal du hero pointe ici : « Découvrez nos solutions »
          doit atterrir sur ce que l'on sait faire, pas sur un formulaire. */}
      <span id="solutions" className="anchor-offset" aria-hidden="true" />
      <section
        id="services"
        style={{ background: "var(--cream)", padding: "60px 32px 96px" }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="waypoint-label reveal">
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
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M22 12h-4M6 12H2" />
              </svg>
            </div>
            <span className="tag">KM 0 · DÉPART</span>
          </div>
          <div className="section-head reveal">
            <h2
              className="display"
              style={{
                fontSize: "clamp(36px,5vw,54px)",
                textTransform: "uppercase",
                color: "var(--navy)",
              }}
            >
              Nos solutions clients
            </h2>
            <div className="rule" />
          </div>
          {/* Ce que nous savons faire à gauche, à qui s'adresser à droite :
              un visiteur qui parcourt les trois prestations a l'invitation
              sous les yeux au moment précis où il se demande qui appeler.
              La reléguer sous la grille faisait perdre cet élan. */}
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
              <div key={r.titre} className="services-repere">
                <span className="services-repere__icone">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--asphalt)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={r.path} />
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
          <div className="services-layout">
            <div className="card-grid">
              <div className="service-card reveal">
                <div className="icon-roundel">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--asphalt)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 26, height: 26 }}
                  >
                    <path d="M3 12l2-6h11l3 6M3 12v6h2M20 12v6h-2M5 18a2 2 0 104 0 2 2 0 00-4 0zM15 18a2 2 0 104 0 2 2 0 00-4 0zM9 18h6" />
                  </svg>
                </div>
                <div>
                  <h3>Livraison de véhicules</h3>
                  <p>
                    Une livraison complète, du premier kilomètre à la remise
                    finale, en moins de 24 heures partout en France.
                  </p>
                  <ul className="service-card__puces">
                    <li>Suivi en temps réel</li>
                    <li>Remise des clés sécurisée</li>
                  </ul>
                </div>
              </div>
              <div
                className="service-card reveal"
                style={{
                  background: "var(--navy)",
                  borderColor: "var(--navy)",
                }}
              >
                <div className="icon-roundel">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--asphalt)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 26, height: 26 }}
                  >
                    <path d="M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ color: "white" }}>Transfert de véhicules</h3>
                  <p style={{ color: "rgba(255,255,255,0.75)" }}>
                    Voitures, vans et camions transférés à travers toute
                    l'Europe.
                  </p>
                  <ul className="service-card__puces service-card__puces--sombre">
                    <li>Réseau européen</li>
                    <li>Transport sécurisé</li>
                  </ul>
                </div>
              </div>
              <div className="service-card reveal">
                <div className="icon-roundel">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--asphalt)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 26, height: 26 }}
                  >
                    <path d="M3 16V7a1 1 0 011-1h9v10H3zM13 10h4l4 4v2h-8v-6z" />
                    <circle cx="7" cy="18" r="2" />
                    <circle cx="17" cy="18" r="2" />
                  </svg>
                </div>
                <div>
                  <h3>Transport de véhicules</h3>
                  <p>
                    Véhicules roulants ou non roulants, transportés par camion
                    en lot ou à l'unité.
                  </p>
                  <ul className="service-card__puces">
                    <li>Solutions adaptées</li>
                    <li>Matériel récent et sécurisé</li>
                  </ul>
                </div>
              </div>
            </div>

            <aside className="services-appel reveal">
              <div className="services-appel__eyebrow">
                CONCESSIONS · LOUEURS · GESTIONNAIRE DE FLOTTES · ENTREPRISES
              </div>
              <h3 className="services-appel__titre">Parlons de vos volumes</h3>
              <ul className="services-appel__liste">
                <li>Véhicules assurés porte à porte</li>
                <li>Suivi de chaque mission en direct</li>
                <li>Facturation centralisée</li>
                <li>Interlocuteur unique dédié</li>
                <li>Solutions sur mesure</li>
              </ul>
              <Link to="/etre-rappele" className="services-appel__cta">
                Faites-vous rappeler
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
              </Link>
              <p className="services-appel__note">
                Quinze minutes au téléphone. Réponse sous 48 h ouvrées, sans
                engagement.
              </p>
            </aside>
          </div>
        </div>
      </section>

      {/* ── PREUVES ────────────────────────────────── */}
      {/* Un grand compte vérifie le site avant d'accorder un rendez-vous :
          les noms qui nous font déjà confiance et des chiffres vérifiables
          pèsent plus lourd que n'importe quelle promesse marketing. */}
      <section
        id="references"
        style={{ background: "white", padding: "88px 32px" }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="section-head reveal">
            <h2
              className="display"
              style={{
                fontSize: "clamp(34px,4.6vw,50px)",
                textTransform: "uppercase",
                color: "var(--navy)",
              }}
            >
              Ce qu'ils en disent
            </h2>
            <div className="rule" />
          </div>

          <div className="temoignages reveal">
            <figure className="temoignage">
              <blockquote>
                « Un interlocuteur unique qui connaît nos sites et nos
                contraintes. On appelle, c'est réglé dans l'heure. »
              </blockquote>
              <figcaption>
                <strong>Responsable de flotte</strong>
                <span>Énergie · 120 véhicules / an</span>
              </figcaption>
            </figure>
            <figure className="temoignage">
              <blockquote>
                « Les états des lieux photo à l'enlèvement et à la livraison ont
                mis fin aux litiges sur les rayures. »
              </blockquote>
              <figcaption>
                <strong>Directeur après-vente</strong>
                <span>Distribution automobile · 8 concessions</span>
              </figcaption>
            </figure>
            <figure className="temoignage">
              <blockquote>
                « Réactivité et proximité : le devis part en trente minutes, le
                convoyeur est affecté le jour même. »
              </blockquote>
              <figcaption>
                <strong>Responsable logistique</strong>
                <span>Loueur longue durée</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <SectionChiffres />

      {/* ── ABOUT ──────────────────────────────────── */}
      <section
        id="about"
        style={{ background: "var(--cream-2)", padding: "60px 32px 96px" }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div className="waypoint-label reveal">
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
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="tag">KM 250 · QUI SOMMES-NOUS</span>
          </div>
          <div className="about-grid">
            <div className="about-left reveal">
              <h2
                className="display"
                style={{
                  fontSize: "clamp(32px,4vw,44px)",
                  textTransform: "uppercase",
                  color: "var(--navy)",
                  marginBottom: 18,
                }}
              >
                Qui sommes-nous ?
              </h2>
              <p
                style={{
                  color: "var(--graphite-soft)",
                  fontSize: 15.5,
                  marginBottom: 22,
                }}
              >
                Drive Line Connect est un acteur spécialisé dans le convoyage et
                le transport de véhicules en France et en Europe.
              </p>
              <p
                style={{
                  color: "var(--graphite-soft)",
                  fontSize: 15.5,
                  marginBottom: 22,
                }}
              >
                Nous accompagnons au quotidien les professionnels de
                l&apos;automobile, les gestionnaires de flottes et les
                entreprises dans leurs besoins de mobilité, du transfert
                ponctuel au déploiement de volumes importants.
              </p>
              <p
                style={{
                  color: "var(--graphite-soft)",
                  fontSize: 15.5,
                  marginBottom: 22,
                }}
              >
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
                  <h4
                    style={{
                      fontSize: 16.5,
                      color: "var(--navy)",
                      marginBottom: 6,
                      fontWeight: 700,
                    }}
                  >
                    Une organisation pensée pour les professionnels
                  </h4>
                  <p style={{ fontSize: 14, color: "var(--graphite-soft)" }}>
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
                  <h4
                    style={{
                      fontSize: 16.5,
                      color: "var(--navy)",
                      marginBottom: 6,
                      fontWeight: 700,
                    }}
                  >
                    Une couverture nationale et européenne
                  </h4>
                  <p style={{ fontSize: 14, color: "var(--graphite-soft)" }}>
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

      {/* ── CONVOYEUR (dark) ───────────────────────── */}
      <section
        id="convoy"
        className="convoy"
        style={{ padding: "60px 32px 96px" }}
      >
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
                <path d="M5 17h14M7 17v-5l2-5h6l2 5v5M9 12h6" />
                <circle cx="8" cy="17" r="1.5" />
                <circle cx="16" cy="17" r="1.5" />
              </svg>
            </div>
            <span className="tag" style={{ color: "var(--amber)" }}>
              KM 340 · REJOIGNEZ LA ROUTE
            </span>
          </div>
          <h2
            className="display reveal"
            style={{
              fontSize: "clamp(36px,5vw,54px)",
              textTransform: "uppercase",
              color: "white",
            }}
          >
            Devenez convoyeur
          </h2>
          <p className="desc reveal">
            En tant que convoyeur partenaire, accédez chaque mois à de
            nombreuses missions à travers l'Europe. Restez maître de votre
            emploi du temps, en choisissant les horaires et les missions qui
            vous conviennent.
          </p>
          <div className="chip-row reveal">
            <div className="chip">MISSIONS RÉGULIÈRES</div>
            <div className="chip">PAIEMENT SOUS 15 JOURS</div>
            <div className="chip">FRANCE & EUROPE</div>
          </div>
          <Link
            to="/devenir-convoyeur"
            className="btn-primary reveal"
            style={{ display: "inline-flex" }}
          >
            Devenir convoyeur
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
          </Link>
        </div>
      </section>
    </>
  );
}
