import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import { libelle, classeDePeage } from "../../lib/vehicules";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import {
  Euro,
  Send,
  X,
  UserCheck,
  Truck,
  MapPin,
  Car,
  Calendar,
  Phone,
  User,
  Key,
  Fuel,
  Sparkles,
  Droplets,
  ShieldAlert,
  MessageSquare,
  FileText,
  Search,
  Download,
  AlertTriangle,
  Zap,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import toast from "react-hot-toast";

// ── Kaze status helpers ──
const KAZE_STATUS_MAP = {
  waiting: "EN_ATTENTE_DE_COTATION",
  assigned: "ASSIGNEE",
  started: "EN_COURS",
  completed: "LIVREE",
  cancelled: "ANNULEE",
};
const KAZE_STATUS_LABELS = {
  waiting: "En attente",
  assigned: "Assignée (cible)",
  started: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};
const KAZE_STATUS_COLORS = {
  waiting: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  assigned: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  started: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  completed: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
  cancelled: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function AdminMissions() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "";

  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [priceModal, setPriceModal] = useState(null);
  const [priceValue, setPriceValue] = useState("");
  const [priceConvoyeurValue, setPriceConvoyeurValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Kaze
  const [kazeJobs, setKazeJobs] = useState([]);
  const [kazeLoading, setKazeLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all"); // "all" | "dlc" | "kaze"

  // Assignation convoyeur
  const [assignModal, setAssignModal] = useState(null);
  const [convoyeurs, setConvoyeurs] = useState([]);
  const [selectedConvoyeur, setSelectedConvoyeur] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchKazeJobs = useCallback(() => {
    setKazeLoading(true);
    api
      .get("/admin/kaze/jobs")
      .then((res) => setKazeJobs(res.data.data || []))
      .catch(() => setKazeJobs([]))
      .finally(() => setKazeLoading(false));
  }, []);

  const fetchMissions = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    api
      .get(`/admin/missions${qs}`)
      .then((res) => setMissions(res.data.missions))
      .catch((err) => {
        console.error(err);
        setError("Impossible de charger les missions.");
        toast.error("Erreur de chargement des missions.");
      })
      .finally(() => setLoading(false));
  }, [statusFilter, searchQuery]);

  // Debounce la recherche (400ms)
  useEffect(() => {
    if (!searchQuery && !statusFilter) {
      fetchMissions();
      return;
    }
    const timer = setTimeout(fetchMissions, searchQuery ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchMissions]);

  // Fetch Kaze jobs once
  useEffect(() => {
    fetchKazeJobs();
  }, [fetchKazeJobs]);

  // ── Merge DLC + Kaze missions ──
  const linkedKazeIds = new Set(
    missions.filter((m) => m.kaze_mission_id).map((m) => m.kaze_mission_id),
  );

  const uniqueKazeJobs = Array.from(
    new Map((kazeJobs || []).map((j) => [j.kaze_job_id, j])).values(),
  );

  const kazeOnlyJobs = uniqueKazeJobs
    .filter((j) => !linkedKazeIds.has(j.kaze_job_id))
    .map((j) => ({
      id: `kaze-${j.kaze_job_id}`,
      source: "kaze",
      kaze_status: j.kaze_status,
      status: KAZE_STATUS_MAP[j.kaze_status] || j.kaze_status,
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
    }));

  const dlcMissions = missions.map((m) => ({ ...m, source: "dlc" }));

  const allMissions = [...dlcMissions, ...kazeOnlyJobs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  const dlcCount = dlcMissions.length;
  const kazeOnlyCount = kazeOnlyJobs.length;

  // ── Filter merged list ──
  const displayMissions = allMissions.filter((m) => {
    if (sourceFilter === "dlc" && m.source !== "dlc") return false;
    if (sourceFilter === "kaze" && m.source !== "kaze") return false;
    if (statusFilter && m.status !== statusFilter) return false;
    return true;
  });

  // ── Export CSV ─────────────────────────────────────────────
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await api.get(`/admin/missions/export-csv${params}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `missions-dlc-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export CSV téléchargé !");
    } catch (err) {
      toast.error("Erreur lors de l'export CSV.");
    } finally {
      setExporting(false);
    }
  };

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
      toast.success("Devis proposé au client.");
      setPriceModal(null);
      setPriceValue("");
      setPriceConvoyeurValue("");
      fetchMissions();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setSubmitting(false);
    }
  };

  // Charger les convoyeurs quand on ouvre le modal
  const openAssignModal = async (mission) => {
    setAssignModal(mission);
    setSelectedConvoyeur("");
    try {
      const res = await api.get("/admin/users?role=convoyeur");
      setConvoyeurs(res.data.users);
    } catch {
      toast.error("Impossible de charger les convoyeurs.");
    }
  };

  const handleAssign = async () => {
    if (!selectedConvoyeur) return toast.error("Sélectionnez un convoyeur.");
    setAssigning(true);
    try {
      const convoyeur = convoyeurs.find(
        (c) => (c.id || c.kazeDriverId) === selectedConvoyeur,
      );
      if (!convoyeur) return toast.error("Convoyeur introuvable.");

      const payload = convoyeur.id
        ? { convoyeurId: convoyeur.id }
        : { kazeDriverId: convoyeur.kaze_driver_id || convoyeur.kazeDriverId };

      await api.post(`/admin/missions/${assignModal.id}/attribuer-convoyeur`, {
        ...payload,
      });
      toast.success("Convoyeur attribué à la mission !");
      setAssignModal(null);
      fetchMissions();
      fetchKazeJobs();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setAssigning(false);
    }
  };

  const canAssign = (m) =>
    ["ACCEPTEE", "ASSIGNEE", "EN_COURS"].includes(m.status);

  const statuses = [
    "",
    "EN_ATTENTE_DE_COTATION",
    "DEVIS_PROPOSE",
    "ACCEPTEE",
    "ASSIGNEE",
    "EN_COURS",
    "LIVREE",
    "ANNULEE",
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Gestion des missions</h1>
          <p className="text-dark-400 text-sm mt-1">
            {dlcCount} DLC + {kazeOnlyCount} Kaze — Visualisez, cotez et
            assignez les missions de convoyage.
          </p>
        </div>
        <button
          onClick={() => {
            fetchMissions();
            fetchKazeJobs();
          }}
          disabled={loading || kazeLoading}
          className="btn-secondary flex items-center gap-2 text-sm mt-3 sm:mt-0"
        >
          <RefreshCw
            size={14}
            className={loading || kazeLoading ? "animate-spin" : ""}
          />
          Actualiser
        </button>
      </div>

      {/* Search + Export */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
            size={16}
          />
          <input
            type="text"
            placeholder="Rechercher par client, entreprise, plaque, adresse, réf. Kaze…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="btn-secondary flex items-center gap-2 text-sm py-2 px-4 whitespace-nowrap"
        >
          <Download size={16} />
          {exporting ? "Export…" : "Export CSV"}
        </button>
      </div>

      {/* Source filter (DLC / Kaze / Toutes) */}
      <div className="flex items-center gap-2 mb-4">
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
            {s.value === "kaze" && <Zap size={10} />}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === s
                ? "bg-primary-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {s ? STATUS_LABELS[s] : "Toutes"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && kazeLoading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-red-400">
          <AlertTriangle size={40} className="mb-4 text-red-500" />
          <p className="text-lg font-medium">{error}</p>
          <button
            onClick={() => {
              fetchMissions();
              fetchKazeJobs();
            }}
            className="mt-4 btn-primary text-sm py-2 px-4"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Table */}
      {!(loading && kazeLoading) && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Source
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Trajet
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Client
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Véhicule
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Prix
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Statut
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Convoyeur
                </th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayMissions.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
                >
                  <td className="py-3 px-4">
                    {m.source === "kaze" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <Zap size={10} /> Kaze
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20">
                        DLC
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium">
                      {m.departure_address}
                      {m.arrival_address ? ` → ${m.arrival_address}` : ""}
                    </span>
                    {m.is_urgent && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 align-middle">
                        <AlertTriangle size={10} />
                        URGENT
                      </span>
                    )}
                    {m.kaze_reference && (
                      <p className="text-[10px] text-orange-400/70 mt-0.5">
                        Réf. {m.kaze_reference}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium">{m.client_name}</p>
                      {m.client_email && (
                        <p className="text-xs text-dark-500">
                          {m.client_email}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-dark-300">
                    {m.vehicle_brand || m.vehicle_model
                      ? `${m.vehicle_brand || ""} ${m.vehicle_model || ""}`.trim()
                      : m.source === "kaze"
                        ? "—"
                        : ""}
                  </td>
                  <td className="py-3 px-4 text-dark-400">
                    {formatDate(m.departure_date || m.created_at)}
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {m.price ? (
                      <div>
                        {formatPrice(m.price)}
                        {m.price_convoyeur && (
                          <p className="text-[10px] font-normal text-accent-400">
                            Conv. {formatPrice(m.price_convoyeur)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-dark-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {m.source === "kaze" && m.kaze_status ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${KAZE_STATUS_COLORS[m.kaze_status] || "bg-dark-700 text-dark-300"}`}
                      >
                        {KAZE_STATUS_LABELS[m.kaze_status] || m.kaze_status}
                      </span>
                    ) : (
                      <span className={`badge ${STATUS_COLORS[m.status]}`}>
                        {STATUS_LABELS[m.status]}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {m.convoyeur_name ? (
                      <span className="flex items-center gap-1.5 text-accent-400 text-xs font-medium">
                        <Truck size={13} />
                        {m.convoyeur_name}
                      </span>
                    ) : (
                      <span className="text-dark-500 text-xs">
                        {m.source === "kaze" && m.kaze_status === "assigned"
                          ? "Intervenant non assigné"
                          : "Non assigné"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {m.source === "dlc" &&
                        m.status === "EN_ATTENTE_DE_COTATION" && (
                          <button
                            onClick={() => {
                              setPriceModal(m);
                              setPriceValue("");
                              setPriceConvoyeurValue("");
                            }}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            <Euro size={14} />
                            Coter
                          </button>
                        )}
                      {canAssign(m) && (
                        <button
                          onClick={() => openAssignModal(m)}
                          className="btn-accent text-xs py-1.5 px-3 flex items-center gap-1"
                        >
                          <UserCheck size={14} />
                          {m.convoyeur_name ? "Réassigner" : "Assigner"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {displayMissions.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-dark-400">
                    Aucune mission trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Price Modal — Détail complet */}
      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPriceModal(null)}
          />
          <div className="relative card w-full max-w-3xl mx-4 bg-dark-800 border-dark-600 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-600/10 rounded-lg flex items-center justify-center">
                  <FileText size={20} className="text-primary-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Coter la mission</h3>
                  <p className="text-xs text-dark-400">
                    Consultez le détail avant de proposer un prix
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPriceModal(null)}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-4 mb-4">
              {/* Urgence déclarée par le client — visible avant toute cotation */}
              {priceModal.is_urgent && (
                <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 flex items-start gap-3">
                  <AlertTriangle
                    size={18}
                    className="text-red-400 mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-bold text-red-300">
                      Livraison urgente
                    </p>
                    <p className="text-xs text-red-300/80 mt-0.5">
                      Le client a signalé cette mission comme prioritaire
                      {priceModal.desired_delivery_date &&
                        ` — livraison souhaitée le ${formatDate(priceModal.desired_delivery_date)}`}
                      .
                    </p>
                  </div>
                </div>
              )}

              {/* Date souhaitée hors contexte d'urgence */}
              {!priceModal.is_urgent && priceModal.desired_delivery_date && (
                <div className="p-3 bg-dark-700/50 rounded-lg flex items-center gap-3">
                  <Calendar size={16} className="text-primary-400 shrink-0" />
                  <p className="text-sm">
                    <span className="text-dark-400">
                      Livraison souhaitée :{" "}
                    </span>
                    <span className="font-medium">
                      {formatDate(priceModal.desired_delivery_date)}
                    </span>
                  </p>
                </div>
              )}

              {/* Client */}
              <div className="p-3 bg-dark-700/50 rounded-lg flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {priceModal.client_name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {priceModal.client_name}
                  </p>
                  <p className="text-xs text-dark-400">
                    {priceModal.client_email}
                  </p>
                </div>
              </div>

              {/* Véhicule */}
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Car size={16} className="text-primary-400" />
                  <h4 className="text-sm font-semibold">Véhicule</h4>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {priceModal.vehicle_brand && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">Marque / Modèle</span>
                      <span className="font-medium">
                        {priceModal.vehicle_brand} {priceModal.vehicle_model}
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_plate && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">Plaque</span>
                      <span className="font-mono">
                        {priceModal.vehicle_plate}
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_type && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-dark-400">Gabarit</span>
                      <span className="font-medium text-right">
                        {libelle(priceModal.vehicle_type)}
                        <span className="ml-2 text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">
                          Péage classe{" "}
                          {priceModal.vehicle_toll_class ||
                            classeDePeage(priceModal.vehicle_type)}
                        </span>
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_vin && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-dark-400">VIN</span>
                      <span className="font-mono text-xs">
                        {priceModal.vehicle_vin}
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_finish && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">Finition</span>
                      <span>{priceModal.vehicle_finish}</span>
                    </div>
                  )}
                  {priceModal.vehicle_energy && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">Énergie</span>
                      <span className="capitalize">
                        {priceModal.vehicle_energy.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_state && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">État</span>
                      <span className="capitalize">
                        {priceModal.vehicle_state.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  {priceModal.vehicle_keys != null && (
                    <div className="flex justify-between">
                      <span className="text-dark-400">Clés</span>
                      <span className="flex items-center gap-1">
                        <Key size={12} /> {priceModal.vehicle_keys}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trajet : Départ + Arrivée côte à côte */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Départ */}
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-green-400" />
                    <h4 className="text-sm font-semibold">Enlèvement</h4>
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {priceModal.departure_address}
                  </p>
                  {priceModal.departure_date && (
                    <p className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
                      <Calendar size={12} />
                      {formatDate(priceModal.departure_date)}
                    </p>
                  )}
                  {priceModal.departure_contact_name && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300 mt-2">
                      <User size={12} className="text-dark-400" />
                      {priceModal.departure_contact_name}
                    </div>
                  )}
                  {priceModal.departure_contact_phone && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300">
                      <Phone size={12} className="text-dark-400" />
                      {priceModal.departure_contact_phone}
                    </div>
                  )}
                  {priceModal.departure_instructions && (
                    <div className="mt-2 p-2 bg-dark-600/50 rounded text-xs text-dark-300">
                      <span className="text-dark-400 font-medium">
                        Instructions :{" "}
                      </span>
                      {priceModal.departure_instructions}
                    </div>
                  )}
                </div>

                {/* Arrivée */}
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} className="text-red-400" />
                    <h4 className="text-sm font-semibold">Livraison</h4>
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {priceModal.arrival_address}
                  </p>
                  {priceModal.arrival_date && (
                    <p className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
                      <Calendar size={12} />
                      {formatDate(priceModal.arrival_date)}
                    </p>
                  )}
                  {priceModal.arrival_contact_name && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300 mt-2">
                      <User size={12} className="text-dark-400" />
                      {priceModal.arrival_contact_name}
                    </div>
                  )}
                  {priceModal.arrival_contact_phone && (
                    <div className="flex items-center gap-1.5 text-xs text-dark-300">
                      <Phone size={12} className="text-dark-400" />
                      {priceModal.arrival_contact_phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Services + Urgence */}
              {(priceModal.service_wash_exterior ||
                priceModal.service_clean_interior ||
                priceModal.service_refuel ||
                priceModal.service_handover ||
                priceModal.emergency_phone) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Services */}
                  {(priceModal.service_wash_exterior ||
                    priceModal.service_clean_interior ||
                    priceModal.service_refuel ||
                    priceModal.service_handover) && (
                    <div className="p-3 bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={16} className="text-primary-400" />
                        <h4 className="text-sm font-semibold">
                          Services demandés
                        </h4>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {priceModal.service_wash_exterior && (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Droplets size={13} /> Lavage extérieur
                          </div>
                        )}
                        {priceModal.service_clean_interior && (
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Sparkles size={13} /> Nettoyage intérieur
                          </div>
                        )}
                        {priceModal.service_refuel && (
                          <div className="flex items-center gap-2 text-amber-400">
                            <Fuel size={13} /> Plein de carburant
                          </div>
                        )}
                        {priceModal.service_handover && (
                          <div className="flex items-center gap-2 text-primary-400">
                            <KeyRound size={13} /> Mise en main du véhicule
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Urgence */}
                  {priceModal.emergency_phone && (
                    <div className="p-3 bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldAlert size={16} className="text-red-400" />
                        <h4 className="text-sm font-semibold">
                          Contact d'urgence
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone size={13} className="text-dark-400" />
                        {priceModal.emergency_phone}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Commentaires */}
              {priceModal.comments && (
                <div className="p-3 bg-dark-700/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={16} className="text-primary-400" />
                    <h4 className="text-sm font-semibold">Commentaires</h4>
                  </div>
                  <p className="text-sm text-dark-300 whitespace-pre-wrap">
                    {priceModal.comments}
                  </p>
                </div>
              )}
            </div>

            {/* Sticky bottom: price input + buttons */}
            <div className="flex-shrink-0 border-t border-dark-600 pt-4">
              <div className="mb-3">
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

              <div className="mb-3">
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
                  <div className="mb-4 p-3 bg-accent-500/5 border border-accent-500/10 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-xs text-dark-400">Marge</p>
                      <p className="text-lg font-bold text-accent-400">
                        {formatPrice(
                          Number(priceValue) - Number(priceConvoyeurValue),
                        )}
                        <span className="text-xs font-normal text-dark-500 ml-2">
                          (
                          {(
                            (1 -
                              Number(priceConvoyeurValue) /
                                Number(priceValue)) *
                            100
                          ).toFixed(1)}
                          %)
                        </span>
                      </p>
                    </div>
                    {Number(priceConvoyeurValue) > Number(priceValue) && (
                      <span className="text-red-400 text-xs flex items-center gap-1">
                        <AlertTriangle size={12} /> Convoyeur &gt; Client
                      </span>
                    )}
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
        </div>
      )}
      {/* ═══ Modal : Assigner un convoyeur ═══ */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setAssignModal(null)}
          />
          <div className="relative card w-full max-w-md mx-4 bg-dark-800 border-dark-600">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Assigner un convoyeur</h3>
              <button
                onClick={() => setAssignModal(null)}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-dark-700/50 rounded-lg">
              <p className="font-medium">
                {assignModal.departure_address} → {assignModal.arrival_address}
              </p>
              <p className="text-sm text-dark-400">
                {assignModal.vehicle_brand} {assignModal.vehicle_model} •{" "}
                {formatPrice(assignModal.price)}
              </p>
              {assignModal.convoyeur_name && (
                <p className="text-xs text-accent-400 mt-1">
                  Actuellement : {assignModal.convoyeur_name}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Sélectionner un convoyeur
              </label>
              {convoyeurs.length === 0 ? (
                <p className="text-dark-500 text-sm p-3 bg-dark-700/50 rounded-lg">
                  Aucun convoyeur inscrit. Invitez des convoyeurs à créer un
                  compte.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {convoyeurs.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                        selectedConvoyeur === c.id
                          ? "bg-accent-600/10 border-accent-500/30"
                          : "bg-dark-700/50 border-dark-600 hover:border-dark-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name="convoyeur"
                        value={c.id}
                        checked={selectedConvoyeur === c.id}
                        onChange={() => setSelectedConvoyeur(c.id)}
                        className="sr-only"
                      />
                      <div className="w-8 h-8 bg-accent-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {c.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.full_name}
                        </p>
                        <p className="text-xs text-dark-400 truncate">
                          {c.email}
                        </p>
                      </div>
                      {selectedConvoyeur === c.id && (
                        <div className="w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAssignModal(null)}
                className="btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedConvoyeur}
                className="btn-accent flex-1 flex items-center justify-center gap-2"
              >
                <Truck size={16} />
                {assigning ? "Attribution…" : "Assigner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
