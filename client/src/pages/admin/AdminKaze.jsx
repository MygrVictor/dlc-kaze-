import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import {
  Zap,
  RefreshCw,
  Truck,
  Clock,
  CheckCircle2,
  UserCheck,
  BarChart3,
  CloudOff,
  Search,
  MapPin,
  Signal,
  Smartphone,
  Users,
  Receipt,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  FileText,
  Calendar,
  Phone,
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminKaze() {
  const [activeSection, setActiveSection] = useState("jobs");

  // Kaze data
  const [kazeJobs, setKazeJobs] = useState(null);
  const [kazeUsers, setKazeUsers] = useState(null);
  const [kazeInvoices, setKazeInvoices] = useState(null);
  const [kazeHealth, setKazeHealth] = useState(null);
  const [loading, setLoading] = useState({
    jobs: true,
    users: false,
    invoices: false,
  });
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async (status) => {
    setLoading((l) => ({ ...l, jobs: true }));
    try {
      const params = status ? `?status=${status}` : "";
      const res = await api.get(`/admin/kaze/jobs${params}`);
      setKazeJobs(res.data);
    } catch (err) {
      setError("Impossible de charger les missions Kaze.");
      toast.error("Erreur de connexion Kaze.");
    } finally {
      setLoading((l) => ({ ...l, jobs: false }));
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading((l) => ({ ...l, users: true }));
    try {
      const res = await api.get("/admin/kaze/users");
      setKazeUsers(res.data);
    } catch {
      toast.error("Erreur chargement convoyeurs Kaze.");
    } finally {
      setLoading((l) => ({ ...l, users: false }));
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading((l) => ({ ...l, invoices: true }));
    try {
      const res = await api.get("/admin/kaze/invoices");
      setKazeInvoices(res.data);
    } catch {
      toast.error("Erreur chargement factures Kaze.");
    } finally {
      setLoading((l) => ({ ...l, invoices: false }));
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get("/admin/kaze-health");
      setKazeHealth(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchHealth();
  }, [fetchJobs, fetchHealth]);

  useEffect(() => {
    if (activeSection === "users" && !kazeUsers) fetchUsers();
    if (activeSection === "invoices" && !kazeInvoices) fetchInvoices();
  }, [activeSection, kazeUsers, kazeInvoices, fetchUsers, fetchInvoices]);

  const sections = [
    {
      id: "jobs",
      label: "Missions",
      icon: FileText,
      count: kazeJobs?.meta?.total_count,
    },
    {
      id: "users",
      label: "Convoyeurs",
      icon: Users,
      count: kazeUsers?.meta?.total_count,
    },
    {
      id: "invoices",
      label: "Factures",
      icon: Receipt,
      count: kazeInvoices?.meta?.total_count,
    },
    { id: "health", label: "Santé API", icon: Zap },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap size={28} className="text-orange-400" />
            Gestion Kaze
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Accédez à toutes les données Kaze sans quitter DLC.
          </p>
        </div>
        <a
          href="https://app.kaze.so"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2 mt-3 sm:mt-0 text-sm"
        >
          <ExternalLink size={14} />
          Ouvrir Kaze
        </a>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-dark-800/50 p-1 rounded-xl overflow-x-auto">
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeSection === sec.id
                  ? "bg-orange-600 text-white shadow-lg"
                  : "text-dark-400 hover:text-white hover:bg-dark-700/50"
              }`}
            >
              <Icon size={16} />
              {sec.label}
              {sec.count != null && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeSection === sec.id
                      ? "bg-white/20"
                      : "bg-dark-600 text-dark-300"
                  }`}
                >
                  {sec.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ Missions Kaze ═══ */}
      {activeSection === "jobs" && (
        <KazeJobsSection
          data={kazeJobs}
          loading={loading.jobs}
          onRefresh={fetchJobs}
        />
      )}

      {/* ═══ Convoyeurs Kaze ═══ */}
      {activeSection === "users" && (
        <KazeUsersSection
          data={kazeUsers}
          loading={loading.users}
          onRefresh={fetchUsers}
        />
      )}

      {/* ═══ Factures Kaze ═══ */}
      {activeSection === "invoices" && (
        <KazeInvoicesSection
          data={kazeInvoices}
          loading={loading.invoices}
          onRefresh={fetchInvoices}
        />
      )}

      {/* ═══ Santé API ═══ */}
      {activeSection === "health" && (
        <KazeHealthSection health={kazeHealth} onRefresh={fetchHealth} />
      )}
    </div>
  );
}

// ── Jobs Section ──────────────────────────────────────────
function KazeJobsSection({ data, loading, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const kazeStatuses = [
    { value: "", label: "Tous", icon: BarChart3 },
    { value: "waiting", label: "En attente", icon: Clock },
    { value: "assigned", label: "Assignées", icon: UserCheck },
    { value: "started", label: "En cours", icon: Truck },
    { value: "completed", label: "Terminées", icon: CheckCircle2 },
    { value: "cancelled", label: "Annulées", icon: AlertCircle },
  ];

  const statusColors = {
    waiting: "bg-yellow-500/15 text-yellow-400",
    assigned: "bg-violet-500/15 text-violet-400",
    started: "bg-emerald-500/15 text-emerald-400",
    completed: "bg-slate-500/15 text-slate-400",
    cancelled: "bg-red-500/15 text-red-400",
  };

  let jobs = data?.data || [];
  if (statusFilter) jobs = jobs.filter((j) => j.kaze_status === statusFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    jobs = jobs.filter((j) => {
      const searchable = [
        j.title,
        j.kaze_reference,
        j.performer_name,
        j.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Rechercher par référence, titre, convoyeur…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => onRefresh(statusFilter || undefined)}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {kazeStatuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === s.value
                ? "bg-orange-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            <s.icon size={13} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-4 px-3 py-2 bg-dark-800/50 rounded-lg text-xs text-dark-400">
          <span>
            Total:{" "}
            <strong className="text-dark-200">
              {data.meta?.total_count || 0}
            </strong>
          </span>
          <span>
            Affichés: <strong className="text-dark-200">{jobs.length}</strong>
          </span>
          <span className="text-dark-500">
            (derniers {data.meta?.days || 60} jours)
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const isExpanded = expanded === job.kaze_job_id;
            return (
              <div
                key={job.kaze_job_id}
                className={`card transition-all ${isExpanded ? "border-orange-500/30" : "border-dark-700 hover:border-dark-600"}`}
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() =>
                    setExpanded(isExpanded ? null : job.kaze_job_id)
                  }
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isExpanded ? (
                      <ChevronDown
                        size={16}
                        className="text-dark-500 shrink-0"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        className="text-dark-500 shrink-0"
                      />
                    )}
                    <span className="font-mono text-xs text-orange-400 shrink-0">
                      {job.kaze_reference}
                    </span>
                    <span className="font-medium text-dark-100 truncate">
                      {job.title || "Sans titre"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {job.performer_name && (
                      <span className="hidden sm:flex text-xs text-dark-300 items-center gap-1">
                        <Truck size={12} className="text-accent-400" />
                        {job.performer_name}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[job.kaze_status] || "bg-dark-600 text-dark-300"}`}
                    >
                      {job.status_name}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-dark-700 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <InfoBlock
                        label="Adresse"
                        value={job.address}
                        icon={MapPin}
                      />
                      <InfoBlock
                        label="Convoyeur"
                        value={
                          job.performer_name
                            ? `${job.performer_name}${job.performer_phone ? ` • ${job.performer_phone}` : ""}`
                            : "Non assigné"
                        }
                        icon={Truck}
                      />
                      <InfoBlock
                        label="Date prévue"
                        value={
                          job.due_date
                            ? new Date(job.due_date).toLocaleDateString(
                                "fr-FR",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                },
                              )
                            : "Non définie"
                        }
                        icon={Calendar}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <InfoBlock
                        label="Coordonnées GPS"
                        value={
                          job.latitude && job.longitude
                            ? `${job.latitude.toFixed(5)}, ${job.longitude.toFixed(5)}`
                            : "Non disponible"
                        }
                        icon={Signal}
                      />
                      <InfoBlock
                        label="Créée le"
                        value={
                          job.created_at
                            ? new Date(job.created_at).toLocaleString("fr-FR")
                            : "—"
                        }
                        icon={Clock}
                      />
                      <InfoBlock
                        label="Complétée le"
                        value={
                          job.completed_at
                            ? new Date(job.completed_at).toLocaleString("fr-FR")
                            : "—"
                        }
                        icon={CheckCircle2}
                      />
                    </div>

                    {job.tags?.length > 0 && (
                      <div>
                        <p className="text-xs text-dark-500 mb-1.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {job.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="text-xs bg-orange-500/10 text-orange-300 px-2 py-0.5 rounded-full"
                            >
                              {tag.name || tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Steps if available */}
                    {job.steps?.length > 0 && (
                      <div>
                        <p className="text-xs text-dark-500 mb-2">
                          Étapes du workflow ({job.steps.length})
                        </p>
                        <div className="space-y-1">
                          {job.steps.map((step, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs p-2 bg-dark-700/30 rounded"
                            >
                              <span className="w-5 h-5 rounded-full bg-dark-600 flex items-center justify-center text-[10px] font-bold text-dark-300">
                                {i + 1}
                              </span>
                              <span className="text-dark-200">
                                {step.name || step.title || `Étape ${i + 1}`}
                              </span>
                              {step.status && (
                                <span className="text-dark-500 ml-auto">
                                  {step.status}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-dark-600 pt-2 border-t border-dark-700/50">
                      ID: <span className="font-mono">{job.kaze_job_id}</span>
                      {job.owner_name && (
                        <span> • Propriétaire: {job.owner_name}</span>
                      )}
                      {job.target_name && (
                        <span> • Cible: {job.target_name}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {jobs.length === 0 && (
            <div className="card text-center py-16 text-dark-400">
              <CloudOff size={40} className="mx-auto mb-4 text-dark-600" />
              <p className="font-medium">Aucune mission Kaze trouvée</p>
              <p className="text-sm mt-1">
                Changez le filtre ou vérifiez la connexion Kaze.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Users Section ─────────────────────────────────────────
function KazeUsersSection({ data, loading, onRefresh }) {
  const [searchQuery, setSearchQuery] = useState("");

  let users = (data?.data || []).filter((u) => !u.disabled);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    users = users.filter((u) =>
      [u.name, u.email, u.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Rechercher un convoyeur…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      <div className="text-xs text-dark-500">
        {users.length} convoyeur(s) actif(s) sur{" "}
        {data?.meta?.total_count || "?"} total
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {users.map((user) => (
            <div
              key={user.kaze_user_id}
              className="card hover:border-orange-500/20 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-500/20 to-primary-500/20 flex items-center justify-center text-sm font-bold text-orange-300 shrink-0">
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
                {user.latitude && (
                  <span className="text-green-400 text-xs flex items-center gap-1 shrink-0">
                    <Signal size={12} /> GPS
                  </span>
                )}
              </div>

              <div className="space-y-2 text-xs">
                {user.phone && (
                  <div className="flex items-center gap-2 text-dark-300">
                    <Phone size={12} className="text-dark-500" />
                    {user.phone}
                  </div>
                )}
                {user.device && (
                  <div className="flex items-center gap-2 text-dark-300">
                    <Smartphone size={12} className="text-dark-500" />
                    {user.device.name || user.device.platform}
                    {user.device.app_version && (
                      <span className="text-dark-500">
                        v{user.device.app_version}
                      </span>
                    )}
                    {user.device.app_status && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          user.device.app_status === "foreground"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-dark-600 text-dark-400"
                        }`}
                      >
                        {user.device.app_status}
                      </span>
                    )}
                  </div>
                )}
                {user.latitude && (
                  <div className="flex items-center gap-2 text-dark-300">
                    <MapPin size={12} className="text-dark-500" />
                    {user.latitude.toFixed(4)}, {user.longitude.toFixed(4)}
                    {user.location_updated_at && (
                      <span className="text-dark-500 ml-auto">
                        {new Date(user.location_updated_at).toLocaleString(
                          "fr-FR",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                          },
                        )}
                      </span>
                    )}
                  </div>
                )}
                {user.rating && (
                  <div className="flex items-center gap-2 text-yellow-400">
                    {"★".repeat(Math.round(user.rating))}{" "}
                    <span className="text-dark-400">
                      {user.rating.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              {user.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-dark-700/50">
                  {user.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-orange-500/10 text-orange-300 px-1.5 py-0.5 rounded"
                    >
                      {tag.name || tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-dark-600 mt-2 pt-2 border-t border-dark-700/50 font-mono truncate">
                {user.kaze_user_id}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="col-span-full card text-center py-12 text-dark-400">
              Aucun convoyeur trouvé.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invoices Section ──────────────────────────────────────
function KazeInvoicesSection({ data, loading, onRefresh }) {
  const invoices = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-dark-400">
          {data?.meta?.total_count || 0} facture(s)
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="card text-center py-16 text-dark-400">
          <Receipt size={40} className="mx-auto mb-4 text-dark-600" />
          <p className="font-medium">Aucune facture Kaze</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-800/50">
                  <th className="text-left py-3 px-4 text-dark-400 font-medium text-xs">
                    N° Facture
                  </th>
                  <th className="text-left py-3 px-4 text-dark-400 font-medium text-xs">
                    Client
                  </th>
                  <th className="text-left py-3 px-4 text-dark-400 font-medium text-xs">
                    Montant
                  </th>
                  <th className="text-left py-3 px-4 text-dark-400 font-medium text-xs">
                    Statut
                  </th>
                  <th className="text-left py-3 px-4 text-dark-400 font-medium text-xs">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr
                    key={inv.id || i}
                    className="border-b border-dark-800 hover:bg-dark-800/30"
                  >
                    <td className="py-3 px-4 font-mono text-xs text-orange-400">
                      {inv.number || inv.reference || inv.id?.substring(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-dark-200">
                      {inv.customer_name || inv.client_name || "—"}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {inv.total_amount
                        ? `${Number(inv.total_amount).toFixed(2)} €`
                        : inv.amount
                          ? `${Number(inv.amount).toFixed(2)} €`
                          : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          inv.status === "paid" || inv.paid
                            ? "bg-green-500/15 text-green-400"
                            : inv.status === "overdue"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-yellow-500/15 text-yellow-400"
                        }`}
                      >
                        {inv.status === "paid" || inv.paid
                          ? "Payée"
                          : inv.status === "overdue"
                            ? "En retard"
                            : inv.status || "En attente"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-dark-400 text-xs">
                      {inv.created_at
                        ? new Date(inv.created_at).toLocaleDateString("fr-FR")
                        : inv.date
                          ? new Date(inv.date).toLocaleDateString("fr-FR")
                          : "—"}
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

// ── Health Section ────────────────────────────────────────
function KazeHealthSection({ health, onRefresh }) {
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.get("/admin/kaze/test");
      setTestResult(res.data);
      toast.success("Test de connexion réussi !");
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message,
      });
      toast.error("Échec du test de connexion.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap size={20} className="text-orange-400" />
          État de la connexion Kaze
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Authentifié</span>
            <span
              className={`text-sm font-medium ${health?.authenticated ? "text-green-400" : "text-red-400"}`}
            >
              {health?.authenticated ? "✅ Oui" : "❌ Non"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Dernière auth</span>
            <span className="text-dark-200 text-sm">
              {health?.lastAuth
                ? new Date(health.lastAuth).toLocaleString("fr-FR")
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Circuit breaker</span>
            <span
              className={`text-sm font-medium ${
                health?.circuitBreaker === "closed"
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {health?.circuitBreaker === "closed"
                ? "🟢 Fermé (OK)"
                : "🔴 Ouvert"}
            </span>
          </div>
          {health?.baseURL && (
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <span className="text-dark-400 text-sm">URL API</span>
              <span className="text-dark-200 text-sm font-mono">
                {health.baseURL}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-primary flex items-center gap-2"
          >
            <Zap size={16} className={testing ? "animate-pulse" : ""} />
            {testing ? "Test en cours…" : "Tester la connexion"}
          </button>
          <button onClick={onRefresh} className="btn-secondary">
            Rafraîchir
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`card ${testResult.success !== false ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
        >
          <h4 className="font-semibold mb-2">
            {testResult.success !== false
              ? "✅ Connexion OK"
              : "❌ Échec de connexion"}
          </h4>
          <pre className="text-xs text-dark-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Reusable Info Block ───────────────────────────────────
function InfoBlock({ label, value, icon: Icon }) {
  return (
    <div className="p-3 bg-dark-700/30 rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={12} className="text-dark-500" />}
        <p className="text-xs text-dark-500">{label}</p>
      </div>
      <p className="text-sm text-dark-200">{value || "—"}</p>
    </div>
  );
}
