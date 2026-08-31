import { useEffect, useState, useCallback, useRef } from "react";
import api from "../../lib/api";
import { formaterMontant, formaterDate } from "../../components/EspaceFactures";
import {
  Receipt,
  Upload,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  AlertCircle,
  Users,
  Truck,
} from "lucide-react";

/**
 * Dépôt et suivi des factures.
 *
 * Deux flux passent par cet écran : ce que nous facturons aux clients et
 * les relevés de prestations des convoyeurs. La nature de la pièce se
 * déduit du rôle du destinataire, l'administration n'a donc rien à
 * déclarer de plus au moment du dépôt.
 *
 * Une facture remise ne se supprime pas : si elle est erronée, on
 * l'annule et l'annulation reste visible des deux côtés.
 */

const STATUTS = {
  emise: {
    libelle: "Émise",
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

const FORMULAIRE_VIDE = {
  destinataire_id: "",
  numero: "",
  libelle: "",
  montant_ttc: "",
  periode: "",
  date_emission: "",
  date_echeance: "",
};

function Badge({ statut }) {
  const config = STATUTS[statut] || STATUTS.emise;
  const Icone = config.icone;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.classe}`}
    >
      <Icone size={13} />
      {config.libelle}
    </span>
  );
}

export default function AdminFactures() {
  const [factures, setFactures] = useState([]);
  const [clients, setClients] = useState([]);
  const [convoyeurs, setConvoyeurs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreRole, setFiltreRole] = useState("");
  const [recherche, setRecherche] = useState("");

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [roleCible, setRoleCible] = useState("client");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [survol, setSurvol] = useState(false);
  const champFichier = useRef(null);
  const [form, setForm] = useState(FORMULAIRE_VIDE);

  const chargerFactures = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const params = new URLSearchParams();
      if (filtreStatut) params.set("statut", filtreStatut);
      if (filtreRole) params.set("role", filtreRole);
      const suffixe = params.toString() ? `?${params}` : "";
      const { data } = await api.get(`/factures${suffixe}`);
      setFactures(data);
    } catch (err) {
      setErreur(
        err.response?.data?.error || "Impossible de charger les factures.",
      );
    } finally {
      setChargement(false);
    }
  }, [filtreStatut, filtreRole]);

  useEffect(() => {
    chargerFactures();
  }, [chargerFactures]);

  // Les annuaires ne dépendent pas des filtres : les recharger à chaque
  // changement de statut serait deux requêtes inutiles.
  useEffect(() => {
    const extraire = (reponse) =>
      Array.isArray(reponse.data) ? reponse.data : reponse.data?.users || [];

    Promise.all([
      api.get("/admin/users?role=client"),
      api.get("/admin/users?role=convoyeur"),
    ])
      .then(([rClients, rConvoyeurs]) => {
        setClients(extraire(rClients));
        setConvoyeurs(extraire(rConvoyeurs));
      })
      .catch(() => setErreur("Impossible de charger la liste des comptes."));
  }, []);

  const majForm = (champ) => (e) =>
    setForm((f) => ({ ...f, [champ]: e.target.value }));

  function retenirFichier(candidat) {
    if (!candidat) return;
    if (candidat.type !== "application/pdf") {
      setErreurFormulaire("La facture doit être un PDF.");
      return;
    }
    if (candidat.size > 10 * 1024 * 1024) {
      setErreurFormulaire("Le fichier dépasse 10 Mo.");
      return;
    }
    setErreurFormulaire(null);
    setFichier(candidat);
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreurFormulaire(null);

    if (!form.destinataire_id) {
      setErreurFormulaire("Choisissez le destinataire.");
      return;
    }
    if (!form.numero.trim()) {
      setErreurFormulaire("Le numéro de facture est obligatoire.");
      return;
    }
    if (!fichier) {
      setErreurFormulaire("Joignez le PDF de la facture.");
      return;
    }

    const donnees = new FormData();
    donnees.append("facture", fichier);
    for (const champ of [
      "numero",
      "libelle",
      "montant_ttc",
      "periode",
      "date_emission",
      "date_echeance",
    ]) {
      if (form[champ]) donnees.append(champ, form[champ]);
    }

    setEnvoiEnCours(true);
    try {
      await api.post(
        `/factures/destinataires/${form.destinataire_id}`,
        donnees,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setForm(FORMULAIRE_VIDE);
      setFichier(null);
      setFormulaireOuvert(false);
      chargerFactures();
    } catch (err) {
      setErreurFormulaire(err.response?.data?.error || "Le dépôt a échoué.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function changerStatut(facture, statut) {
    if (statut === "annulee") {
      const confirme = window.confirm(
        `Annuler la facture ${facture.numero} ?\n\n` +
          "L'annulation est définitive et restera visible du destinataire.",
      );
      if (!confirme) return;
    }
    try {
      await api.patch(`/factures/${facture.id}/statut`, { statut });
      chargerFactures();
    } catch (err) {
      setErreur(
        err.response?.data?.error || "Le changement de statut a échoué.",
      );
    }
  }

  const annuaire = roleCible === "client" ? clients : convoyeurs;

  const filtrees = factures.filter((f) => {
    if (!recherche.trim()) return true;
    const terme = recherche.toLowerCase();
    return [f.numero, f.libelle, f.destinataire_nom, f.destinataire_societe]
      .filter(Boolean)
      .some((valeur) => valeur.toLowerCase().includes(terme));
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt size={24} />
            Factures
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Déposez les pièces comptables dans l'espace de chaque client ou
            convoyeur.
          </p>
        </div>
        <button
          onClick={() => setFormulaireOuvert((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
        >
          <Upload size={17} />
          {formulaireOuvert ? "Fermer" : "Déposer une facture"}
        </button>
      </div>

      {formulaireOuvert && (
        <form
          onSubmit={soumettre}
          className="mb-6 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <div className="flex gap-2 mb-4">
            {[
              { valeur: "client", libelle: "Client", icone: Users },
              { valeur: "convoyeur", libelle: "Convoyeur", icone: Truck },
            ].map(({ valeur, libelle, icone: Icone }) => (
              <button
                key={valeur}
                type="button"
                onClick={() => {
                  setRoleCible(valeur);
                  setForm((f) => ({ ...f, destinataire_id: "" }));
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                  roleCible === valeur
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-slate-300 dark:border-slate-600 text-slate-500"
                }`}
              >
                <Icone size={15} />
                {libelle}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <span className="text-sm font-medium">
                {roleCible === "client" ? "Client" : "Convoyeur"} *
              </span>
              <select
                value={form.destinataire_id}
                onChange={majForm("destinataire_id")}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
                required
              >
                <option value="">Sélectionner…</option>
                {annuaire.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.company ? `${u.company} — ` : ""}
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Numéro *</span>
              <input
                type="text"
                value={form.numero}
                onChange={majForm("numero")}
                placeholder="F-2026-001"
                maxLength={60}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Montant TTC (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.montant_ttc}
                onChange={majForm("montant_ttc")}
                placeholder="1234,56"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Libellé</span>
              <input
                type="text"
                value={form.libelle}
                onChange={majForm("libelle")}
                placeholder={
                  roleCible === "client"
                    ? "Convoyages du mois"
                    : "Relevé de prestations"
                }
                maxLength={200}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Période</span>
              <input
                type="text"
                value={form.periode}
                onChange={majForm("periode")}
                placeholder="Janvier 2026"
                maxLength={40}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Date d'émission</span>
              <input
                type="date"
                value={form.date_emission}
                onChange={majForm("date_emission")}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Échéance</span>
              <input
                type="date"
                value={form.date_echeance}
                onChange={majForm("date_echeance")}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
              />
            </label>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              retenirFichier(e.dataTransfer.files?.[0]);
            }}
            onClick={() => champFichier.current?.click()}
            className={`mt-4 p-6 rounded-lg border-2 border-dashed text-center cursor-pointer transition ${
              survol
                ? "border-indigo-500 bg-indigo-500/5"
                : "border-slate-300 dark:border-slate-600"
            }`}
          >
            <input
              ref={champFichier}
              type="file"
              accept="application/pdf"
              onChange={(e) => retenirFichier(e.target.files?.[0])}
              className="hidden"
            />
            <Upload size={22} className="mx-auto mb-2 text-slate-400" />
            {fichier ? (
              <p className="text-sm font-medium">{fichier.name}</p>
            ) : (
              <p className="text-sm text-slate-500">
                Glissez le PDF ici, ou cliquez pour le choisir
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">PDF · 10 Mo maximum</p>
          </div>

          {erreurFormulaire && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle size={15} />
              {erreurFormulaire}
            </p>
          )}

          <button
            type="submit"
            disabled={envoiEnCours}
            className="mt-4 px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {envoiEnCours ? "Dépôt en cours…" : "Déposer"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Numéro, libellé, destinataire…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
          />
        </div>
        <select
          value={filtreRole}
          onChange={(e) => setFiltreRole(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
        >
          <option value="">Tous les destinataires</option>
          <option value="client">Clients</option>
          <option value="convoyeur">Convoyeurs</option>
        </select>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent"
        >
          <option value="">Tous les statuts</option>
          <option value="emise">Émises</option>
          <option value="payee">Payées</option>
          <option value="annulee">Annulées</option>
        </select>
      </div>

      {erreur && (
        <p className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="text-slate-500 py-8 text-center">Chargement…</p>
      ) : filtrees.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          <Receipt size={36} className="mx-auto mb-3 opacity-40" />
          <p>Aucune facture pour le moment.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Numéro</th>
                <th className="px-4 py-3 font-semibold">Destinataire</th>
                <th className="px-4 py-3 font-semibold">Libellé</th>
                <th className="px-4 py-3 font-semibold text-right">Montant</th>
                <th className="px-4 py-3 font-semibold">Émission</th>
                <th className="px-4 py-3 font-semibold">Échéance</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((f) => (
                <tr
                  key={f.id}
                  className="border-t border-slate-200 dark:border-slate-700"
                >
                  <td className="px-4 py-3 font-mono text-xs">{f.numero}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-medium">
                      {f.destinataire_role === "convoyeur" ? (
                        <Truck size={13} className="text-slate-400" />
                      ) : (
                        <Users size={13} className="text-slate-400" />
                      )}
                      {f.destinataire_societe || f.destinataire_nom}
                    </div>
                    {f.destinataire_societe && (
                      <div className="text-xs text-slate-500 pl-5">
                        {f.destinataire_nom}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {f.libelle || "—"}
                    {f.periode && <div className="text-xs">{f.periode}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formaterMontant(f.montant_ttc)}
                  </td>
                  <td className="px-4 py-3">{formaterDate(f.date_emission)}</td>
                  <td className="px-4 py-3">{formaterDate(f.date_echeance)}</td>
                  <td className="px-4 py-3">
                    <Badge statut={f.statut} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`${f.file_path}?token=${localStorage.getItem("dlc_token")}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Télécharger"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Download size={16} />
                      </a>
                      {f.statut === "emise" && (
                        <>
                          <button
                            onClick={() => changerStatut(f, "payee")}
                            title="Marquer payée"
                            className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-600"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            onClick={() => changerStatut(f, "annulee")}
                            title="Annuler"
                            className="p-1.5 rounded hover:bg-red-500/10 text-red-600"
                          >
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
