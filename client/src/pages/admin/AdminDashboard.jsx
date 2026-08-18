import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import {
  BarChart3,
  FileText,
  Users,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  ArrowRight,
  MapPin,
  Smartphone,
  RefreshCw,
  Zap,
  Activity,
  CloudOff,
  Cloud,
  AlertTriangle,
  Euro,
  Send,
  X,
  UserCheck,
  Search,
  RotateCcw,
  Signal,
  Wifi,
  WifiOff,
  UserPlus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Calendar,
  Car,
  Phone,
  User,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Missions DLC
  const [missions, setMissions] = useState([]);
  const [missionsLoading, setMissionsLoading] = useState(true);

  // Kaze data
  const [kazeJobs, setKazeJobs] = useState(null);
  const [kazeUsers, setKazeUsers] = useState(null);
  const [kazeHealth, setKazeHealth] = useState(null);
  const [kazeLoading, setKazeLoading] = useState(true);
  const [kazeError, setKazeError] = useState(null);

  // Modals
  const [priceModal, setPriceModal] = useState(null);
  const [priceValue, setPriceValue] = useState("");
  const [priceConvoyeurValue, setPriceConvoyeurValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(null);

  // Assign modal
  const [assignModal, setAssignModal] = useState(null);
  const [convoyeurs, setConvoyeurs] = useState([]);
  const [selectedConvoyeur, setSelectedConvoyeur] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState(null);

  // New mission modal (admin)
  const [newMissionModal, setNewMissionModal] = useState(false);
  const [newMissionForm, setNewMissionForm] = useState({
    client_name: "",
    client_email: "",
    vehicle_plate: "",
    vehicle_brand: "",
    vehicle_model: "",
    vehicle_energy: "",
    departure_address: "",
    departure_date: "",
    departure_contact_name: "",
    departure_contact_phone: "",
    arrival_address: "",
    arrival_date: "",
    arrival_contact_name: "",
    arrival_contact_phone: "",
    comments: "",
    price: "",
    price_convoyeur: "",
    status: "EN_ATTENTE_DE_COTATION",
  });
  const [newMissionLoading, setNewMissionLoading] = useState(false);

  // Recherche par plaque
  const [plateSearch, setPlateSearch] = useState("");
  const [plateResults, setPlateResults] = useState(null);
  const [plateSearching, setPlateSearching] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState("overview");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRecent, setShowRecent] = useState(false);

  const fetchStats = useCallback(() => {
    api
      .get("/admin/stats")
      .then((res) => setStats(res.data))
      .catch(() => setError("Impossible de charger les stats."))
      .finally(() => setLoading(false));
  }, []);

  const fetchMissions = useCallback(() => {
    setMissionsLoading(true);
    api
      .get("/admin/missions?limit=200")
      .then((res) => setMissions(res.data.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false));
  }, []);

  const fetchKazeData = useCallback(async () => {
    setKazeLoading(true);
    setKazeError(null);
    try {
      const [jobsRes, usersRes, healthRes] = await Promise.all([
        api.get("/admin/kaze/jobs"),
        api.get("/admin/kaze/users"),
        api.get("/admin/kaze-health").catch(() => ({ data: null })),
      ]);
      setKazeJobs(jobsRes.data);
      setKazeUsers(usersRes.data);
      setKazeHealth(healthRes.data);
    } catch (err) {
      console.error("Kaze error:", err);
      setKazeError("Impossible de charger les données Kaze.");
    } finally {
      setKazeLoading(false);
    }
  }, []);

  const fetchConvoyeurs = useCallback(async () => {
    try {
      const [dlcRes, kazeRes] = await Promise.all([
        api.get("/admin/users?role=convoyeur"),
        api.get("/admin/kaze/users").catch(() => ({ data: { data: [] } })),
      ]);
      const dlc = (dlcRes.data.users || []).map((u) => ({
        id: u.id,
        name: u.full_name || u.email,
        email: u.email,
        kazeDriverId: u.kaze_driver_id,
        source: "dlc",
      }));
      // Kaze users not already linked in DLC
      const linkedKazeIds = new Set(
        dlc.map((u) => u.kazeDriverId).filter(Boolean),
      );
      const kaze = (kazeRes.data.data || [])
        .filter((u) => !u.disabled && !linkedKazeIds.has(u.kaze_user_id))
        .map((u) => ({
          id: null,
          name: u.name || u.email,
          email: u.email,
          kazeDriverId: u.kaze_user_id,
          source: "kaze",
        }));
      setConvoyeurs([...dlc, ...kaze]);
    } catch (err) {
      console.error("Erreur chargement convoyeurs:", err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchMissions();
    fetchKazeData();
    fetchConvoyeurs();
  }, [fetchStats, fetchMissions, fetchKazeData, fetchConvoyeurs]);

  // ── Actions ──────────────────────────────────────────────
  const handleProposerPrix = async () => {
    if (!priceValue || isNaN(priceValue) || Number(priceValue) <= 0) {
      return toast.error("Veuillez saisir un prix client valide.");
    }
    if (
      !priceConvoyeurValue ||
      isNaN(priceConvoyeurValue) ||
      Number(priceConvoyeurValue) <= 0
    ) {
      return toast.error("Veuillez saisir un prix convoyeur valide.");
    }
    if (Number(priceConvoyeurValue) > Number(priceValue)) {
      return toast.error(
        "Le prix convoyeur ne peut pas dépasser le prix client.",
      );
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/missions/${priceModal.id}/proposer-prix`, {
        price: Number(priceValue),
        price_convoyeur: Number(priceConvoyeurValue),
      });
      toast.success("Devis proposé au client !");
      setPriceModal(null);
      setPriceValue("");
      setPriceConvoyeurValue("");
      fetchMissions();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMission = async (e) => {
    e.preventDefault();
    if (!newMissionForm.departure_address || !newMissionForm.arrival_address) {
      toast.error("Adresses de départ et d'arrivée obligatoires.");
      return;
    }
    setNewMissionLoading(true);
    try {
      const payload = { ...newMissionForm };
      if (!payload.price) delete payload.price;
      if (!payload.price_convoyeur) delete payload.price_convoyeur;
      await api.post("/admin/missions", payload);
      toast.success("Mission créée !");
      setNewMissionModal(false);
      setNewMissionForm({
        client_name: "",
        client_email: "",
        vehicle_plate: "",
        vehicle_brand: "",
        vehicle_model: "",
        vehicle_energy: "",
        departure_address: "",
        departure_date: "",
        departure_contact_name: "",
        departure_contact_phone: "",
        arrival_address: "",
        arrival_date: "",
        arrival_contact_name: "",
        arrival_contact_phone: "",
        comments: "",
        price: "",
        price_convoyeur: "",
        status: "EN_ATTENTE_DE_COTATION",
      });
      fetchMissions();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la création.");
    } finally {
      setNewMissionLoading(false);
    }
  };

  const handleSyncKaze = async (missionId) => {
    setSyncing(missionId);
    try {
      const res = await api.post(`/admin/missions/${missionId}/sync-kaze`);
      const { driver_assigned, assign_error, just_created, kaze_mission_id } =
        res.data;
      if (assign_error) {
        toast.error(`Convoyeur non assigné dans Kaze : ${assign_error}`, {
          duration: 8000,
        });
      } else if (driver_assigned) {
        toast.success("Convoyeur assigné dans Kaze avec succès !");
      } else if (just_created) {
        toast.success(
          `Mission créée dans Kaze ! ID: ${kaze_mission_id?.substring(0, 8)}…`,
        );
      } else {
        toast.success("Mission déjà synchronisée avec Kaze.");
      }
      fetchMissions();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur de synchronisation Kaze.",
      );
    } finally {
      setSyncing(null);
    }
  };

  const handleAnnuler = async (missionId) => {
    if (!confirm("Voulez-vous vraiment annuler cette mission ?")) return;
    try {
      await api.post(`/admin/missions/${missionId}/annuler`);
      toast.success("Mission annulée.");
      fetchMissions();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    }
  };

  // Suppression définitive : le serveur la restreint aux dossiers non
  // démarrés (devis refusé sans suite, doublon, annulation définitive).
  const handleSupprimer = async (mission) => {
    const trajet = `${mission.departure_address?.split(",")[0]} → ${mission.arrival_address?.split(",")[0]}`;
    if (
      !confirm(
        `Supprimer définitivement la mission « ${trajet} » ?\n\nCette action est irréversible.`,
      )
    )
      return;
    try {
      await api.delete(`/admin/missions/${mission.id}`);
      toast.success("Mission supprimée.");
      fetchMissions();
      fetchStats();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la suppression.",
      );
    }
  };

  const handleAssignConvoyeur = async () => {
    if (!selectedConvoyeur) return toast.error("Sélectionnez un convoyeur.");
    setAssigning(true);
    try {
      const conv = convoyeurs.find(
        (c) => (c.id || c.kazeDriverId) === selectedConvoyeur,
      );
      if (!conv) return toast.error("Convoyeur introuvable.");

      if (conv.source === "dlc" && conv.id) {
        // DLC convoyeur — use existing route
        const res = await api.post(
          `/admin/missions/${assignModal.id}/attribuer-convoyeur`,
          {
            convoyeurId: conv.id,
          },
        );
        if (res.data.kazeSync?.error) {
          toast.error(
            `Convoyeur assigné dans DLC, mais pas dans Kaze : ${res.data.kazeSync.error}`,
            { duration: 8000 },
          );
        }
      } else {
        // Kaze-only user — assign directly in Kaze if mission is synced
        if (assignModal.kaze_mission_id && conv.kazeDriverId) {
          await api.post(
            `/admin/missions/${assignModal.id}/attribuer-convoyeur`,
            {
              kazeDriverId: conv.kazeDriverId,
            },
          );
        }
        toast(
          "⚠️ Ce convoyeur n'a pas de compte DLC. Assignation Kaze uniquement.",
          { icon: "⚠️" },
        );
      }
      toast.success(`Convoyeur ${conv.name} assigné !`);
      setAssignModal(null);
      setSelectedConvoyeur("");
      fetchMissions();
      fetchKazeData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur d'assignation.");
    } finally {
      setAssigning(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────
  const missionsNonSync = missions.filter(
    (m) =>
      !m.kaze_mission_id &&
      ["ACCEPTEE", "ASSIGNEE", "EN_COURS"].includes(m.status),
  );

  const kazeOnline =
    kazeHealth?.token?.hasJwt === true || kazeHealth?.authenticated === true;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
      </div>
    );
  }

  const UPCOMING_STATUSES = [
    "EN_ATTENTE_DE_COTATION",
    "DEVIS_PROPOSE",
    "DEVIS_REFUSE",
    "ACCEPTEE",
    "ASSIGNEE",
  ];
  const upcomingCount =
    missions.filter((m) => UPCOMING_STATUSES.includes(m.status)).length +
    (kazeJobs?.data || []).filter(
      (j) =>
        !missions.some((m) => m.kaze_mission_id === j.kaze_job_id) &&
        ["waiting", "assigned"].includes(j.kaze_status),
    ).length;

  const tabs = [
    { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
    {
      id: "missions",
      label: "Missions",
      icon: FileText,
      count:
        (stats?.missions?.total || 0) +
        (kazeJobs?.data || []).filter(
          (j) => !missions.some((m) => m.kaze_mission_id === j.kaze_job_id),
        ).length,
    },
    {
      id: "upcoming",
      label: "À venir",
      icon: Calendar,
      count: upcomingCount,
    },
    { id: "convoyeurs", label: "Convoyeurs", icon: Users },
  ];

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            Tableau de bord
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                kazeOnline
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {kazeOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              Kaze {kazeOnline ? "connecté" : "hors ligne"}
            </span>
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Administration DLC-Kaze — données en temps réel
          </p>
        </div>
        <div className="flex items-center gap-2 mt-3 sm:mt-0 w-full sm:w-auto">
          <button
            onClick={() => setNewMissionModal(true)}
            className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center text-sm"
          >
            <Plus size={15} />
            <span className="hidden xs:inline">Nouvelle mission</span>
            <span className="xs:hidden">Créer</span>
          </button>
          <button
            onClick={() => {
              fetchStats();
              fetchMissions();
              fetchKazeData();
            }}
            disabled={kazeLoading}
            className="btn-secondary flex items-center gap-2 flex-1 sm:flex-none justify-center text-sm"
          >
            <RefreshCw
              size={15}
              className={kazeLoading ? "animate-spin" : ""}
            />
            <span className="hidden xs:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-dark-800/50 p-1 rounded-xl overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-primary-600 text-white shadow-lg"
                  : "text-dark-400 hover:text-white hover:bg-dark-700/50"
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {tab.count != null && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? "bg-white/20"
                      : "bg-dark-600 text-dark-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB: Vue d'ensemble ═══ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Alertes non-sync */}
          {missionsNonSync.length > 0 && (
            <div className="card border-yellow-500/30 bg-yellow-500/5">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-yellow-400" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-300">
                    {missionsNonSync.length} mission(s) non synchronisée(s) avec
                    Kaze
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    Ces missions ont été acceptées mais n'ont pas été créées
                    dans Kaze.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("missions")}
                  className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  Voir <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Pipeline des missions */}
          <div>
            <h3 className="text-sm font-semibold text-dark-300 mb-3">
              Pipeline des missions
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                {
                  label: "En attente",
                  sublabel: "À coter",
                  value: stats?.missions?.en_attente || 0,
                  icon: Clock,
                  color: "text-yellow-400",
                  bg: "bg-yellow-500/10",
                  border: "border-yellow-500/20",
                },
                {
                  label: "Devis proposés",
                  sublabel: "En attente client",
                  value: stats?.missions?.devis_proposes || 0,
                  icon: FileText,
                  color: "text-blue-400",
                  bg: "bg-blue-500/10",
                  border: "border-blue-500/20",
                },
                {
                  label: "Acceptées",
                  sublabel: "À assigner",
                  value: stats?.missions?.acceptees || 0,
                  icon: CheckCircle2,
                  color: "text-green-400",
                  bg: "bg-green-500/10",
                  border: "border-green-500/20",
                },
                {
                  label: "Assignées",
                  sublabel: "En livraison",
                  value:
                    (Number(stats?.missions?.assignees) || 0) +
                    (Number(stats?.missions?.en_cours) || 0),
                  icon: Truck,
                  color: "text-purple-400",
                  bg: "bg-purple-500/10",
                  border: "border-purple-500/20",
                },
                {
                  label: "Livrées",
                  sublabel: "Terminées (Kaze)",
                  value: stats?.missions?.livrees || 0,
                  icon: CheckCircle2,
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10",
                  border: "border-emerald-500/20",
                },
              ].map((card, index) => (
                <div key={card.label} className="relative">
                  <div
                    className={`card text-center py-4 border ${card.border} ${card.bg.replace("/10", "/5")}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl ${card.bg} ${card.color} flex items-center justify-center mx-auto mb-2`}
                    >
                      <card.icon size={20} />
                    </div>
                    <p className="text-3xl font-bold">{card.value}</p>
                    <p className={`text-sm font-medium mt-1 ${card.color}`}>
                      {card.label}
                    </p>
                    <p className="text-[11px] text-dark-500 mt-0.5">
                      {card.sublabel}
                    </p>
                  </div>
                  {index < 4 && (
                    <div className="absolute top-1/2 -right-2 z-10 -translate-y-1/2 text-dark-600">
                      <ArrowRight size={14} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Alerte: missions en attente d'assignation */}
          {Number(stats?.missions?.en_attente_assignation) > 0 && (
            <div className="card border-orange-500/30 bg-orange-500/5">
              <div className="flex items-center gap-3">
                <UserPlus size={20} className="text-orange-400" />
                <div className="flex-1">
                  <p className="font-medium text-orange-300">
                    {stats.missions.en_attente_assignation} mission(s) en
                    attente d'assignation
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    Acceptées par le client, en attente d'un convoyeur.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("missions")}
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                >
                  Assigner <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/admin/missions?status=EN_ATTENTE_DE_COTATION"
              className="card flex items-center justify-between hover:border-yellow-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-yellow-400" />
                <span className="font-medium">
                  Missions à coter ({stats?.missions?.en_attente || 0})
                </span>
              </div>
              <ArrowRight
                size={18}
                className="text-dark-500 group-hover:text-yellow-400 transition-colors"
              />
            </Link>
            <Link
              to="/admin/carte"
              className="card flex items-center justify-between hover:border-primary-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <MapPin size={20} className="text-primary-400" />
                <span className="font-medium">Carte des missions</span>
              </div>
              <ArrowRight
                size={18}
                className="text-dark-500 group-hover:text-primary-400 transition-colors"
              />
            </Link>
            <Link
              to="/admin/utilisateurs"
              className="card flex items-center justify-between hover:border-accent-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <Users size={20} className="text-accent-400" />
                <span className="font-medium">Gérer les utilisateurs</span>
              </div>
              <ArrowRight
                size={18}
                className="text-dark-500 group-hover:text-accent-400 transition-colors"
              />
            </Link>
          </div>

          {/* Recherche missions par plaque */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
                <Search size={16} className="text-amber-400" />
                Recherche par plaque
                <span className="text-xs font-normal text-dark-500">
                  (historique facturation convoyeur)
                </span>
              </h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!plateSearch.trim() || plateSearch.trim().length < 2)
                  return;
                setPlateSearching(true);
                api
                  .get(
                    `/admin/missions/search-plate?plate=${encodeURIComponent(plateSearch.trim())}`,
                  )
                  .then((res) => setPlateResults(res.data.missions || []))
                  .catch(() => toast.error("Erreur lors de la recherche"))
                  .finally(() => setPlateSearching(false));
              }}
              className="flex gap-2 mb-4"
            >
              <div className="relative flex-1">
                <Car
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
                />
                <input
                  type="text"
                  value={plateSearch}
                  onChange={(e) => setPlateSearch(e.target.value.toUpperCase())}
                  placeholder="Ex : AB-123-CD ou AB123CD"
                  className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-accent-500 font-mono tracking-wider"
                />
              </div>
              <button
                type="submit"
                disabled={plateSearching || plateSearch.trim().length < 2}
                className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {plateSearching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Search size={14} />
                )}
                Rechercher
              </button>
              {plateResults !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setPlateResults(null);
                    setPlateSearch("");
                  }}
                  className="px-3 py-2 bg-dark-700 text-dark-400 rounded-lg text-sm hover:text-dark-200 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </form>

            {plateResults !== null &&
              (plateResults.length === 0 ? (
                <p className="text-dark-500 text-sm text-center py-4">
                  Aucune mission trouvée pour cette plaque.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <p className="text-xs text-dark-500 mb-2">
                    {plateResults.length} mission(s) trouvée(s)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-dark-400 text-xs border-b border-dark-700">
                        <th className="text-left pb-2 font-medium">Statut</th>
                        <th className="text-left pb-2 font-medium">Trajet</th>
                        <th className="text-left pb-2 font-medium">Véhicule</th>
                        <th className="text-left pb-2 font-medium">
                          Convoyeur
                        </th>
                        <th className="text-left pb-2 font-medium">
                          Prix client
                        </th>
                        <th className="text-left pb-2 font-medium">
                          Prix convoyeur
                        </th>
                        <th className="text-left pb-2 font-medium">Marge</th>
                        <th className="text-left pb-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-700/50">
                      {plateResults.map((m) => {
                        const margin =
                          m.price && m.price_convoyeur
                            ? Number(m.price) - Number(m.price_convoyeur)
                            : null;
                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-dark-700/30 transition-colors cursor-pointer"
                            onClick={() =>
                              setDetailModal({ ...m, source: "dlc" })
                            }
                          >
                            <td className="py-2.5 pr-3">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[m.status] || "bg-dark-700 text-dark-300"}`}
                              >
                                {STATUS_LABELS[m.status] || m.status}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 max-w-[180px] truncate font-medium text-dark-100">
                              {m.departure_address?.split(",")[0]} →{" "}
                              {m.arrival_address?.split(",")[0]}
                            </td>
                            <td className="py-2.5 pr-3 text-dark-300 text-xs">
                              {m.vehicle_brand} {m.vehicle_model}
                              <span className="ml-1 font-mono text-amber-400 font-semibold">
                                {m.vehicle_plate}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-xs">
                              {m.convoyeur_name ? (
                                <span className="text-accent-400 flex items-center gap-1">
                                  <Truck size={11} /> {m.convoyeur_name}
                                </span>
                              ) : (
                                <span className="text-dark-500">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold">
                              {m.price ? formatPrice(m.price) : "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-amber-400 font-bold text-base">
                              {m.price_convoyeur
                                ? formatPrice(m.price_convoyeur)
                                : "—"}
                            </td>
                            <td className="py-2.5 pr-3">
                              {margin != null ? (
                                <span
                                  className={`font-bold ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}
                                >
                                  {formatPrice(margin)}
                                </span>
                              ) : (
                                <span className="text-dark-500">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-dark-300 text-xs">
                              {formatDate(m.updated_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>

          {/* Missions terminées — accordéon (DLC + Kaze fusionnées) */}
          {(() => {
            const linkedKazeIds = new Set(
              missions
                .filter((m) => m.kaze_mission_id)
                .map((m) => m.kaze_mission_id),
            );

            const dlcCompleted = missions
              .filter((m) => m.status === "LIVREE")
              .map((m) => ({ ...m, source: "dlc" }));

            const kazeCompletedOnly = (kazeJobs?.data || [])
              .filter(
                (j) =>
                  j.kaze_status === "completed" &&
                  !linkedKazeIds.has(j.kaze_job_id),
              )
              .map((j) => ({
                id: j.kaze_job_id,
                source: "kaze",
                kaze_mission_id: j.kaze_job_id,
                kaze_reference: j.kaze_reference,
                departure_address: j.departure_address || j.address || j.title,
                arrival_address: j.arrival_address || null,
                client_name: j.target_name || j.owner_name || "—",
                vehicle_brand: null,
                vehicle_model: null,
                vehicle_plate: null,
                performer_name: j.performer_name,
                convoyeur_name: j.performer_name,
                price: null,
                price_convoyeur: null,
                status: "LIVREE",
                created_at: j.created_at,
                tags: j.tags,
                updated_at: j.completed_at || j.updated_at || j.created_at,
              }));

            const completed = [...dlcCompleted, ...kazeCompletedOnly].sort(
              (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
            );

            if (completed.length === 0) return null;

            const dlcCount = dlcCompleted.length;
            const kazeCount = kazeCompletedOnly.length;

            return (
              <div className="card">
                <button
                  onClick={() => setShowCompleted((v) => !v)}
                  className="w-full flex items-center justify-between group"
                >
                  <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    Missions terminées
                    <span className="text-xs font-normal bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
                      {completed.length}
                    </span>
                    <span className="text-[10px] font-normal text-dark-500">
                      (DLC + Kaze)
                    </span>
                  </h3>
                  <div className="flex items-center gap-3">
                    <Link
                      to="/admin/carte"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      Voir sur la carte <MapPin size={12} />
                    </Link>
                    <ChevronDown
                      size={16}
                      className={`text-dark-400 transition-transform duration-200 ${showCompleted ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                {showCompleted && (
                  <div className="mt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-dark-400 text-xs border-b border-dark-700">
                            <th className="text-left pb-2 font-medium">
                              Source
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Trajet
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Client
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Véhicule
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Convoyeur
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Prix client
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Prix convoyeur
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Marge
                            </th>
                            <th className="text-left pb-2 font-medium">
                              Terminée le
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-700/50">
                          {completed.map((m) => {
                            const margin =
                              m.price && m.price_convoyeur
                                ? Number(m.price) - Number(m.price_convoyeur)
                                : null;
                            return (
                              <tr
                                key={`${m.source}-${m.id}`}
                                className="hover:bg-dark-700/30 transition-colors cursor-pointer"
                                onClick={() => setDetailModal(m)}
                              >
                                <td className="py-2.5 pr-3">
                                  {m.source === "kaze" ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded">
                                      <Zap size={10} /> Kaze
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 px-1.5 py-0.5 rounded">
                                      <FileText size={10} /> DLC
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 max-w-[180px] truncate font-medium text-dark-100">
                                  {m.source === "kaze" ? (
                                    <>
                                      {m.kaze_reference && (
                                        <span className="font-mono text-[10px] text-orange-400 mr-1">
                                          #{m.kaze_reference}
                                        </span>
                                      )}
                                      {m.departure_address || "Mission Kaze"}
                                    </>
                                  ) : (
                                    <>
                                      {m.departure_address?.split(",")[0]} →{" "}
                                      {m.arrival_address?.split(",")[0]}
                                    </>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-dark-300 text-xs">
                                  {m.client_name}
                                </td>
                                <td className="py-2.5 pr-3 text-dark-300 text-xs">
                                  {m.vehicle_brand || m.vehicle_model ? (
                                    <>
                                      {m.vehicle_brand} {m.vehicle_model}
                                      {m.vehicle_plate && (
                                        <span className="ml-1 font-mono text-dark-500">
                                          {m.vehicle_plate}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-dark-600">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-xs">
                                  {m.convoyeur_name ? (
                                    <span className="text-accent-400 flex items-center gap-1">
                                      <Truck size={11} /> {m.convoyeur_name}
                                    </span>
                                  ) : (
                                    <span className="text-dark-500">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 font-semibold">
                                  {m.price ? formatPrice(m.price) : "—"}
                                </td>
                                <td className="py-2.5 pr-3 text-accent-400 font-semibold">
                                  {m.price_convoyeur
                                    ? formatPrice(m.price_convoyeur)
                                    : "—"}
                                </td>
                                <td className="py-2.5 pr-3">
                                  {margin != null ? (
                                    <span
                                      className={`font-bold ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}
                                    >
                                      {formatPrice(margin)}
                                    </span>
                                  ) : (
                                    <span className="text-dark-500">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 text-dark-300 text-xs">
                                  {formatDate(m.updated_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-dark-500">
                      <span className="flex items-center gap-1">
                        <FileText size={10} className="text-primary-400" />
                        {dlcCount} DLC
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap size={10} className="text-orange-400" />
                        {kazeCount} Kaze
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Recent missions (DLC + Kaze fusionnées) */}
          <div className="card">
            <button
              onClick={() => setShowRecent((v) => !v)}
              className="w-full flex items-center justify-between group"
            >
              <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
                {missionsLoading || kazeLoading ? (
                  <Loader2
                    size={16}
                    className="text-primary-400 animate-spin"
                  />
                ) : (
                  <Activity size={16} className="text-primary-400" />
                )}
                Dernières missions
                <span className="text-xs font-normal text-dark-500">
                  (DLC + Kaze)
                </span>
              </h3>
              <div className="flex items-center gap-3">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab("missions");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setActiveTab("missions");
                    }
                  }}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 cursor-pointer"
                >
                  Voir tout <ArrowRight size={12} />
                </span>
                <ChevronDown
                  size={16}
                  className={`text-dark-400 transition-transform duration-200 ${showRecent ? "rotate-180" : ""}`}
                />
              </div>
            </button>
            {showRecent && (
              <div className="mt-4">
                {missionsLoading || kazeLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {(() => {
                      // Fusionner missions DLC et jobs Kaze non déjà liés
                      const linkedKazeIds = new Set(
                        missions
                          .filter((m) => m.kaze_mission_id)
                          .map((m) => m.kaze_mission_id),
                      );

                      const kazeOnlyJobs = (kazeJobs?.data || [])
                        .filter((j) => !linkedKazeIds.has(j.kaze_job_id))
                        .map((j) => ({
                          id: j.kaze_job_id,
                          source: "kaze",
                          departure_address:
                            j.departure_address || j.address || j.title,
                          arrival_address: j.arrival_address || null,
                          client_name: j.target_name || j.owner_name || "—",
                          price: null,
                          status: j.status,
                          kaze_mission_id: j.kaze_job_id,
                          kaze_reference: j.kaze_reference,
                          performer_name: j.performer_name,
                          created_at: j.created_at,
                          departure_date: j.scheduled_at || j.start_date,
                          tags: j.tags,
                          steps: j.steps,
                          raw: j,
                        }));

                      const dlcMissions = missions.map((m) => ({
                        ...m,
                        source: "dlc",
                      }));

                      const allMissions = [...dlcMissions, ...kazeOnlyJobs]
                        .sort(
                          (a, b) =>
                            new Date(b.created_at) - new Date(a.created_at),
                        )
                        .slice(0, 10);

                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-dark-400 text-xs border-b border-dark-700">
                              <th className="text-left pb-2 font-medium">
                                Source
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Trajet / Mission
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Date
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Client
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Prix
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Statut
                              </th>
                              <th className="text-left pb-2 font-medium">
                                Kaze
                              </th>
                              <th className="text-right pb-2 font-medium">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-dark-700/50">
                            {allMissions.map((m) => (
                              <tr
                                key={`${m.source}-${m.id}`}
                                className="hover:bg-dark-700/30 transition-colors cursor-pointer group/row"
                                onClick={() => setDetailModal(m)}
                              >
                                <td className="py-2.5 pr-3">
                                  {m.source === "kaze" ? (
                                    <span className="badge text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                      Kaze
                                    </span>
                                  ) : (
                                    <span className="badge text-xs bg-primary-500/10 text-primary-400 border border-primary-500/20">
                                      DLC
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 max-w-[200px] truncate font-medium text-dark-100 group-hover/row:text-primary-400 transition-colors">
                                  {m.source === "kaze" ? (
                                    <span title={m.departure_address}>
                                      {m.kaze_reference
                                        ? `#${m.kaze_reference} — `
                                        : ""}
                                      {m.departure_address || "Mission Kaze"}
                                    </span>
                                  ) : (
                                    <>
                                      {m.departure_address?.split(",")[0]} →{" "}
                                      {m.arrival_address?.split(",")[0]}
                                    </>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-dark-300 text-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <span
                                      className="flex items-center gap-1"
                                      title="Date de création"
                                    >
                                      <Calendar
                                        size={10}
                                        className="text-dark-500"
                                      />
                                      {formatDate(m.created_at)}
                                    </span>
                                    {m.departure_date && (
                                      <span
                                        className="flex items-center gap-1 text-primary-400/70"
                                        title="Date d'enlèvement"
                                      >
                                        <Truck size={10} />
                                        {formatDate(m.departure_date)}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 pr-3 text-dark-300 text-xs">
                                  {m.source === "kaze"
                                    ? m.performer_name || m.client_name
                                    : m.client_name}
                                </td>
                                <td className="py-2.5 pr-3 font-semibold">
                                  {m.price ? (
                                    <div className="flex flex-col">
                                      <span>{formatPrice(m.price)}</span>
                                      {m.price_convoyeur && (
                                        <span className="text-[10px] font-normal text-accent-400">
                                          Conv. {formatPrice(m.price_convoyeur)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-dark-500">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3">
                                  <span
                                    className={`badge text-xs ${STATUS_COLORS[m.status] || "bg-orange-500/10 text-orange-400 border border-orange-500/20"}`}
                                  >
                                    {STATUS_LABELS[m.status] || m.status}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3">
                                  {m.kaze_mission_id ? (
                                    <span className="text-green-400 flex items-center gap-1 text-xs">
                                      <Cloud size={12} /> Sync
                                    </span>
                                  ) : m.source === "kaze" ? (
                                    <span className="text-orange-400 flex items-center gap-1 text-xs">
                                      <Cloud size={12} /> Kaze only
                                    </span>
                                  ) : [
                                      "ACCEPTEE",
                                      "ASSIGNEE",
                                      "EN_COURS",
                                    ].includes(m.status) ? (
                                    <span className="text-yellow-400 flex items-center gap-1 text-xs">
                                      <CloudOff size={12} /> Non sync
                                    </span>
                                  ) : (
                                    <span className="text-dark-500 text-xs">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="py-2.5 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button
                                      onClick={() => setDetailModal(m)}
                                      className="text-xs bg-dark-600 hover:bg-dark-500 text-dark-200 hover:text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                      title="Voir le détail"
                                    >
                                      <Eye size={12} />
                                    </button>
                                    {m.source === "dlc" && (
                                      <>
                                        {[
                                          "EN_ATTENTE_DE_COTATION",
                                          "DEVIS_REFUSE",
                                        ].includes(m.status) && (
                                          <button
                                            onClick={() => {
                                              setPriceModal(m);
                                              setPriceValue("");
                                              setPriceConvoyeurValue("");
                                            }}
                                            className="text-xs bg-primary-600 hover:bg-primary-500 text-white px-2 py-1 rounded flex items-center gap-1"
                                          >
                                            <Euro size={12} />{" "}
                                            {m.status === "DEVIS_REFUSE"
                                              ? "Recoter"
                                              : "Coter"}
                                          </button>
                                        )}
                                        {[
                                          "ACCEPTEE",
                                          "ASSIGNEE",
                                          "EN_COURS",
                                        ].includes(m.status) && (
                                          <button
                                            onClick={() => {
                                              setAssignModal(m);
                                              setSelectedConvoyeur("");
                                            }}
                                            className="text-xs bg-accent-600 hover:bg-accent-500 text-white px-2 py-1 rounded flex items-center gap-1"
                                          >
                                            <UserPlus size={12} />
                                          </button>
                                        )}
                                        {!m.kaze_mission_id &&
                                          [
                                            "ACCEPTEE",
                                            "ASSIGNEE",
                                            "EN_COURS",
                                          ].includes(m.status) && (
                                            <button
                                              onClick={() =>
                                                handleSyncKaze(m.id)
                                              }
                                              disabled={syncing === m.id}
                                              className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                                            >
                                              <RotateCcw
                                                size={12}
                                                className={
                                                  syncing === m.id
                                                    ? "animate-spin"
                                                    : ""
                                                }
                                              />
                                              Sync
                                            </button>
                                          )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {allMissions.length === 0 && (
                              <tr>
                                <td
                                  colSpan="8"
                                  className="py-8 text-center text-dark-400 text-sm"
                                >
                                  Aucune mission pour le moment.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL: Détail mission ═══ */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDetailModal(null)}
          />
          <div className="relative card w-full max-w-2xl mx-4 bg-dark-800 border-dark-600 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    detailModal.source === "kaze"
                      ? "bg-orange-600/10"
                      : "bg-primary-600/10"
                  }`}
                >
                  <FileText
                    size={20}
                    className={
                      detailModal.source === "kaze"
                        ? "text-orange-400"
                        : "text-primary-400"
                    }
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    Détail de la mission
                    {detailModal.source === "kaze" ? (
                      <span className="badge text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        Kaze
                      </span>
                    ) : (
                      <span className="badge text-xs bg-primary-500/10 text-primary-400 border border-primary-500/20">
                        DLC
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-dark-400">
                    {detailModal.source === "kaze" && detailModal.kaze_reference
                      ? `Réf. Kaze #${detailModal.kaze_reference}`
                      : `Créée le ${formatDate(detailModal.created_at)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-4">
              {/* Statut + Prix */}
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`badge text-sm px-3 py-1 ${STATUS_COLORS[detailModal.status] || "bg-orange-500/10 text-orange-400 border border-orange-500/20"}`}
                >
                  {STATUS_LABELS[detailModal.status] || detailModal.status}
                </span>
                {detailModal.price && (
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <span className="text-lg font-bold text-primary-400">
                        {formatPrice(detailModal.price)}
                      </span>
                      <p className="text-[10px] text-dark-500">Prix client</p>
                    </div>
                    {detailModal.price_convoyeur && (
                      <>
                        <span className="text-dark-600">/</span>
                        <div className="text-center">
                          <span className="text-lg font-bold text-accent-400">
                            {formatPrice(detailModal.price_convoyeur)}
                          </span>
                          <p className="text-[10px] text-dark-500">
                            Prix convoyeur
                          </p>
                        </div>
                        <div className="px-2 py-1 bg-accent-500/5 border border-accent-500/10 rounded text-center">
                          <span className="text-sm font-bold text-accent-400">
                            {formatPrice(
                              Number(detailModal.price) -
                                Number(detailModal.price_convoyeur),
                            )}
                          </span>
                          <p className="text-[10px] text-dark-500">Marge</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {detailModal.kaze_mission_id && (
                  <span className="text-green-400 flex items-center gap-1 text-xs">
                    <Cloud size={12} /> Synchronisée Kaze
                  </span>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <p className="text-xs text-dark-400 mb-1 flex items-center gap-1">
                    <Calendar size={12} /> Créée le
                  </p>
                  <p className="text-sm font-medium">
                    {formatDate(detailModal.created_at)}
                  </p>
                </div>
                {detailModal.departure_date && (
                  <div className="p-3 bg-dark-700/50 rounded-lg">
                    <p className="text-xs text-dark-400 mb-1 flex items-center gap-1">
                      <MapPin size={12} className="text-green-400" /> Enlèvement
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(detailModal.departure_date)}
                    </p>
                  </div>
                )}
                {detailModal.arrival_date && (
                  <div className="p-3 bg-dark-700/50 rounded-lg">
                    <p className="text-xs text-dark-400 mb-1 flex items-center gap-1">
                      <MapPin size={12} className="text-red-400" /> Livraison
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(detailModal.arrival_date)}
                    </p>
                  </div>
                )}
              </div>

              {/* Client */}
              {(detailModal.client_name || detailModal.client_email) && (
                <div className="p-3 bg-dark-700/50 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(
                      detailModal.client_name ||
                      detailModal.performer_name ||
                      "?"
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {detailModal.client_name}
                      {detailModal.source === "kaze" &&
                        detailModal.performer_name && (
                          <span className="text-dark-400 ml-2 text-xs">
                            Convoyeur : {detailModal.performer_name}
                          </span>
                        )}
                    </p>
                    {detailModal.client_email && (
                      <p className="text-xs text-dark-400">
                        {detailModal.client_email}
                      </p>
                    )}
                    {detailModal.client_company && (
                      <p className="text-xs text-dark-500">
                        {detailModal.client_company}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Trajet */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Départ */}
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={14} className="text-green-400" />
                    <h4 className="text-sm font-semibold">Enlèvement</h4>
                  </div>
                  <p className="text-sm">
                    {detailModal.departure_address || "—"}
                  </p>
                  {detailModal.departure_contact_name && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300 mt-2">
                      <User size={11} className="text-dark-400" />
                      {detailModal.departure_contact_name}
                    </div>
                  )}
                  {detailModal.departure_contact_phone && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300">
                      <Phone size={11} className="text-dark-400" />
                      {detailModal.departure_contact_phone}
                    </div>
                  )}
                  {detailModal.departure_instructions && (
                    <div className="mt-2 p-2 bg-dark-600/50 rounded text-xs text-dark-300">
                      {detailModal.departure_instructions}
                    </div>
                  )}
                </div>

                {/* Arrivée */}
                {detailModal.arrival_address && (
                  <div className="p-3 bg-dark-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={14} className="text-red-400" />
                      <h4 className="text-sm font-semibold">Livraison</h4>
                    </div>
                    <p className="text-sm">{detailModal.arrival_address}</p>
                    {detailModal.arrival_contact_name && (
                      <div className="flex items-center gap-1.5 text-xs text-dark-300 mt-2">
                        <User size={11} className="text-dark-400" />
                        {detailModal.arrival_contact_name}
                      </div>
                    )}
                    {detailModal.arrival_contact_phone && (
                      <div className="flex items-center gap-1.5 text-xs text-dark-300">
                        <Phone size={11} className="text-dark-400" />
                        {detailModal.arrival_contact_phone}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Véhicule (DLC seulement) */}
              {detailModal.source === "dlc" &&
                (detailModal.vehicle_brand || detailModal.vehicle_plate) && (
                  <div className="p-3 bg-dark-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Car size={14} className="text-primary-400" />
                      <h4 className="text-sm font-semibold">Véhicule</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      {detailModal.vehicle_brand && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Marque / Modèle</span>
                          <span className="font-medium">
                            {detailModal.vehicle_brand}{" "}
                            {detailModal.vehicle_model}
                          </span>
                        </div>
                      )}
                      {detailModal.vehicle_plate && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Plaque</span>
                          <span className="font-mono">
                            {detailModal.vehicle_plate}
                          </span>
                        </div>
                      )}
                      {detailModal.vehicle_vin && (
                        <div className="flex justify-between col-span-2">
                          <span className="text-dark-400">VIN</span>
                          <span className="font-mono text-xs">
                            {detailModal.vehicle_vin}
                          </span>
                        </div>
                      )}
                      {detailModal.vehicle_energy && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Énergie</span>
                          <span className="capitalize">
                            {detailModal.vehicle_energy.replace("_", " ")}
                          </span>
                        </div>
                      )}
                      {detailModal.vehicle_state && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">État</span>
                          <span className="capitalize">
                            {detailModal.vehicle_state.replace("_", " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Kaze-specific info */}
              {detailModal.source === "kaze" && (
                <div className="p-3 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-orange-400" />
                    <h4 className="text-sm font-semibold text-orange-400">
                      Données Kaze
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {detailModal.kaze_reference && (
                      <div className="flex justify-between">
                        <span className="text-dark-400">Référence</span>
                        <span className="font-mono">
                          #{detailModal.kaze_reference}
                        </span>
                      </div>
                    )}
                    {detailModal.performer_name && (
                      <div className="flex justify-between">
                        <span className="text-dark-400">Convoyeur</span>
                        <span className="font-medium">
                          {detailModal.performer_name}
                        </span>
                      </div>
                    )}
                    {detailModal.tags && detailModal.tags.length > 0 && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-dark-400">Tags</span>
                        <div className="flex gap-1 flex-wrap">
                          {detailModal.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="badge text-xs bg-dark-600 text-dark-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Commentaires */}
              {detailModal.comments && (
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <p className="text-xs text-dark-400 mb-1 font-medium">
                    Commentaires
                  </p>
                  <p className="text-sm text-dark-200">
                    {detailModal.comments}
                  </p>
                </div>
              )}

              {/* Convoyeur assigné (DLC) */}
              {detailModal.convoyeur_name && (
                <div className="p-3 bg-dark-700/50 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {detailModal.convoyeur_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Convoyeur assigné</p>
                    <p className="font-medium text-sm">
                      {detailModal.convoyeur_name}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-dark-700 flex-shrink-0">
              {detailModal.source === "dlc" &&
                detailModal.status === "EN_ATTENTE_DE_COTATION" && (
                  <button
                    onClick={() => {
                      setDetailModal(null);
                      setPriceModal(detailModal);
                      setPriceValue("");
                      setPriceConvoyeurValue("");
                    }}
                    className="text-sm bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <Euro size={14} /> Coter cette mission
                  </button>
                )}
              <button
                onClick={() => setDetailModal(null)}
                className="text-sm bg-dark-600 hover:bg-dark-500 text-dark-200 px-4 py-2 rounded-lg"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Missions (DLC + Kaze fusionnées) ═══ */}
      {activeTab === "missions" && (
        <MissionsTab
          missions={missions}
          kazeJobs={kazeJobs}
          loading={missionsLoading}
          kazeLoading={kazeLoading}
          onRefresh={() => {
            fetchMissions();
            fetchKazeData();
          }}
          onSyncKaze={handleSyncKaze}
          onAnnuler={handleAnnuler}
          onSupprimer={handleSupprimer}
          syncing={syncing}
          onCoter={(m) => {
            setPriceModal(m);
            setPriceValue("");
            setPriceConvoyeurValue("");
          }}
          onAssign={(m) => {
            setAssignModal(m);
            setSelectedConvoyeur("");
          }}
        />
      )}

      {/* ═══ TAB: Missions à venir ═══ */}
      {activeTab === "upcoming" && (
        <UpcomingMissionsTab
          missions={missions}
          kazeJobs={kazeJobs}
          loading={missionsLoading}
          kazeLoading={kazeLoading}
          onRefresh={() => {
            fetchMissions();
            fetchKazeData();
          }}
          onCoter={(m) => {
            setPriceModal(m);
            setPriceValue("");
            setPriceConvoyeurValue("");
          }}
          onAssign={(m) => {
            setAssignModal(m);
            setSelectedConvoyeur("");
          }}
          onSyncKaze={handleSyncKaze}
          syncing={syncing}
        />
      )}

      {/* ═══ TAB: Convoyeurs ═══ */}
      {activeTab === "convoyeurs" && (
        <ConvoyeursTab
          kazeUsers={kazeUsers}
          kazeLoading={kazeLoading}
          kazeError={kazeError}
          onRefresh={fetchKazeData}
        />
      )}

      {/* ═══ Modal : Nouvelle mission (admin) ═══ */}
      {newMissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setNewMissionModal(false)}
          />
          <div className="relative bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl mx-2 sm:mx-0">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Plus size={20} className="text-primary-400" />
                Nouvelle mission
              </h3>
              <button
                onClick={() => setNewMissionModal(false)}
                className="text-dark-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateMission} className="p-5 space-y-5">
              {/* Client */}
              <div>
                <h4 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                  <User size={14} className="text-primary-400" /> Client
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Nom client
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="Nom / société"
                      value={newMissionForm.client_name}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          client_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Email client
                    </label>
                    <input
                      className="input-field text-sm"
                      type="email"
                      placeholder="client@email.fr"
                      value={newMissionForm.client_email}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          client_email: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Véhicule */}
              <div>
                <h4 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                  <Car size={14} className="text-primary-400" /> Véhicule
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Plaque
                    </label>
                    <input
                      className="input-field text-sm font-mono"
                      placeholder="AB-123-CD"
                      value={newMissionForm.vehicle_plate}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          vehicle_plate: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Marque
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="Renault"
                      value={newMissionForm.vehicle_brand}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          vehicle_brand: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Modèle
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="Clio"
                      value={newMissionForm.vehicle_model}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          vehicle_model: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Énergie
                    </label>
                    <select
                      className="input-field text-sm"
                      value={newMissionForm.vehicle_energy}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          vehicle_energy: e.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {["Essence", "Diesel", "Électrique", "Hybride"].map(
                        (e) => (
                          <option key={e}>{e}</option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Départ */}
              <div>
                <h4 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                  <MapPin size={14} className="text-primary-400" /> Départ
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-dark-400 mb-1">
                      Adresse *
                    </label>
                    <input
                      className="input-field text-sm"
                      required
                      placeholder="15 rue de la Paix, Paris"
                      value={newMissionForm.departure_address}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          departure_address: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Date
                    </label>
                    <input
                      className="input-field text-sm"
                      type="datetime-local"
                      value={newMissionForm.departure_date}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          departure_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Contact
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="Nom contact"
                      value={newMissionForm.departure_contact_name}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          departure_contact_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Téléphone départ
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="06 00 00 00 00"
                      value={newMissionForm.departure_contact_phone}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          departure_contact_phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Arrivée */}
              <div>
                <h4 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                  <Truck size={14} className="text-primary-400" /> Arrivée
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-dark-400 mb-1">
                      Adresse *
                    </label>
                    <input
                      className="input-field text-sm"
                      required
                      placeholder="20 avenue Victor Hugo, Lyon"
                      value={newMissionForm.arrival_address}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          arrival_address: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Date livraison
                    </label>
                    <input
                      className="input-field text-sm"
                      type="datetime-local"
                      value={newMissionForm.arrival_date}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          arrival_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Contact
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="Nom contact"
                      value={newMissionForm.arrival_contact_name}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          arrival_contact_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Téléphone arrivée
                    </label>
                    <input
                      className="input-field text-sm"
                      placeholder="06 00 00 00 00"
                      value={newMissionForm.arrival_contact_phone}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          arrival_contact_phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Prix + statut */}
              <div>
                <h4 className="text-sm font-semibold text-dark-300 mb-3 flex items-center gap-2">
                  <Euro size={14} className="text-primary-400" /> Prix & statut
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Prix client (€)
                    </label>
                    <input
                      className="input-field text-sm"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="350.00"
                      value={newMissionForm.price}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          price: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Prix convoyeur (€)
                    </label>
                    <input
                      className="input-field text-sm"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="200.00"
                      value={newMissionForm.price_convoyeur}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          price_convoyeur: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-400 mb-1">
                      Statut initial
                    </label>
                    <select
                      className="input-field text-sm"
                      value={newMissionForm.status}
                      onChange={(e) =>
                        setNewMissionForm((f) => ({
                          ...f,
                          status: e.target.value,
                        }))
                      }
                    >
                      {[
                        "EN_ATTENTE_DE_COTATION",
                        "DEVIS_PROPOSE",
                        "ACCEPTEE",
                        "ASSIGNEE",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s] || s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Commentaires */}
              <div>
                <label className="block text-xs text-dark-400 mb-1">
                  Observations / commentaires
                </label>
                <textarea
                  className="input-field text-sm"
                  rows={3}
                  placeholder="Instructions particulières…"
                  value={newMissionForm.comments}
                  onChange={(e) =>
                    setNewMissionForm((f) => ({
                      ...f,
                      comments: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-dark-700">
                <button
                  type="button"
                  onClick={() => setNewMissionModal(false)}
                  className="btn-secondary flex-1"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={newMissionLoading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {newMissionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Créer la mission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Price Modal ═══ */}
      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPriceModal(null)}
          />
          <div className="relative card w-full max-w-md mx-4 bg-dark-800 border-dark-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Proposer un prix</h3>
              <button
                onClick={() => setPriceModal(null)}
                className="text-dark-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-3 bg-dark-700/50 rounded-lg mb-4">
              <p className="font-medium text-sm">
                {priceModal.departure_address?.split(",")[0]} →{" "}
                {priceModal.arrival_address?.split(",")[0]}
              </p>
              <p className="text-xs text-dark-400 mt-1">
                {priceModal.vehicle_brand} {priceModal.vehicle_model} • Client:{" "}
                {priceModal.client_name}
              </p>
            </div>
            {priceModal.refus_motif && (
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-4">
                <p className="text-sm font-semibold text-orange-300 mb-1">
                  Devis précédent refusé
                  {priceModal.price
                    ? ` (${formatPrice(priceModal.price)})`
                    : ""}
                </p>
                <p className="text-sm text-dark-200 whitespace-pre-wrap">
                  {priceModal.refus_motif}
                </p>
                {priceModal.client_phone && (
                  <p className="text-xs text-dark-400 mt-2">
                    À rappeler : {priceModal.client_phone}
                  </p>
                )}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Prix client (€ TTC)
              </label>
              <div className="relative">
                <Euro
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  className="input-field pl-10"
                  placeholder="350.00"
                  autoFocus
                />
              </div>
              <p className="text-xs text-dark-500 mt-1">
                Montant facturé au client
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Prix convoyeur (€ TTC)
              </label>
              <div className="relative">
                <Truck
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-400"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceConvoyeurValue}
                  onChange={(e) => setPriceConvoyeurValue(e.target.value)}
                  className="input-field pl-10"
                  placeholder="200.00"
                />
              </div>
              <p className="text-xs text-dark-500 mt-1">
                Rémunération du convoyeur
              </p>
            </div>
            {priceValue &&
              priceConvoyeurValue &&
              Number(priceValue) > 0 &&
              Number(priceConvoyeurValue) > 0 && (
                <div className="mb-4 p-3 bg-accent-500/5 border border-accent-500/10 rounded-lg">
                  <p className="text-xs text-dark-400">Marge</p>
                  <p className="text-lg font-bold text-accent-400">
                    {formatPrice(
                      Number(priceValue) - Number(priceConvoyeurValue),
                    )}
                    <span className="text-xs font-normal text-dark-500 ml-2">
                      (
                      {(
                        (1 - Number(priceConvoyeurValue) / Number(priceValue)) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </p>
                </div>
              )}
            <div className="flex gap-3">
              <button
                onClick={() => setPriceModal(null)}
                className="btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                onClick={handleProposerPrix}
                disabled={submitting}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Send size={16} />
                {submitting ? "Envoi…" : "Proposer le devis"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENT: Missions Tab
// ══════════════════════════════════════════════════════════════
function MissionsTab({
  missions,
  kazeJobs,
  loading,
  kazeLoading,
  onRefresh,
  onSyncKaze,
  onAnnuler,
  onSupprimer,
  syncing,
  onCoter,
  onAssign,
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all"); // "all" | "dlc" | "kaze"

  // ── Kaze status mapping ──
  const KAZE_STATUS_MAP = {
    waiting: "EN_ATTENTE_DE_COTATION",
    assigned: "ASSIGNEE",
    started: "EN_COURS",
    completed: "LIVREE",
    cancelled: "ANNULEE",
  };

  const KAZE_STATUS_COLORS = {
    waiting: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    assigned: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    started: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    completed: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
    cancelled: "bg-red-500/10 text-red-400 border border-red-500/20",
  };

  const KAZE_STATUS_LABELS = {
    waiting: "En attente",
    assigned: "Assignée (cible)",
    started: "En cours",
    completed: "Terminée",
    cancelled: "Annulée",
  };

  const statuses = [
    "",
    "EN_ATTENTE_DE_COTATION",
    "DEVIS_PROPOSE",
    "DEVIS_REFUSE",
    "ACCEPTEE",
    "ASSIGNEE",
    "EN_COURS",
    "LIVREE",
    "ANNULEE",
  ];

  // ── Fusionner missions DLC + Kaze ──
  const linkedKazeIds = new Set(
    missions.filter((m) => m.kaze_mission_id).map((m) => m.kaze_mission_id),
  );

  const uniqueKazeJobs = Array.from(
    new Map((kazeJobs?.data || []).map((j) => [j.kaze_job_id, j])).values(),
  );

  const kazeOnlyJobs = uniqueKazeJobs
    .filter((j) => !linkedKazeIds.has(j.kaze_job_id))
    .map((j) => ({
      id: j.kaze_job_id,
      source: "kaze",
      kaze_status: j.kaze_status,
      status: KAZE_STATUS_MAP[j.kaze_status] || j.kaze_status,
      status_name: j.status_name,
      departure_address: j.departure_address || j.address || j.title,
      arrival_address: j.arrival_address || null,
      client_name: j.target_name || j.owner_name || "—",
      client_email: null,
      vehicle_brand: null,
      vehicle_model: null,
      vehicle_plate: null,
      price: null,
      price_convoyeur: null,
      kaze_mission_id: j.kaze_job_id,
      kaze_reference: j.kaze_reference,
      convoyeur_name: j.performer_name,
      created_at: j.created_at,
      departure_date: j.due_date || j.start_date,
      tags: j.tags,
    }));

  const dlcMissions = missions.map((m) => ({ ...m, source: "dlc" }));

  const allMissions = [...dlcMissions, ...kazeOnlyJobs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  // ── Compteurs par source ──
  const dlcCount = dlcMissions.length;
  const kazeOnlyCount = kazeOnlyJobs.length;

  // ── Filtrage ──
  const filtered = allMissions.filter((m) => {
    // Filtre source
    if (sourceFilter === "dlc" && m.source !== "dlc") return false;
    if (sourceFilter === "kaze" && m.source !== "kaze") return false;
    // Filtre statut
    if (statusFilter && m.status !== statusFilter) return false;
    // Filtre recherche
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const searchable = [
        m.client_name,
        m.client_email,
        m.vehicle_brand,
        m.vehicle_model,
        m.vehicle_plate,
        m.departure_address,
        m.arrival_address,
        m.convoyeur_name,
        m.kaze_reference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Rechercher client, plaque, adresse, réf. Kaze…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading || kazeLoading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw
            size={14}
            className={loading || kazeLoading ? "animate-spin" : ""}
          />
          Actualiser
        </button>
      </div>

      {/* Source filter (DLC / Kaze / Toutes) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-dark-500">Source :</span>
        {[
          { value: "all", label: "Toutes", count: allMissions.length },
          { value: "dlc", label: "DLC", count: dlcCount, color: "primary" },
          {
            value: "kaze",
            label: "Kaze",
            count: kazeOnlyCount,
            color: "orange",
          },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setSourceFilter(s.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              sourceFilter === s.value
                ? s.value === "kaze"
                  ? "bg-orange-600 text-white"
                  : "bg-primary-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {s.label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                sourceFilter === s.value
                  ? "bg-white/20"
                  : "bg-dark-600 text-dark-300"
              }`}
            >
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              statusFilter === s
                ? "bg-primary-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {s ? STATUS_LABELS[s] : "Tous les statuts"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && kazeLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-800/50">
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Source
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Trajet / Mission
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Client
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Véhicule
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Date
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Prix
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Statut
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Convoyeur
                  </th>
                  <th className="text-right py-3 px-3 text-dark-400 font-medium text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={`${m.source}-${m.id}`}
                    className={`border-b border-dark-800 hover:bg-dark-800/30 transition-colors ${
                      m.source === "kaze" ? "bg-orange-500/[0.02]" : ""
                    }`}
                  >
                    {/* Source badge */}
                    <td className="py-3 px-3">
                      {m.source === "kaze" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded">
                          <Zap size={10} /> Kaze
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 px-1.5 py-0.5 rounded">
                          <FileText size={10} /> DLC
                        </span>
                      )}
                    </td>
                    {/* Trajet */}
                    <td className="py-3 px-3 max-w-[180px]">
                      {m.source === "kaze" ? (
                        <div>
                          {m.kaze_reference && (
                            <span className="font-mono text-[10px] text-orange-400 mr-1">
                              #{m.kaze_reference}
                            </span>
                          )}
                          <p className="font-medium truncate text-dark-100">
                            {m.departure_address || "Mission Kaze"}
                          </p>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium truncate text-dark-100">
                            {m.departure_address?.split(",")[0]}
                          </p>
                          <p className="text-xs text-dark-500 truncate">
                            → {m.arrival_address?.split(",")[0]}
                          </p>
                        </>
                      )}
                    </td>
                    {/* Client */}
                    <td className="py-3 px-3">
                      <p className="font-medium text-dark-200 truncate max-w-[120px]">
                        {m.client_name || "—"}
                      </p>
                      {m.client_email && (
                        <p className="text-xs text-dark-500 truncate">
                          {m.client_email}
                        </p>
                      )}
                    </td>
                    {/* Véhicule */}
                    <td className="py-3 px-3 text-dark-300">
                      {m.vehicle_brand ? (
                        <>
                          <p>
                            {m.vehicle_brand} {m.vehicle_model}
                          </p>
                          {m.vehicle_plate && (
                            <p className="text-xs text-dark-500 font-mono">
                              {m.vehicle_plate}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-dark-600 text-xs">—</span>
                      )}
                    </td>
                    {/* Date */}
                    <td className="py-3 px-3 text-dark-400 text-xs whitespace-nowrap">
                      {formatDate(m.departure_date || m.created_at)}
                    </td>
                    {/* Prix */}
                    <td className="py-3 px-3 font-semibold">
                      {m.price ? (
                        formatPrice(m.price)
                      ) : (
                        <span className="text-dark-600 text-xs">—</span>
                      )}
                    </td>
                    {/* Statut */}
                    <td className="py-3 px-3">
                      {m.source === "kaze" ? (
                        <span
                          className={`badge text-xs ${KAZE_STATUS_COLORS[m.kaze_status] || STATUS_COLORS[m.status] || "bg-dark-700 text-dark-300"}`}
                        >
                          {KAZE_STATUS_LABELS[m.kaze_status] ||
                            m.status_name ||
                            m.status}
                        </span>
                      ) : (
                        <span
                          className={`badge text-xs ${STATUS_COLORS[m.status]}`}
                        >
                          {STATUS_LABELS[m.status]}
                        </span>
                      )}
                    </td>
                    {/* Convoyeur */}
                    <td className="py-3 px-3">
                      {m.convoyeur_name ? (
                        <span className="flex items-center gap-1.5 text-accent-400 text-xs font-medium">
                          <Truck size={12} /> {m.convoyeur_name}
                        </span>
                      ) : (
                        <span className="text-dark-500 text-xs">—</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      {m.source === "dlc" ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          {["EN_ATTENTE_DE_COTATION", "DEVIS_REFUSE"].includes(
                            m.status,
                          ) && (
                            <button
                              onClick={() => onCoter(m)}
                              className="btn-primary btn-xs"
                            >
                              <Euro size={11} />{" "}
                              {m.status === "DEVIS_REFUSE"
                                ? "Recoter"
                                : "Coter"}
                            </button>
                          )}
                          {[
                            "EN_ATTENTE_DE_COTATION",
                            "DEVIS_PROPOSE",
                            "DEVIS_REFUSE",
                            "ANNULEE",
                          ].includes(m.status) && (
                            <button
                              onClick={() => onSupprimer(m)}
                              title="Supprimer définitivement"
                              className="btn-soft-danger btn-xs"
                            >
                              <Trash2 size={11} /> Supprimer
                            </button>
                          )}
                          {["ACCEPTEE", "ASSIGNEE", "EN_COURS"].includes(
                            m.status,
                          ) && (
                            <button
                              onClick={() => onAssign(m)}
                              className="btn-success btn-xs"
                            >
                              <UserPlus size={11} />
                              {m.convoyeur_name ? "Réassigner" : "Assigner"}
                            </button>
                          )}
                          {!m.kaze_mission_id &&
                            ["ACCEPTEE", "ASSIGNEE", "EN_COURS"].includes(
                              m.status,
                            ) && (
                              <button
                                onClick={() => onSyncKaze(m.id)}
                                disabled={syncing === m.id}
                                title="Créer la mission dans Kaze"
                                className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                              >
                                <RotateCcw
                                  size={11}
                                  className={
                                    syncing === m.id ? "animate-spin" : ""
                                  }
                                />
                                Sync
                              </button>
                            )}
                          {!!m.kaze_mission_id &&
                            !!m.convoyeur_id &&
                            ["ASSIGNEE", "EN_COURS"].includes(m.status) && (
                              <button
                                onClick={() => onSyncKaze(m.id)}
                                disabled={syncing === m.id}
                                title="Forcer la ré-assignation du convoyeur dans Kaze"
                                className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                              >
                                <RotateCcw
                                  size={11}
                                  className={
                                    syncing === m.id ? "animate-spin" : ""
                                  }
                                />
                                Ré-assigner
                              </button>
                            )}
                          {!["LIVREE", "ANNULEE"].includes(m.status) && (
                            <button
                              onClick={() => onAnnuler(m.id)}
                              title="Annuler la mission"
                              className="btn-soft-warning btn-xs"
                            >
                              <X size={11} /> Annuler
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-dark-500 font-mono">
                          {m.kaze_reference ? `#${m.kaze_reference}` : "Kaze"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-dark-400">
                      Aucune mission trouvée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-dark-800/30 text-xs text-dark-500 border-t border-dark-700 flex items-center gap-4">
            <span>{filtered.length} mission(s) affichée(s)</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText size={10} className="text-primary-400" />
              {dlcCount} DLC
            </span>
            <span className="flex items-center gap-1">
              <Zap size={10} className="text-orange-400" />
              {kazeOnlyCount} Kaze uniquement
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENT: Convoyeurs Tab
// ══════════════════════════════════════════════════════════════
function ConvoyeursTab({ kazeUsers, kazeLoading, kazeError, onRefresh }) {
  if (kazeError) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-center py-12">
        <CloudOff size={40} className="mx-auto text-red-400 mb-4" />
        <p className="text-red-400 font-medium">{kazeError}</p>
        <button onClick={onRefresh} className="btn-secondary mt-4 mx-auto">
          Réessayer
        </button>
      </div>
    );
  }

  const users = (kazeUsers?.data || []).filter((u) => !u.disabled);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-orange-400" />
          <span className="text-sm font-semibold">
            {users.length} convoyeur(s) Kaze actif(s)
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={kazeLoading}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw size={14} className={kazeLoading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {kazeLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((user) => (
            <div
              key={user.kaze_user_id}
              className="card hover:border-orange-500/20 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/20 to-primary-500/20 flex items-center justify-center text-sm font-bold text-orange-300 shrink-0">
                  {user.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-100 truncate">
                    {user.name}
                  </p>
                  {user.email && (
                    <p className="text-xs text-dark-500 truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {/* GPS */}
                <div className="flex items-center justify-between">
                  <span className="text-dark-500">Position GPS</span>
                  {user.latitude ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <Signal size={12} /> {user.latitude.toFixed(3)},{" "}
                      {user.longitude.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-dark-600">Non disponible</span>
                  )}
                </div>

                {/* Device */}
                {user.device && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-500">Appareil</span>
                    <span className="text-dark-300 flex items-center gap-1">
                      <Smartphone size={12} />
                      {user.device.name || user.device.platform}
                      {user.device.app_version &&
                        ` v${user.device.app_version}`}
                    </span>
                  </div>
                )}

                {/* Rating */}
                {user.rating && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-500">Note</span>
                    <span className="text-yellow-400">
                      {"★".repeat(Math.round(user.rating))}{" "}
                      {user.rating.toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Phone */}
                {user.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-500">Téléphone</span>
                    <span className="text-dark-300">{user.phone}</span>
                  </div>
                )}

                {/* Last activity */}
                {user.location_updated_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-dark-500">Dernière position</span>
                    <span className="text-dark-400">
                      {new Date(user.location_updated_at).toLocaleString(
                        "fr-FR",
                        {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {user.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-dark-700/50">
                  {user.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-dark-700 text-dark-400 px-1.5 py-0.5 rounded"
                    >
                      {tag.name || tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <div className="col-span-full card text-center py-12 text-dark-400">
              Aucun convoyeur Kaze actif.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ─── ONGLET MISSIONS À VENIR ────────────────────────────────
// ═══════════════════════════════════════════════════════════════
function UpcomingMissionsTab({
  missions,
  kazeJobs,
  loading,
  kazeLoading,
  onRefresh,
  onCoter,
  onAssign,
  onSyncKaze,
  syncing,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const UPCOMING_STATUSES = [
    "EN_ATTENTE_DE_COTATION",
    "DEVIS_PROPOSE",
    "DEVIS_REFUSE",
    "ACCEPTEE",
    "ASSIGNEE",
  ];
  const KAZE_UPCOMING = ["waiting", "assigned"];

  const KAZE_STATUS_MAP = {
    waiting: "EN_ATTENTE_DE_COTATION",
    assigned: "ASSIGNEE",
  };

  const KAZE_STATUS_COLORS = {
    waiting: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    assigned: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  };

  const KAZE_STATUS_LABELS = {
    waiting: "En attente",
    assigned: "Assignée (cible)",
  };

  const linkedKazeIds = new Set(
    missions.filter((m) => m.kaze_mission_id).map((m) => m.kaze_mission_id),
  );

  const uniqueKazeUpcomingJobs = Array.from(
    new Map((kazeJobs?.data || []).map((j) => [j.kaze_job_id, j])).values(),
  );

  const kazeUpcomingJobs = uniqueKazeUpcomingJobs
    .filter(
      (j) =>
        !linkedKazeIds.has(j.kaze_job_id) &&
        KAZE_UPCOMING.includes(j.kaze_status),
    )
    .map((j) => ({
      id: j.kaze_job_id,
      source: "kaze",
      kaze_status: j.kaze_status,
      status: KAZE_STATUS_MAP[j.kaze_status] || j.kaze_status,
      departure_address: j.departure_address || j.address || j.title,
      arrival_address: j.arrival_address || null,
      client_name: j.target_name || j.owner_name || "—",
      vehicle_brand: null,
      vehicle_model: null,
      vehicle_plate: null,
      price: null,
      price_convoyeur: null,
      kaze_mission_id: j.kaze_job_id,
      kaze_reference: j.kaze_reference,
      convoyeur_name: j.performer_name,
      created_at: j.created_at,
      departure_date: j.due_date || j.start_date,
    }));

  const dlcUpcoming = missions
    .filter((m) => UPCOMING_STATUSES.includes(m.status))
    .map((m) => ({ ...m, source: "dlc" }));

  const allUpcoming = [...dlcUpcoming, ...kazeUpcomingJobs].sort((a, b) => {
    const da = a.departure_date || a.created_at;
    const db = b.departure_date || b.created_at;
    return new Date(da) - new Date(db);
  });

  const filtered = allUpcoming.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [
      m.client_name,
      m.vehicle_brand,
      m.vehicle_model,
      m.vehicle_plate,
      m.departure_address,
      m.arrival_address,
      m.convoyeur_name,
      m.kaze_reference,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Rechercher client, plaque, adresse…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading || kazeLoading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw
            size={14}
            className={loading || kazeLoading ? "animate-spin" : ""}
          />
          Actualiser
        </button>
      </div>

      {/* Compteurs */}
      <div className="flex items-center gap-3 text-xs text-dark-400">
        <span className="flex items-center gap-1.5">
          <Calendar size={13} className="text-primary-400" />
          <span className="text-white font-medium">{filtered.length}</span>{" "}
          mission{filtered.length > 1 ? "s" : ""} à venir
        </span>
        {dlcUpcoming.length > 0 && (
          <span className="bg-primary-500/10 text-primary-400 border border-primary-500/20 px-2 py-0.5 rounded-full">
            {dlcUpcoming.length} DLC
          </span>
        )}
        {kazeUpcomingJobs.length > 0 && (
          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full">
            {kazeUpcomingJobs.length} Kaze
          </span>
        )}
      </div>

      {/* Table */}
      {loading && kazeLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-dark-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p>Aucune mission à venir.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-800/50">
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Source
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Statut
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Trajet
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Client
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Véhicule
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Convoyeur
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Date départ
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Prix
                  </th>
                  <th className="text-left py-3 px-3 text-dark-400 font-medium text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-dark-700/30 transition-colors"
                  >
                    {/* Source */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.source === "kaze"
                            ? "bg-orange-500/10 text-orange-400"
                            : "bg-primary-500/10 text-primary-400"
                        }`}
                      >
                        {m.source === "kaze" ? "KAZE" : "DLC"}
                      </span>
                    </td>
                    {/* Statut */}
                    <td className="py-2.5 px-3">
                      {m.source === "kaze" ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${KAZE_STATUS_COLORS[m.kaze_status] || "bg-dark-700 text-dark-300"}`}
                        >
                          {KAZE_STATUS_LABELS[m.kaze_status] || m.kaze_status}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[m.status] || "bg-dark-700 text-dark-300"}`}
                        >
                          {STATUS_LABELS[m.status] || m.status}
                        </span>
                      )}
                    </td>
                    {/* Trajet */}
                    <td className="py-2.5 px-3 max-w-[180px]">
                      <p className="font-medium text-dark-100 truncate text-xs">
                        {m.departure_address?.split(",")[0]}
                        {m.arrival_address && (
                          <> → {m.arrival_address.split(",")[0]}</>
                        )}
                      </p>
                      {m.kaze_reference && (
                        <p className="text-[10px] text-dark-500 font-mono">
                          {m.kaze_reference}
                        </p>
                      )}
                    </td>
                    {/* Client */}
                    <td className="py-2.5 px-3 text-dark-300 text-xs">
                      {m.client_name || "—"}
                    </td>
                    {/* Véhicule */}
                    <td className="py-2.5 px-3 text-dark-300 text-xs">
                      {m.vehicle_brand || m.vehicle_model ? (
                        <>
                          {m.vehicle_brand} {m.vehicle_model}
                          {m.vehicle_plate && (
                            <span className="ml-1 font-mono text-dark-500">
                              {m.vehicle_plate}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Convoyeur */}
                    <td className="py-2.5 px-3 text-xs">
                      {m.convoyeur_name ? (
                        <span className="text-accent-400 flex items-center gap-1">
                          <Truck size={11} /> {m.convoyeur_name}
                        </span>
                      ) : (
                        <span className="text-dark-500">Non assigné</span>
                      )}
                    </td>
                    {/* Date départ */}
                    <td className="py-2.5 px-3 text-dark-300 text-xs">
                      {m.departure_date ? (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} className="text-primary-400" />
                          {formatDate(m.departure_date)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Prix */}
                    <td className="py-2.5 px-3 text-xs">
                      {m.price ? (
                        <span className="text-emerald-400 font-medium">
                          {formatPrice(m.price)}
                        </span>
                      ) : (
                        <span className="text-dark-500">—</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        {m.source === "dlc" && !m.price && (
                          <button
                            onClick={() => onCoter(m)}
                            className="text-[10px] px-2 py-1 bg-accent-500/10 text-accent-400 border border-accent-500/20 rounded hover:bg-accent-500/20 transition-colors"
                          >
                            Coter
                          </button>
                        )}
                        {m.source === "dlc" &&
                          m.status === "ACCEPTEE" &&
                          !m.convoyeur_id && (
                            <button
                              onClick={() => onAssign(m)}
                              className="text-[10px] px-2 py-1 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded hover:bg-violet-500/20 transition-colors"
                            >
                              Assigner
                            </button>
                          )}
                        {m.source === "dlc" &&
                          !m.kaze_mission_id &&
                          ["ACCEPTEE", "ASSIGNEE", "EN_COURS"].includes(
                            m.status,
                          ) && (
                            <button
                              onClick={() => onSyncKaze(m.id)}
                              disabled={syncing === m.id}
                              className="text-[10px] px-2 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                            >
                              {syncing === m.id ? "…" : "Sync"}
                            </button>
                          )}
                        {m.source === "dlc" &&
                          m.kaze_mission_id &&
                          m.convoyeur_id &&
                          ["ASSIGNEE", "EN_COURS"].includes(m.status) && (
                            <button
                              onClick={() => onSyncKaze(m.id)}
                              disabled={syncing === m.id}
                              title="Forcer la ré-assignation du convoyeur dans Kaze"
                              className="text-[10px] px-2 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                            >
                              {syncing === m.id ? "…" : "Ré-assigner"}
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
