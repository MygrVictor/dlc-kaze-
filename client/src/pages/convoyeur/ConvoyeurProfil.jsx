import { useState, useEffect } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  User,
  Link2,
  Unlink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Mail,
  Phone,
  Calendar,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatDate } from "../../lib/utils";
import DocumentsValidation from "./DocumentsValidation";

export default function ConvoyeurProfil() {
  const { user } = useAuth();
  const [profil, setProfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkMethod, setLinkMethod] = useState("email"); // "email" | "phone"
  const [kazeEmail, setKazeEmail] = useState("");
  const [kazePhone, setKazePhone] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [activeTab, setActiveTab] = useState("profil");

  const fetchProfil = () => {
    setLoading(true);
    api
      .get("/convoyeur/profil")
      .then((res) => setProfil(res.data))
      .catch(() => toast.error("Erreur lors du chargement du profil."))
      .finally(() => setLoading(false));
  };

  useEffect(fetchProfil, []);

  const handleLink = async (e) => {
    e.preventDefault();
    if (linkMethod === "email" && !kazeEmail.trim()) {
      return toast.error("Veuillez saisir votre email Kaze.");
    }
    if (linkMethod === "phone" && !kazePhone.trim()) {
      return toast.error("Veuillez saisir votre numéro de téléphone Kaze.");
    }
    setLinking(true);
    try {
      const payload = linkMethod === "email" ? { kazeEmail } : { kazePhone };
      const { data } = await api.post("/convoyeur/lier-kaze", payload);
      toast.success(data.message);
      setKazeEmail("");
      setKazePhone("");
      fetchProfil();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Impossible de lier le compte Kaze.",
      );
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Voulez-vous vraiment délier votre compte Kaze ?")) return;
    setUnlinking(true);
    try {
      await api.delete("/convoyeur/lier-kaze");
      toast.success("Compte Kaze délié.");
      fetchProfil();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la déliaison.");
    } finally {
      setUnlinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User size={28} className="text-accent-400" />
          Mon profil
        </h1>
        <p className="text-dark-400 text-sm mt-1">
          Gérez votre compte et vos documents de validation.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 p-1 bg-dark-800 rounded-xl border border-dark-700">
        <button
          onClick={() => setActiveTab("profil")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "profil"
              ? "bg-dark-600 text-white shadow"
              : "text-dark-400 hover:text-dark-200"
          }`}
        >
          <User size={15} />
          Profil & Kaze
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "documents"
              ? "bg-dark-600 text-white shadow"
              : "text-dark-400 hover:text-dark-200"
          }`}
        >
          <FileText size={15} />
          Documents
        </button>
      </div>

      {/* Contenu onglet Documents */}
      {activeTab === "documents" && <DocumentsValidation />}

      {/* Contenu onglet Profil */}
      {activeTab === "profil" && (
        <>
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              Informations personnelles
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-700 rounded-full flex items-center justify-center text-sm font-bold">
                  {profil?.user?.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{profil?.user?.full_name}</p>
                  <p className="text-xs text-dark-400">Convoyeur</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-dark-300">
                <Mail size={16} className="text-dark-500" />
                {profil?.user?.email}
              </div>
              {profil?.user?.phone && (
                <div className="flex items-center gap-3 text-sm text-dark-300">
                  <Phone size={16} className="text-dark-500" />
                  {profil?.user?.phone}
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-dark-300">
                <Calendar size={16} className="text-dark-500" />
                Inscrit le {formatDate(profil?.user?.created_at)}
              </div>
            </div>
          </div>

          {/* Liaison Kaze */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">Liaison compte Kaze</h2>
            <p className="text-dark-400 text-sm mb-6">
              Liez votre compte Kaze pour que vos missions soient
              automatiquement synchronisées avec la plateforme Kaze.
            </p>

            {profil?.kazeLinked ? (
              /* ── Compte lié ── */
              <div>
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl mb-4">
                  <CheckCircle
                    size={24}
                    className="text-green-400 flex-shrink-0"
                  />
                  <div>
                    <p className="font-medium text-green-400">
                      Compte Kaze lié
                    </p>
                    <p className="text-sm text-dark-400 mt-0.5">
                      ID Kaze :{" "}
                      <span className="font-mono text-dark-300">
                        {profil.user.kaze_driver_id}
                      </span>
                    </p>
                  </div>
                </div>

                {profil.kazeDriverInfo && profil.kazeDriverInfo.name && (
                  <div className="p-4 bg-dark-700/50 rounded-xl mb-4">
                    <p className="text-sm text-dark-400">Nom dans Kaze</p>
                    <p className="font-medium">
                      {profil.kazeDriverInfo.name ||
                        profil.kazeDriverInfo.full_name}
                    </p>
                    {profil.kazeDriverInfo.email && (
                      <>
                        <p className="text-sm text-dark-400 mt-2">Email Kaze</p>
                        <p className="font-medium">
                          {profil.kazeDriverInfo.email}
                        </p>
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
                >
                  {unlinking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Unlink size={16} />
                  )}
                  Délier mon compte Kaze
                </button>
              </div>
            ) : (
              /* ── Compte non lié ── */
              <div>
                <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-6">
                  <AlertCircle
                    size={24}
                    className="text-yellow-400 flex-shrink-0"
                  />
                  <div>
                    <p className="font-medium text-yellow-400">
                      Compte Kaze non lié
                    </p>
                    <p className="text-sm text-dark-400 mt-0.5">
                      Liez votre compte pour synchroniser vos missions avec
                      Kaze.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleLink} className="space-y-4">
                  {/* Sélecteur méthode : email ou téléphone */}
                  <div className="flex gap-1 p-1 bg-dark-800 rounded-xl border border-dark-700">
                    <button
                      type="button"
                      onClick={() => setLinkMethod("email")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        linkMethod === "email"
                          ? "bg-dark-600 text-white shadow"
                          : "text-dark-400 hover:text-dark-200"
                      }`}
                    >
                      <Mail size={14} />
                      Par email
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkMethod("phone")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        linkMethod === "phone"
                          ? "bg-dark-600 text-white shadow"
                          : "text-dark-400 hover:text-dark-200"
                      }`}
                    >
                      <Phone size={14} />
                      Par téléphone
                    </button>
                  </div>

                  {linkMethod === "email" ? (
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">
                        Email de votre compte Kaze
                      </label>
                      <input
                        type="email"
                        value={kazeEmail}
                        onChange={(e) => setKazeEmail(e.target.value)}
                        className="input-field"
                        placeholder="votre-email@exemple.fr"
                        required
                      />
                      <p className="text-xs text-dark-500 mt-1.5">
                        Entrez l'email utilisé pour votre compte sur kaze.app.
                        Nous vérifierons automatiquement votre identité.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">
                        Téléphone de votre compte Kaze
                      </label>
                      <input
                        type="tel"
                        value={kazePhone}
                        onChange={(e) => setKazePhone(e.target.value)}
                        className="input-field"
                        placeholder="06 12 34 56 78"
                        required
                      />
                      <p className="text-xs text-dark-500 mt-1.5">
                        Entrez le numéro de téléphone utilisé pour votre compte
                        sur kaze.app. Nous vérifierons automatiquement votre
                        identité.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={linking}
                    className="btn-primary flex items-center gap-2"
                  >
                    {linking ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Link2 size={16} />
                    )}
                    {linking ? "Vérification…" : "Lier mon compte Kaze"}
                  </button>
                </form>

                <div className="mt-6 p-4 bg-dark-700/50 rounded-xl">
                  <h3 className="text-sm font-medium mb-2">
                    Comment ça fonctionne ?
                  </h3>
                  <ol className="text-sm text-dark-400 space-y-2 list-decimal list-inside">
                    <li>
                      Créez un compte convoyeur sur{" "}
                      <a
                        href="https://kaze.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300"
                      >
                        kaze.app
                      </a>{" "}
                      si ce n'est pas déjà fait.
                    </li>
                    <li>
                      Entrez ci-dessus l'email ou le téléphone utilisé sur Kaze.
                    </li>
                    <li>
                      Une fois lié, toutes les missions que vous prenez seront
                      automatiquement synchronisées avec Kaze.
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
