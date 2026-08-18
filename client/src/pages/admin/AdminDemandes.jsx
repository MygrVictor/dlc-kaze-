import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  Mail,
  Phone,
  Building2,
  Truck,
  UserPlus,
  Trash2,
  RefreshCw,
  Check,
  MessageSquare,
  Copy,
} from "lucide-react";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { formatDate } from "../../lib/utils";

const STATUTS = {
  nouvelle: {
    label: "Nouvelle",
    className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  },
  contactee: {
    label: "Contactée",
    className: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  },
  convertie: {
    label: "Convertie",
    className: "bg-green-500/10 text-green-400 border border-green-500/20",
  },
  archivee: {
    label: "Archivée",
    className: "bg-dark-700 text-dark-400 border border-dark-600",
  },
};

export default function AdminDemandes() {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  // Conversion : la demande sert de brouillon au formulaire de création.
  const [conversion, setConversion] = useState(null);
  const [formCompte, setFormCompte] = useState(null);
  const [creation, setCreation] = useState(false);
  const [compteCree, setCompteCree] = useState(null);

  const charger = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtreStatut) params.set("status", filtreStatut);
    if (filtreType) params.set("type", filtreType);
    const qs = params.toString() ? `?${params.toString()}` : "";

    api
      .get(`/admin/demandes${qs}`)
      .then((res) => setDemandes(res.data.demandes))
      .catch(() => toast.error("Erreur de chargement des demandes."))
      .finally(() => setLoading(false));
  }, [filtreStatut, filtreType]);

  useEffect(charger, [charger]);

  const changerStatut = async (id, status) => {
    try {
      await api.patch(`/admin/demandes/${id}`, { status });
      toast.success("Statut mis à jour.");
      charger();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    }
  };

  const supprimer = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      await api.delete(`/admin/demandes/${aSupprimer.id}`);
      toast.success("Demande supprimée.");
      setASupprimer(null);
      charger();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setSuppression(false);
    }
  };

  const ouvrirConversion = (d) => {
    setConversion(d);
    setCompteCree(null);
    setFormCompte({
      fullName: [d.first_name, d.last_name].filter(Boolean).join(" ").trim(),
      email: d.email || "",
      phone: d.phone || "",
      company: d.company || "",
      role: d.type,
      password: "",
    });
  };

  const creerCompte = async (e) => {
    e.preventDefault();
    setCreation(true);
    try {
      const payload = {
        fullName: formCompte.fullName,
        email: formCompte.email,
        phone: formCompte.phone || undefined,
        company: formCompte.company || undefined,
        role: formCompte.role,
      };
      if (formCompte.password.trim()) payload.password = formCompte.password;

      const { data } = await api.post("/auth/register", payload);

      // La demande n'a de sens qu'une fois rattachée au compte créé :
      // on la bascule immédiatement en « convertie ».
      await api.patch(`/admin/demandes/${conversion.id}`, {
        status: "convertie",
      });

      setCompteCree({
        user: data.user,
        generatedPassword: data.generatedPassword,
      });
      toast.success("Compte créé et demande convertie.");
      charger();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la création.");
    } finally {
      setCreation(false);
    }
  };

  const copier = (texte) => {
    navigator.clipboard.writeText(texte);
    toast.success("Copié !");
  };

  const nouvelles = demandes.filter((d) => d.status === "nouvelle").length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demandes de contact</h1>
          <p className="text-dark-400 text-sm mt-1">
            {nouvelles} nouvelle(s) demande(s) — rappelez le prospect puis créez
            son compte.
          </p>
        </div>
        <button
          onClick={charger}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-dark-500">Statut :</span>
        {["", "nouvelle", "contactee", "convertie", "archivee"].map((s) => (
          <button
            key={s || "tous"}
            onClick={() => setFiltreStatut(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filtreStatut === s
                ? "bg-primary-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {s ? STATUTS[s].label : "Tous"}
          </button>
        ))}
        <span className="text-xs text-dark-500 ml-4">Type :</span>
        {["", "client", "convoyeur"].map((t) => (
          <button
            key={t || "tous"}
            onClick={() => setFiltreType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filtreType === t
                ? "bg-accent-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {t ? t.charAt(0).toUpperCase() + t.slice(1) : "Tous"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      ) : demandes.length === 0 ? (
        <div className="card text-center py-16 text-dark-400">
          <Inbox size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {demandes.map((d) => {
            const statut = STATUTS[d.status] || STATUTS.nouvelle;
            const nom =
              [d.first_name, d.last_name].filter(Boolean).join(" ") ||
              d.company ||
              "—";

            return (
              <div key={d.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        d.type === "convoyeur"
                          ? "bg-accent-500/10 text-accent-400"
                          : "bg-primary-500/10 text-primary-400"
                      }`}
                    >
                      {d.type === "convoyeur" ? (
                        <Truck size={18} />
                      ) : (
                        <Building2 size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{nom}</p>
                      <p className="text-xs text-dark-500">
                        {d.type === "convoyeur" ? "Convoyeur" : "Client"} •{" "}
                        {formatDate(d.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className={`badge text-xs ${statut.className}`}>
                    {statut.label}
                  </span>
                </div>

                {d.company && d.type === "convoyeur" && (
                  <p className="text-sm text-dark-300 flex items-center gap-2">
                    <Building2 size={13} className="text-dark-500" />
                    {d.company}
                  </p>
                )}

                <div className="space-y-1.5 text-sm">
                  {d.email && (
                    <a
                      href={`mailto:${d.email}`}
                      className="flex items-center gap-2 text-dark-300 hover:text-primary-400 transition-colors"
                    >
                      <Mail size={13} className="text-dark-500" />
                      {d.email}
                    </a>
                  )}
                  {d.phone && (
                    <a
                      href={`tel:${d.phone}`}
                      className="flex items-center gap-2 text-dark-300 hover:text-accent-400 transition-colors"
                    >
                      <Phone size={13} className="text-dark-500" />
                      {d.phone}
                    </a>
                  )}
                </div>

                {d.message && (
                  <p className="text-xs text-dark-300 bg-dark-900/60 border border-dark-700 rounded-lg px-3 py-2 whitespace-pre-wrap flex gap-2">
                    <MessageSquare
                      size={13}
                      className="text-dark-500 flex-shrink-0 mt-0.5"
                    />
                    {d.message}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dark-700">
                  {d.status === "nouvelle" && (
                    <button
                      onClick={() => changerStatut(d.id, "contactee")}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                    >
                      <Check size={13} /> Marquer contactée
                    </button>
                  )}
                  {d.status !== "convertie" && (
                    <button
                      onClick={() => ouvrirConversion(d)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus size={13} /> Créer le compte
                    </button>
                  )}
                  {d.status !== "archivee" && (
                    <button
                      onClick={() => changerStatut(d.id, "archivee")}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
                    >
                      Archiver
                    </button>
                  )}
                  <button
                    onClick={() => setASupprimer(d)}
                    className="ml-auto p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conversion en compte */}
      {conversion && formCompte && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserPlus size={20} className="text-primary-400" />
                {compteCree ? "Compte créé !" : "Créer le compte"}
              </h3>
              <button
                onClick={() => setConversion(null)}
                className="text-dark-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {compteCree ? (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm text-green-400">
                  Compte {compteCree.user.role} créé. Les identifiants ont été
                  envoyés par email.
                </div>
                <div className="bg-dark-900 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-dark-500 mb-1">Mot de passe</p>
                    <p className="font-mono text-sm">
                      {compteCree.generatedPassword}
                    </p>
                  </div>
                  <button
                    onClick={() => copier(compteCree.generatedPassword)}
                    className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <button
                  onClick={() => setConversion(null)}
                  className="btn-secondary w-full"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={creerCompte} className="space-y-4">
                <div className="flex bg-dark-700 rounded-lg p-1">
                  {["client", "convoyeur"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setFormCompte({ ...formCompte, role: r })}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                        formCompte.role === r
                          ? "bg-primary-600 text-white shadow"
                          : "text-dark-400 hover:text-white"
                      }`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Nom complet *
                  </label>
                  <input
                    required
                    value={formCompte.fullName}
                    onChange={(e) =>
                      setFormCompte({ ...formCompte, fullName: e.target.value })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formCompte.email}
                    onChange={(e) =>
                      setFormCompte({ ...formCompte, email: e.target.value })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Téléphone
                  </label>
                  <input
                    value={formCompte.phone}
                    onChange={(e) =>
                      setFormCompte({ ...formCompte, phone: e.target.value })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Entreprise
                  </label>
                  <input
                    value={formCompte.company}
                    onChange={(e) =>
                      setFormCompte({ ...formCompte, company: e.target.value })
                    }
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Mot de passe
                  </label>
                  <input
                    type="text"
                    value={formCompte.password}
                    onChange={(e) =>
                      setFormCompte({ ...formCompte, password: e.target.value })
                    }
                    className="input-field"
                    placeholder="Laisser vide pour générer automatiquement"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={creation}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <UserPlus size={16} />
                    {creation ? "Création…" : "Créer le compte"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversion(null)}
                    className="btn-secondary"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Suppression */}
      {aSupprimer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Supprimer la demande</h3>
            <p className="text-sm text-dark-400 mb-6">
              Cette action est irréversible. Les coordonnées du prospect seront
              définitivement perdues.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setASupprimer(null)}
                className="btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                onClick={supprimer}
                disabled={suppression}
                className="btn-danger flex-1"
              >
                <Trash2 size={16} />
                {suppression ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
