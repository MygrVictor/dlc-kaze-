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
  History,
} from "lucide-react";
import { useState, useEffect } from "react";
import TelephoneRequis from "../components/TelephoneRequis";

/**
 * Reproduit la règle serveur : seuls les mobiles reçoivent WhatsApp.
 */
function mobileManquant(user) {
  if (user?.role !== "convoyeur") return false;
  const chiffres = String(user.phone || "").replace(/\D/g, "");
  if (!chiffres) return true;
  if (/^0[67]\d{8}$/.test(chiffres)) return false;
  if (/^(?:00)?330?[67]\d{8}$/.test(chiffres)) return false;
  return (
    chiffres.startsWith("33") ||
    /^0[1-5,9]/.test(chiffres) ||
    chiffres.length < 10
  );
}

const NAV_ITEMS = {
  client: [
    { label: "Mes missions", path: "/client", icon: FileText },
    {
      label: "Nouvelle mission",
      path: "/client/nouvelle-mission",
      icon: PlusCircle,
    },
  ],
  admin: [
    { label: "Tableau de bord", path: "/admin", icon: BarChart3 },
    { label: "Missions", path: "/admin/missions", icon: FileText },
    { label: "Carte", path: "/admin/carte", icon: MapPin },
    { label: "Utilisateurs", path: "/admin/utilisateurs", icon: Users },
    { label: "Demandes", path: "/admin/demandes", icon: Inbox },
    { label: "Gestion Kaze", path: "/admin/kaze", icon: Zap },
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

  const items = NAV_ITEMS[user?.role] || [];

  // Fetch badge count pour "Missions disponibles" si convoyeur
  useEffect(() => {
    // Inutile tant que le mobile manque : l'API refuserait l'appel.
    if (user?.role === "convoyeur" && !mobileManquant(user)) {
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
  }, [user?.role, user?.phone]);

  // Un convoyeur sans mobile ne peut pas être prévenu des missions :
  // on l'oriente vers la saisie de son numéro avant toute autre chose.
  if (mobileManquant(user)) {
    return <TelephoneRequis />;
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const roleLabel = {
    client: "Espace Client",
    admin: "Administration",
    convoyeur: "Espace Convoyeur",
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-slate-800">
        <Link to="/" className="flex flex-col items-center gap-3">
          <div className="w-full flex justify-center">
            <img
              src="/logo.png"
              alt="DLC Kaze"
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
        <p className="text-xs mt-2 text-center text-slate-400">
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
                    ? "bg-primary-600 text-white shadow-lg shadow-primary-600/20"
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
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-primary-600/20 text-primary-400">
            {user?.full_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">
              {user?.full_name}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="dash min-h-screen flex bg-slate-950 text-slate-100">
      {/* ── Sidebar desktop ──────────────────── */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-30 bg-slate-900 border-r border-slate-800">
        <Sidebar />
      </aside>

      {/* ── Sidebar mobile ───────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 z-50 bg-slate-900 border-r border-slate-800">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar mobile */}
        <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-slate-900 border-b border-slate-800 text-slate-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white"
          >
            <Menu size={24} />
          </button>
          <span className="text-sm font-semibold">{roleLabel[user?.role]}</span>
          <div className="w-6" />
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
