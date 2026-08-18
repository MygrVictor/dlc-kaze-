import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { STATUS_LABELS, STATUS_COLORS, formatDate } from "../../lib/utils";
import {
  Truck,
  MapPin,
  Calendar,
  Car,
  RefreshCw,
  Inbox,
  Phone,
  User,
  Cloud,
  Clock,
  Navigation,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Zap,
  Package,
  ArrowRight,
  Flag,
  MessageSquare,
  Key,
  Fuel,
  Sparkles,
  Droplets,
  KeyRound,
} from "lucide-react";
import toast from "react-hot-toast";

export default function ConvoyeurDashboard() {
  const [missions, setMissions] = useState([]);
  const [source, setSource] = useState("local");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [missionsDispoCount, setMissionsDispoCount] = useState(0);

  const fetchMissions = useCallback(() => {
    setLoading(true);
    api
      .get("/convoyeur/missions")
      .then((res) => {
        setMissions(res.data.missions || []);
        setSource(res.data.source || "local");
      })
      .catch((err) => {
        console.error(err);
        toast.error("Erreur lors du chargement des missions.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch count missions disponibles pour le badge
  const fetchMissionsDispoCount = useCallback(async () => {
    try {
      const { data } = await api.get("/convoyeur/missions-disponibles-count");
      setMissionsDispoCount(data.count || 0);
    } catch (err) {
      console.error("Erreur lors du chargement du badge :", err);
    }
  }, []);

  useEffect(() => {
    fetchMissions();
    fetchMissionsDispoCount();
    // Auto-refresh toutes les 30s
    const interval = setInterval(() => {
      fetchMissions();
      fetchMissionsDispoCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMissions, fetchMissionsDispoCount]);

  // ── Actions ──────────────────────────────────────────────
  // Le démarrage et la clôture d'une mission n'existent plus ici : ils se
  // font dans Kaze, seule source de vérité du terrain. DLC Kaze se contente
  // d'afficher le statut redescendu par la synchronisation.

  // ── Stats rapides ────────────────────────────────────────
  const assignees = missions.filter(
    (m) => m.status === "ASSIGNEE" || m.kaze_status === "assigned",
  );
  const enCours = missions.filter(
    (m) => m.status === "EN_COURS" || m.kaze_status === "started",
  );
  const total = missions.length;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck size={28} className="text-accent-400" />
            Mon planning
          </h1>
          <p className="text-dark-400 text-sm mt-1 flex items-center gap-2">
            Vos missions de convoyage assignées
            {source === "kaze" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Zap size={10} /> Sync Kaze
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchMissions}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 mt-3 sm:mt-0"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {/* ── Stats rapides ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card text-center py-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center mx-auto mb-2">
            <Package size={16} className="text-cyan-400" />
          </div>
          <p className="text-xl font-bold">{assignees.length}</p>
          <p className="text-xs text-dark-400">À démarrer</p>
        </div>
        <div className="card text-center py-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
            <Truck size={16} className="text-purple-400" />
          </div>
          <p className="text-xl font-bold">{enCours.length}</p>
          <p className="text-xs text-dark-400">En cours</p>
        </div>
        <div className="card text-center py-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center mx-auto mb-2">
            <Flag size={16} className="text-accent-400" />
          </div>
          <p className="text-xl font-bold">{total}</p>
          <p className="text-xs text-dark-400">Total</p>
        </div>
      </div>

      {/* ── Loading ────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500" />
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────── */}
      {!loading && missions.length === 0 && (
        <div className="space-y-4">
          {/* Badge missions disponibles */}
          {missionsDispoCount > 0 && (
            <div className="card bg-gradient-to-r from-accent-900/50 to-dark-800/50 border-accent-500/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
                    <div className="relative inline-flex rounded-full h-12 w-12 bg-accent-600 items-center justify-center text-white font-bold">
                      {missionsDispoCount}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-accent-300">
                      {missionsDispoCount} mission
                      {missionsDispoCount > 1 ? "s" : ""} disponible
                      {missionsDispoCount > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-dark-400">
                      Dépêchez-vous, d'autres le feront !
                    </p>
                  </div>
                </div>
                <a
                  href="/convoyeur/disponibles"
                  className="btn-primary whitespace-nowrap"
                >
                  <ArrowRight size={16} />
                  Voir les missions
                </a>
              </div>
            </div>
          )}

          <div className="card text-center py-16">
            <div className="w-16 h-16 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Inbox size={32} className="text-dark-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Aucune mission attribuée
            </h3>
            <p className="text-dark-400 text-sm max-w-md mx-auto">
              Vous n'avez actuellement aucune mission planifiée. Consultez les{" "}
              <a
                href="/convoyeur/disponibles"
                className="text-accent-400 hover:text-accent-300"
              >
                missions disponibles
              </a>{" "}
              ou revenez plus tard.
            </p>
          </div>
        </div>
      )}

      {/* ── Mission Cards ──────────────────────────────── */}
      {!loading && missions.length > 0 && (
        <div className="space-y-3">
          {missions.map((mission, i) => {
            const id = mission.id || mission.kaze_job_id || i;
            const isExpanded = expanded === id;
            const isAssignee =
              mission.status === "ASSIGNEE" ||
              mission.kaze_status === "assigned";
            const isEnCours =
              mission.status === "EN_COURS" ||
              mission.kaze_status === "started";
            const isLivree =
              mission.status === "LIVREE" ||
              mission.kaze_status === "completed";

            return (
              <div
                key={id}
                className={`card transition-all ${
                  isLivree
                    ? "border-dark-700 opacity-70"
                    : isEnCours
                      ? "border-purple-500/30 bg-purple-500/[0.02]"
                      : isAssignee
                        ? "border-cyan-500/20"
                        : "border-dark-700"
                }`}
              >
                {/* Main row */}
                <div className="flex items-start gap-4">
                  {/* Status indicator */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isLivree
                        ? "bg-emerald-500/10"
                        : isEnCours
                          ? "bg-purple-500/10"
                          : isAssignee
                            ? "bg-cyan-500/10"
                            : "bg-dark-700"
                    }`}
                  >
                    {isLivree ? (
                      <Flag size={20} className="text-emerald-400" />
                    ) : isEnCours ? (
                      <Truck size={20} className="text-purple-400" />
                    ) : (
                      <Package size={20} className="text-cyan-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Status + Date */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`badge text-xs ${STATUS_COLORS[mission.status] || "bg-dark-600 text-dark-300"}`}
                      >
                        {STATUS_LABELS[mission.status] ||
                          mission.status_name ||
                          mission.status}
                      </span>
                      <div className="flex items-center gap-2">
                        {mission.kaze_job_id && (
                          <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                            <Cloud size={10} /> Kaze
                          </span>
                        )}
                        {(mission.departure_date || mission.due_date) && (
                          <span className="flex items-center gap-1 text-xs text-dark-400">
                            <Calendar size={12} />
                            {formatDate(
                              mission.departure_date || mission.due_date,
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Route */}
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={16} className="text-green-400 shrink-0" />
                      <p className="font-semibold text-dark-100 truncate">
                        {mission.departure_address ||
                          mission.departure?.address ||
                          mission.address ||
                          "—"}
                      </p>
                      <ArrowRight
                        size={14}
                        className="text-dark-500 shrink-0"
                      />
                      <MapPin size={16} className="text-red-400 shrink-0" />
                      <p className="font-semibold text-dark-100 truncate">
                        {mission.arrival_address ||
                          mission.arrival?.address ||
                          "—"}
                      </p>
                    </div>

                    {/* Vehicle */}
                    <div className="flex items-center gap-2 p-2.5 bg-dark-700/40 rounded-lg mb-3">
                      <Car size={16} className="text-dark-400 shrink-0" />
                      <span className="text-sm font-medium text-dark-200">
                        {mission.vehicle_brand || mission.vehicle?.brand || "—"}{" "}
                        {mission.vehicle_model || mission.vehicle?.model || ""}
                      </span>
                      {(mission.vehicle_plate || mission.vehicle?.plate) && (
                        <span className="text-xs text-dark-500 font-mono ml-auto">
                          {mission.vehicle_plate || mission.vehicle?.plate}
                        </span>
                      )}
                    </div>

                    {/* Actions
                        Le cycle de vie d'une mission (démarrage, livraison)
                        se pilote exclusivement depuis Kaze. Ici, le convoyeur
                        consulte : le statut redescend par la synchronisation. */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(isAssignee || isEnCours) && (
                        <span className="flex items-center gap-1.5 px-3 py-2 bg-dark-700/40 border border-dark-600 text-dark-400 text-xs rounded-lg">
                          <Cloud size={13} className="text-orange-400" />
                          {isAssignee
                            ? "Démarrez cette mission depuis Kaze"
                            : "Clôturez cette mission depuis Kaze"}
                        </span>
                      )}

                      {/* Expand detail */}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : id)}
                        className="flex items-center gap-1 px-3 py-2 bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm rounded-lg transition-colors ml-auto"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={14} /> Réduire
                          </>
                        ) : (
                          <>
                            <ChevronDown size={14} /> Détails
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Expanded detail ──────────────────────── */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-dark-700 space-y-4">
                    {/* Contacts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Départ */}
                      <div className="p-3 bg-dark-700/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin size={14} className="text-green-400" />
                          <h4 className="text-sm font-semibold">Enlèvement</h4>
                        </div>
                        <p className="text-sm text-dark-200 mb-2">
                          {mission.departure_address ||
                            mission.departure?.address ||
                            mission.address ||
                            "—"}
                        </p>
                        {mission.departure_date && (
                          <p className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
                            <Calendar size={11} />
                            {new Date(
                              mission.departure_date,
                            ).toLocaleDateString("fr-FR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                        {mission.departure_contact_name && (
                          <div className="flex items-center gap-1.5 text-xs text-dark-300">
                            <User size={11} className="text-dark-500" />
                            {mission.departure_contact_name}
                          </div>
                        )}
                        {mission.departure_contact_phone && (
                          <a
                            href={`tel:${mission.departure_contact_phone}`}
                            className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 mt-1"
                          >
                            <Phone size={11} />
                            {mission.departure_contact_phone}
                          </a>
                        )}
                        {mission.departure_instructions && (
                          <div className="mt-2 p-2 bg-dark-600/30 rounded text-xs text-dark-300">
                            <span className="text-dark-500">
                              Instructions :{" "}
                            </span>
                            {mission.departure_instructions}
                          </div>
                        )}
                      </div>

                      {/* Arrivée */}
                      <div className="p-3 bg-dark-700/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin size={14} className="text-red-400" />
                          <h4 className="text-sm font-semibold">Livraison</h4>
                        </div>
                        <p className="text-sm text-dark-200 mb-2">
                          {mission.arrival_address ||
                            mission.arrival?.address ||
                            "—"}
                        </p>
                        {mission.arrival_date && (
                          <p className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
                            <Calendar size={11} />
                            {new Date(mission.arrival_date).toLocaleDateString(
                              "fr-FR",
                              {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        )}
                        {mission.arrival_contact_name && (
                          <div className="flex items-center gap-1.5 text-xs text-dark-300">
                            <User size={11} className="text-dark-500" />
                            {mission.arrival_contact_name}
                          </div>
                        )}
                        {mission.arrival_contact_phone && (
                          <a
                            href={`tel:${mission.arrival_contact_phone}`}
                            className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 mt-1"
                          >
                            <Phone size={11} />
                            {mission.arrival_contact_phone}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Vehicle detail */}
                    <div className="p-3 bg-dark-700/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Car size={14} className="text-primary-400" />
                        <h4 className="text-sm font-semibold">
                          Détail véhicule
                        </h4>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {(mission.vehicle_brand || mission.vehicle?.brand) && (
                          <div>
                            <span className="text-dark-500">Marque</span>
                            <p className="text-dark-200 font-medium">
                              {mission.vehicle_brand || mission.vehicle?.brand}
                            </p>
                          </div>
                        )}
                        {(mission.vehicle_model || mission.vehicle?.model) && (
                          <div>
                            <span className="text-dark-500">Modèle</span>
                            <p className="text-dark-200 font-medium">
                              {mission.vehicle_model || mission.vehicle?.model}
                            </p>
                          </div>
                        )}
                        {(mission.vehicle_plate || mission.vehicle?.plate) && (
                          <div>
                            <span className="text-dark-500">Plaque</span>
                            <p className="text-dark-200 font-mono">
                              {mission.vehicle_plate || mission.vehicle?.plate}
                            </p>
                          </div>
                        )}
                        {mission.vehicle_vin && (
                          <div>
                            <span className="text-dark-500">VIN</span>
                            <p className="text-dark-200 font-mono text-[10px]">
                              {mission.vehicle_vin}
                            </p>
                          </div>
                        )}
                        {mission.vehicle_energy && (
                          <div>
                            <span className="text-dark-500">Énergie</span>
                            <p className="text-dark-200 capitalize">
                              {mission.vehicle_energy.replace("_", " ")}
                            </p>
                          </div>
                        )}
                        {mission.vehicle_state && (
                          <div>
                            <span className="text-dark-500">État</span>
                            <p className="text-dark-200 capitalize">
                              {mission.vehicle_state.replace("_", " ")}
                            </p>
                          </div>
                        )}
                        {mission.vehicle_keys != null && (
                          <div>
                            <span className="text-dark-500">Clés</span>
                            <p className="text-dark-200 flex items-center gap-1">
                              <Key size={10} /> {mission.vehicle_keys}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Services */}
                    {(mission.service_wash_exterior ||
                      mission.service_clean_interior ||
                      mission.service_refuel ||
                      mission.service_handover) && (
                      <div className="p-3 bg-dark-700/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles size={14} className="text-primary-400" />
                          <h4 className="text-sm font-semibold">
                            Services demandés
                          </h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mission.service_wash_exterior && (
                            <span className="text-xs flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full">
                              <Droplets size={11} /> Lavage extérieur
                            </span>
                          )}
                          {mission.service_clean_interior && (
                            <span className="text-xs flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full">
                              <Sparkles size={11} /> Nettoyage intérieur
                            </span>
                          )}
                          {mission.service_refuel && (
                            <span className="text-xs flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full">
                              <Fuel size={11} /> Plein de carburant
                            </span>
                          )}
                          {mission.service_handover && (
                            <span className="text-xs flex items-center gap-1 px-2 py-1 bg-primary-500/10 text-primary-400 rounded-full">
                              <KeyRound size={11} /> Mise en main
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Emergency + Comments */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {mission.emergency_phone && (
                        <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertCircle size={14} className="text-red-400" />
                            <h4 className="text-sm font-semibold text-red-300">
                              Contact d'urgence
                            </h4>
                          </div>
                          <a
                            href={`tel:${mission.emergency_phone}`}
                            className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1.5"
                          >
                            <Phone size={12} />
                            {mission.emergency_phone}
                          </a>
                        </div>
                      )}
                      {mission.comments && (
                        <div className="p-3 bg-dark-700/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare
                              size={14}
                              className="text-primary-400"
                            />
                            <h4 className="text-sm font-semibold">
                              Commentaires
                            </h4>
                          </div>
                          <p className="text-sm text-dark-300 whitespace-pre-wrap">
                            {mission.comments}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Client info */}
                    {mission.client_name && (
                      <div className="text-xs text-dark-500 pt-2 border-t border-dark-700/50">
                        Client : {mission.client_name}
                        {mission.kaze_job_id && (
                          <span className="ml-3 text-orange-400/60 font-mono">
                            Kaze: {mission.kaze_job_id.substring(0, 8)}…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Real-time indicator ────────────────────────── */}
      {!loading && missions.length > 0 && (
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-dark-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Mise à jour automatique toutes les 30 secondes
        </div>
      )}
    </div>
  );
}
