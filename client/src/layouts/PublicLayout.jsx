import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";

export default function PublicLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="mx-auto flex h-[76px] max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
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
              style={{
                height: 38,
                width: "auto",
                maxWidth: 180,
                objectFit: "contain",
                display: "block",
              }}
            />
          </Link>

          {/* Nav desktop */}
          <nav className="hidden md:block">
            <ul
              style={{
                listStyle: "none",
                display: "flex",
                gap: 24,
                alignItems: "center",
              }}
            >
              {[
                { label: "Accueil", href: "/" },
                { label: "Nos services", href: "#services" },
                { label: "Qui sommes-nous", href: "#about" },
                { label: "Devenez convoyeur", href: "#convoy" },
                { label: "Contact", href: "#contact" },
              ].map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 14.5,
                      fontWeight: 500,
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.target.style.color = "white")}
                    onMouseLeave={(e) =>
                      (e.target.style.color = "rgba(255,255,255,0.75)")
                    }
                  >
                    {item.label}
                  </a>
                </li>
              ))}
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
            {[
              { label: "Accueil", href: "/" },
              { label: "Nos services", href: "#services" },
              { label: "Qui sommes-nous", href: "#about" },
              { label: "Devenez convoyeur", href: "#convoy" },
              { label: "Contact", href: "#contact" },
            ].map((item) => (
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

      {/* ── Footer ───────────────────────────────────── */}
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
            02 41 18 85 53 · contact@drivelineconnect.com
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
