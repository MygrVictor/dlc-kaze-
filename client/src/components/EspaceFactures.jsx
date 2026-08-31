import { useEffect, useState } from "react";
import api from "../lib/api";
import {
  Receipt,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

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
    classe:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  payee: {
    libelle: "Payée",
    icone: CheckCircle2,
    classe:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
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

export default function EspaceFactures({
  titre = "Mes factures",
  sousTitre = "Retrouvez ici toutes vos pièces comptables.",
  libelleTotal = "Restant à régler",
  libelleDefaut = "Facture de convoyage",
}) {
  const [factures, setFactures] = useState([]);
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

  const enAttente = factures
    .filter((f) => f.statut === "emise")
    .reduce((total, f) => total + (f.montant_ttc || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt size={24} />
          {titre}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{sousTitre}</p>
      </div>

      {enAttente > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm font-medium">{libelleTotal}</span>
          <span className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
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
          <p>Aucune facture pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {factures.map((f) => {
            const config = STATUTS[f.statut] || STATUTS.emise;
            const Icone = config.icone;
            const retard = estEnRetard(f);

            return (
              <li
                key={f.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-4"
              >
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
                  <p className="font-medium mt-1">
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
                  <div className="text-lg font-bold tabular-nums">
                    {formaterMontant(f.montant_ttc)}
                  </div>
                  <div className="text-xs text-slate-500">TTC</div>
                </div>

                <a
                  href={`${f.file_path}?token=${localStorage.getItem("dlc_token")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
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
