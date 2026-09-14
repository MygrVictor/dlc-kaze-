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

/**
 * Formate une date en `AAAA-MM-JJ` dans le fuseau de l'utilisateur.
 *
 * `toISOString()` convertit d'abord en UTC : en France (UTC+1 ou +2),
 * le 1er janvier à minuit devient le 31 décembre à 22 h, et la borne
 * envoyée au serveur recule d'un jour. Toutes les périodes étaient
 * décalées, si bien qu'une mission du 31 décembre était comptée dans
 * le chiffre d'affaires de l'année suivante.
 *
 * On lit donc les composantes locales, sans conversion.
 */
const jour = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

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
function Indicateur({
  icone: Icone,
  libelle,
  valeur,
  evolution,
  precision,
  majeur,
  negatif,
}) {
  const hausse = evolution > 0;
  const Fleche = hausse ? TrendingUp : TrendingDown;

  return (
    <div className={`at-kpi${majeur ? " at-kpi--majeur" : ""}`}>
      <p className="at-kpi__lab">
        <Icone size={12} />
        {libelle}
      </p>
      <p className={`at-kpi__val${negatif ? " at-kpi__val--negatif" : ""}`}>
        {valeur}
      </p>
      {precision && <p className="at-kpi__sous">{precision}</p>}
      {evolution !== null && evolution !== undefined && (
        <p
          className={`at-kpi__evo ${
            hausse ? "at-kpi__evo--hausse" : "at-kpi__evo--baisse"
          }`}
        >
          <Fleche size={11} />
          {Math.abs(evolution).toFixed(1)} %<span>vs précédent</span>
        </p>
      )}
    </div>
  );
}

/** Barre de proportion, plus lisible qu'un camembert au-delà de 4 lignes. */
function Barre({ part }) {
  return (
    <div className="at-jauge">
      <div
        className="at-jauge__val"
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
    <div className="at-panneau">
      <div className="at-panneau__tete">
        <h2 className="at-panneau__titre">Clients par chiffre d'affaires</h2>
        <div className="at-legende">
          <span>
            <i className="at-barre__marge" />
            Marge
          </span>
          <span>
            <i className="at-barre__cout" />
            Coût convoyeur
          </span>
        </div>
      </div>
      <p className="at-panneau__note">
        La longueur totale est le chiffre d'affaires ; la part verte, ce qu'il
        vous reste.
      </p>

      <div className="at-panneau__corps space-y-3">
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
                    l.groupe ? "italic opacity-60" : ""
                  }`}
                  style={{ color: "var(--at-encre-2)" }}
                >
                  {l.nom}
                  {l.sousTitre && (
                    <span style={{ color: "var(--at-encre-3)" }}>
                      {" "}
                      · {l.sousTitre}
                    </span>
                  )}
                </p>
                <p
                  className="text-xs font-medium tabular-nums flex-shrink-0"
                  style={{ color: "var(--at-encre)" }}
                >
                  {euros(l.ca)}
                  <span
                    className="font-normal"
                    style={{ color: "var(--at-encre-3)" }}
                  >
                    {" "}
                    · {total > 0 ? ((l.ca / total) * 100).toFixed(0) : 0} %
                  </span>
                </p>
              </div>

              <div className="at-barre">
                <div
                  className="at-barre__remplissage"
                  style={{
                    width: `${largeur}%`,
                    opacity: actif ? 1 : 0.85,
                  }}
                >
                  <div
                    className="at-barre__marge"
                    style={{ width: `${partMarge}%` }}
                  />
                  <div className="at-barre__cout" />
                </div>
              </div>

              {actif && (
                <div className="absolute right-0 top-full mt-1 z-20 at-bulle">
                  <strong>{l.nom}</strong>
                  <p>
                    {euros(l.ca)} de CA · {l.missions} mission
                    {l.missions > 1 ? "s" : ""} livrée
                    {l.missions > 1 ? "s" : ""}
                  </p>
                  <p style={{ color: "var(--at-positif)" }}>
                    {euros(l.marge)} de marge
                    {l.tauxMarge !== null && ` · ${l.tauxMarge.toFixed(1)} %`}
                  </p>
                  <p>{euros(l.cout)} versés aux convoyeurs</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tete.length > 1 && (
        <p className="at-panneau__pied">
          Les {Math.min(3, tete.length)} premiers représentent{" "}
          <span className="font-semibold" style={{ color: "var(--at-encre)" }}>
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
        // Même raison que pour les bornes : en soirée, `toISOString`
        // daterait le fichier du lendemain.
        `analyse-clients-${jour(new Date())}.csv`,
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
        <div
          className="animate-spin w-7 h-7 rounded-full"
          style={{
            border: "2px solid var(--at-accent)",
            borderTopColor: "transparent",
          }}
        />
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
      <div className="at-entete">
        <div>
          <h1 className="at-entete__titre">Analyse</h1>
          <p className="at-entete__sous">
            Montants hors taxes · chiffre d'affaires réalisé sur les missions
            livrées
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="at-select"
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
            className="at-bouton"
          >
            <Download size={14} />
            {exportEnCours ? "Export…" : "Exporter"}
          </button>
        </div>
      </div>

      {/* ── Indicateurs ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicateur
          icone={Euro}
          libelle="CA réalisé"
          valeur={euros(totaux.ca_realise)}
          evolution={evolutions.ca_realise}
          majeur
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
        <Indicateur
          icone={Package}
          libelle="CA engagé"
          valeur={euros(totaux.ca_engage)}
          precision={`${totaux.missions_engagees} devis signés, livrés ou non · marge prévisionnelle ${euros(totaux.marge_engagee)}`}
        />
        <Indicateur
          icone={Percent}
          libelle="Taux de transformation"
          valeur={pourcent(totaux.taux_transformation)}
          precision={`des devis tranchés ont été signés · ${totaux.devis_en_attente} encore en attente`}
        />
        <Indicateur
          icone={TrendingDown}
          libelle="CA perdu"
          valeur={euros(totaux.ca_perdu)}
          negatif
          precision={`${totaux.devis_refuses} devis refusés · ${totaux.annulees} missions annulées`}
        />
      </div>

      {/* ── Classement des clients ──────────────────── */}
      <ClassementClients clients={clients} />

      {/* ── Évolution mensuelle ─────────────────────── */}
      {mensuel.length > 1 && (
        <div className="at-panneau">
          <div className="at-panneau__tete">
            <h2 className="at-panneau__titre">Évolution sur 12 mois</h2>
          </div>
          <p className="at-panneau__note">
            Indépendant du filtre de période — sert à lire la saisonnalité.
          </p>
          <div className="at-panneau__corps">
            <div className="flex items-end gap-1.5 h-32">
              {mensuel.map((m) => (
                <div
                  key={m.mois}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                >
                  <div className="w-full flex flex-col justify-end h-24">
                    <div
                      className="at-histo"
                      style={{
                        height: `${Math.max(2, (m.ca / caMensuelMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--at-encre-3)" }}
                  >
                    {m.mois.slice(5)}
                  </span>
                  <div className="absolute bottom-full mb-1 hidden group-hover:block at-bulle z-10">
                    <strong>{m.mois}</strong>
                    <p>{euros(m.ca)} de CA</p>
                    <p>{m.livrees} livrées</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Onglets ─────────────────────────────────── */}
      <div className="at-rail">
        {[
          { cle: "clients", libelle: "Par client", icone: Users },
          { cle: "convoyeurs", libelle: "Par convoyeur", icone: Truck },
        ].map(({ cle, libelle, icone: Icone }) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`at-rail__item${
              onglet === cle ? " at-rail__item--actif" : ""
            }`}
          >
            <Icone size={14} />
            {libelle}
          </button>
        ))}
      </div>

      {/* ── Tableau clients ─────────────────────────── */}
      {onglet === "clients" && (
        <div className="at-panneau">
          <div className="overflow-x-auto">
            <table className="at-table">
              <thead>
                <tr>
                  <th className="text-left">Client</th>
                  <th className="num">Missions</th>
                  <th className="num">
                    <button
                      onClick={() => setTri("ca_realise")}
                      className={`at-table__tri${
                        tri === "ca_realise" ? " at-table__tri--actif" : ""
                      }`}
                    >
                      CA <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="num">Coût</th>
                  <th className="num">
                    <button
                      onClick={() => setTri("marge")}
                      className={`at-table__tri${
                        tri === "marge" ? " at-table__tri--actif" : ""
                      }`}
                    >
                      Marge <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="num">
                    <button
                      onClick={() => setTri("taux_marge")}
                      className={`at-table__tri${
                        tri === "taux_marge" ? " at-table__tri--actif" : ""
                      }`}
                    >
                      Taux <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="num">Panier</th>
                  <th className="num">Dernière</th>
                </tr>
              </thead>
              <tbody>
                {clientsTries.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Barre part={(c.ca_realise / caMax) * 100} />
                        <div className="min-w-0">
                          <p className="fort truncate">
                            {c.company || c.full_name}
                          </p>
                          {c.company && (
                            <p
                              className="text-xs truncate"
                              style={{ color: "var(--at-encre-3)" }}
                            >
                              {c.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <span className="fort">{c.missions_livrees}</span>
                      {c.missions_total > c.missions_livrees && (
                        <span style={{ color: "var(--at-encre-3)" }}>
                          {" "}
                          / {c.missions_total}
                        </span>
                      )}
                      {c.devis_refuses > 0 && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--at-negatif)" }}
                        >
                          {c.devis_refuses} refusé
                          {c.devis_refuses > 1 ? "s" : ""}
                        </p>
                      )}
                    </td>
                    <td className="num fort">{eurosPrecis(c.ca_realise)}</td>
                    <td className="num">{eurosPrecis(c.cout_realise)}</td>
                    <td className="num positif">{eurosPrecis(c.marge)}</td>
                    <td
                      className={`num${
                        c.taux_marge < 15 && c.ca_realise > 0 ? " alerte" : ""
                      }`}
                    >
                      {c.ca_realise > 0 ? pourcent(c.taux_marge) : "—"}
                    </td>
                    <td className="num">{eurosPrecis(c.panier_moyen)}</td>
                    <td className="num text-xs">
                      {dateCourte(c.derniere_mission)}
                    </td>
                  </tr>
                ))}
                {clientsTries.length === 0 && (
                  <tr>
                    <td colSpan="8" className="at-vide">
                      Aucune mission sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="at-panneau__pied">
            Un taux de marge sous 15 % est signalé en orange. Le coût correspond
            à la rétribution des convoyeurs.
          </p>
        </div>
      )}

      {/* ── Tableau convoyeurs ──────────────────────── */}
      {onglet === "convoyeurs" && (
        <div className="at-panneau">
          <div className="overflow-x-auto">
            <table className="at-table">
              <thead>
                <tr>
                  <th className="text-left">Convoyeur</th>
                  <th className="num">Livrées</th>
                  <th className="num">Montant dû</th>
                  <th className="num">CA généré</th>
                  <th className="num">Marge dégagée</th>
                </tr>
              </thead>
              <tbody>
                {convoyeurs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <p className="fort">{c.full_name}</p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--at-encre-3)" }}
                      >
                        {c.email}
                      </p>
                    </td>
                    <td className="num">
                      <span className="fort">{c.missions_livrees}</span>
                      {c.missions_total > c.missions_livrees && (
                        <span style={{ color: "var(--at-encre-3)" }}>
                          {" "}
                          / {c.missions_total}
                        </span>
                      )}
                    </td>
                    <td className="num fort">{eurosPrecis(c.montant_du)}</td>
                    <td className="num">{eurosPrecis(c.ca_genere)}</td>
                    <td className="num positif">
                      {eurosPrecis(c.ca_genere - c.montant_du)}
                    </td>
                  </tr>
                ))}
                {convoyeurs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="at-vide">
                      Aucune mission assignée sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="at-panneau__pied">
            Le montant dû ne remplace pas les factures : il donne un ordre de
            grandeur à partir des tarifs saisis sur les missions.
          </p>
        </div>
      )}
    </div>
  );
}
