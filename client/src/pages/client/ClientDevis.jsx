import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  formatDate,
  formatPrice,
} from "../../lib/utils";
import {
  Download,
  FileText,
  ArrowRight,
  Receipt,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const STATUTS_DEVIS = [
  "DEVIS_PROPOSE",
  "ACCEPTEE",
  "ASSIGNEE",
  "EN_COURS",
  "LIVREE",
];

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const STATUTS_FACTURES = {
  emise: {
    libelle: "À régler",
    icone: Clock,
    classe: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  payee: {
    libelle: "Payée",
    icone: CheckCircle2,
    classe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  annulee: {
    libelle: "Annulée",
    icone: XCircle,
    classe: "bg-slate-500/10 text-slate-500 border-slate-500/30",
  },
};

const formaterMontantFacture = (centimes) => {
  if (centimes === null || centimes === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
};

const extraireNomFichier = (contentDisposition) => {
  if (!contentDisposition) return null;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const classique = contentDisposition.match(/filename="?([^";\n]+)"?/i);
  return classique?.[1] || null;
};

export default function ClientDevis() {
  const [missions, setMissions] = useState([]);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onglet, setOnglet] = useState("devis");

  useEffect(() => {
    Promise.all([
      api.get("/missions/mes-missions?limit=100"),
      api.get("/factures/mes-factures"),
    ])
      .then(([missionsRes, facturesRes]) => {
        setMissions(missionsRes.data.missions || []);
        setFactures(facturesRes.data || []);
      })
      .catch(() => toast.error("Impossible de charger vos devis/factures."))
      .finally(() => setLoading(false));
  }, []);

  const devis = useMemo(
    () =>
      missions.filter(
        (m) => m.price && STATUTS_DEVIS.includes(String(m.status || "")),
      ),
    [missions],
  );

  const telechargerDevis = async (missionId) => {
    try {
      const response = await api.get(`/missions/${missionId}/devis`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      const nomServeur = extraireNomFichier(
        response.headers?.["content-disposition"],
      );
      link.setAttribute(
        "download",
        nomServeur || `devis-${missionId.substring(0, 8).toUpperCase()}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Téléchargement du devis impossible.");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Mes factures et devis</h1>
        <p className="text-dark-400 text-sm mt-1">
          Retrouvez vos devis et vos factures dans le même espace.
        </p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setOnglet("devis")}
          className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
            onglet === "devis"
              ? "bg-primary-600 text-white border-primary-600"
              : "bg-dark-800 text-dark-300 border-dark-700 hover:bg-dark-700"
          }`}
        >
          Devis ({devis.length})
        </button>
        <button
          type="button"
          onClick={() => setOnglet("factures")}
          className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
            onglet === "factures"
              ? "bg-primary-600 text-white border-primary-600"
              : "bg-dark-800 text-dark-300 border-dark-700 hover:bg-dark-700"
          }`}
        >
          Factures ({factures.length})
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      )}

      {!loading && onglet === "devis" && devis.length === 0 && (
        <div className="card text-center py-14">
          <div className="w-14 h-14 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-dark-400" />
          </div>
          <p className="text-dark-300 font-medium">Aucun devis disponible.</p>
        </div>
      )}

      {!loading && onglet === "devis" && devis.length > 0 && (
        <div className="space-y-4">
          {devis.map((mission) => (
            <div
              key={mission.id}
              className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`badge ${STATUS_COLORS[mission.status]}`}>
                    {STATUS_LABELS[mission.status]}
                  </span>
                  <span className="text-sm text-dark-400">
                    {formatDate(mission.created_at)}
                  </span>
                </div>
                <p className="font-semibold text-dark-100 truncate">
                  {mission.departure_address} → {mission.arrival_address}
                </p>
                <p className="text-sm text-dark-400 mt-1">
                  {mission.vehicle_brand || "Véhicule"}{" "}
                  {mission.vehicle_model || ""}
                  {mission.vehicle_plate ? ` • ${mission.vehicle_plate}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 self-start sm:self-center">
                <span className="price-tag text-lg font-bold mr-1">
                  {formatPrice(mission.price)}
                </span>
                <button
                  type="button"
                  onClick={() => telechargerDevis(mission.id)}
                  className="btn-secondary btn-sm"
                >
                  <Download size={16} />
                  PDF
                </button>
                <Link
                  to={`/client/missions/${mission.id}`}
                  className="btn-primary btn-sm"
                >
                  Détail
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && onglet === "factures" && factures.length === 0 && (
        <div className="card text-center py-14">
          <div className="w-14 h-14 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Receipt size={28} className="text-dark-400" />
          </div>
          <p className="text-dark-300 font-medium">
            Aucune facture disponible.
          </p>
        </div>
      )}

      {!loading && onglet === "factures" && factures.length > 0 && (
        <ul className="space-y-3">
          {factures.map((f) => {
            const config = STATUTS_FACTURES[f.statut] || STATUTS_FACTURES.emise;
            const Icone = config.icone;
            return (
              <li key={f.id} className="card flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-500">
                      {f.numero}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.classe}`}
                    >
                      <Icone size={12} />
                      {config.libelle}
                    </span>
                  </div>
                  <p className="font-medium mt-1 text-dark-100">
                    {f.libelle || "Facture de convoyage"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.periode && `${f.periode} · `}
                    Émise le {formatDate(f.date_emission)}
                    {f.date_echeance &&
                      ` · Échéance ${formatDate(f.date_echeance)}`}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-dark-100">
                    {formaterMontantFacture(f.montant_ttc)}
                  </div>
                  <div className="text-xs text-slate-500">TTC</div>
                </div>

                <a
                  href={`${API_BASE}${f.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-700 text-sm font-medium hover:bg-dark-700 transition"
                >
                  <Download size={15} />
                  PDF
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
