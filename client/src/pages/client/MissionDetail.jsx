import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import {
  ArrowLeft,
  MapPin,
  Car,
  Calendar,
  Euro,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  User,
  Key,
  Fuel,
  Sparkles,
  Droplets,
  ShieldAlert,
  Download,
  KeyRound,
} from "lucide-react";
import toast from "react-hot-toast";

export default function MissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api
      .get(`/missions/${id}`)
      .then((res) => setMission(res.data.mission))
      .catch(() => {
        toast.error("Mission introuvable.");
        navigate("/client");
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const downloadDevis = async (missionId) => {
    try {
      const response = await api.get(`/missions/${missionId}/devis`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `devis-DEV-${missionId.substring(0, 8).toUpperCase()}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur lors du téléchargement du devis.");
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await api.post(`/missions/${id}/accepter`);
      toast.success("Mission acceptée ! Téléchargement du devis…");
      setMission({ ...mission, status: "ACCEPTEE" });
      // Télécharger automatiquement le devis PDF
      await downloadDevis(id);
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de l'acceptation.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!mission) return null;

  const energyLabels = {
    essence: "Essence",
    diesel: "Diesel",
    electrique: "Électrique",
    hybride: "Hybride",
    hybride_rechargeable: "Hybride rechargeable",
    gpl: "GPL",
  };
  const stateLabels = {
    neuf: "Neuf",
    occasion: "Occasion",
    accidente: "Accidenté",
    non_roulant: "Non roulant",
  };

  const hasServices =
    mission.service_wash_exterior ||
    mission.service_clean_interior ||
    mission.service_refuel ||
    mission.service_handover;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/client")}
        className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        Retour aux missions
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {mission.departure_address} → {mission.arrival_address}
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            Créée le {formatDate(mission.created_at)}
          </p>
        </div>
        <span
          className={`badge text-sm px-3 py-1 mt-3 sm:mt-0 ${STATUS_COLORS[mission.status]}`}
        >
          {STATUS_LABELS[mission.status]}
        </span>
      </div>

      {/* Accept bar */}
      {mission.status === "DEVIS_PROPOSE" && (
        <div className="card bg-gradient-to-r from-primary-900/50 to-dark-800/50 border-primary-500/30 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Euro size={24} className="text-primary-400" />
              <div>
                <p className="text-sm text-dark-300">Devis proposé</p>
                <p className="text-2xl font-bold">
                  {formatPrice(mission.price)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadDevis(id)}
                className="btn-secondary flex items-center gap-2"
              >
                <Download size={18} />
                Voir le devis
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="btn-accent flex items-center gap-2"
              >
                <CheckCircle2 size={18} />
                {accepting ? "Validation…" : "Accepter la mission"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download devis bar (after acceptance) */}
      {mission.price &&
        ["ACCEPTEE", "ASSIGNEE", "EN_COURS", "LIVREE"].includes(
          mission.status,
        ) && (
          <div className="card bg-gradient-to-r from-emerald-900/30 to-dark-800/50 border-emerald-500/20 mb-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-emerald-400" />
                <div>
                  <p className="text-sm text-dark-300">Devis accepté</p>
                  <p className="text-xl font-bold">
                    {formatPrice(mission.price)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => downloadDevis(id)}
                className="btn-primary flex items-center gap-2"
              >
                <Download size={18} />
                Télécharger le devis PDF
              </button>
            </div>
          </div>
        )}

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Véhicule */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Car size={18} className="text-primary-400" />
            <h3 className="font-semibold">Véhicule</h3>
          </div>
          <div className="space-y-2 text-sm">
            {mission.vehicle_brand && (
              <div className="flex justify-between">
                <span className="text-dark-400">Marque / Modèle</span>
                <span>
                  {mission.vehicle_brand} {mission.vehicle_model}
                </span>
              </div>
            )}
            {mission.vehicle_plate && (
              <div className="flex justify-between">
                <span className="text-dark-400">Plaque</span>
                <span className="font-mono">{mission.vehicle_plate}</span>
              </div>
            )}
            {mission.vehicle_vin && (
              <div className="flex justify-between">
                <span className="text-dark-400">VIN</span>
                <span className="font-mono text-xs">{mission.vehicle_vin}</span>
              </div>
            )}
            {mission.vehicle_finish && (
              <div className="flex justify-between">
                <span className="text-dark-400">Finition</span>
                <span>{mission.vehicle_finish}</span>
              </div>
            )}
            {mission.vehicle_energy && (
              <div className="flex justify-between">
                <span className="text-dark-400">Énergie</span>
                <span>
                  {energyLabels[mission.vehicle_energy] ||
                    mission.vehicle_energy}
                </span>
              </div>
            )}
            {mission.vehicle_state && (
              <div className="flex justify-between">
                <span className="text-dark-400">État</span>
                <span>
                  {stateLabels[mission.vehicle_state] || mission.vehicle_state}
                </span>
              </div>
            )}
            {mission.vehicle_keys != null && (
              <div className="flex justify-between">
                <span className="text-dark-400">Clés</span>
                <span className="flex items-center gap-1">
                  <Key size={13} />
                  {mission.vehicle_keys}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Départ */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-green-400" />
            <h3 className="font-semibold">Enlèvement (départ)</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-dark-400 text-xs">Adresse</p>
              <p className="font-medium">{mission.departure_address}</p>
            </div>
            {mission.departure_date && (
              <div>
                <p className="text-dark-400 text-xs">Date / heure</p>
                <p>{formatDate(mission.departure_date)}</p>
              </div>
            )}
            {mission.departure_contact_name && (
              <div className="flex items-center gap-2 pt-2 border-t border-dark-700">
                <User size={14} className="text-dark-400" />
                <span>{mission.departure_contact_name}</span>
              </div>
            )}
            {mission.departure_contact_phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-dark-400" />
                <span>{mission.departure_contact_phone}</span>
              </div>
            )}
            {mission.departure_instructions && (
              <div className="mt-2 p-2 bg-dark-700/50 rounded text-xs text-dark-300">
                <p className="font-medium text-dark-400 mb-1">Instructions</p>
                {mission.departure_instructions}
              </div>
            )}
          </div>
        </div>

        {/* Arrivée */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-red-400" />
            <h3 className="font-semibold">Livraison (arrivée)</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-dark-400 text-xs">Adresse</p>
              <p className="font-medium">{mission.arrival_address}</p>
            </div>
            {mission.arrival_date && (
              <div>
                <p className="text-dark-400 text-xs">Date / heure</p>
                <p>{formatDate(mission.arrival_date)}</p>
              </div>
            )}
            {mission.arrival_contact_name && (
              <div className="flex items-center gap-2 pt-2 border-t border-dark-700">
                <User size={14} className="text-dark-400" />
                <span>{mission.arrival_contact_name}</span>
              </div>
            )}
            {mission.arrival_contact_phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-dark-400" />
                <span>{mission.arrival_contact_phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        {hasServices && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={18} className="text-primary-400" />
              <h3 className="font-semibold">Services</h3>
            </div>
            <div className="space-y-2 text-sm">
              {mission.service_wash_exterior && (
                <div className="flex items-center gap-2 text-blue-400">
                  <Droplets size={14} />
                  <span>Lavage extérieur</span>
                </div>
              )}
              {mission.service_clean_interior && (
                <div className="flex items-center gap-2 text-emerald-400">
                  <Sparkles size={14} />
                  <span>Nettoyage intérieur</span>
                </div>
              )}
              {mission.service_refuel && (
                <div className="flex items-center gap-2 text-amber-400">
                  <Fuel size={14} />
                  <span>Plein de carburant</span>
                </div>
              )}
              {mission.service_handover && (
                <div className="flex items-center gap-2 text-primary-400">
                  <KeyRound size={14} />
                  <span>Mise en main du véhicule</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prix */}
        {mission.price && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Euro size={18} className="text-primary-400" />
              <h3 className="font-semibold">Tarif</h3>
            </div>
            <p className="text-2xl font-bold">{formatPrice(mission.price)}</p>
          </div>
        )}

        {/* Urgence */}
        {mission.emergency_phone && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert size={18} className="text-red-400" />
              <h3 className="font-semibold">Contact d'urgence</h3>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone size={14} className="text-dark-400" />
              <span>{mission.emergency_phone}</span>
            </div>
          </div>
        )}
      </div>

      {/* Commentaires */}
      {mission.comments && (
        <div className="card mt-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-primary-400" />
            <h3 className="font-semibold">Commentaires</h3>
          </div>
          <p className="text-dark-300 text-sm whitespace-pre-wrap">
            {mission.comments}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="card mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-primary-400" />
          <h3 className="font-semibold">Suivi</h3>
        </div>
        <div className="space-y-3">
          {[
            {
              status: "EN_ATTENTE_DE_COTATION",
              label: "Demande créée",
              date: mission.created_at,
            },
            mission.status !== "EN_ATTENTE_DE_COTATION" && {
              status: "DEVIS_PROPOSE",
              label: "Devis proposé",
              date: mission.updated_at,
            },
            ["ACCEPTEE", "ASSIGNEE", "EN_COURS", "LIVREE"].includes(
              mission.status,
            ) && {
              status: "ACCEPTEE",
              label: "Mission acceptée",
              date: mission.updated_at,
            },
            ["ASSIGNEE", "EN_COURS", "LIVREE"].includes(mission.status) && {
              status: "ASSIGNEE",
              label: "Convoyeur assigné",
              date: mission.updated_at,
            },
            ["EN_COURS", "LIVREE"].includes(mission.status) && {
              status: "EN_COURS",
              label: "En cours de convoyage",
              date: mission.updated_at,
            },
            mission.status === "LIVREE" && {
              status: "LIVREE",
              label: "Véhicule livré",
              date: mission.updated_at,
            },
          ]
            .filter(Boolean)
            .map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-dark-500">
                    {formatDate(step.date)}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
