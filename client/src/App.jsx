import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// Layouts
import PublicLayout from "./layouts/PublicLayout";
import DashboardLayout from "./layouts/DashboardLayout";

// Pages publiques
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Pages Client
import ClientDashboard from "./pages/client/ClientDashboard";
import NewMission from "./pages/client/NewMission";
import MissionDetail from "./pages/client/MissionDetail";

// Pages Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminMissions from "./pages/admin/AdminMissions";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminDemandes from "./pages/admin/AdminDemandes";
import AdminMap from "./pages/admin/AdminMap";
import AdminKaze from "./pages/admin/AdminKaze";

// Pages Convoyeur
import ConvoyeurDashboard from "./pages/convoyeur/ConvoyeurDashboard";
import MissionsDisponibles from "./pages/convoyeur/MissionsDisponibles";
import ConvoyeurProfil from "./pages/convoyeur/ConvoyeurProfil";
// ── Route protégée ──────────────────────────────────────────
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  const { user } = useAuth();

  // Redirige vers le bon dashboard selon le rôle
  const getDashboardPath = () => {
    if (!user) return "/login";
    switch (user.role) {
      case "admin":
        return "/admin";
      case "convoyeur":
        return "/convoyeur";
      default:
        return "/client";
    }
  };

  return (
    <Routes>
      {/* ── Pages publiques ──────────────────── */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* ── Dashboard Client ─────────────────── */}
      <Route
        path="/client"
        element={
          <ProtectedRoute roles={["client"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ClientDashboard />} />
        <Route path="nouvelle-mission" element={<NewMission />} />
        <Route path="missions/:id" element={<MissionDetail />} />
      </Route>

      {/* ── Dashboard Admin ──────────────────── */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="missions" element={<AdminMissions />} />
        <Route path="carte" element={<AdminMap />} />
        <Route path="utilisateurs" element={<AdminUsers />} />
        <Route path="demandes" element={<AdminDemandes />} />
        <Route path="kaze" element={<AdminKaze />} />
      </Route>

      {/* ── Portail Convoyeur ────────────────── */}
      <Route
        path="/convoyeur"
        element={
          <ProtectedRoute roles={["convoyeur"]}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ConvoyeurDashboard />} />
        <Route path="disponibles" element={<MissionsDisponibles />} />
        <Route path="profil" element={<ConvoyeurProfil />} />
      </Route>

      {/* ── Raccourci dashboard ──────────────── */}
      <Route
        path="/dashboard"
        element={<Navigate to={getDashboardPath()} replace />}
      />

      {/* ── 404 ──────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
