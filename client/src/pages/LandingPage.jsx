import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import RappelForm from "../components/RappelForm";
import LogoClient from "../components/LogoClient";
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
    "/images/hero/hero-1.jpg",
    "/images/hero/hero-2.jpg",
    "/images/hero/hero-3.jpg",
    "/images/hero/hero-4.jpg",
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
            Votre véhicule.
            <br />
            <span style={{ color: "var(--amber)" }}>Notre route.</span>
          </h1>
          <p className="hero-sub reveal">
            Drive Line Connect relie entreprises et convoyeurs professionnels
            pour livrer vos véhicules partout en France et en Europe — suivi,
            assurance et délais maîtrisés.
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
            <a href="#rappel" className="btn-outline">
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
            </a>
          </div>
          <p className="hero-note reveal">
            Rappel garanti sous 48 heures ouvrées par un expert convoyage.
          </p>
          <div className="stat-strip reveal">
            <div className="stat">
              <Compteur className="num" valeur={40} suffixe="+" />
              <div className="label">Convoyeurs partenaires</div>
            </div>
            <div className="stat">
              <Compteur className="num" valeur={3500} suffixe="+" />
              <div className="label">Véhicules convoyés</div>
            </div>
            <div className="stat">
              <Compteur className="num" valeur={98} suffixe=" %" />
              <div className="label">Livrés dans les délais</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES ──────────────────────────────── */}
      {/* Le CTA principal du hero pointe ici : « Découvrez nos solutions »
          doit atterrir sur ce que l'on sait faire, pas sur un formulaire. */}
      <span id="solutions" className="anchor-offset" aria-hidden="true" />
      <section
        id="services"
        style={{ background: "var(--cream)", padding: "96px 32px" }}
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
              Nos services
            </h2>
            <div className="rule" />
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 16,
                marginTop: 14,
              }}
            >
              Trois façons de faire voyager un véhicule, du premier kilomètre à
              la remise des clés.
            </p>
          </div>
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
              <h3>Livraison de véhicules</h3>
              <p>
                Une livraison complète, du premier kilomètre à la remise finale,
                en moins de 24 heures partout en France.
              </p>
            </div>
            <div
              className="service-card reveal"
              style={{ background: "var(--navy)", borderColor: "var(--navy)" }}
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
              <h3 style={{ color: "white" }}>Transfert de véhicules</h3>
              <p style={{ color: "rgba(255,255,255,0.75)" }}>
                Voitures, vans et camions transférés à travers toute l'Europe en
                seulement 48 heures.
              </p>
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
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <h3>Prestations sur mesure</h3>
              <p>
                Nettoyage complet, mise en main et état des lieux photographique
                : une solution clé en main.
              </p>
            </div>
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
              Ils nous font confiance
            </h2>
            <div className="rule" />
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 17,
                marginTop: 16,
              }}
            >
              Énergéticiens, constructeurs et groupes de distribution nous
              confient leurs véhicules au quotidien.
            </p>
          </div>

          <div className="logo-row reveal" style={{ marginBottom: 64 }}>
            <LogoClient src="/images/clients/grdf.png" nom="GRDF" />
            <LogoClient src="/images/clients/land-rover.png" nom="Land Rover" />
            <LogoClient
              src="/images/clients/zelle.png"
              nom="Groupe Zelle Logistique"
            />
            <LogoClient src="/images/clients/hertz.png" nom="Hertz" />
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
        style={{ background: "var(--cream-2)", padding: "96px 32px" }}
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
            <span className="tag">KM 180 · QUI SOMMES-NOUS</span>
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
                Drive Line Connect est née de la conviction que l'innovation
                dans les services de mobilité est la clé pour transformer
                l'usage et la gestion des véhicules.
              </p>
              <p
                style={{
                  color: "var(--graphite-soft)",
                  fontSize: 15.5,
                  marginBottom: 22,
                }}
              >
                Nous mettons en relation entreprises et convoyeurs
                professionnels indépendants pour rendre chaque trajet plus
                simple, plus rapide et plus sûr.
              </p>
              <a href="#contact" className="link-arrow">
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
              </a>
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
                    <path d="M12 2l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
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
                    Réseau efficace et sécurisé
                  </h4>
                  <p style={{ fontSize: 14, color: "var(--graphite-soft)" }}>
                    Un réseau de convoyeurs professionnels qui garantit des
                    services rapides et fiables, avec des délais maîtrisés —
                    livraison 24h en France, transfert sécurisé à travers
                    l'Europe.
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
                    <path d="M12 7v5l3 3" />
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
                    Flexibilité et autonomie
                  </h4>
                  <p style={{ fontSize: 14, color: "var(--graphite-soft)" }}>
                    Nos convoyeurs choisissent librement leurs missions,
                    horaires et distances — trajets courts intra-urbains ou
                    longs déplacements internationaux.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLIENT ─────────────────────────────────── */}
      {/* Pendant clair de la section convoyeur : les deux publics ont
          désormais chacun leur invitation, au lieu d'un unique appel qui
          renvoyait tout le monde vers le même formulaire. */}
      <section
        id="entreprises"
        className="section-claire"
        style={{ background: "var(--cream)", padding: "96px 32px" }}
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
                <path d="M3 21h18M5 21V7l7-4 7 4v14" />
                <path d="M9 21v-6h6v6" />
              </svg>
            </div>
            <span className="tag">KM 180 · ENTREPRISES</span>
          </div>
          <h2
            className="display reveal"
            style={{
              fontSize: "clamp(36px,5vw,54px)",
              textTransform: "uppercase",
              color: "var(--navy)",
            }}
          >
            Devenez client
          </h2>
          <p className="desc reveal">
            Concessions, garages, loueurs et gestionnaires de flotte : confiez
            vos livraisons clients, transferts inter-sites et retours de
            location à des convoyeurs vérifiés. Vos véhicules sont assurés
            pendant tout le trajet et vous suivez chaque mission en direct.
          </p>
          <div className="chip-row reveal">
            <div className="chip">VÉHICULES ASSURÉS</div>
            <div className="chip">SUIVI EN TEMPS RÉEL</div>
            <div className="chip">FACTURATION CENTRALISÉE</div>
          </div>
          <a
            href="#rappel"
            className="btn-primary reveal"
            style={{ display: "inline-flex" }}
          >
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
          </a>
          <p
            className="reveal"
            style={{
              fontSize: 15,
              color: "var(--graphite-soft)",
              marginTop: 14,
            }}
          >
            Un expert vous rappelle sous 48 h ouvrées. Sans engagement.{" "}
            <Link
              to="/devenir-client"
              style={{ color: "var(--teal)", fontWeight: 700 }}
            >
              Ou ouvrez directement un compte →
            </Link>
          </p>
        </div>
      </section>

      {/* ── CONVOYEUR (dark) ───────────────────────── */}
      <section id="convoy" className="convoy" style={{ padding: "96px 32px" }}>
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
            <div className="chip">MISSIONS CHAQUE SEMAINE</div>
            <div className="chip">PAIEMENT SOUS 7 JOURS</div>
            <div className="chip">COUVERTURE EUROPE</div>
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

      {/* ── ASSURANCE ──────────────────────────────── */}
      <section
        style={{
          background: "var(--cream)",
          padding: "96px 32px",
          textAlign: "center",
        }}
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
                <path d="M12 2l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <span className="tag">KM 410 · ASSURANCE</span>
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
              Assurance &amp; confiance
            </h2>
            <div className="rule" />
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 16,
                marginTop: 14,
              }}
            >
              La sécurité et le bien-être de nos convoyeurs sont au cœur de nos
              préoccupations. En collaboration avec nos partenaires, nous
              offrons une couverture complète des véhicules et des conducteurs.
            </p>
          </div>
          <div className="logo-row reveal">
            <div className="logo-card">
              <img
                src="/images/assurance/areas.png"
                alt="Areas Assurances"
                style={{ height: 52, width: "auto", objectFit: "contain" }}
              />
            </div>
            <div className="logo-card">
              <img
                src="/images/assurance/tetris.png"
                alt="Tetris Assurance"
                style={{ height: 52, width: "auto", objectFit: "contain" }}
              />
            </div>
            <div className="logo-card">
              <img
                src="/images/assurance/generali.png"
                alt="Generali"
                style={{ height: 52, width: "auto", objectFit: "contain" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── RAPPEL ──────────────────────────── */}
      {/* Ouvrir un compte est un engagement trop lourd pour un premier
          contact : on propose d'abord d'être rappelé, la création de compte
          restant accessible depuis les pages dédiées. */}
      <section
        id="rappel"
        style={{ background: "var(--cream-2)", padding: "96px 32px" }}
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
                <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <span className="tag">DESTINATION · VOUS</span>
          </div>

          <div className="rappel-grid-2">
            <div className="reveal">
              <h2
                className="display"
                style={{
                  fontSize: "clamp(34px,4.6vw,50px)",
                  textTransform: "uppercase",
                  color: "var(--navy)",
                  marginBottom: 20,
                }}
              >
                Parlons de vos convoyages
              </h2>
              <p
                style={{
                  fontSize: 17.5,
                  lineHeight: 1.65,
                  color: "var(--graphite-soft)",
                  marginBottom: 30,
                }}
              >
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
                      Un interlocuteur unique, qui connaît votre dossier de bout
                      en bout.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="rappel-puce">3</span>
                  <div>
                    <strong>Vous recevez une proposition chiffrée</strong>
                    <p>
                      Tout compris : carburant, péages et manutention du
                      véhicule.
                    </p>
                  </div>
                </li>
              </ul>

              <p className="rappel-alt">
                Vous êtes convoyeur professionnel ?{" "}
                <Link to="/devenir-convoyeur">Rejoignez notre réseau →</Link>
              </p>
            </div>

            <div className="reveal" id="contact">
              <RappelForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
