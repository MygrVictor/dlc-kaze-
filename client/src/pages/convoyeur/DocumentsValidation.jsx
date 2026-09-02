import { useState, useEffect, useRef } from "react";
import api from "../../lib/api";
import {
  FileText,
  Upload,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Loader2,
  Car,
  CreditCard,
  ShieldCheck,
  Home,
  Building2,
  Wrench,
} from "lucide-react";
import toast from "react-hot-toast";

// Même origine que l'API en production : un repli sur localhost serait
// compilé dans le bundle et rendrait les documents inaccessibles en ligne.
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const getFileUrl = (filePath) => {
  const token = localStorage.getItem("dlc_token");
  return `${API_BASE}${filePath}?token=${token}`;
};

const DOCUMENT_TYPES = [
  {
    key: "permis",
    label: "Permis de conduire — recto",
    description: "La face portant votre photographie et vos catégories.",
    icon: Car,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    key: "permis_verso",
    label: "Permis de conduire — verso",
    description:
      "La face portant les dates de validité et les éventuelles restrictions.",
    icon: Car,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    key: "carte_identite",
    label: "Pièce d'identité",
    description:
      "Recto de votre carte nationale, ou page d'identification de votre passeport.",
    icon: CreditCard,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
  // Facultatif, parce qu'un passeport n'a pas de verso à fournir : le
  // rendre obligatoire bloquerait les convoyeurs qui en présentent un.
  {
    key: "carte_identite_verso",
    label: "Carte d'identité — verso (si CNI)",
    description:
      "La face portant votre adresse et la date d'expiration. Inutile avec un passeport.",
    icon: CreditCard,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
  // L'ancienne « attestation d'assurance convoyeur » n'est plus demandée :
  // les deux RC la remplacent et se vérifient séparément. Le type reste
  // connu du serveur et de l'espace admin, afin que les attestations déjà
  // déposées restent consultables.
  {
    key: "kbis",
    label: "Extrait Kbis",
    description:
      "Extrait de moins de 3 mois attestant l'immatriculation de votre structure.",
    icon: Building2,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
  },
  {
    key: "rc_circulation",
    label: "RC circulation",
    description:
      "Attestation couvrant le véhicule qui vous est confié pendant le convoyage.",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "rc_pro",
    label: "RC professionnelle",
    description:
      "Attestation couvrant les dommages causés à des tiers dans le cadre de votre activité.",
    icon: ShieldCheck,
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
  },
  {
    key: "domicile",
    label: "Justificatif de domicile",
    description:
      "Facture ou relevé de moins de 3 mois justifiant votre adresse.",
    icon: Home,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  // Facultative : elle n'entre pas dans DOCUMENTS_REQUIS côté serveur et
  // ne bloque donc jamais l'activation du compte. Elle ouvre simplement
  // l'accès aux missions qui l'exigent.
  {
    key: "w_garage",
    label: "Certification W garage (facultatif)",
    description:
      "Votre certificat W garage, si vous en disposez : il débloque des missions supplémentaires.",
    icon: Wrench,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
];

// La progression ne doit compter que les pièces qui conditionnent
// l'activation du compte : inclure le W garage laisserait un dossier
// pourtant complet afficher éternellement une barre inachevée.
const CLES_FACULTATIVES = ["w_garage", "carte_identite_verso"];
const TYPES_REQUIS = DOCUMENT_TYPES.filter(
  (d) => !CLES_FACULTATIVES.includes(d.key),
);

const STATUS_CONFIG = {
  en_attente: {
    label: "En attente",
    icon: Clock,
    className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  },
  valide: {
    label: "Validé",
    icon: CheckCircle,
    className: "text-green-400 bg-green-500/10 border-green-500/20",
  },
  refuse: {
    label: "Refusé",
    icon: XCircle,
    className: "text-red-400 bg-red-500/10 border-red-500/20",
  },
};

export default function DocumentsValidation() {
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [deleting, setDeleting] = useState({});
  const fileInputs = useRef({});

  const fetchDocuments = () => {
    setLoading(true);
    api
      .get("/convoyeur/documents")
      .then((res) => {
        const map = {};
        res.data.documents.forEach((d) => (map[d.type] = d));
        setDocuments(map);
      })
      .catch(() => toast.error("Erreur lors du chargement des documents."))
      .finally(() => setLoading(false));
  };

  useEffect(fetchDocuments, []);

  const handleUpload = async (type, file) => {
    if (!file) return;
    setUploading((p) => ({ ...p, [type]: true }));
    const formData = new FormData();
    formData.append("document", file);
    try {
      await api.post(`/convoyeur/documents/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document déposé avec succès !");
      fetchDocuments();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de l'envoi du fichier.",
      );
    } finally {
      setUploading((p) => ({ ...p, [type]: false }));
      if (fileInputs.current[type]) fileInputs.current[type].value = "";
    }
  };

  const handleDelete = async (type) => {
    if (!confirm("Supprimer ce document ?")) return;
    setDeleting((p) => ({ ...p, [type]: true }));
    try {
      await api.delete(`/convoyeur/documents/${type}`);
      toast.success("Document supprimé.");
      fetchDocuments();
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la suppression.",
      );
    } finally {
      setDeleting((p) => ({ ...p, [type]: false }));
    }
  };

  // Calcul de la progression globale
  const validated = TYPES_REQUIS.filter(
    (t) => documents[t.key]?.status === "valide",
  ).length;
  const uploaded = Object.keys(documents).length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-accent-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progression globale */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={20} className="text-accent-400" />
            Validation de compte
          </h2>
          <span className="text-sm text-dark-400">
            {validated}/{TYPES_REQUIS.length} validés
          </span>
        </div>
        <div className="w-full bg-dark-700 rounded-full h-2 mb-3">
          <div
            className="bg-accent-500 h-2 rounded-full transition-all duration-500"
            style={{
              width: `${(validated / TYPES_REQUIS.length) * 100}%`,
            }}
          />
        </div>
        <p className="text-sm text-dark-400">
          {uploaded === 0
            ? "Déposez vos documents pour valider votre compte convoyeur."
            : validated === TYPES_REQUIS.length
              ? "🎉 Tous vos documents ont été validés !"
              : `${uploaded} document${uploaded > 1 ? "s" : ""} déposé${
                  uploaded > 1 ? "s" : ""
                }, en attente de validation par l'équipe.`}
        </p>
      </div>

      {/* Cartes par document */}
      {DOCUMENT_TYPES.map(
        ({ key, label, description, icon: Icon, color, bg }) => {
          const doc = documents[key];
          const statusCfg = doc ? STATUS_CONFIG[doc.status] : null;
          const StatusIcon = statusCfg?.icon;
          const isUploading = uploading[key];
          const isDeleting = deleting[key];

          return (
            <div key={key} className="card">
              <div className="flex items-start gap-4">
                {/* Icône */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${bg}`}
                >
                  <Icon size={22} className={color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold">{label}</h3>
                    {statusCfg && (
                      <span
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.className}`}
                      >
                        <StatusIcon size={13} />
                        {statusCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-dark-400 mt-0.5">{description}</p>

                  {/* Fichier existant */}
                  {doc && (
                    <div className="mt-3 flex items-center gap-3 p-3 bg-dark-700/60 rounded-lg text-sm">
                      <FileText
                        size={16}
                        className="text-dark-400 flex-shrink-0"
                      />
                      <span className="truncate text-dark-300 flex-1">
                        {doc.original_name}
                      </span>
                      <a
                        href={getFileUrl(doc.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0"
                        title="Voir le fichier"
                      >
                        <Eye size={15} />
                        <span className="hidden sm:inline">Voir</span>
                      </a>
                    </div>
                  )}

                  {/* Note de refus */}
                  {doc?.status === "refuse" && doc?.admin_note && (
                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
                      <span className="font-medium">Motif : </span>
                      {doc.admin_note}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    {/* Bouton upload */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        className="hidden"
                        ref={(el) => (fileInputs.current[key] = el)}
                        onChange={(e) => handleUpload(key, e.target.files[0])}
                        disabled={isUploading}
                      />
                      <span
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          doc
                            ? "bg-dark-600 hover:bg-dark-500 text-dark-200 border border-dark-500"
                            : "btn-primary"
                        }
                        ${isUploading ? "opacity-60 pointer-events-none" : ""}`}
                      >
                        {isUploading ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Upload size={15} />
                        )}
                        {doc ? "Remplacer" : "Déposer le document"}
                      </span>
                    </label>

                    {/* Bouton suppression */}
                    {doc && (
                      <button
                        onClick={() => handleDelete(key)}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        {isDeleting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Supprimer
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-dark-500 mt-2">
                    Formats acceptés : JPG, PNG, WEBP, PDF — 10 Mo max
                  </p>
                </div>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}
