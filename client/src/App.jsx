import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// La page d'accueil et son gabarit sont les seuls modules chargés
// immédiatement : ce sont eux que découvre un visiteur venu de Google.
// Tout le reste est découpé en fichiers séparés par `lazy()`, téléchargés
// uniquement lorsque l'internaute emprunte la route correspondante. Sans
// cela, chaque visiteur de la vitrine téléchargeait aussi les espaces
// client, convoyeur et administration — dont la cartographie Leaflet.
import PublicLayout from "./layouts/PublicLayout";
import LandingPage from "./pages/LandingPage";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));

// Pages publiques
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MotDePasseOubliePage = lazy(() => import("./pages/MotDePasseOubliePage"));
const ReinitialiserMotDePassePage = lazy(
  () => import("./pages/ReinitialiserMotDePassePage"),
);
const DevenirConvoyeurPage = lazy(() => import("./pages/DevenirConvoyeurPage"));
const EtreRappelePage = lazy(() => import("./pages/EtreRappelePage"));

// Pages Client
const ClientDashboard = lazy(() => import("./pages/client/ClientDashboard"));
const NewMission = lazy(() => import("./pages/client/NewMission"));
const MissionDetail = lazy(() => import("./pages/client/MissionDetail"));
const ClientFactures = lazy(() => import("./pages/client/ClientFactures"));

// Pages Admin
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminMissions = lazy(() => import("./pages/admin/AdminMissions"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminDemandes = lazy(() => import("./pages/admin/AdminDemandes"));
const AdminMap = lazy(() => import("./pages/admin/AdminMap"));
const AdminKaze = lazy(() => import("./pages/admin/AdminKaze"));
const AdminFactures = lazy(() => import("./pages/admin/AdminFactures"));

// Pages Convoyeur
const ConvoyeurDashboard = lazy(
  () => import("./pages/convoyeur/ConvoyeurDashboard"),
);
const MissionsDisponibles = lazy(
  () => import("./pages/convoyeur/MissionsDisponibles"),
);
const ConvoyeurHistorique = lazy(
  () => import("./pages/convoyeur/ConvoyeurHistorique"),
);
const ConvoyeurProfil = lazy(() => import("./pages/convoyeur/ConvoyeurProfil"));
const ConvoyeurFactures = lazy(
  () => import("./pages/convoyeur/ConvoyeurFactures"),
);

// ── Écran d'attente ─────────────────────────────────────────
// Affiché le temps que le fichier de la page demandée arrive. Il reprend
// l'apparence de l'attente d'authentification pour que la transition ne
// se remarque pas.
function Chargement() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
    </div>
  );
}

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
    <Suspense fallback={<Chargement />}>
      <Routes>
        {/* ── Pages publiques ──────────────────── */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/mot-de-passe-oublie"
            element={<MotDePasseOubliePage />}
          />
          <Route
            path="/reinitialiser-mot-de-passe"
            element={<ReinitialiserMotDePassePage />}
          />
          <Route path="/devenir-convoyeur" element={<DevenirConvoyeurPage />} />
          <Route path="/etre-rappele" element={<EtreRappelePage />} />
          {/* L'ouverture de compte en libre-service laissait entrer des
            dossiers non qualifiés : les comptes clients sont désormais
            créés par nos soins après l'entretien téléphonique. Les liens
            et signets existants restent valides. */}
          <Route
            path="/devenir-client"
            element={<Navigate to="/etre-rappele" replace />}
          />
          <Route
            path="/register"
            element={<Navigate to="/etre-rappele" replace />}
          />
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
          <Route path="factures" element={<ClientFactures />} />
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
          {/* Même formulaire que le client : les champs administratifs
            n'apparaissent que si le compte connecté est admin. */}
          <Route path="nouvelle-mission" element={<NewMission />} />
          <Route path="carte" element={<AdminMap />} />
          <Route path="utilisateurs" element={<AdminUsers />} />
          <Route path="demandes" element={<AdminDemandes />} />
          <Route path="factures" element={<AdminFactures />} />
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
          <Route path="disponibles" element={<MissionsDisponibles />} />{" "}
          <Route path="historique" element={<ConvoyeurHistorique />} />{" "}
          <Route path="profil" element={<ConvoyeurProfil />} />
          <Route path="factures" element={<ConvoyeurFactures />} />
        </Route>

        {/* ── Raccourci dashboard ──────────────── */}
        <Route
          path="/dashboard"
          element={<Navigate to={getDashboardPath()} replace />}
        />

        {/* ── 404 ──────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
