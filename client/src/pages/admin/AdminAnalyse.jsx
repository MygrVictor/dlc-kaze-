import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import {
  TrendingUp,
  TrendingDown,
  Euro,
  Package,
  Percent,
  Download,
  Users,
  Truck,
  BarChart3,
  ArrowUpDown,
} from "lucide-react";

/**
 * Analyse — chiffre d'affaires, marge et activité.
 *
 * Le parti pris de cet écran est de ne jamais afficher un montant sans
 * son coût : une ligne client qui ne montrerait que le chiffre d'affaires
 * laisserait croire que le plus gros facturier est le plus rentable, ce
 * qui est faux dès que les tarifs convoyeurs diffèrent d'un trajet à
 * l'autre.
 *
 * Deux notions cohabitent, volontairement séparées :
 *   • réalisé — missions LIVREE, ce qui est effectivement dû ;
 *   • engagé  — devis signés, livrés ou non, donc prévisionnel.
 * Les fondre en un seul chiffre reviendrait à ne plus savoir ce qu'on lit.
 *
 * Tous les montants sont hors taxes, comme `missions.price`.
 */

// ── Périodes proposées ───────────────────────────────────────
// Les bornes sont calculées à la demande : un objet figé au chargement
// deviendrait faux si l'onglet reste ouvert au passage de minuit.
const jour = (d) => d.toISOString().slice(0, 10);

const PERIODES = {
  mois: {
    libelle: "Ce mois-ci",
    bornes: () => {
      const n = new Date();
      return {
        debut: jour(new Date(n.getFullYear(), n.getMonth(), 1)),
        fin: jour(n),
      };
    },
  },
  mois_dernier: {
    libelle: "Mois dernier",
    bornes: () => {
      const n = new Date();
      return {
        debut: jour(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        fin: jour(new Date(n.getFullYear(), n.getMonth(), 0)),
      };
    },
  },
  trimestre: {
    libelle: "Trimestre en cours",
    bornes: () => {
      const n = new Date();
      return {
        debut: jour(
          new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1),
        ),
        fin: jour(n),
      };
    },
  },
  annee: {
    libelle: "Année en cours",
    bornes: () => {
      const n = new Date();
      return { debut: jour(new Date(n.getFullYear(), 0, 1)), fin: jour(n) };
    },
  },
};

// ── Formatage ────────────────────────────────────────────────
const euros = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const eurosPrecis = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(n) || 0);

const pourcent = (n) =>
  n === null || n === undefined ? "—" : `${Number(n).toFixed(1)} %`;

const dateCourte = (v) =>
  v
    ? new Date(v).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      })
    : "—";

/**
 * Carte de synthèse. L'évolution n'est affichée que si la période
 * précédente contenait quelque chose : « +∞ % » face à un zéro
 * n'apprend rien et fait douter du reste.
 */
function Indicateur({ icone: Icone, libelle, valeur, evolution, precision }) {
  const hausse = evolution > 0;
  const Fleche = hausse ? TrendingUp : TrendingDown;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-dark-400 mb-1">{libelle}</p>
          <p className="text-xl font-bold truncate">{valeur}</p>
          {evolution !== null && evolution !== undefined && (
            <p
              className={`text-xs mt-1 flex items-center gap-1 ${
                hausse ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <Fleche size={12} />
              {Math.abs(evolution).toFixed(1)} %
              <span className="text-dark-500">vs période précédente</span>
            </p>
          )}
          {precision && (
            <p className="text-xs text-dark-500 mt-1">{precision}</p>
          )}
        </div>
        <div className="w-9 h-9 rounded-lg bg-accent-600/10 flex items-center justify-center flex-shrink-0">
          <Icone size={18} className="text-accent-400" />
        </div>
      </div>
    </div>
  );
}

/** Barre de proportion, plus lisible qu'un camembert au-delà de 4 lignes. */
function Barre({ part }) {
  return (
    <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden">
      <div
        className="h-full bg-accent-500 rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, part))}%` }}
      />
    </div>
  );
}

/**
 * Classement des clients par chiffre d'affaires.
 *
 * Barres horizontales et non verticales : les raisons sociales sont
 * longues, un axe vertical imposerait des libellés penchés illisibles.
 *
 * Chaque barre est scindée en deux teintes — la marge, puis le coût
 * convoyeur. Un graphique qui n'afficherait que le chiffre d'affaires
 * ferait passer pour excellent un client qui facture beaucoup en ne
 * rapportant presque rien : c'est exactement l'erreur que cet écran
 * doit éviter.
 *
 * Au-delà de huit clients, le reste est regroupé : un classement sert
 * à distinguer les premiers, pas à tout énumérer — le tableau complet
 * est juste en dessous.
 */
function ClassementClients({ clients }) {
  const [survol, setSurvol] = useState(null);
  const TETE = 8;

  // Un client sans chiffre d'affaires n'a pas sa place dans un
  // classement de chiffre d'affaires : il y apparaîtrait en barre vide.
  const avecCa = clients.filter((c) => c.ca_realise > 0);
  if (avecCa.length === 0) return null;

  const tries = [...avecCa].sort((a, b) => b.ca_realise - a.ca_realise);
  const tete = tries.slice(0, TETE);
  const reste = tries.slice(TETE);

  const lignes = tete.map((c) => ({
    cle: c.id,
    nom: c.company || c.full_name,
    sousTitre: c.company ? c.full_name : null,
    ca: c.ca_realise,
    marge: c.marge,
    cout: c.cout_realise,
    missions: c.missions_livrees,
    tauxMarge: c.taux_marge,
  }));

  if (reste.length > 0) {
    lignes.push({
      cle: "__reste",
      nom: `${reste.length} autre${reste.length > 1 ? "s" : ""} client${reste.length > 1 ? "s" : ""}`,
      sousTitre: null,
      ca: reste.reduce((s, c) => s + c.ca_realise, 0),
      marge: reste.reduce((s, c) => s + c.marge, 0),
      cout: reste.reduce((s, c) => s + c.cout_realise, 0),
      missions: reste.reduce((s, c) => s + c.missions_livrees, 0),
      tauxMarge: null,
      groupe: true,
    });
  }

  const max = Math.max(...lignes.map((l) => l.ca), 1);
  const total = avecCa.reduce((s, c) => s + c.ca_realise, 0);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold">
          Clients par chiffre d'affaires
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-dark-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Marge
          </span>
          <span className="flex items-center gap-1.5 text-dark-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-500/50" />
            Coût convoyeur
          </span>
        </div>
      </div>
      <p className="text-xs text-dark-500 mb-4">
        La longueur totale est le chiffre d'affaires ; la part verte, ce qu'il
        vous reste.
      </p>

      <div className="space-y-2.5">
        {lignes.map((l) => {
          const largeur = (l.ca / max) * 100;
          // La marge peut être négative si le convoyeur a coûté plus
          // cher que la facture : on n'affiche alors aucune part verte.
          const partMarge = l.ca > 0 ? Math.max(0, (l.marge / l.ca) * 100) : 0;
          const actif = survol === l.cle;

          return (
            <div
              key={l.cle}
              onMouseEnter={() => setSurvol(l.cle)}
              onMouseLeave={() => setSurvol(null)}
              className="relative"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p
                  className={`text-xs truncate ${
                    l.groupe ? "text-dark-500 italic" : "text-dark-200"
                  }`}
                >
                  {l.nom}
                  {l.sousTitre && (
                    <span className="text-dark-500"> · {l.sousTitre}</span>
                  )}
                </p>
                <p className="text-xs font-medium tabular-nums flex-shrink-0">
                  {euros(l.ca)}
                  <span className="text-dark-500 font-normal">
                    {" "}
                    · {total > 0 ? ((l.ca / total) * 100).toFixed(0) : 0} %
                  </span>
                </p>
              </div>

              <div className="h-5 bg-dark-800 rounded overflow-hidden">
                <div
                  className={`h-full flex transition-opacity ${
                    actif ? "opacity-100" : "opacity-85"
                  }`}
                  style={{ width: `${largeur}%` }}
                >
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${partMarge}%` }}
                  />
                  <div className="h-full flex-1 bg-accent-500/50" />
                </div>
              </div>

              {actif && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap">
                  <p className="font-medium mb-1">{l.nom}</p>
                  <p className="text-dark-300">
                    {euros(l.ca)} de CA · {l.missions} mission
                    {l.missions > 1 ? "s" : ""} livrée
                    {l.missions > 1 ? "s" : ""}
                  </p>
                  <p className="text-emerald-400">
                    {euros(l.marge)} de marge
                    {l.tauxMarge !== null && ` · ${l.tauxMarge.toFixed(1)} %`}
                  </p>
                  <p className="text-dark-400">
                    {euros(l.cout)} versés aux convoyeurs
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tete.length > 1 && (
        <p className="text-xs text-dark-500 mt-4 pt-3 border-t border-dark-700/50">
          Les {Math.min(3, tete.length)} premiers représentent{" "}
          <span className="text-dark-300 font-medium">
            {total > 0
              ? (
                  (tete.slice(0, 3).reduce((s, l) => s + l.ca, 0) / total) *
                  100
                ).toFixed(0)
              : 0}{" "}
            %
          </span>{" "}
          du chiffre d'affaires de la période.
        </p>
      )}
    </div>
  );
}

export default function AdminAnalyse() {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [periode, setPeriode] = useState("annee");
  const [tri, setTri] = useState("ca_realise");
  const [onglet, setOnglet] = useState("clients");
  const [exportEnCours, setExportEnCours] = useState(false);

  const bornes = PERIODES[periode].bornes();

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const { debut, fin } = PERIODES[periode].bornes();
      const res = await api.get(`/admin/analyse?debut=${debut}&fin=${fin}`);
      setDonnees(res.data);
    } catch {
      toast.error("Impossible de charger l'analyse.");
    } finally {
      setChargement(false);
    }
  }, [periode]);

  useEffect(() => {
    charger();
  }, [charger]);

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const { debut, fin } = PERIODES[periode].bornes();
      const res = await api.get(
        `/admin/analyse/export-csv?debut=${debut}&fin=${fin}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const lien = document.createElement("a");
      lien.href = url;
      lien.setAttribute(
        "download",
        `analyse-clients-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export téléchargé.");
    } catch {
      toast.error("Erreur lors de l'export.");
    } finally {
      setExportEnCours(false);
    }
  };

  if (chargement && !donnees) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!donnees) return null;

  const { totaux, evolutions, clients, convoyeurs, mensuel } = donnees;

  const clientsTries = [...clients].sort((a, b) => {
    if (tri === "nom")
      return (a.company || a.full_name).localeCompare(b.company || b.full_name);
    return (b[tri] || 0) - (a[tri] || 0);
  });

  const caMax = Math.max(...clients.map((c) => c.ca_realise), 1);
  const caMensuelMax = Math.max(...mensuel.map((m) => m.ca), 1);

  return (
    <div className="space-y-6">
      {/* ── En-tête ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={24} className="text-accent-400" />
            Analyse
          </h1>
          <p className="text-sm text-dark-400 mt-0.5">
            Montants hors taxes · chiffre d'affaires réalisé sur les missions
            livrées
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="input py-2 text-sm"
          >
            {Object.entries(PERIODES).map(([cle, { libelle }]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="btn-secondary btn-sm"
          >
            <Download size={15} />
            {exportEnCours ? "Export…" : "Exporter"}
          </button>
        </div>
      </div>

      {/* ── Indicateurs ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicateur
          icone={Euro}
          libelle="Chiffre d'affaires réalisé"
          valeur={euros(totaux.ca_realise)}
          evolution={evolutions.ca_realise}
        />
        <Indicateur
          icone={Percent}
          libelle="Marge"
          valeur={euros(totaux.marge_realisee)}
          evolution={evolutions.marge_realisee}
          precision={`${totaux.taux_marge.toFixed(1)} % du CA`}
        />
        <Indicateur
          icone={Package}
          libelle="Missions livrées"
          valeur={totaux.missions_livrees}
          evolution={evolutions.missions_livrees}
          precision={`${totaux.missions_total} créées sur la période`}
        />
        <Indicateur
          icone={TrendingUp}
          libelle="Panier moyen"
          valeur={euros(totaux.panier_moyen)}
          evolution={evolutions.panier_moyen}
        />
      </div>

      {/* ── Prévisionnel et devis ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-dark-400 mb-1">
            Chiffre d'affaires engagé
          </p>
          <p className="text-lg font-bold">{euros(totaux.ca_engage)}</p>
          <p className="text-xs text-dark-500 mt-1">
            {totaux.missions_engagees} devis signés, livrés ou non · marge
            prévisionnelle {euros(totaux.marge_engagee)}
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs text-dark-400 mb-1">Taux de transformation</p>
          <p className="text-lg font-bold">
            {pourcent(totaux.taux_transformation)}
          </p>
          <p className="text-xs text-dark-500 mt-1">
            des devis tranchés ont été signés · {totaux.devis_en_attente} encore
            en attente
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs text-dark-400 mb-1">Chiffre d'affaires perdu</p>
          <p className="text-lg font-bold text-red-400">
            {euros(totaux.ca_perdu)}
          </p>
          <p className="text-xs text-dark-500 mt-1">
            {totaux.devis_refuses} devis refusés · {totaux.annulees} missions
            annulées
          </p>
        </div>
      </div>

      {/* ── Classement des clients ──────────────────── */}
      <ClassementClients clients={clients} />

      {/* ── Évolution mensuelle ─────────────────────── */}
      {mensuel.length > 1 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-1">Évolution sur 12 mois</h2>
          <p className="text-xs text-dark-500 mb-4">
            Indépendant du filtre de période — sert à lire la saisonnalité.
          </p>
          <div className="flex items-end gap-1.5 h-32">
            {mensuel.map((m) => (
              <div
                key={m.mois}
                className="flex-1 flex flex-col items-center gap-1 group relative"
              >
                <div className="w-full flex flex-col justify-end h-24">
                  <div
                    className="w-full bg-accent-500/80 rounded-t group-hover:bg-accent-400 transition-colors"
                    style={{
                      height: `${Math.max(2, (m.ca / caMensuelMax) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-dark-500">
                  {m.mois.slice(5)}
                </span>
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                  <p className="font-medium">{m.mois}</p>
                  <p className="text-dark-300">{euros(m.ca)} de CA</p>
                  <p className="text-dark-400">{m.livrees} livrées</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Onglets ─────────────────────────────────── */}
      <div className="flex gap-2 border-b border-dark-700">
        {[
          { cle: "clients", libelle: "Par client", icone: Users },
          { cle: "convoyeurs", libelle: "Par convoyeur", icone: Truck },
        ].map(({ cle, libelle, icone: Icone }) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
              onglet === cle
                ? "border-accent-500 text-accent-400"
                : "border-transparent text-dark-400 hover:text-dark-200"
            }`}
          >
            <Icone size={15} />
            {libelle}
          </button>
        ))}
      </div>

      {/* ── Tableau clients ─────────────────────────── */}
      {onglet === "clients" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-800/50 text-dark-400 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-right px-3 py-3 font-medium">Missions</th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => setTri("ca_realise")}
                      className="inline-flex items-center gap-1 hover:text-dark-200"
                    >
                      CA <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">Coût</th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => setTri("marge")}
                      className="inline-flex items-center gap-1 hover:text-dark-200"
                    >
                      Marge <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    <button
                      onClick={() => setTri("taux_marge")}
                      className="inline-flex items-center gap-1 hover:text-dark-200"
                    >
                      Taux <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 font-medium">Panier</th>
                  <th className="text-right px-4 py-3 font-medium">Dernière</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {clientsTries.map((c) => (
                  <tr key={c.id} className="hover:bg-dark-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Barre part={(c.ca_realise / caMax) * 100} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {c.company || c.full_name}
                          </p>
                          {c.company && (
                            <p className="text-xs text-dark-500 truncate">
                              {c.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-medium">{c.missions_livrees}</span>
                      {c.missions_total > c.missions_livrees && (
                        <span className="text-dark-500">
                          {" "}
                          / {c.missions_total}
                        </span>
                      )}
                      {c.devis_refuses > 0 && (
                        <p className="text-xs text-red-400/70">
                          {c.devis_refuses} refusé
                          {c.devis_refuses > 1 ? "s" : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {eurosPrecis(c.ca_realise)}
                    </td>
                    <td className="px-3 py-3 text-right text-dark-400">
                      {eurosPrecis(c.cout_realise)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-emerald-400">
                      {eurosPrecis(c.marge)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right ${
                        c.taux_marge < 15 && c.ca_realise > 0
                          ? "text-amber-400"
                          : "text-dark-300"
                      }`}
                    >
                      {c.ca_realise > 0 ? pourcent(c.taux_marge) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right text-dark-400">
                      {eurosPrecis(c.panier_moyen)}
                    </td>
                    <td className="px-4 py-3 text-right text-dark-500 text-xs">
                      {dateCourte(c.derniere_mission)}
                    </td>
                  </tr>
                ))}
                {clientsTries.length === 0 && (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-dark-400">
                      Aucune mission sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-dark-500 border-t border-dark-700/50">
            Un taux de marge sous 15 % est signalé en orange. Le coût correspond
            à la rétribution des convoyeurs.
          </p>
        </div>
      )}

      {/* ── Tableau convoyeurs ──────────────────────── */}
      {onglet === "convoyeurs" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-800/50 text-dark-400 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Convoyeur</th>
                  <th className="text-right px-3 py-3 font-medium">Livrées</th>
                  <th className="text-right px-3 py-3 font-medium">
                    Montant dû
                  </th>
                  <th className="text-right px-3 py-3 font-medium">
                    CA généré
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    Marge dégagée
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {convoyeurs.map((c) => (
                  <tr key={c.id} className="hover:bg-dark-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.full_name}</p>
                      <p className="text-xs text-dark-500">{c.email}</p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-medium">{c.missions_livrees}</span>
                      {c.missions_total > c.missions_livrees && (
                        <span className="text-dark-500">
                          {" "}
                          / {c.missions_total}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {eurosPrecis(c.montant_du)}
                    </td>
                    <td className="px-3 py-3 text-right text-dark-400">
                      {eurosPrecis(c.ca_genere)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400">
                      {eurosPrecis(c.ca_genere - c.montant_du)}
                    </td>
                  </tr>
                ))}
                {convoyeurs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-dark-400">
                      Aucune mission assignée sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-dark-500 border-t border-dark-700/50">
            Le montant dû ne remplace pas les factures : il donne un ordre de
            grandeur à partir des tarifs saisis sur les missions.
          </p>
        </div>
      )}
    </div>
  );
}
