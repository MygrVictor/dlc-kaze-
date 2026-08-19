import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
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
            <Link to="/devenir-client" className="btn-primary">
              Demander un devis
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
            <a href="#services" className="btn-outline">
              Découvrir nos services
            </a>
          </div>
          <div className="stat-strip reveal">
            <div className="stat">
              <div className="num">+40</div>
              <div className="label">Chauffeurs partenaires</div>
            </div>
            <div className="stat">
              <div className="num">+3500</div>
              <div className="label">Véhicules convoyés</div>
            </div>
            <div className="stat">
              <div className="num">100%</div>
              <div className="label">Satisfaction client</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES
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

      {/* ── CONTACT ────────────────────────────────── */}
      <section
        id="contact"
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
          <div className="contact-card reveal">
            <h3
              style={{
                fontSize: 24,
                color: "var(--navy)",
                textAlign: "center",
                marginBottom: 8,
                fontWeight: 800,
              }}
            >
              Créez votre espace
            </h3>
            <p className="sub">
              Client ou convoyeur, les informations demandées diffèrent :
              choisissez votre parcours.
            </p>

            {/* Deux portes distinctes plutôt qu'un formulaire à bascule :
                un transporteur et un donneur d'ordre n'ont ni les mêmes
                attentes ni les mêmes informations à fournir. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginTop: 24,
              }}
            >
              <Link
                to="/devenir-client"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "22px 20px",
                  borderRadius: 14,
                  border: "2px solid rgba(255,209,26,0.55)",
                  background: "rgba(255,209,26,0.10)",
                  textDecoration: "none",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: "var(--amber-deep)",
                  }}
                >
                  ENTREPRISES
                </span>
                <span
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: "var(--navy)",
                  }}
                >
                  Je fais convoyer mes véhicules
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--graphite-soft)",
                  }}
                >
                  Concessions, garages, loueurs : recevez une offre adaptée à
                  vos volumes.
                </span>
                <span
                  style={{
                    marginTop: 6,
                    fontWeight: 700,
                    color: "var(--amber-deep)",
                  }}
                >
                  Devenir client →
                </span>
              </Link>

              <Link
                to="/devenir-convoyeur"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "22px 20px",
                  borderRadius: 14,
                  border: "2px solid rgba(14,116,144,0.45)",
                  background: "rgba(14,116,144,0.08)",
                  textDecoration: "none",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: "var(--teal)",
                  }}
                >
                  CONVOYEURS
                </span>
                <span
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: "var(--navy)",
                  }}
                >
                  Je conduis des missions
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--graphite-soft)",
                  }}
                >
                  Accédez aux missions disponibles et choisissez celles qui vous
                  conviennent.
                </span>
                <span
                  style={{
                    marginTop: 6,
                    fontWeight: 700,
                    color: "var(--teal)",
                  }}
                >
                  Devenir convoyeur →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
