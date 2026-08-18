import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import {
  PlusCircle,
  FileText,
  ArrowRight,
  AlertTriangle,
  Truck,
} from "lucide-react";

/**
 * Regroupements proposés au client.
 *
 * On raisonne par étape vécue plutôt que par statut technique : « en cours »
 * couvre aussi bien une mission assignée qu'un convoyage démarré, distinction
 * qui n'intéresse pas le client. Un filtre par statut brut multiplierait les
 * onglets pour un gain nul.
 */
const FILTRES = [
  { cle: "TOUTES", label: "Toutes", statuts: null },
  {
    cle: "A_COTER",
    label: "En attente de cotation",
    statuts: ["EN_ATTENTE_DE_COTATION"],
  },
  {
    cle: "DEVIS",
    label: "Devis à traiter",
    statuts: ["DEVIS_PROPOSE", "DEVIS_REFUSE"],
  },
  {
    cle: "EN_COURS",
    label: "En cours",
    statuts: ["ACCEPTEE", "ASSIGNEE", "EN_COURS"],
  },
  { cle: "TERMINEES", label: "Terminées", statuts: ["LIVREE"] },
  { cle: "ANNULEES", label: "Annulées", statuts: ["ANNULEE"] },
];

export default function ClientDashboard() {
  const { user } = useAuth();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtre, setFiltre] = useState("TOUTES");

  useEffect(() => {
    api
      .get("/missions/mes-missions")
      .then((res) => setMissions(res.data.missions))
      .catch((err) => {
        console.error(err);
        setError("Impossible de charger vos missions.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Le filtrage se fait en mémoire : le client a rarement plus de quelques
  // dizaines de missions, un aller-retour serveur par onglet serait un coût
  // sans contrepartie.
  const compter = (statuts) =>
    statuts === null
      ? missions.length
      : missions.filter((m) => statuts.includes(m.status)).length;

  const actif = FILTRES.find((f) => f.cle === filtre) || FILTRES[0];
  const missionsVisibles =
    actif.statuts === null
      ? missions
      : missions.filter((m) => actif.statuts.includes(m.status));

  if (!user.is_validated) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">
          Compte en attente de validation
        </h2>
        <p className="text-dark-400 text-center max-w-md">
          Votre compte doit être validé par un administrateur avant de pouvoir
          créer des missions. Vous serez notifié par email dès que votre compte
          sera activé.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Mes missions</h1>
          <p className="text-dark-400 text-sm mt-1">
            Gérez vos demandes de convoyage automobile.
          </p>
        </div>
        <Link
          to="/client/nouvelle-mission"
          className="btn-primary flex items-center gap-2 mt-4 sm:mt-0"
        >
          <PlusCircle size={18} />
          Nouvelle mission
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      )}

      {/* Empty */}
      {!loading && missions.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Truck size={32} className="text-dark-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Aucune mission</h3>
          <p className="text-dark-400 text-sm mb-6">
            Vous n'avez pas encore créé de demande de convoyage.
          </p>
          <Link
            to="/client/nouvelle-mission"
            className="btn-primary inline-flex items-center gap-2"
          >
            <PlusCircle size={18} />
            Créer ma première mission
          </Link>
        </div>
      )}

      {/* Filtres par étape — masqués tant qu'il n'y a rien à trier */}
      {!loading && missions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-5 -mx-1 px-1">
          {FILTRES.map((f) => {
            const n = compter(f.statuts);
            // Un onglet toujours vide n'apporte rien : on le retire, sauf
            // « Toutes » qui sert de retour à l'état initial.
            if (n === 0 && f.cle !== "TOUTES") return null;
            const estActif = filtre === f.cle;
            return (
              <button
                key={f.cle}
                onClick={() => setFiltre(f.cle)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-lg text-sm font-medium border transition-colors ${
                  estActif
                    ? "bg-primary-600 border-primary-600 text-white"
                    : "bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700"
                }`}
              >
                {f.label}
                <span
                  className={`text-xs font-bold ${
                    estActif ? "text-white/80" : "text-dark-500"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Aucun résultat pour le filtre courant */}
      {!loading && missions.length > 0 && missionsVisibles.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-dark-400 text-sm">
            Aucune mission dans cette catégorie.
          </p>
        </div>
      )}

      {!loading && missionsVisibles.length > 0 && (
        <div className="space-y-4">
          {missionsVisibles.map((mission) => (
            <Link
              key={mission.id}
              to={`/client/missions/${mission.id}`}
              className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-primary-500/30 transition-all group"
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="w-10 h-10 bg-primary-600/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileText size={20} className="text-primary-400" />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold">
                      {mission.departure_address} → {mission.arrival_address}
                    </h3>
                    <span className={`badge ${STATUS_COLORS[mission.status]}`}>
                      {STATUS_LABELS[mission.status]}
                    </span>
                  </div>
                  <p className="text-dark-400 text-sm mt-1">
                    {mission.vehicle_brand} {mission.vehicle_model}
                    {mission.vehicle_plate && ` • ${mission.vehicle_plate}`}
                  </p>
                  <p className="text-dark-500 text-xs mt-1">
                    Créée le {formatDate(mission.created_at)}
                    {mission.departure_date &&
                      ` • Départ le ${formatDate(mission.departure_date)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {mission.price && (
                  <span className="text-lg font-bold text-white">
                    {formatPrice(mission.price)}
                  </span>
                )}
                <ArrowRight
                  size={18}
                  className="text-dark-500 group-hover:text-primary-400 transition-colors"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
