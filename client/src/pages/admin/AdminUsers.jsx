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
  Building2,
  Network,
  Upload,
  ReceiptText,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";

// En production, l'API et le front sont servis par la même origine : le
// repli doit être une chaîne vide (chemin relatif), surtout pas localhost,
// qui serait figé dans le bundle et casserait les téléchargements en ligne.
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const getFileUrl = (filePath) => `${API_BASE}${filePath}`;
const euros = (centimes) => {
  if (centimes === null || centimes === undefined || centimes === "") {
    return "—";
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(centimes) / 100);
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [kazeModal, setKazeModal] = useState(null); // user obj
  const [kazeEmailInput, setKazeEmailInput] = useState("");
  const [kazePhoneInput, setKazePhoneInput] = useState("");
  const [kazeIdInput, setKazeIdInput] = useState("");
  const [kazeLinkMethod, setKazeLinkMethod] = useState("email");
  const [kazeSaving, setKazeSaving] = useState(false);

  // ── Modal rattachement à un siège ──────────────────────
  const [parentModal, setParentModal] = useState(null); // user obj
  const [parentChoisi, setParentChoisi] = useState("");
  const [parentSaving, setParentSaving] = useState(false);

  // ── Modal documents convoyeur ───────────────────────────────
  const [docsModal, setDocsModal] = useState(null); // user obj
  const [docsData, setDocsData] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docReviewing, setDocReviewing] = useState({});
  const [refuseNote, setRefuseNote] = useState({});

  // ── Modal profil utilisateur (infos + factures + docs client) ─────
  const [profileModal, setProfileModal] = useState(null);
  const [profileTab, setProfileTab] = useState("infos");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFactures, setProfileFactures] = useState([]);
  const [profileDocs, setProfileDocs] = useState([]);
  const [factureUploading, setFactureUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docDeleting, setDocDeleting] = useState({});
  const [factureForm, setFactureForm] = useState({
    numero: "",
    libelle: "",
    montant_ttc: "",
    date_emission: "",
    file: null,
  });
  const [clientDocForm, setClientDocForm] = useState({
    label: "",
    file: null,
  });

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
  const [emailModal, setEmailModal] = useState(null); // user obj
  const [emailInput, setEmailInput] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Envoi en cours, par identifiant : le tableau peut compter des
  // dizaines de lignes, un indicateur global ne dirait pas laquelle.
  const [envoiReset, setEnvoiReset] = useState({});
  // Même principe que les demandes : la liste complète n'est plus chargée
  // systématiquement, elle s'étend à la demande.
  const [plafond, setPlafond] = useState(100);
  const [reste, setReste] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set("role", roleFilter);
    params.set("limit", String(plafond));
    api
      .get(`/admin/users?${params.toString()}`)
      .then((res) => {
        setUsers(res.data.users);
        setReste(Boolean(res.data.pagination?.hasMore));
      })
      .catch((err) => {
        console.error(err);
        toast.error("Erreur de chargement des utilisateurs.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(fetchUsers, [roleFilter, plafond]);

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

  const openEmailModal = (u) => {
    setEmailModal(u);
    setEmailInput(u.email || "");
  };

  const handleUpdateEmail = async () => {
    if (!emailModal) return;

    const prochainEmail = emailInput.trim().toLowerCase();
    if (!prochainEmail) {
      toast.error("Veuillez renseigner un email.");
      return;
    }

    setEmailSaving(true);
    try {
      const { data } = await api.patch(`/admin/users/${emailModal.id}/email`, {
        email: prochainEmail,
      });
      toast.success(data.message || "Email mis à jour.");
      setEmailModal(null);
      fetchUsers();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la mise à jour.",
      );
    } finally {
      setEmailSaving(false);
    }
  };

  const openKazeModal = (u) => {
    setKazeModal(u);
    setKazeLinkMethod("email");
    setKazeIdInput(u.kaze_driver_id || "");
    setKazeEmailInput(u.email || "");
    setKazePhoneInput(u.phone || "");
  };

  const openParentModal = (u) => {
    setParentModal(u);
    setParentChoisi(u.parent_id || "");
  };

  const handleParentLink = async () => {
    setParentSaving(true);
    try {
      const { data } = await api.patch(
        `/admin/users/${parentModal.id}/parent`,
        { parentId: parentChoisi || null },
      );
      toast.success(data.message);
      setParentModal(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur.");
    } finally {
      setParentSaving(false);
    }
  };

  const openDocsModal = (u) => {
    setDocsModal(u);
    setDocsData([]);
    setDocsLoading(true);
    api
      .get(`/admin/users/${u.id}/docs`)
      .then((res) => setDocsData(res.data.documents))
      .catch(() => toast.error("Erreur chargement documents."))
      .finally(() => setDocsLoading(false));
  };

  const handleDocReview = async (userId, docId, status, note) => {
    setDocReviewing((p) => ({ ...p, [docId]: true }));
    try {
      const { data } = await api.patch(`/admin/users/${userId}/docs/${docId}`, {
        status,
        admin_note: note || undefined,
      });
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

  const rechargerProfil = async (u = profileModal) => {
    if (!u?.id) return;
    setProfileLoading(true);
    try {
      const requetes = [api.get(`/factures?destinataire_id=${u.id}`)];
      if (u.role === "client") {
        requetes.push(api.get(`/admin/users/${u.id}/files`));
      }
      const [resFactures, resDocs] = await Promise.all(requetes);
      setProfileFactures(resFactures.data || []);
      setProfileDocs(resDocs?.data?.documents || []);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger le profil utilisateur.");
    } finally {
      setProfileLoading(false);
    }
  };

  const openProfileModal = (u, startTab = "infos") => {
    setProfileModal(u);
    setProfileTab(startTab);
    setProfileFactures([]);
    setProfileDocs([]);
    setFactureForm({
      numero: "",
      libelle: "",
      montant_ttc: "",
      date_emission: "",
      file: null,
    });
    setClientDocForm({ label: "", file: null });
    rechargerProfil(u);
  };

  const handleUploadFactureProfil = async () => {
    if (!profileModal?.id) return;
    if (!factureForm.numero.trim()) {
      toast.error("Le numéro de facture est obligatoire.");
      return;
    }
    if (!factureForm.file) {
      toast.error("Joignez un PDF de facture.");
      return;
    }
    if (factureForm.file.type !== "application/pdf") {
      toast.error("La facture doit être un PDF.");
      return;
    }

    const donnees = new FormData();
    donnees.append("facture", factureForm.file);
    donnees.append("numero", factureForm.numero.trim());
    if (factureForm.libelle.trim()) {
      donnees.append("libelle", factureForm.libelle.trim());
    }
    if (factureForm.montant_ttc.trim()) {
      donnees.append("montant_ttc", factureForm.montant_ttc.trim());
    }
    if (factureForm.date_emission) {
      donnees.append("date_emission", factureForm.date_emission);
    }

    setFactureUploading(true);
    try {
      await api.post(`/factures/destinataires/${profileModal.id}`, donnees);
      toast.success("Facture déposée.");
      setFactureForm({
        numero: "",
        libelle: "",
        montant_ttc: "",
        date_emission: "",
        file: null,
      });
      await rechargerProfil(profileModal);
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors du dépôt de la facture.",
      );
    } finally {
      setFactureUploading(false);
    }
  };

  const handleUploadClientDoc = async () => {
    if (!profileModal?.id || profileModal.role !== "client") return;
    if (!clientDocForm.label.trim()) {
      toast.error("Le libellé du document est obligatoire.");
      return;
    }
    if (!clientDocForm.file) {
      toast.error("Joignez un document.");
      return;
    }

    const mimeAutorises = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!mimeAutorises.includes(clientDocForm.file.type)) {
      toast.error("Formats acceptés : PDF, JPG, PNG, WEBP.");
      return;
    }

    const donnees = new FormData();
    donnees.append("label", clientDocForm.label.trim());
    donnees.append("document", clientDocForm.file);

    setDocUploading(true);
    try {
      await api.post(`/admin/users/${profileModal.id}/files`, donnees);
      toast.success("Document ajouté.");
      setClientDocForm({ label: "", file: null });
      await rechargerProfil(profileModal);
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de l'ajout du document.",
      );
    } finally {
      setDocUploading(false);
    }
  };

  const handleDeleteClientDoc = async (docId) => {
    if (!profileModal?.id || !docId) return;
    if (!confirm("Supprimer ce document ?")) return;

    setDocDeleting((p) => ({ ...p, [docId]: true }));
    try {
      await api.delete(`/admin/users/${profileModal.id}/files/${docId}`);
      toast.success("Document supprimé.");
      await rechargerProfil(profileModal);
    } catch (err) {
      toast.error(err.response?.data?.error || "Suppression impossible.");
    } finally {
      setDocDeleting((p) => ({ ...p, [docId]: false }));
    }
  };

  const handleKazeLink = async (methodOverride) => {
    const method = methodOverride || kazeLinkMethod;
    if (method === "email" && !kazeEmailInput.trim()) {
      return toast.error("Veuillez saisir l'email Kaze.");
    }
    if (method === "phone" && !kazePhoneInput.trim()) {
      return toast.error("Veuillez saisir le téléphone Kaze.");
    }

    setKazeSaving(true);
    try {
      const payload =
        method === "email"
          ? { kazeEmail: kazeEmailInput.trim() }
          : { kazePhone: kazePhoneInput.trim() };

      const { data } = await api.patch(
        `/admin/users/${kazeModal.id}/kaze-link`,
        payload,
      );

      const idRetrouve =
        data.user?.kaze_driver_id ||
        data.kazeDriver?.id ||
        data.kazeDriverId ||
        "";

      if (idRetrouve) {
        setKazeIdInput(idRetrouve);
      }

      toast.success(data.message || "Compte Kaze lié.");
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <button
            onClick={openCreateModal}
            className="card border border-dashed border-primary-500/40 hover:border-primary-400 transition-colors min-h-[220px] flex flex-col items-center justify-center gap-3 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-primary-500/15 text-primary-300 flex items-center justify-center">
              <UserPlus size={24} />
            </div>
            <p className="font-semibold text-base">Ajouter un compte</p>
            <p className="text-sm text-dark-400 max-w-xs">
              Créer un client ou un convoyeur puis gérer ses factures et
              documents depuis sa fiche.
            </p>
          </button>

          {users.map((u) => {
            const RoleIcon = roleIcons[u.role] || Users;
            return (
              <div
                key={u.id}
                className="card border border-dark-700 hover:border-dark-500 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-primary-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                      {u.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{u.full_name}</p>
                      <p className="text-xs text-dark-500 truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  <span className={`badge ${roleColors[u.role]} shrink-0`}>
                    <RoleIcon size={12} className="mr-1" />
                    {u.role}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-dark-800/60 px-3 py-2">
                    <p className="text-xs text-dark-500">Entreprise</p>
                    <p className="text-dark-200 truncate">{u.company || "—"}</p>
                  </div>
                  <div className="rounded-lg bg-dark-800/60 px-3 py-2">
                    <p className="text-xs text-dark-500">Téléphone</p>
                    <p className="text-dark-200 truncate">{u.phone || "—"}</p>
                  </div>
                  <div className="rounded-lg bg-dark-800/60 px-3 py-2 sm:col-span-2">
                    <p className="text-xs text-dark-500">Inscrit le</p>
                    <p className="text-dark-200">{formatDate(u.created_at)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
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

                  {u.role === "client" ? (
                    u.parent_id ? (
                      <button
                        onClick={() => openParentModal(u)}
                        title={`Rattaché à ${u.parent_company || u.parent_name}`}
                        className="badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/20 transition-colors max-w-[14rem]"
                      >
                        <Building2 size={12} className="mr-1 shrink-0" />
                        <span className="truncate">
                          {u.parent_company || u.parent_name}
                        </span>
                      </button>
                    ) : Number(u.rattachements) > 0 ? (
                      <button
                        onClick={() => openParentModal(u)}
                        title="Ce compte est le siège d'un groupe"
                        className="badge bg-violet-500/10 text-violet-400 border border-violet-500/20 cursor-pointer hover:bg-violet-500/20 transition-colors"
                      >
                        <Network size={12} className="mr-1" />
                        Siège · {u.rattachements}
                      </button>
                    ) : (
                      <button
                        onClick={() => openParentModal(u)}
                        className="badge bg-dark-700 text-dark-400 border border-dark-600 cursor-pointer hover:bg-dark-600 hover:text-dark-300 transition-colors"
                      >
                        Indépendant
                      </button>
                    )
                  ) : null}

                  {(u.role === "convoyeur" || u.role === "admin") &&
                    (u.kaze_driver_id ? (
                      <button
                        onClick={() => openKazeModal(u)}
                        className="badge bg-green-500/10 text-green-400 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
                      >
                        <Link2 size={12} className="mr-1" />
                        Kaze lié
                      </button>
                    ) : (
                      <button
                        onClick={() => openKazeModal(u)}
                        className="badge bg-dark-700 text-dark-400 border border-dark-600 cursor-pointer hover:bg-dark-600 hover:text-dark-300 transition-colors"
                      >
                        <Unlink size={12} className="mr-1" />
                        Kaze non lié
                      </button>
                    ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {(u.role === "client" || u.role === "convoyeur") && (
                    <button
                      onClick={() => openProfileModal(u)}
                      title="Consulter la fiche"
                      aria-label="Consulter la fiche"
                      className="relative group p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                    >
                      <Eye size={14} />
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-dark-800 text-dark-100 text-[11px] whitespace-nowrap border border-dark-600 z-20">
                        Consulter la fiche
                      </span>
                    </button>
                  )}

                  {(u.role === "client" || u.role === "convoyeur") && (
                    <button
                      onClick={() => openProfileModal(u, "factures")}
                      title="Ajouter facture"
                      aria-label="Ajouter facture"
                      className="relative group p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                    >
                      <ReceiptText size={14} />
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-dark-800 text-dark-100 text-[11px] whitespace-nowrap border border-dark-600 z-20">
                        Ajouter facture
                      </span>
                    </button>
                  )}

                  {u.role === "client" && (
                    <button
                      onClick={() => openProfileModal(u, "docs")}
                      title="Ajouter document"
                      aria-label="Ajouter document"
                      className="relative group p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                    >
                      <Upload size={14} />
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-dark-800 text-dark-100 text-[11px] whitespace-nowrap border border-dark-600 z-20">
                        Ajouter document
                      </span>
                    </button>
                  )}

                  {u.role === "convoyeur" && (
                    <button
                      onClick={() => openDocsModal(u)}
                      title="Voir les justificatifs"
                      aria-label="Voir les justificatifs"
                      className="relative group p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                    >
                      <ShieldCheck size={14} />
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-dark-800 text-dark-100 text-[11px] whitespace-nowrap border border-dark-600 z-20">
                        Voir les justificatifs
                      </span>
                    </button>
                  )}

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
                      onClick={() => openEmailModal(u)}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                      title="Modifier l'email"
                    >
                      <Mail size={15} />
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
              </div>
            );
          })}

          {users.length === 0 && (
            <div className="card text-center py-16 text-dark-400 lg:col-span-2">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucun utilisateur trouvé.</p>
            </div>
          )}
        </div>
      )}

      {reste && !loading && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setPlafond((p) => p + 100)}
            className="btn-secondary"
          >
            Afficher les comptes plus anciens
          </button>
        </div>
      )}

      {/* Modal modification email */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Modifier l'email — {emailModal.full_name}
              </h3>
              <button
                onClick={() => setEmailModal(null)}
                className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-dark-400 mb-4">
              Cette action est réservée à l'administrateur.
            </p>

            <label className="block text-xs text-dark-400 mb-1">
              Nouvel email
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="input-field mb-4"
              placeholder="utilisateur@exemple.fr"
            />

            <div className="flex gap-3">
              <button
                onClick={handleUpdateEmail}
                disabled={emailSaving}
                className="btn-primary flex-1"
              >
                {emailSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                onClick={() => setEmailModal(null)}
                className="btn-secondary flex-1"
              >
                Annuler
              </button>
            </div>
          </div>
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
              Entrez l'email ou le téléphone utilisé sur Kaze. Le UUID exact est
              récupéré automatiquement depuis Kaze, puis affiché ici.
            </p>

            <div className="flex gap-1 p-1 bg-dark-800 rounded-xl border border-dark-700 mb-4">
              <button
                type="button"
                onClick={() => setKazeLinkMethod("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  kazeLinkMethod === "email"
                    ? "bg-dark-600 text-white shadow"
                    : "text-dark-400 hover:text-dark-200"
                }`}
              >
                <Mail size={14} />
                Par email
              </button>
              <button
                type="button"
                onClick={() => setKazeLinkMethod("phone")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  kazeLinkMethod === "phone"
                    ? "bg-dark-600 text-white shadow"
                    : "text-dark-400 hover:text-dark-200"
                }`}
              >
                <KeyRound size={14} />
                Par téléphone
              </button>
            </div>

            {kazeLinkMethod === "email" ? (
              <div className="mb-4">
                <label className="block text-xs text-dark-400 mb-1">
                  Email du compte Kaze
                </label>
                <input
                  type="email"
                  value={kazeEmailInput}
                  onChange={(e) => setKazeEmailInput(e.target.value)}
                  className="input-field"
                  placeholder="prenom.nom@exemple.fr"
                />
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-xs text-dark-400 mb-1">
                  Téléphone du compte Kaze
                </label>
                <input
                  type="tel"
                  value={kazePhoneInput}
                  onChange={(e) => setKazePhoneInput(e.target.value)}
                  className="input-field"
                  placeholder="06 12 34 56 78"
                />
              </div>
            )}

            {kazeIdInput && (
              <div className="mb-4 p-3 rounded-xl border border-green-500/20 bg-green-500/5">
                <p className="text-xs text-dark-400 mb-1">ID Kaze retrouvé</p>
                <p className="font-mono text-sm text-green-300 break-all">
                  {kazeIdInput}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => handleKazeLink()}
                disabled={kazeSaving}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Link2 size={16} />
                {kazeSaving ? "Enregistrement…" : "Lier le compte Kaze"}
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

      {/* Modal rattachement à un siège */}
      {parentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Groupe — {parentModal.full_name}
              </h3>
              <button
                onClick={() => setParentModal(null)}
                className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {Number(parentModal.rattachements) > 0 ? (
              // Un siège ne peut pas être rattaché ailleurs : le serveur
              // le refuse, autant ne pas proposer l'action.
              <div className="text-sm text-dark-300 space-y-3">
                <p>
                  Ce compte est le siège de{" "}
                  <span className="font-medium text-violet-400">
                    {parentModal.rattachements} entité
                    {Number(parentModal.rattachements) > 1 ? "s" : ""}
                  </span>
                  . Il consulte leurs missions et leurs factures, et peut
                  valider leurs devis.
                </p>
                <p className="text-xs text-dark-500">
                  Pour le rattacher lui-même à un autre compte, détachez d'abord
                  ses entités : les groupes se limitent à un niveau.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-dark-400 mb-4">
                  Rattacher ce compte au siège de son groupe. Le siège verra ses
                  missions et ses factures ; ce compte, lui, ne verra aucun
                  changement.
                </p>

                <select
                  value={parentChoisi}
                  onChange={(e) => setParentChoisi(e.target.value)}
                  className="input-field mb-4"
                >
                  <option value="">Compte indépendant</option>
                  {users
                    .filter(
                      (c) =>
                        c.role === "client" &&
                        c.id !== parentModal.id &&
                        !c.parent_id,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company ? `${c.company} — ` : ""}
                        {c.full_name}
                      </option>
                    ))}
                </select>
              </>
            )}

            <div className="flex gap-3 mt-4">
              {Number(parentModal.rattachements) === 0 && (
                <button
                  onClick={handleParentLink}
                  disabled={parentSaving}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Building2 size={16} />
                  {parentSaving
                    ? "Enregistrement…"
                    : parentChoisi
                      ? "Rattacher"
                      : "Détacher"}
                </button>
              )}
              <button
                onClick={() => setParentModal(null)}
                className="btn-secondary flex-1"
              >
                Fermer
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

      {/* ── Modal Profil utilisateur ─────────────────────── */}
      {profileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-dark-700 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  Profil — {profileModal.full_name}
                </h3>
                <p className="text-sm text-dark-400 mt-1">
                  {profileModal.role === "client" ? "Client" : "Convoyeur"} ·{" "}
                  {profileModal.email}
                </p>
              </div>
              <button
                onClick={() => setProfileModal(null)}
                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex gap-2">
                {[
                  { key: "infos", label: "Infos", icon: Users },
                  { key: "factures", label: "Factures", icon: ReceiptText },
                  ...(profileModal.role === "client"
                    ? [{ key: "docs", label: "Documents", icon: FileText }]
                    : []),
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setProfileTab(tab.key)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                        profileTab === tab.key
                          ? "bg-primary-600 text-white border-primary-500"
                          : "bg-dark-900 text-dark-300 border-dark-700 hover:bg-dark-700"
                      }`}
                    >
                      <Icon size={14} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {profileLoading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
                </div>
              ) : (
                <>
                  {profileTab === "infos" && (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">Nom</p>
                        <p className="font-medium">{profileModal.full_name}</p>
                      </div>
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">Email</p>
                        <p className="font-medium break-all">
                          {profileModal.email}
                        </p>
                      </div>
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">Téléphone</p>
                        <p className="font-medium">
                          {profileModal.phone || "—"}
                        </p>
                      </div>
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">Entreprise</p>
                        <p className="font-medium">
                          {profileModal.company || "—"}
                        </p>
                      </div>
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">
                          Inscription
                        </p>
                        <p className="font-medium">
                          {formatDate(profileModal.created_at)}
                        </p>
                      </div>
                      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
                        <p className="text-xs text-dark-500 mb-1">Statut</p>
                        <p className="font-medium">
                          {profileModal.is_validated ? "Validé" : "En attente"}
                        </p>
                      </div>
                    </div>
                  )}

                  {profileTab === "factures" && (
                    <div className="space-y-4">
                      <div className="border border-dark-700 rounded-xl p-4 bg-dark-900/60 space-y-3">
                        <h4 className="font-medium">Ajouter une facture</h4>
                        <div className="grid md:grid-cols-2 gap-3">
                          <input
                            value={factureForm.numero}
                            onChange={(e) =>
                              setFactureForm((p) => ({
                                ...p,
                                numero: e.target.value,
                              }))
                            }
                            className="input-field"
                            placeholder="Numéro de facture *"
                          />
                          <input
                            value={factureForm.libelle}
                            onChange={(e) =>
                              setFactureForm((p) => ({
                                ...p,
                                libelle: e.target.value,
                              }))
                            }
                            className="input-field"
                            placeholder="Libellé"
                          />
                          <input
                            value={factureForm.montant_ttc}
                            onChange={(e) =>
                              setFactureForm((p) => ({
                                ...p,
                                montant_ttc: e.target.value,
                              }))
                            }
                            className="input-field"
                            placeholder="Montant TTC (€)"
                          />
                          <input
                            type="date"
                            value={factureForm.date_emission}
                            onChange={(e) =>
                              setFactureForm((p) => ({
                                ...p,
                                date_emission: e.target.value,
                              }))
                            }
                            className="input-field"
                          />
                        </div>

                        <div
                          className="border-2 border-dashed border-dark-600 rounded-xl p-4 text-sm text-dark-400"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fichier = e.dataTransfer.files?.[0];
                            if (fichier) {
                              setFactureForm((p) => ({ ...p, file: fichier }));
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p>
                              Glissez un PDF ici ou sélectionnez un fichier.
                              {factureForm.file ? (
                                <span className="block text-primary-300 mt-1">
                                  {factureForm.file.name}
                                </span>
                              ) : null}
                            </p>
                            <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                              <Upload size={14} />
                              Choisir
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={(e) =>
                                  setFactureForm((p) => ({
                                    ...p,
                                    file: e.target.files?.[0] || null,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={handleUploadFactureProfil}
                          disabled={factureUploading}
                          className="btn-primary"
                        >
                          {factureUploading ? "Envoi…" : "Déposer la facture"}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {profileFactures.length === 0 ? (
                          <div className="text-sm text-dark-400 border border-dark-700 rounded-xl p-4">
                            Aucune facture déposée.
                          </div>
                        ) : (
                          profileFactures.map((f) => (
                            <div
                              key={f.id}
                              className="border border-dark-700 rounded-xl p-4 flex items-center justify-between gap-4"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{f.numero}</p>
                                <p className="text-xs text-dark-400">
                                  {f.libelle || "Sans libellé"} ·{" "}
                                  {euros(f.montant_ttc)} ·{" "}
                                  {formatDate(f.date_emission)}
                                </p>
                                <p className="text-xs text-dark-500 mt-1">
                                  Statut : {f.statut}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <a
                                  href={getFileUrl(f.file_path)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg text-dark-300 hover:text-primary-300 hover:bg-primary-500/10"
                                  title="Voir"
                                >
                                  <ExternalLink size={15} />
                                </a>
                                <a
                                  href={getFileUrl(f.file_path)}
                                  download={f.original_name}
                                  className="p-2 rounded-lg text-dark-300 hover:text-green-300 hover:bg-green-500/10"
                                  title="Télécharger"
                                >
                                  <Download size={15} />
                                </a>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {profileTab === "docs" && profileModal.role === "client" && (
                    <div className="space-y-4">
                      <div className="border border-dark-700 rounded-xl p-4 bg-dark-900/60 space-y-3">
                        <h4 className="font-medium">
                          Ajouter un document complémentaire
                        </h4>
                        <input
                          value={clientDocForm.label}
                          onChange={(e) =>
                            setClientDocForm((p) => ({
                              ...p,
                              label: e.target.value,
                            }))
                          }
                          className="input-field"
                          placeholder="Libellé du document (ex: Bon de commande)"
                        />
                        <div
                          className="border-2 border-dashed border-dark-600 rounded-xl p-4 text-sm text-dark-400"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fichier = e.dataTransfer.files?.[0];
                            if (fichier) {
                              setClientDocForm((p) => ({
                                ...p,
                                file: fichier,
                              }));
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p>
                              Glissez un document (PDF/JPG/PNG/WEBP) ici.
                              {clientDocForm.file ? (
                                <span className="block text-primary-300 mt-1">
                                  {clientDocForm.file.name}
                                </span>
                              ) : null}
                            </p>
                            <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                              <Upload size={14} />
                              Choisir
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) =>
                                  setClientDocForm((p) => ({
                                    ...p,
                                    file: e.target.files?.[0] || null,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={handleUploadClientDoc}
                          disabled={docUploading}
                          className="btn-primary"
                        >
                          {docUploading ? "Envoi…" : "Ajouter le document"}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {profileDocs.length === 0 ? (
                          <div className="text-sm text-dark-400 border border-dark-700 rounded-xl p-4">
                            Aucun document complémentaire.
                          </div>
                        ) : (
                          profileDocs.map((d) => (
                            <div
                              key={d.id}
                              className="border border-dark-700 rounded-xl p-4 flex items-center justify-between gap-4"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{d.label}</p>
                                <p className="text-xs text-dark-400 truncate">
                                  {d.original_name}
                                </p>
                                <p className="text-xs text-dark-500 mt-1">
                                  Ajouté le {formatDate(d.created_at)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <a
                                  href={getFileUrl(d.file_path)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg text-dark-300 hover:text-primary-300 hover:bg-primary-500/10"
                                  title="Voir"
                                >
                                  <ExternalLink size={15} />
                                </a>
                                <a
                                  href={getFileUrl(d.file_path)}
                                  download={d.original_name}
                                  className="p-2 rounded-lg text-dark-300 hover:text-green-300 hover:bg-green-500/10"
                                  title="Télécharger"
                                >
                                  <Download size={15} />
                                </a>
                                <button
                                  onClick={() => handleDeleteClientDoc(d.id)}
                                  disabled={docDeleting[d.id]}
                                  className="p-2 rounded-lg text-dark-300 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                                  title="Supprimer"
                                >
                                  {docDeleting[d.id] ? (
                                    <Loader2
                                      size={15}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={15} />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-dark-700 flex justify-end">
              <button
                onClick={() => setProfileModal(null)}
                className="btn-secondary"
              >
                Fermer
              </button>
            </div>
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
