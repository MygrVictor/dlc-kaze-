import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import {
  Receipt,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

/**
 * Espace factures d'un destinataire.
 *
 * Clients et convoyeurs consultent la même chose — leurs pièces
 * comptables, de la plus récente à la plus ancienne — et l'API leur
 * répond par la même route, qui lit l'identifiant dans le jeton. Deux
 * écrans distincts n'auraient différé que par leur titre.
 */

const STATUTS = {
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

export function formaterMontant(centimes) {
  if (centimes === null || centimes === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

export function formaterDate(valeur) {
  if (!valeur) return "—";
  return new Date(valeur).toLocaleDateString("fr-FR");
}

/**
 * Une facture émise dont l'échéance est passée mérite d'être signalée :
 * c'est la seule information que le destinataire ne peut pas déduire
 * d'un coup d'œil à la liste.
 */
function estEnRetard(facture) {
  if (facture.statut !== "emise" || !facture.date_echeance) return false;
  const echeance = new Date(facture.date_echeance);
  echeance.setHours(23, 59, 59, 999);
  return echeance < new Date();
}

/* ---------- Filtre par période (semaine / mois / année) ---------- */

const MODES_PERIODE = [
  { cle: "tout", libelle: "Tout" },
  { cle: "semaine", libelle: "Semaine" },
  { cle: "mois", libelle: "Mois" },
  { cle: "annee", libelle: "Année" },
];

/** Bornes [début, fin[ de la période contenant `ref`. Semaine = lundi → dimanche. */
function bornesPeriode(mode, ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (mode === "semaine") {
    const debut = new Date(d);
    debut.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const fin = new Date(debut);
    fin.setDate(debut.getDate() + 7);
    return [debut, fin];
  }
  if (mode === "mois") {
    return [
      new Date(d.getFullYear(), d.getMonth(), 1),
      new Date(d.getFullYear(), d.getMonth() + 1, 1),
    ];
  }
  if (mode === "annee") {
    return [
      new Date(d.getFullYear(), 0, 1),
      new Date(d.getFullYear() + 1, 0, 1),
    ];
  }
  return [null, null];
}

function decalerPeriode(mode, ref, sens) {
  const d = new Date(ref);
  if (mode === "semaine") d.setDate(d.getDate() + 7 * sens);
  else if (mode === "mois") d.setMonth(d.getMonth() + sens, 1);
  else if (mode === "annee") d.setFullYear(d.getFullYear() + sens);
  return d;
}

function numeroSemaineIso(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
}

function libellePeriode(mode, ref) {
  const [debut, fin] = bornesPeriode(mode, ref);
  if (mode === "semaine") {
    const dernier = new Date(fin);
    dernier.setDate(fin.getDate() - 1);
    return `Semaine ${numeroSemaineIso(debut)} · ${debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – ${dernier.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }
  if (mode === "mois") {
    const txt = debut.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  if (mode === "annee") return String(debut.getFullYear());
  return "";
}

export default function EspaceFactures({
  titre = "Mes factures",
  sousTitre = "Retrouvez ici toutes vos pièces comptables.",
  libelleTotal = "Restant à régler",
  libelleDefaut = "Facture de convoyage",
  filtrePeriode = false,
}) {
  const [modePeriode, setModePeriode] = useState("tout");
  const [refPeriode, setRefPeriode] = useState(() => new Date());
  const [toutesFactures, setFactures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let actif = true;
    api
      .get("/factures/mes-factures")
      .then(({ data }) => {
        if (actif) setFactures(data);
      })
      .catch((err) => {
        if (actif)
          setErreur(
            err.response?.data?.error || "Impossible de charger vos factures.",
          );
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  const factures = useMemo(() => {
    if (!filtrePeriode || modePeriode === "tout") return toutesFactures;
    const [debut, fin] = bornesPeriode(modePeriode, refPeriode);
    return toutesFactures.filter((f) => {
      if (!f.date_emission) return false;
      const d = new Date(f.date_emission);
      return d >= debut && d < fin;
    });
  }, [toutesFactures, filtrePeriode, modePeriode, refPeriode]);

  const enAttente = factures
    .filter((f) => f.statut === "emise")
    .reduce((total, f) => total + (f.montant_ttc || 0), 0);

  const totalPeriode = factures
    .filter((f) => f.statut !== "annulee")
    .reduce((total, f) => total + (f.montant_ttc || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-dark-100">
          <Receipt size={24} />
          {titre}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{sousTitre}</p>
      </div>

      {filtrePeriode && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-dark-700 overflow-hidden">
            {MODES_PERIODE.map((m) => (
              <button
                key={m.cle}
                type="button"
                onClick={() => {
                  setModePeriode(m.cle);
                  setRefPeriode(new Date());
                }}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  modePeriode === m.cle
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:bg-dark-700"
                }`}
              >
                {m.libelle}
              </button>
            ))}
          </div>

          {modePeriode !== "tout" && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="Période précédente"
                onClick={() =>
                  setRefPeriode((r) => decalerPeriode(modePeriode, r, -1))
                }
                className="p-1.5 rounded-lg border border-dark-700 hover:bg-dark-700"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[180px] text-center text-sm font-medium text-dark-100">
                {libellePeriode(modePeriode, refPeriode)}
              </span>
              <button
                type="button"
                aria-label="Période suivante"
                onClick={() =>
                  setRefPeriode((r) => decalerPeriode(modePeriode, r, 1))
                }
                className="p-1.5 rounded-lg border border-dark-700 hover:bg-dark-700"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setRefPeriode(new Date())}
                className="ml-1 px-2 py-1 text-xs text-slate-400 hover:text-dark-100"
              >
                Aujourd'hui
              </button>
            </div>
          )}

          {modePeriode !== "tout" && !chargement && (
            <span className="ml-auto text-sm text-slate-500">
              {factures.length} facture{factures.length > 1 ? "s" : ""} ·{" "}
              <span className="font-semibold tabular-nums text-dark-100">
                {formaterMontant(totalPeriode)}
              </span>
            </span>
          )}
        </div>
      )}

      {enAttente > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm font-medium text-dark-100">
            {libelleTotal}
          </span>
          <span className="text-xl font-bold tabular-nums text-amber-400">
            {formaterMontant(enAttente)}
          </span>
        </div>
      )}

      {erreur && (
        <p className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="text-slate-500 py-8 text-center">Chargement…</p>
      ) : factures.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          <Receipt size={36} className="mx-auto mb-3 opacity-40" />
          <p>
            {toutesFactures.length > 0
              ? "Aucune facture sur cette période."
              : "Aucune facture pour le moment."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {factures.map((f) => {
            const config = STATUTS[f.statut] || STATUTS.emise;
            const Icone = config.icone;
            const retard = estEnRetard(f);

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
                    {retard && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-600">
                        <AlertTriangle size={12} />
                        Échue
                      </span>
                    )}
                  </div>
                  <p className="font-medium mt-1 text-dark-100">
                    {f.libelle || libelleDefaut}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.periode && `${f.periode} · `}
                    Émise le {formaterDate(f.date_emission)}
                    {f.date_echeance &&
                      ` · Échéance ${formaterDate(f.date_echeance)}`}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-dark-100">
                    {formaterMontant(f.montant_ttc)}
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
