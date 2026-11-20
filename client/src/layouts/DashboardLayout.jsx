import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import {
  Truck,
  LayoutDashboard,
  PlusCircle,
  Users,
  FileText,
  LogOut,
  ChevronRight,
  BarChart3,
  Menu,
  X,
  User,
  MapPin,
  Zap,
  Inbox,
  Receipt,
  FolderOpen,
  History,
  TrendingUp,
  Sun,
  Moon,
  ExternalLink,
  Copy,
} from "lucide-react";
import { useState, useEffect } from "react";
import CrispChat from "../components/CrispChat";

const NAV_ITEMS = {
  client: [
    { label: "Mes missions", path: "/client", icon: FileText },
    {
      label: "Nouvelle mission",
      path: "/client/nouvelle-mission",
      icon: PlusCircle,
    },
    {
      label: "Récapitulatifs",
      path: "/client/recaps",
      icon: FileText,
    },
    {
      label: "Mes factures et devis",
      path: "/client/devis",
      icon: Receipt,
    },
    {
      label: "Mes documents",
      path: "/client/documents",
      icon: FolderOpen,
    },
    { label: "Analyse", path: "/client/analyse", icon: TrendingUp },
  ],
  admin: [
    { label: "Tableau de bord", path: "/admin", icon: BarChart3 },
    { label: "Missions", path: "/admin/missions", icon: FileText },
    { label: "Analyse", path: "/admin/analyse", icon: TrendingUp },
    { label: "Carte", path: "/admin/carte", icon: MapPin },
    { label: "Utilisateurs", path: "/admin/utilisateurs", icon: Users },
    { label: "Demandes", path: "/admin/demandes", icon: Inbox },
    { label: "Santé API Kaze", path: "/admin/kaze", icon: Zap },
  ],
  convoyeur: [
    { label: "Mon planning", path: "/convoyeur", icon: LayoutDashboard },
    {
      label: "Missions disponibles",
      path: "/convoyeur/disponibles",
      icon: FileText,
    },
    {
      label: "Historique",
      path: "/convoyeur/historique",
      icon: History,
    },
    { label: "Mes factures", path: "/convoyeur/factures", icon: Receipt },
    {
      label: "Mon profil & Kaze",
      path: "/convoyeur/profil",
      icon: User,
    },
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [missionsDispoCount, setMissionsDispoCount] = useState(0);
  const [dansTelegram, setDansTelegram] = useState(false);
  const [estAndroid, setEstAndroid] = useState(false);
  const [estIos, setEstIos] = useState(false);
  const [copieOk, setCopieOk] = useState(false);

  // Thème du tableau de bord. Le choix est propre à l'appareil (un même
  // convoyeur peut préférer le clair en plein soleil et le sombre le soir),
  // donc localStorage plutôt qu'une préférence en base.
  // Sans choix enregistré, on suit le réglage de l'appareil plutôt que
  // d'imposer le sombre : un client au bureau, en plein jour, ouvrait un
  // tableau de bord nocturne.
  const [theme, setTheme] = useState(() => {
    try {
      const enregistre = localStorage.getItem("dlc-theme");
      if (enregistre) return enregistre;
    } catch {
      /* stockage indisponible : on retombe sur le réglage système */
    }
    return window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });

  // N'enregistre que le choix explicite de l'utilisateur : persister le
  // thème déduit figerait le réglage système du jour de la première visite.
  const basculerTheme = (suivant) => {
    setTheme(suivant);
    try {
      localStorage.setItem("dlc-theme", suivant);
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
  };

  useEffect(() => {
    const ua = navigator?.userAgent || "";
    setDansTelegram(/telegram/i.test(ua));
    setEstAndroid(/android/i.test(ua));
    setEstIos(/iphone|ipad|ipod/i.test(ua));
  }, []);

  const items = NAV_ITEMS[user?.role] || [];

  // Fetch badge count pour "Missions disponibles" si convoyeur
  useEffect(() => {
    if (user?.role === "convoyeur") {
      const fetchCount = async () => {
        try {
          const { data } = await api.get(
            "/convoyeur/missions-disponibles-count",
          );
          setMissionsDispoCount(data.count || 0);
        } catch (err) {
          console.error("Erreur badge :", err);
        }
      };
      fetchCount();
      // Refresh toutes les 30s
      const interval = setInterval(fetchCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const copierLienCourant = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopieOk(true);
      setTimeout(() => setCopieOk(false), 2000);
    } catch {
      setCopieOk(false);
    }
  };

  const lienIntentChrome = (() => {
    try {
      const url = new URL(window.location.href);
      const chemin = `${url.pathname}${url.search}${url.hash}`;
      return `intent://${url.host}${chemin}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
    } catch {
      return null;
    }
  })();

  const roleLabel = {
    client: "Espace Client",
    admin: "Administration",
    convoyeur: "Espace Convoyeur",
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={`p-5 border-b ${
          theme === "light" ? "border-slate-200" : "border-slate-800"
        }`}
      >
        <Link to="/" className="flex flex-col items-center gap-3">
          <div className="w-full flex justify-center">
            <img
              src="/logo.png"
              alt="Drive Line Connect"
              className="h-16 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextElementSibling.style.display = "flex";
              }}
            />
            <div className="items-center gap-2 hidden">
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <Truck size={20} className="text-white" />
              </div>
              <span className="text-lg font-bold text-white">
                DLC <span className="text-primary-400">Kaze</span>
              </span>
            </div>
          </div>
        </Link>
        <p
          className={`text-xs mt-2 text-center ${
            theme === "light" ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {roleLabel[user?.role]}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const showBadge =
            user?.role === "convoyeur" &&
            item.path === "/convoyeur/disponibles" &&
            missionsDispoCount > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative
                ${
                  isActive
                    ? "bg-amber text-navy font-semibold shadow-lg shadow-amber/10"
                    : theme === "light"
                      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
            >
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold text-white bg-red-500">
                  {missionsDispoCount > 9 ? "9+" : missionsDispoCount}
                </span>
              )}
              {isActive && <ChevronRight size={14} />}
            </Link>
          );
        })}
      </nav>

      {/* User info & logout */}
      <div
        className={`p-4 border-t ${
          theme === "light" ? "border-slate-200" : "border-slate-800"
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
              theme === "light"
                ? "bg-primary-100 text-primary-700"
                : "bg-primary-600/20 text-primary-400"
            }`}
          >
            {user?.full_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium truncate ${
                theme === "light" ? "text-slate-900" : "text-slate-100"
              }`}
            >
              {user?.full_name}
            </p>
            <p
              className={`text-xs truncate ${
                theme === "light" ? "text-slate-500" : "text-slate-500"
              }`}
            >
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => basculerTheme(theme === "dark" ? "light" : "dark")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
              theme === "light"
                ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
            title={theme === "dark" ? "Mode clair" : "Mode sombre"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline text-xs">
              {theme === "dark" ? "Clair" : "Sombre"}
            </span>
          </button>
          <button
            onClick={handleLogout}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
              theme === "light"
                ? "text-slate-600 hover:text-red-700 hover:bg-red-50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Déconnexion"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline text-xs">Sortir</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`dash min-h-screen flex text-slate-100 ${
        theme === "light" ? "theme-light bg-slate-100" : "bg-slate-950"
      }`}
    >
      {/* Messagerie réservée aux clients : les convoyeurs passent par
          l'équipe opérationnelle, et les administrateurs sont de l'autre
          côté de la conversation. */}
      {user?.role === "client" && <CrispChat user={user} />}
      {/* ── Sidebar desktop ──────────────────── */}
      <aside
        className={`dash-sidebar hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-30 border-r ${
          theme === "light"
            ? "bg-white border-slate-200"
            : "bg-slate-900 border-slate-800"
        }`}
      >
        <Sidebar />
      </aside>

      {/* ── Sidebar mobile ───────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className={`dash-sidebar absolute left-0 top-0 bottom-0 w-64 z-50 border-r ${
              theme === "light"
                ? "bg-white border-slate-200"
                : "bg-slate-900 border-slate-800"
            }`}
          >
            <Sidebar />
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────── */}
      {/* `min-w-0` est indispensable : sans lui, un enfant flex refuse de
         rétrécir sous sa largeur de contenu (une adresse longue, un tableau)
         et pousse la page au-delà de la fenêtre, laissant apparaître le fond
         clair du `body` sur la droite. */}
      <div className="flex-1 min-w-0 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar mobile */}
        <header
          className={`dash-topbar lg:hidden flex items-center justify-between px-4 h-14 border-b ${
            theme === "light"
              ? "bg-white border-slate-200 text-slate-900"
              : "bg-slate-900 border-slate-800 text-slate-100"
          }`}
        >
          <button aria-label="Ouvrir le menu"
            onClick={() => setSidebarOpen(true)}
            className={
              theme === "light"
                ? "text-slate-600 hover:text-slate-900"
                : "text-slate-400 hover:text-white"
            }
          >
            <Menu size={24} />
          </button>
          <span className="text-sm font-semibold">{roleLabel[user?.role]}</span>
          {/* Le sélecteur de thème vit dans la barre latérale, invisible sur
              mobile tant qu'on ne l'ouvre pas : on le redouble ici. */}
          <button
            onClick={() => basculerTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Mode clair" : "Mode sombre"}
            className={
              theme === "light"
                ? "text-slate-600 hover:text-slate-900 p-1"
                : "text-slate-400 hover:text-white p-1"
            }
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden p-3 sm:p-6 lg:p-8">
          {user?.role === "convoyeur" && dansTelegram && (
            <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">
                Ouvert dans le navigateur interne Telegram
              </p>
              <p className="mt-1 text-amber-100/90">
                Telegram garde les liens dans son navigateur interne. Pour
                basculer vers votre app web installée, ouvrez d'abord ce lien
                dans le navigateur système.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {estAndroid && lienIntentChrome ? (
                  <a
                    href={lienIntentChrome}
                    className="inline-flex items-center gap-1 rounded bg-amber-300 px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-200"
                  >
                    <ExternalLink size={14} />
                    Ouvrir dans Chrome
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        window.location.href,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    className="inline-flex items-center gap-1 rounded bg-amber-300 px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-200"
                  >
                    <ExternalLink size={14} />
                    Ouvrir un nouvel onglet
                  </button>
                )}
                <button
                  type="button"
                  onClick={copierLienCourant}
                  className="inline-flex items-center gap-1 rounded border border-amber-300/60 px-2.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10"
                >
                  <Copy size={14} />
                  {copieOk ? "Lien copié" : "Copier le lien"}
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-200/90">
                {estIos
                  ? "iPhone/iPad : dans Telegram, utilisez Partager → Ouvrir dans Safari, puis lancez l'app installée."
                  : estAndroid
                    ? "Android : si besoin, après copie du lien, collez-le dans Chrome puis ouvrez l'app installée."
                    : "Ouvrez ce lien dans votre navigateur habituel pour retrouver l'app installée."}
              </p>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
