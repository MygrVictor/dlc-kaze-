import { useState, useEffect } from "react";
import api from "../../lib/api";
import { formatDate } from "../../lib/utils";
import {
  Users,
  CheckCircle2,
  Clock,
  Truck,
  Shield,
  UserCheck,
  Link2,
  Unlink,
  X,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  Mail,
  Trash2,
  AlertTriangle,
  FileText,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  Car,
  CreditCard,
  ShieldCheck,
  Home,
  KeyRound,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

// En production, l'API et le front sont servis par la même origine : le
// repli doit être une chaîne vide (chemin relatif), surtout pas localhost,
// qui serait figé dans le bundle et casserait les téléchargements en ligne.
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const getFileUrl = (filePath) => {
  const token = localStorage.getItem("dlc_token");
  return `${API_BASE}${filePath}?token=${token}`;
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [kazeModal, setKazeModal] = useState(null); // user obj
  const [kazeIdInput, setKazeIdInput] = useState("");
  const [kazeSaving, setKazeSaving] = useState(false);

  // ── Modal documents convoyeur ───────────────────────────────
  const [docsModal, setDocsModal] = useState(null); // user obj
  const [docsData, setDocsData] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docReviewing, setDocReviewing] = useState({});
  const [refuseNote, setRefuseNote] = useState({});

  // ── Modal création utilisateur ──────────────────────────────
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    role: "client",
    password: "",
  });
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState(null); // { user, generatedPassword }
  const [showGenPassword, setShowGenPassword] = useState(false);

  // ── Modal suppression ──────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState(null); // user obj
  const [deleting, setDeleting] = useState(false);

  // Envoi en cours, par identifiant : le tableau peut compter des
  // dizaines de lignes, un indicateur global ne dirait pas laquelle.
  const [envoiReset, setEnvoiReset] = useState({});

  const fetchUsers = () => {
    setLoading(true);
    const params = roleFilter ? `?role=${roleFilter}` : "";
    api
      .get(`/admin/users${params}`)
      .then((res) => setUsers(res.data.users))
      .catch((err) => {
        console.error(err);
        toast.error("Erreur de chargement des utilisateurs.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(fetchUsers, [roleFilter]);

  const handleValidate = async (userId) => {
    try {
      await api.patch(`/admin/users/${userId}/validate`);
      toast.success("Client validé.");
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    }
  };

  // L'administrateur ne voit jamais le mot de passe : il déclenche le
  // même parcours que le « mot de passe oublié », l'utilisateur reste
  // seul à choisir le sien.
  const handleEnvoyerReset = async (u) => {
    if (
      !confirm(
        `Envoyer un lien de réinitialisation à ${u.email} ?\nSon mot de passe actuel reste valable tant qu'il ne l'utilise pas.`,
      )
    )
      return;
    setEnvoiReset((p) => ({ ...p, [u.id]: true }));
    try {
      const { data } = await api.post(`/admin/users/${u.id}/reset-password`);
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de l'envoi.");
    } finally {
      setEnvoiReset((p) => ({ ...p, [u.id]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${deleteModal.id}`);
      toast.success(`Utilisateur ${deleteModal.full_name} supprimé.`);
      setDeleteModal(null);
      fetchUsers();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la suppression.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openKazeModal = (u) => {
    setKazeModal(u);
    setKazeIdInput(u.kaze_driver_id || "");
  };

  const openDocsModal = (u) => {
    setDocsModal(u);
    setDocsData([]);
    setDocsLoading(true);
    api
      .get(`/admin/users/${u.id}/documents`)
      .then((res) => setDocsData(res.data.documents))
      .catch(() => toast.error("Erreur chargement documents."))
      .finally(() => setDocsLoading(false));
  };

  const handleDocReview = async (userId, docId, status, note) => {
    setDocReviewing((p) => ({ ...p, [docId]: true }));
    try {
      const { data } = await api.patch(
        `/admin/users/${userId}/documents/${docId}`,
        {
          status,
          admin_note: note || undefined,
        },
      );
      toast.success(data.message);
      setDocsData((prev) =>
        prev.map((d) => (d.id === docId ? data.document : d)),
      );
      setRefuseNote((p) => ({ ...p, [docId]: "" }));
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la révision.");
    } finally {
      setDocReviewing((p) => ({ ...p, [docId]: false }));
    }
  };

  const handleKazeLink = async () => {
    setKazeSaving(true);
    try {
      await api.patch(`/admin/users/${kazeModal.id}/kaze-link`, {
        kazeDriverId: kazeIdInput.trim() || null,
      });
      toast.success(
        kazeIdInput.trim() ? "Compte Kaze lié." : "Liaison Kaze supprimée.",
      );
      setKazeModal(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setKazeSaving(false);
    }
  };

  // ── Création d'utilisateur ──────────────────────────────────
  const openCreateModal = () => {
    setCreateForm({
      fullName: "",
      email: "",
      phone: "",
      company: "",
      role: "client",
      password: "",
    });
    setCreatedResult(null);
    setShowGenPassword(false);
    setCreateModal(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        fullName: createForm.fullName,
        email: createForm.email,
        phone: createForm.phone || undefined,
        company: createForm.company || undefined,
        role: createForm.role,
      };
      // N'envoyer le mot de passe que si l'admin en a saisi un
      if (createForm.password.trim()) {
        payload.password = createForm.password;
      }
      const res = await api.post("/auth/register", payload);
      setCreatedResult({
        user: res.data.user,
        generatedPassword: res.data.generatedPassword,
      });
      toast.success("Compte créé avec succès !");
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la création.");
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié dans le presse-papier !");
  };

  const roleIcons = {
    client: Users,
    convoyeur: Truck,
    admin: Shield,
  };

  const roleColors = {
    client: "bg-primary-500/10 text-primary-400 border border-primary-500/20",
    convoyeur: "bg-accent-500/10 text-accent-400 border border-accent-500/20",
    admin: "bg-red-500/10 text-red-400 border border-red-500/20",
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des utilisateurs</h1>
          <p className="text-dark-400 text-sm mt-1">
            Créez, validez et gérez les comptes utilisateurs.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={18} />
          Créer un utilisateur
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {["", "client", "convoyeur", "admin"].map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              roleFilter === r
                ? "bg-primary-600 text-white"
                : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
            }`}
          >
            {r || "Tous"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      )}

      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-stack">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Utilisateur
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Rôle
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Entreprise
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Téléphone
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Inscrit le
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Statut
                </th>
                <th className="text-left py-3 px-4 text-dark-400 font-medium">
                  Kaze
                </th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const RoleIcon = roleIcons[u.role] || Users;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                          {u.full_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-xs text-dark-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${roleColors[u.role]}`}>
                        <RoleIcon size={12} className="mr-1" />
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-dark-400">
                      {u.company || "—"}
                    </td>
                    <td className="py-3 px-4 text-dark-400">
                      {u.phone || "—"}
                    </td>
                    <td className="py-3 px-4 text-dark-400">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      {u.is_validated ? (
                        <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle2 size={12} className="mr-1" />
                          Validé
                        </span>
                      ) : (
                        <span className="badge bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          <Clock size={12} className="mr-1" />
                          En attente
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.role === "convoyeur" ? (
                        u.kaze_driver_id ? (
                          <button
                            onClick={() => openKazeModal(u)}
                            className="badge bg-green-500/10 text-green-400 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
                          >
                            <Link2 size={12} className="mr-1" />
                            Lié
                          </button>
                        ) : (
                          <button
                            onClick={() => openKazeModal(u)}
                            className="badge bg-dark-700 text-dark-400 border border-dark-600 cursor-pointer hover:bg-dark-600 hover:text-dark-300 transition-colors"
                          >
                            <Unlink size={12} className="mr-1" />
                            Non lié
                          </button>
                        )
                      ) : (
                        <span className="text-dark-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {" "}
                        {u.role === "convoyeur" && (
                          <button
                            onClick={() => openDocsModal(u)}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                            title="Voir les documents"
                          >
                            <FileText size={15} />
                          </button>
                        )}{" "}
                        {(u.role === "client" || u.role === "convoyeur") &&
                          !u.is_validated && (
                            <button
                              onClick={() => handleValidate(u.id)}
                              className="btn-success btn-xs"
                            >
                              <UserCheck size={14} />
                              Valider
                            </button>
                          )}
                        {u.role !== "admin" && (
                          <button
                            onClick={() => handleEnvoyerReset(u)}
                            disabled={envoiReset[u.id]}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-50"
                            title="Envoyer un lien de réinitialisation de mot de passe"
                          >
                            {envoiReset[u.id] ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <KeyRound size={15} />
                            )}
                          </button>
                        )}
                        {u.role !== "admin" && (
                          <button
                            onClick={() => setDeleteModal(u)}
                            className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-dark-400">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Kaze Link */}
      {kazeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Liaison Kaze — {kazeModal.full_name}
              </h3>
              <button
                onClick={() => setKazeModal(null)}
                className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-dark-400 mb-4">
              Entrez l'ID du convoyeur dans Kaze (kaze_driver_id) ou laissez
              vide pour supprimer la liaison.
            </p>

            <input
              type="text"
              value={kazeIdInput}
              onChange={(e) => setKazeIdInput(e.target.value)}
              className="input-field mb-4"
              placeholder="ex: drv_abc123xyz"
            />

            <div className="flex gap-3">
              <button
                onClick={handleKazeLink}
                disabled={kazeSaving}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Link2 size={16} />
                {kazeSaving
                  ? "Enregistrement…"
                  : kazeIdInput.trim()
                    ? "Lier"
                    : "Supprimer la liaison"}
              </button>
              <button
                onClick={() => setKazeModal(null)}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Modal Suppression utilisateur                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  Supprimer l'utilisateur
                </h3>
                <p className="text-xs text-dark-400">
                  Cette action est irréversible
                </p>
              </div>
            </div>

            <div className="bg-dark-900 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {deleteModal.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{deleteModal.full_name}</p>
                  <p className="text-xs text-dark-400">{deleteModal.email}</p>
                  <span
                    className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded font-medium ${roleColors[deleteModal.role]}`}
                  >
                    {deleteModal.role}
                  </span>
                </div>
              </div>
            </div>

            {deleteModal.role === "client" && (
              <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
                <AlertTriangle size={14} />
                Toutes les missions de ce client seront également supprimées.
              </p>
            )}
            {deleteModal.role === "convoyeur" && (
              <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
                <AlertTriangle size={14} />
                Les missions assignées à ce convoyeur seront détachées (non
                supprimées).
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="btn-secondary flex-1"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger flex-1"
              >
                <Trash2 size={16} />
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Modal Création utilisateur                                */}
      {/* ══════════════════════════════════════════════════════════ */}
      {createModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserPlus size={20} className="text-primary-400" />
                {createdResult ? "Compte créé !" : "Créer un utilisateur"}
              </h3>
              <button
                onClick={() => setCreateModal(false)}
                className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* ── Résultat après création ────────────────────── */}
            {createdResult ? (
              <div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
                  <p className="text-green-400 font-medium mb-1 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Compte {createdResult.user.role} créé avec succès
                  </p>
                  <p className="text-dark-400 text-xs">
                    Un email avec les identifiants a été envoyé à l'utilisateur.
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="bg-dark-900 rounded-lg p-3">
                    <p className="text-xs text-dark-500 mb-1">Nom</p>
                    <p className="font-medium">
                      {createdResult.user.full_name}
                    </p>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Email</p>
                      <p className="font-medium font-mono text-sm">
                        {createdResult.user.email}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(createdResult.user.email)}
                      className="p-2 hover:bg-dark-700 rounded-lg transition-colors text-dark-400 hover:text-white"
                      title="Copier"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Mot de passe</p>
                      <p className="font-medium font-mono text-sm">
                        {showGenPassword
                          ? createdResult.generatedPassword
                          : "••••••••••••"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowGenPassword(!showGenPassword)}
                        className="p-2 hover:bg-dark-700 rounded-lg transition-colors text-dark-400 hover:text-white"
                        title={showGenPassword ? "Masquer" : "Afficher"}
                      >
                        {showGenPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          copyToClipboard(createdResult.generatedPassword)
                        }
                        className="p-2 hover:bg-dark-700 rounded-lg transition-colors text-dark-400 hover:text-white"
                        title="Copier"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
                  <Mail size={14} />
                  Ces identifiants ont aussi été envoyés par email à{" "}
                  {createdResult.user.email}.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={openCreateModal}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <UserPlus size={16} />
                    Créer un autre
                  </button>
                  <button
                    onClick={() => setCreateModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              /* ── Formulaire de création ──────────────────────── */
              <form onSubmit={handleCreateUser} className="space-y-4">
                {/* Rôle */}
                <div className="flex bg-dark-700 rounded-lg p-1">
                  {[
                    { value: "client", label: "Client", icon: Users },
                    { value: "convoyeur", label: "Convoyeur", icon: Truck },
                  ].map((r) => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() =>
                          setCreateForm({ ...createForm, role: r.value })
                        }
                        className={`flex-1 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                          createForm.role === r.value
                            ? "bg-primary-600 text-white shadow"
                            : "text-dark-400 hover:text-white"
                        }`}
                      >
                        <Icon size={14} />
                        {r.label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Nom complet *
                  </label>
                  <input
                    required
                    value={createForm.fullName}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, fullName: e.target.value })
                    }
                    className="input-field"
                    placeholder="Jean Dupont"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, email: e.target.value })
                    }
                    className="input-field"
                    placeholder="utilisateur@email.fr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Téléphone
                  </label>
                  <input
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, phone: e.target.value })
                    }
                    className="input-field"
                    placeholder="+33 6 12 34 56 78"
                  />
                </div>

                {createForm.role === "client" && (
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1.5">
                      Entreprise
                    </label>
                    <input
                      value={createForm.company}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          company: e.target.value,
                        })
                      }
                      className="input-field"
                      placeholder="Nom de l'entreprise"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Mot de passe
                  </label>
                  <input
                    type="text"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, password: e.target.value })
                    }
                    className="input-field"
                    placeholder="Laisser vide pour générer automatiquement"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Si vide, un mot de passe sécurisé sera généré
                    automatiquement.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <UserPlus size={16} />
                    {creating ? "Création…" : "Créer le compte"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModal(false)}
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

      {/* ── Modal Documents Convoyeur ─────────────────────── */}
      {docsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-dark-700">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <FileText size={20} className="text-accent-400" />
                  Documents — {docsModal.full_name}
                </h3>
                <p className="text-sm text-dark-400 mt-0.5">
                  Validez ou refusez les pièces justificatives du convoyeur.
                </p>
              </div>
              <button
                onClick={() => setDocsModal(null)}
                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {docsLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
                </div>
              ) : docsData.length === 0 ? (
                <div className="text-center py-10 text-dark-400">
                  <FileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p>Aucun document déposé pour ce convoyeur.</p>
                </div>
              ) : (
                docsData.map((doc) => {
                  const DOC_LABELS = {
                    permis: { label: "Permis de conduire", icon: Car },
                    carte_identite: {
                      label: "Carte d'identité",
                      icon: CreditCard,
                    },
                    carte_identite_verso: {
                      label: "Carte d'identité — verso",
                      icon: CreditCard,
                    },
                    assurance: {
                      label: "Attestation d'assurance",
                      icon: ShieldCheck,
                    },
                    kbis: { label: "Extrait Kbis", icon: FileText },
                    rc_circulation: {
                      label: "RC circulation",
                      icon: ShieldCheck,
                    },
                    w_garage: {
                      label: "Certification W garage",
                      icon: FileText,
                    },
                    rc_pro: {
                      label: "RC professionnelle",
                      icon: ShieldCheck,
                    },
                    domicile: { label: "Justificatif de domicile", icon: Home },
                  };
                  const cfg = DOC_LABELS[doc.type] || {
                    label: doc.type,
                    icon: FileText,
                  };
                  const DocIcon = cfg.icon;
                  const isReviewing = docReviewing[doc.id];

                  return (
                    <div
                      key={doc.id}
                      className="border border-dark-700 rounded-xl p-4 space-y-3"
                    >
                      {/* En-tête doc */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <DocIcon size={18} className="text-dark-400" />
                          <div>
                            <p className="font-medium text-sm">{cfg.label}</p>
                            <p className="text-xs text-dark-500 truncate max-w-[200px]">
                              {doc.original_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Badge statut */}
                          {doc.status === "en_attente" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center gap-1">
                              <Clock size={11} /> En attente
                            </span>
                          )}
                          {doc.status === "valide" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-1">
                              <CheckCircle size={11} /> Validé
                            </span>
                          )}
                          {doc.status === "refuse" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1">
                              <XCircle size={11} /> Refusé
                            </span>
                          )}
                          {/* Lien voir + télécharger fichier */}
                          <a
                            href={getFileUrl(doc.file_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                            title="Voir le fichier"
                          >
                            <ExternalLink size={15} />
                          </a>
                          <a
                            href={getFileUrl(doc.file_path)}
                            download={doc.original_name}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                            title="Télécharger"
                          >
                            <Download size={15} />
                          </a>
                        </div>
                      </div>

                      {/* Note admin si refusé */}
                      {doc.status === "refuse" && doc.admin_note && (
                        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          Motif : {doc.admin_note}
                        </p>
                      )}

                      {/* Actions de révision */}
                      <div className="space-y-2">
                        {doc.status !== "valide" && (
                          <button
                            onClick={() =>
                              handleDocReview(
                                docsModal.id,
                                doc.id,
                                "valide",
                                "",
                              )
                            }
                            disabled={isReviewing}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-colors"
                          >
                            {isReviewing ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400" />
                            ) : (
                              <CheckCircle size={15} />
                            )}
                            Valider ce document
                          </button>
                        )}
                        {doc.status !== "refuse" && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Motif du refus (optionnel)…"
                              value={refuseNote[doc.id] || ""}
                              onChange={(e) =>
                                setRefuseNote((p) => ({
                                  ...p,
                                  [doc.id]: e.target.value,
                                }))
                              }
                              className="input-field text-sm flex-1 py-2"
                            />
                            <button
                              onClick={() =>
                                handleDocReview(
                                  docsModal.id,
                                  doc.id,
                                  "refuse",
                                  refuseNote[doc.id],
                                )
                              }
                              disabled={isReviewing}
                              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors flex-shrink-0"
                            >
                              <XCircle size={15} />
                              Refuser
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-dark-700">
              <button
                onClick={() => setDocsModal(null)}
                className="btn-secondary w-full"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
