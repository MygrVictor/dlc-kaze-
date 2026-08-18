import { useState, useEffect, useMemo, Fragment } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  LayerGroup,
  CircleMarker,
  Polyline,
  Popup,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../lib/api";
import {
  Loader2,
  AlertCircle,
  Filter,
  MapPin,
  RefreshCw,
  Users,
  Truck,
  Zap,
} from "lucide-react";

// ── Couleurs par statut ─────────────────────────────────────
const STATUS_CONFIG = {
  EN_ATTENTE_DE_COTATION: {
    color: "#facc15",
    label: "En attente de cotation",
    bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  DEVIS_PROPOSE: {
    color: "#fb923c",
    label: "Devis proposé",
    bg: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  ACCEPTEE: {
    color: "#60a5fa",
    label: "Acceptée",
    bg: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  ASSIGNEE: {
    color: "#a78bfa",
    label: "Assignée",
    bg: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  },
  EN_COURS: {
    color: "#34d399",
    label: "En cours",
    bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  LIVREE: {
    color: "#94a3b8",
    label: "Livrée",
    bg: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
};

// ── Phases d'exploitation ──────────────────────────────────
// Huit statuts à l'écran ne se lisent pas d'un coup d'œil. Ce qui
// intéresse l'exploitant sur une carte tient en trois questions : qu'est-ce
// qui attend une action de ma part, qu'est-ce qui roule, qu'est-ce qui est
// derrière moi. Les statuts fins restent dans l'infobulle.
const PHASES = {
  A_TRAITER: {
    label: "À traiter",
    aide: "Sans convoyeur : à coter, à valider ou à assigner",
    color: "#f59e0b",
    bg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    rayon: 9,
  },
  EN_COURS: {
    label: "En cours",
    aide: "Assignée à un convoyeur ou déjà en route",
    color: "#22c55e",
    bg: "bg-green-500/20 text-green-400 border-green-500/30",
    rayon: 9,
  },
  TERMINEE: {
    label: "Terminées",
    aide: "Livrées — conservées pour l'historique",
    color: "#64748b",
    bg: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    rayon: 5,
  },
};

/** Phase d'une mission DLC, déduite de son statut. */
function phaseDeStatut(status) {
  if (status === "LIVREE") return "TERMINEE";
  if (status === "ASSIGNEE" || status === "EN_COURS") return "EN_COURS";
  return "A_TRAITER";
}

/** Même lecture pour un job Kaze, dont les statuts sont en anglais. */
function phaseDeKaze(job) {
  if (job.kaze_status === "completed" || job.kaze_status === "cancelled")
    return "TERMINEE";
  if (job.kaze_status === "started" || job.performer_name) return "EN_COURS";
  return "A_TRAITER";
}

// ── Auto-fit de la carte aux markers ────────────────────────
function FitBounds({ missions }) {
  const map = useMap();
  useEffect(() => {
    if (!missions || missions.length === 0) return;
    const points = [];
    missions.forEach((m) => {
      if (m.departure) points.push([m.departure.lat, m.departure.lng]);
      if (m.arrival) points.push([m.arrival.lat, m.arrival.lng]);
    });
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
    }
  }, [missions, map]);
  return null;
}

// ── Popup content ───────────────────────────────────────────
function MissionPopup({ mission, type }) {
  const cfg = STATUS_CONFIG[mission.status] || {};
  const point = type === "departure" ? mission.departure : mission.arrival;
  return (
    <div className="min-w-[220px] text-sm">
      <div className="font-bold text-dark-900 mb-1 flex items-center gap-1.5">
        <MapPin size={14} />
        {type === "departure" ? "Départ" : "Arrivée"}
      </div>
      <p className="text-dark-600 text-xs mb-2">{point?.address}</p>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-dark-500">Statut</span>
          <span
            className="font-medium text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: cfg.color + "22", color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
        {mission.vehicle && (
          <div className="flex justify-between">
            <span className="text-dark-500">Véhicule</span>
            <span className="font-medium text-dark-800">{mission.vehicle}</span>
          </div>
        )}
        {mission.plate && (
          <div className="flex justify-between">
            <span className="text-dark-500">Plaque</span>
            <span className="font-medium text-dark-800">{mission.plate}</span>
          </div>
        )}
        {mission.client && (
          <div className="flex justify-between">
            <span className="text-dark-500">Client</span>
            <span className="font-medium text-dark-800">{mission.client}</span>
          </div>
        )}
        {mission.convoyeur && (
          <div className="flex justify-between">
            <span className="text-dark-500">Convoyeur</span>
            <span className="font-medium text-dark-800">
              {mission.convoyeur}
            </span>
          </div>
        )}
        {mission.price && (
          <div className="flex justify-between">
            <span className="text-dark-500">Prix</span>
            <span className="font-bold text-dark-800">
              {parseFloat(mission.price).toFixed(2)} € HT
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminMap() {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Par défaut, l'historique est masqué : la carte sert d'abord à piloter
  // ce qui reste à faire.
  const [activePhases, setActivePhases] = useState(
    new Set(["A_TRAITER", "EN_COURS"]),
  );

  // Kaze data
  const [kazeJobs, setKazeJobs] = useState([]);
  const [kazeUsers, setKazeUsers] = useState([]);
  const [showKazeJobs, setShowKazeJobs] = useState(true);
  const [showKazeDrivers, setShowKazeDrivers] = useState(true);

  const fetchMapData = async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses = [...activeStatuses].join(",");
      const [mapRes, kazeUsersRes] = await Promise.all([
        api
          .get(`/admin/missions/map?statuses=${statuses}`)
          .catch(() => ({ data: { missions: [], kazeMissions: [] } })),
        api.get("/admin/kaze/users").catch(() => ({ data: { data: [] } })),
      ]);
      setMissions(mapRes.data.missions || []);
      setKazeJobs(mapRes.data.kazeMissions || []);
      setKazeUsers(kazeUsersRes.data.data || []);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les données de la carte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePhase = (phase) => {
    setActivePhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  // Filtrage local pour une bascule instantanée
  const filtered = useMemo(
    () => missions.filter((m) => activePhases.has(phaseDeStatut(m.status))),
    [missions, activePhases],
  );

  const kazeFiltres = useMemo(
    () => kazeJobs.filter((j) => activePhases.has(phaseDeKaze(j))),
    [kazeJobs, activePhases],
  );

  // Compteurs par phase, toutes sources confondues : c'est le volume réel
  // à traiter qui compte, pas la provenance technique de la mission.
  const stats = useMemo(() => {
    const counts = { A_TRAITER: 0, EN_COURS: 0, TERMINEE: 0 };
    missions.forEach((m) => counts[phaseDeStatut(m.status)]++);
    kazeJobs.forEach((j) => counts[phaseDeKaze(j)]++);
    return counts;
  }, [missions, kazeJobs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={36} className="animate-spin text-primary-500 mb-4" />
        <p className="text-dark-400 text-sm">
          Géocodage des adresses en cours…
        </p>
        <p className="text-dark-500 text-xs mt-1">
          (premier chargement plus long)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-400">
        <AlertCircle size={40} className="mb-4 text-red-500" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={fetchMapData}
          className="mt-4 bg-primary-600 hover:bg-primary-700 text-white py-2 px-4 rounded-lg text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── En-tête ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Carte des missions</h1>
          <p className="text-dark-400 text-sm mt-1">
            {filtered.length} mission{filtered.length > 1 ? "s" : ""} affichée
            {filtered.length > 1 ? "s" : ""} sur {missions.length}
          </p>
        </div>
        <button
          onClick={fetchMapData}
          className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-dark-200 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {/* ── Filtres par phase ────────────────── */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-dark-400" />
          <span className="text-sm font-medium text-dark-300">
            Où en sont les missions
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Object.entries(PHASES).map(([key, cfg]) => {
            const isActive = activePhases.has(key);
            return (
              <button
                key={key}
                onClick={() => togglePhase(key)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all duration-200 ${
                  isActive
                    ? cfg.bg
                    : "bg-dark-900/50 text-dark-500 border-dark-700 opacity-50"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: isActive ? cfg.color : "#475569",
                    }}
                  />
                  {cfg.label}
                  <span className="ml-auto font-bold">{stats[key] || 0}</span>
                </span>
                <span className="block text-[11px] text-dark-400 mt-1 pl-5">
                  {cfg.aide}
                </span>
              </button>
            );
          })}
        </div>
        {/* Kaze toggles */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dark-700">
          <Zap size={14} className="text-orange-400" />
          <span className="text-xs font-medium text-orange-400 mr-2">Kaze</span>
          <button
            onClick={() => setShowKazeJobs((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
              showKazeJobs
                ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                : "bg-dark-900/50 text-dark-500 border-dark-700 opacity-50"
            }`}
          >
            <Truck size={12} />
            Missions Kaze
            <span className="font-bold">{kazeFiltres.length}</span>
          </button>
          <button
            onClick={() => setShowKazeDrivers((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
              showKazeDrivers
                ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                : "bg-dark-900/50 text-dark-500 border-dark-700 opacity-50"
            }`}
          >
            <Users size={12} />
            Convoyeurs GPS
            <span className="font-bold">
              {kazeUsers.filter((u) => u.latitude).length}
            </span>
          </button>
        </div>
      </div>

      {/* ── Carte Leaflet ────────────────────── */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div style={{ height: "65vh", minHeight: 500 }}>
          <MapContainer
            center={[46.603354, 1.888334]} // Centre France
            zoom={6}
            style={{ height: "100%", width: "100%" }}
            className="rounded-xl"
          >
            {/*
              Fonds de carte. Le fond par défaut est une véritable carte
              routière : hiérarchie des axes marquée, numéros d'autoroutes
              et de nationales lisibles dès le zoom régional, échangeurs
              nommés. C'est ce qu'il faut pour juger un trajet de convoyage.
            */}
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Carte routière">
                {/*
                  Esri World Street Map : rendu de type atlas routier, les
                  autoroutes ressortent en orange soutenu et les nationales
                  en jaune, bien avant les rues secondaires.
                */}
                <TileLayer
                  attribution="Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Routière (nuit)">
                {/*
                  Même hiérarchie routière sur fond sombre : cohérent avec le
                  dashboard, les tracés de missions restent lisibles.
                */}
                <LayerGroup>
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
                    maxZoom={20}
                  />
                  {/* Calque de libellés seul : rend les numéros de route
                      lisibles par-dessus le fond sombre. */}
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png"
                    maxZoom={20}
                  />
                </LayerGroup>
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="OpenStreetMap">
                {/*
                  Rendu Mapnik : plus dense, utile pour vérifier une adresse
                  précise ou un accès de livraison.
                */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Relief">
                {/*
                  Ombrage du relief : pour anticiper les trajets de montagne
                  et les cols, qui pèsent sur la durée d'un convoyage.
                */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tuiles <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <FitBounds missions={filtered} />

            {filtered.map((m) => {
              const phase = phaseDeStatut(m.status);
              const cfg = PHASES[phase];
              // Les missions livrées s'effacent : présentes pour le contexte,
              // elles ne doivent pas concurrencer visuellement l'actif.
              const terminee = phase === "TERMINEE";

              return (
                <Fragment key={m.id}>
                  {/* Ligne départ → arrivée */}
                  {m.departure && m.arrival && (
                    <Polyline
                      positions={[
                        [m.departure.lat, m.departure.lng],
                        [m.arrival.lat, m.arrival.lng],
                      ]}
                      pathOptions={{
                        color: cfg.color,
                        weight: terminee ? 1.5 : 3,
                        opacity: terminee ? 0.35 : 0.9,
                        dashArray: terminee ? "3 6" : "7 5",
                      }}
                    />
                  )}

                  {/* Marqueur départ — disque plein */}
                  {m.departure && (
                    <CircleMarker
                      center={[m.departure.lat, m.departure.lng]}
                      radius={cfg.rayon}
                      pathOptions={{
                        fillColor: cfg.color,
                        fillOpacity: terminee ? 0.5 : 1,
                        color: "#0f172a",
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <MissionPopup mission={m} type="departure" />
                      </Popup>
                    </CircleMarker>
                  )}

                  {/* Marqueur arrivée — anneau creux, pour distinguer
                      d'un coup d'œil le point de chute du point de départ */}
                  {m.arrival && (
                    <CircleMarker
                      center={[m.arrival.lat, m.arrival.lng]}
                      radius={cfg.rayon - 2}
                      pathOptions={{
                        fillColor: "#ffffff",
                        fillOpacity: terminee ? 0.5 : 0.95,
                        color: cfg.color,
                        weight: 3,
                      }}
                    >
                      <Popup>
                        <MissionPopup mission={m} type="arrival" />
                      </Popup>
                    </CircleMarker>
                  )}
                </Fragment>
              );
            })}

            {/* ── Missions Kaze ──────────────────────── */}
            {/* Même code couleur que les missions DLC : ce qui compte est
                l'avancement, pas la provenance. La bordure orange rappelle
                seulement qu'elles viennent de Kaze. */}
            {showKazeJobs &&
              kazeFiltres.map((job) => {
                const cfg = PHASES[phaseDeKaze(job)];
                return (
                  <CircleMarker
                    key={`kaze-${job.kaze_job_id}`}
                    center={[job.latitude, job.longitude]}
                    radius={cfg.rayon}
                    pathOptions={{
                      fillColor: cfg.color,
                      fillOpacity: 1,
                      color: "#f97316",
                      weight: 3,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px] text-sm">
                        <div className="font-bold text-dark-900 mb-1 flex items-center gap-1.5">
                          <span style={{ color: "#f97316" }}>⚡</span> Kaze —{" "}
                          {job.kaze_reference}
                        </div>
                        <p className="font-medium text-dark-800 mb-1">
                          {job.title}
                        </p>
                        <p className="text-dark-500 text-xs mb-2">
                          {job.address}
                        </p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-dark-500">Statut</span>
                            <span
                              className="font-medium"
                              style={{ color: "#f97316" }}
                            >
                              {job.status_name}
                            </span>
                          </div>
                          {job.performer_name && (
                            <div className="flex justify-between">
                              <span className="text-dark-500">Convoyeur</span>
                              <span className="font-medium text-dark-800">
                                {job.performer_name}
                              </span>
                            </div>
                          )}
                          {job.due_date && (
                            <div className="flex justify-between">
                              <span className="text-dark-500">Date</span>
                              <span className="text-dark-700">
                                {new Date(job.due_date).toLocaleDateString(
                                  "fr-FR",
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

            {/* ── Kaze drivers GPS (cyan pulsing markers) ── */}
            {showKazeDrivers &&
              kazeUsers
                .filter((u) => u.latitude)
                .map((user) => (
                  <CircleMarker
                    key={`driver-${user.kaze_user_id}`}
                    center={[user.latitude, user.longitude]}
                    radius={6}
                    pathOptions={{
                      fillColor: "#06b6d4",
                      fillOpacity: 0.9,
                      color: "#06b6d4",
                      weight: 3,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[180px] text-sm">
                        <div className="font-bold text-dark-900 mb-1 flex items-center gap-1.5">
                          <span style={{ color: "#06b6d4" }}>📍</span>{" "}
                          {user.name}
                        </div>
                        <div className="space-y-1 text-xs">
                          {user.device && (
                            <div className="flex justify-between">
                              <span className="text-dark-500">Appareil</span>
                              <span className="text-dark-700">
                                {user.device.name || user.device.platform}
                              </span>
                            </div>
                          )}
                          {user.location_updated_at && (
                            <div className="flex justify-between">
                              <span className="text-dark-500">Position</span>
                              <span className="text-dark-700">
                                {new Date(
                                  user.location_updated_at,
                                ).toLocaleString("fr-FR")}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-dark-500">GPS</span>
                            <span className="text-dark-700 font-mono text-[10px]">
                              {user.latitude?.toFixed(4)},{" "}
                              {user.longitude?.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
          </MapContainer>
        </div>
      </div>

      {/* ── Légende ──────────────────────────── */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <p className="text-sm font-medium text-dark-300 mb-3">Légende</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-dark-400">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-white border-2 border-primary-400" />
            Gros cercle = Départ
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border-2 border-dashed border-primary-400"
              style={{ borderStyle: "dashed" }}
            />
            Petit cercle = Arrivée
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 border-t-2 border-dashed border-primary-400" />
            Ligne = Trajet
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: "#f97316", border: "2px solid #fff" }}
            />
            <span className="text-orange-400">Mission Kaze</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{
                backgroundColor: "#06b6d4",
                border: "2px solid #06b6d4",
              }}
            />
            <span className="text-cyan-400">Convoyeur GPS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
