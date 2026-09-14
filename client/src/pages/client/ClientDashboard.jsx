import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import {
  STATUS_LABELS,
  classeStatut,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import { PlusCircle, ArrowRight, Building2 } from "lucide-react";

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
    // Le siège d'un groupe agrège les missions de ses entités : la
    // valeur par défaut de vingt tronquerait sa liste sans rien dire.
    api
      .get("/missions/mes-missions?limit=100")
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
      <div className="at-etat mt-6">
        <p className="at-etat__titre">Compte en attente de validation</p>
        <p className="at-etat__texte max-w-md mx-auto">
          Votre compte doit être validé par un administrateur avant de pouvoir
          créer des missions. Vous serez notifié par courriel dès qu'il sera
          activé.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="at-entete mb-6">
        <div>
          <h1 className="at-entete__titre">Mes missions</h1>
          <p className="at-entete__sous">
            Gérez vos demandes de convoyage automobile.
          </p>
        </div>
        <Link to="/client/nouvelle-mission" className="at-action">
          <PlusCircle size={16} />
          Nouvelle mission
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20">
          <div
            className="animate-spin rounded-full h-8 w-8"
            style={{
              border: "2px solid var(--at-accent)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      )}

      {/* Empty */}
      {!loading && missions.length === 0 && (
        <div className="at-etat">
          <p className="at-etat__titre">Aucune mission</p>
          <p className="at-etat__texte">
            Vous n'avez pas encore créé de demande de convoyage.
          </p>
          <Link to="/client/nouvelle-mission" className="at-action mt-5">
            <PlusCircle size={16} />
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
                className={`at-puce${estActif ? " at-puce--actif" : ""}`}
              >
                {f.label}
                <span className="at-puce__n">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Aucun résultat pour le filtre courant */}
      {!loading && missions.length > 0 && missionsVisibles.length === 0 && (
        <div className="at-etat">
          <p className="at-etat__texte">Aucune mission dans cette catégorie.</p>
        </div>
      )}

      {!loading && missionsVisibles.length > 0 && (
        <div className="space-y-2">
          {missionsVisibles.map((mission) => (
            <Link
              key={mission.id}
              to={`/client/missions/${mission.id}`}
              className="at-carte flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* La plaque prime sur le trajet : c'est par elle que le
                      client désigne son véhicule au téléphone, et deux
                      missions sur un même axe ne se distinguent que par
                      elle. Le trajet reste juste en dessous. */}
                  <h3 className="at-carte__titre at-plaque">
                    {mission.vehicle_plate || "Plaque non renseignée"}
                  </h3>
                  <span className={classeStatut(mission.status)}>
                    {STATUS_LABELS[mission.status]}
                  </span>
                </div>
                <p className="at-carte__meta">
                  {mission.departure_address} → {mission.arrival_address}
                </p>
                <p className="at-carte__note">
                  {mission.vehicle_brand} {mission.vehicle_model}
                </p>
                {/* Renseigné par le serveur pour les seuls sièges de
                    groupe : sans ce repère, les missions des entités se
                    mélangeraient sans qu'on puisse les distinguer. */}
                {(mission.entite_company || mission.entite_name) && (
                  <p
                    className="at-carte__note flex items-center gap-1.5"
                    style={{ color: "var(--at-accent)" }}
                  >
                    <Building2 size={11} />
                    {mission.entite_company || mission.entite_name}
                  </p>
                )}
                <p className="at-carte__note">
                  Créée le {formatDate(mission.created_at)}
                  {mission.departure_date &&
                    ` · Départ le ${formatDate(mission.departure_date)}`}
                </p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                {mission.price && (
                  <span className="at-carte__montant">
                    {formatPrice(mission.price)}
                  </span>
                )}
                <ArrowRight
                  size={16}
                  style={{ color: "var(--at-encre-3)" }}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
