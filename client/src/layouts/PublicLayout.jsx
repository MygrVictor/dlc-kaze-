import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";

const LIENS = [
  { label: "Accueil", href: "/" },
  { label: "Nos solutions clients", href: "#solutions" },
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

export default function PublicLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const sectionActive = useSectionActive();

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ───────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(18,20,28,0.94)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,209,26,0.15)",
        }}
      >
        <div className="mx-auto flex h-[72px] w-full max-w-[1700px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-10 xl:px-20 md:h-[88px]">
          {/* Logo */}
          <Link
            to="/"
            className="logo"
            aria-label="Accueil Drive Line Connect"
            style={{ minWidth: 0 }}
          >
            <img
              src="/logo.png"
              alt="Drive Line Connect"
              className="nav-logo"
              style={{
                width: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />
          </Link>

          {/* Nav desktop */}
          <nav className="nav-desktop hidden md:block">
            <ul
              style={{
                listStyle: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              {LIENS.map((item) => {
                const cible = item.href.startsWith("#")
                  ? item.href.slice(1)
                  : "accueil";
                const estActif = sectionActive === cible;

                return (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className={`nav-lien${estActif ? " nav-lien--actif" : ""}`}
                      aria-current={estActif ? "true" : undefined}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Account button desktop */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link to="/dashboard" className="btn-account">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
                </svg>
                Mon espace
              </Link>
            ) : (
              <Link to="/login" className="btn-account">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
                </svg>
                Mon compte
              </Link>
            )}
          </div>

          {/* Burger mobile */}
          <button
            className="md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              color: "white",
              fontSize: 22,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            aria-label="Menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            style={{
              background: "rgba(18,20,28,0.98)",
              borderTop: "1px solid rgba(255,209,26,0.1)",
              padding: "16px 32px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {LIENS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 15,
                  fontWeight: 500,
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {item.label}
              </a>
            ))}
            <Link
              to={user ? "/dashboard" : "/login"}
              onClick={() => setMenuOpen(false)}
              className="btn-primary"
              style={{ marginTop: 12, justifyContent: "center" }}
            >
              {user ? "Mon espace" : "Connexion"}
            </Link>
          </div>
        )}
      </header>

      {/* ── Content ──────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

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
              src="/logo.png"
              alt="Drive Line Connect"
              style={{ height: 44, width: "auto", objectFit: "contain" }}
            />
          </div>
          <div
            style={{
              color: "white",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13.5,
              marginBottom: 20,
            }}
          >
            06 69 58 34 30 
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 26,
              fontSize: 13,
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
