import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import GoogleAnalytics from "../components/GoogleAnalytics";
import "./navbar.css";

const LIENS = [
  { label: "Accueil", href: "/" },
  { label: "Devenir client", href: "#solutions" },
  { label: "Nos chiffres", href: "#chiffres" },
  { label: "Qui sommes-nous", href: "#about" },
  { label: "Devenez convoyeur", href: "#convoy" },
];

/**
 * Suit la section actuellement à l'écran pour souligner le lien
 * correspondant.
 *
 * On déclenche le changement lorsque la section franchit le tiers supérieur
 * de la fenêtre plutôt qu'à son entrée : à la lecture, c'est la partie
 * haute de l'écran que l'on considère comme « l'endroit où l'on est ».
 * La dernière section franchie l'emporte, ce qui évite les hésitations
 * quand deux sections sont visibles simultanément.
 */
function useSectionActive() {
  const [actif, setActif] = useState("");

  useEffect(() => {
    const ancres = LIENS.filter((l) => l.href.startsWith("#")).map((l) =>
      l.href.slice(1),
    );

    const relever = () => {
      const seuil = window.innerHeight / 3;
      let courant = "";

      for (const id of ancres) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= seuil) {
          courant = id;
        }
      }

      // Tout en haut de page, aucune section n'est encore atteinte :
      // c'est « Accueil » qui doit être mis en avant.
      setActif(window.scrollY < 120 ? "accueil" : courant);
    };

    relever();
    window.addEventListener("scroll", relever, { passive: true });
    window.addEventListener("resize", relever);
    return () => {
      window.removeEventListener("scroll", relever);
      window.removeEventListener("resize", relever);
    };
  }, []);

  return actif;
}

/**
 * Gestion du défilement entre les pages du site.
 *
 * - Changement de page sans ancre : retour en haut (sinon on arrivait sur
 *   « Devenir convoyeur » à la hauteur où l'on avait cliqué sur l'accueil).
 * - Ancre (`/#convoy`) : défilement vers la section, en réessayant le temps
 *   que la page d'accueil (chargée à la demande) soit affichée.
 */
function useDefilementRoutes() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = hash.slice(1);
    let essais = 0;
    let minuteur;
    const viser = () => {
      const cible = document.getElementById(id);
      if (cible) {
        cible.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (essais++ < 20) {
        minuteur = setTimeout(viser, 50);
      }
    };
    viser();
    return () => clearTimeout(minuteur);
  }, [pathname, hash]);
}

const IconeCompte = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
  </svg>
);

const IconeTelephone = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.9 2.2z" />
  </svg>
);

/**
 * Liens de la barre de navigation, avec une pastille qui glisse.
 *
 * La pastille se pose sous le lien de la section en cours et suit la souris
 * (ou le clavier) d'un lien à l'autre ; en la quittant, elle revient à la
 * section en cours. Elle remplace le soulignement : on voit où l'on est, et
 * où l'on va.
 */
function NavLiens({ sectionActive, surAccueil, allerA }) {
  const liste = useRef(null);
  const [survol, setSurvol] = useState(null);
  const [pilule, setPilule] = useState({ x: 0, w: 0, visible: false });
  const [pret, setPret] = useState(false);

  const indexActif = LIENS.findIndex((item) => {
    const cible = item.href.startsWith("#") ? item.href.slice(1) : "accueil";
    return surAccueil && sectionActive === cible;
  });
  const cible = survol ?? (indexActif >= 0 ? indexActif : null);

  useLayoutEffect(() => {
    const mesurer = () => {
      const li = cible === null ? null : liste.current?.children[cible];
      setPilule((p) =>
        li
          ? { x: li.offsetLeft, w: li.offsetWidth, visible: true }
          : { ...p, visible: false },
      );
    };
    mesurer();
    window.addEventListener("resize", mesurer);
    // Les polices changent la largeur des liens après le premier rendu.
    document.fonts?.ready.then(mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, [cible]);

  // Au premier affichage, la pastille se pose sans glisser depuis la gauche.
  useEffect(() => {
    const id = requestAnimationFrame(() => setPret(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="site-nav__rail" onMouseLeave={() => setSurvol(null)}>
      <span
        className={`nav-pilule${pilule.visible ? " nav-pilule--visible" : ""}${pret ? " nav-pilule--pret" : ""}`}
        style={{ transform: `translateX(${pilule.x}px)`, width: pilule.w }}
        aria-hidden="true"
      />
      <ul ref={liste} className="site-nav__liens">
        {LIENS.map((item, i) => {
          const estActif = i === indexActif;
          return (
            <li key={item.label}>
              <a
                href={item.href === "/" ? "/" : `/${item.href}`}
                onClick={(e) => allerA(e, item.href)}
                onMouseEnter={() => setSurvol(i)}
                onFocus={() => setSurvol(i)}
                onBlur={() => setSurvol(null)}
                className={`nav-lien${cible === i ? " nav-lien--cible" : ""}${estActif ? " nav-lien--actif" : ""}`}
                aria-current={estActif ? "true" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PublicLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const sectionActive = useSectionActive();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const surAccueil = pathname === "/";
  const [defile, setDefile] = useState(false);
  useDefilementRoutes();

  // La barre s'opacifie dès que la page quitte le haut : elle reste lisible
  // par-dessus n'importe quelle section, claire ou sombre.
  useEffect(() => {
    const maj = () => setDefile(window.scrollY > 8);
    maj();
    window.addEventListener("scroll", maj, { passive: true });
    return () => window.removeEventListener("scroll", maj);
  }, []);

  /**
   * Les liens de la navbar visent des sections de l'accueil. Depuis une
   * autre page (formulaire de rappel, devenir convoyeur), une simple ancre
   * `#convoy` ne mène nulle part : on repasse donc par l'accueil.
   */
  const allerA = (e, href) => {
    e.preventDefault();
    setMenuOpen(false);
    if (href === "/") {
      if (surAccueil) window.scrollTo({ top: 0, behavior: "smooth" });
      else navigate("/");
      return;
    }
    navigate(`/${href}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ───────────────────────────────────── */}
      <header
        className={`site-nav${defile ? " site-nav--defile" : ""}${menuOpen ? " site-nav--ouvert" : ""}`}
      >
        <div className="site-nav__barre">
          <Link
            to="/"
            className="site-nav__logo"
            aria-label="Accueil Drive Line Connect"
          >
            <img
              src="/logo-mobilite.png"
              alt="Drive Line Connect Mobilité"
              width="1200"
              height="165"
            />
          </Link>

          <nav className="site-nav__principale" aria-label="Navigation principale">
            <NavLiens
              sectionActive={sectionActive}
              surAccueil={surAccueil}
              allerA={allerA}
            />
          </nav>

          <div className="site-nav__droite">
            {pathname !== "/etre-rappele" && (
              <Link to="/etre-rappele" className="nav-cta">
                <IconeTelephone />
                Être rappelé
              </Link>
            )}
            <Link to={user ? "/dashboard" : "/login"} className="nav-compte">
              <IconeCompte />
              {user ? "Mon espace" : "Mon compte"}
            </Link>
          </div>

          <button
            type="button"
            className="nav-burger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {menuOpen && (
          <div className="site-nav__mobile" id="menu-mobile">
            {LIENS.map((item, i) => (
              <a
                key={item.label}
                href={item.href === "/" ? "/" : `/${item.href}`}
                onClick={(e) => allerA(e, item.href)}
                style={{ "--i": i }}
              >
                {item.label}
              </a>
            ))}
            <div className="site-nav__mobile-actions" style={{ "--i": LIENS.length }}>
              {pathname !== "/etre-rappele" && (
                <Link
                  to="/etre-rappele"
                  onClick={() => setMenuOpen(false)}
                  className="nav-cta"
                >
                  <IconeTelephone />
                  Être rappelé
                </Link>
              )}
              <Link
                to={user ? "/dashboard" : "/login"}
                onClick={() => setMenuOpen(false)}
                className="nav-compte"
              >
                <IconeCompte />
                {user ? "Mon espace" : "Connexion"}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Content ──────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>
      <GoogleAnalytics />

      {/* ──  ───────────────────────────────────── */}
      <footer
        style={{
          background: "var(--asphalt)",
          color: "rgba(255,255,255,0.6)",
          padding: "52px 32px 28px",
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 18,
            }}
          >
            <img
              src="/logo-mobilite.png"
              alt="Drive Line Connect Mobilité"
              width="1200"
              height="165"
              style={{ height: 44, width: "auto", objectFit: "contain" }}
            />
          </div>
          <div
            style={{
              color: "white",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              marginBottom: 20,
            }}
          >
            Contact . 02 40 82 42 31
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 26,
              fontSize: 12,
              marginBottom: 28,
              flexWrap: "wrap",
            }}
          >
            {[
              "Mentions légales",
              "Politique de confidentialité",
              "Politique des cookies",
            ].map((label) => (
              <a
                key={label}
                href="#"
                style={{ transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.target.style.color = "var(--amber)")}
                onMouseLeave={(e) =>
                  (e.target.style.color = "rgba(255,255,255,0.6)")
                }
              >
                {label}
              </a>
            ))}
          </div>
          <div
            style={{
              width: "100%",
              height: 1,
              background: "rgba(255,255,255,0.08)",
              marginBottom: 22,
            }}
          />
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            © {new Date().getFullYear()} Drive Line Connect — Tous droits
            réservés
          </div>
        </div>
      </footer>
    </div>
  );
}
