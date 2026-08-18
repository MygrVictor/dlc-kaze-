import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { libelle, classeDePeage } from "../../lib/vehicules";
import {
  MapPin,
  Car,
  Euro,
  Clock,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

const statusColors = {
  ACCEPTEE: "bg-green-500/20 text-green-400",
};

export default function MissionsDisponibles() {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(null);

  const fetchMissions = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/convoyeur/missions-disponibles");
      setMissions(data.missions || data);
    } catch {
      toast.error("Erreur lors du chargement des missions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissions();
    // Rafraîchir toutes les 15 secondes pour le temps réel
    const interval = setInterval(fetchMissions, 15000);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  const handlePrendre = async (mission) => {
    if (!confirm("Voulez-vous vraiment prendre cette mission ?")) return;
    try {
      setTaking(mission.id);
      if (mission.source === "kaze") {
        // Mission provenant uniquement de Kaze (jamais créée sur le site)
        await api.post(
          `/convoyeur/kaze-missions/${mission.kaze_job_id}/prendre`,
        );
        toast.success(
          "Mission prise avec succès ! Elle apparaît dans votre planning.",
        );
      } else {
        const { data } = await api.post(
          `/convoyeur/missions/${mission.id}/prendre`,
        );
        toast.success(
          "Mission prise avec succès ! Elle apparaît dans votre planning.",
        );
        if (data.kazeSync?.error) {
          toast.error(
            `⚠️ Mission prise, mais non synchronisée avec Kaze : ${data.kazeSync.error}. Contactez un administrateur.`,
            { duration: 10000 },
          );
        }
      }
      // Retirer la mission de la liste
      setMissions((prev) => prev.filter((m) => m.id !== mission.id));
    } catch (err) {
      const msg =
        err.response?.data?.error || "Impossible de prendre cette mission";
      toast.error(msg);
    } finally {
      setTaking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Missions disponibles
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Missions acceptées par les clients, en attente d'un convoyeur
          </p>
        </div>
        <button
          onClick={fetchMissions}
          className="flex items-center justify-center gap-2 px-4 min-h-[44px] bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors w-full sm:w-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Rafraîchir
        </button>
      </div>

      {/* Indicateur temps réel */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        Mise à jour automatique toutes les 15 secondes
      </div>

      {/* Liste des missions */}
      {missions.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400">
            Aucune mission disponible
          </h3>
          <p className="text-gray-500 mt-2">
            Les nouvelles missions apparaîtront ici automatiquement
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {missions.map((mission) => (
            <div
              key={mission.id}
              className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-blue-500/50 transition-colors"
            >
              {/* Status */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    statusColors[mission.status] || "bg-gray-600 text-gray-300"
                  }`}
                >
                  {mission.status}
                </span>
                <div className="flex items-center gap-2">
                  {mission.source === "kaze" && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400">
                      Kaze
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(mission.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>

              {/* Trajet */}
              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Départ</p>
                    <p className="text-white font-medium break-words">
                      {mission.departure_address}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Arrivée</p>
                    <p className="text-white font-medium break-words">
                      {mission.arrival_address || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Véhicule & Prix */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <Car className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-gray-300 truncate">
                    {mission.vehicle_brand} {mission.vehicle_model}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Euro className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400 font-bold">
                    {mission.price ? `${mission.price} €` : "—"}
                  </span>
                </div>
              </div>

              {/* Gabarit : conditionne la conduite et la classe de péage */}
              {mission.vehicle_type && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded-full">
                    {libelle(mission.vehicle_type)}
                  </span>
                  <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full">
                    Péage classe{" "}
                    {mission.vehicle_toll_class ||
                      classeDePeage(mission.vehicle_type)}
                  </span>
                </div>
              )}

              {mission.departure_date && (
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                  <Clock className="w-4 h-4" />
                  <span>
                    {new Date(mission.departure_date).toLocaleDateString(
                      "fr-FR",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      },
                    )}
                  </span>
                </div>
              )}

              {/* Bouton prendre */}
              <button
                onClick={() => handlePrendre(mission)}
                disabled={taking === mission.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {taking === mission.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    En cours...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Prendre cette mission
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
