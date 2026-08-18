import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { formatDate, formatPrice } from "../../lib/utils";
import {
  History,
  MapPin,
  ArrowRight,
  Car,
  Calendar,
  Inbox,
  Euro,
  Flag,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Archive des missions livrées par le convoyeur connecté.
 *
 * Le planning ne conserve que les 7 derniers jours pour rester lisible :
 * cette page donne accès à l'ensemble des courses passées, avec le cumul
 * des rémunérations, afin que le convoyeur puisse vérifier ses revenus.
 */
export default function ConvoyeurHistorique() {
  const [missions, setMissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [revenus, setRevenus] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchHistorique = useCallback((pageDemandee) => {
    setLoading(true);
    api
      .get(`/convoyeur/historique?page=${pageDemandee}&limit=25`)
      .then(({ data }) => {
        // Page 1 : on repart de zéro. Pages suivantes : on empile.
        setMissions((prev) =>
          pageDemandee === 1 ? data.missions : [...prev, ...data.missions],
        );
        setTotal(data.total || 0);
        setRevenus(data.revenus || 0);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => toast.error("Impossible de charger votre historique."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHistorique(page);
  }, [page, fetchHistorique]);

  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History size={26} className="text-accent-400" />
            Mes missions passées
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Retrouvez l'ensemble de vos convoyages terminés.
          </p>
        </div>
        <button
          onClick={() => {
            setPage(1);
            fetchHistorique(1);
          }}
          disabled={loading}
          className="btn-secondary btn-sm w-full sm:w-auto"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {/* ── Totaux ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Flag size={18} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-dark-400">Missions livrées</p>
              <p className="text-xl font-bold">{total}</p>
            </div>
          </div>
        </div>
        <div className="card py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
              <Euro size={18} className="text-accent-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-dark-400">Total perçu</p>
              <p className="text-xl font-bold truncate">
                {formatPrice(revenus)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chargement initial ──────────────────────────── */}
      {loading && missions.length === 0 && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500" />
        </div>
      )}

      {/* ── Aucune mission ──────────────────────────────── */}
      {!loading && missions.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Inbox size={30} className="text-dark-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Aucune mission terminée
          </h3>
          <p className="text-dark-400 text-sm max-w-md mx-auto">
            Vos convoyages apparaîtront ici une fois livrés.
          </p>
        </div>
      )}

      {/* ── Liste ───────────────────────────────────────── */}
      {missions.length > 0 && (
        <div className="space-y-3">
          {missions.map((mission) => (
            <div key={mission.id} className="card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Flag size={18} className="text-emerald-400" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Date + rémunération */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-1 text-xs text-dark-400">
                      <Calendar size={12} />
                      Livrée le {formatDate(mission.updated_at)}
                    </span>
                    {mission.price > 0 && (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-accent-500/10 text-accent-400 border border-accent-500/20 shrink-0">
                        {formatPrice(mission.price)}
                      </span>
                    )}
                  </div>

                  {/* Trajet : empilé sur mobile pour éviter la troncature */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={14} className="text-green-400 shrink-0" />
                      <span className="text-sm font-medium text-dark-100 truncate">
                        {mission.departure_address}
                      </span>
                    </span>
                    <ArrowRight
                      size={13}
                      className="text-dark-500 shrink-0 rotate-90 sm:rotate-0 ml-1 sm:ml-0"
                    />
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={14} className="text-red-400 shrink-0" />
                      <span className="text-sm font-medium text-dark-100 truncate">
                        {mission.arrival_address}
                      </span>
                    </span>
                  </div>

                  {/* Véhicule */}
                  <div className="flex items-center gap-2 text-xs text-dark-400">
                    <Car size={13} className="shrink-0" />
                    <span className="truncate">
                      {mission.vehicle_brand} {mission.vehicle_model}
                    </span>
                    {mission.vehicle_plate && (
                      <span className="font-mono text-dark-500 ml-auto shrink-0">
                        {mission.vehicle_plate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading}
              className="btn-secondary w-full"
            >
              {loading ? "Chargement…" : "Voir les missions plus anciennes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
