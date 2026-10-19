import { useEffect, useState } from "react";
import { FolderOpen, FileText, Download, ExternalLink } from "lucide-react";
import api from "../../lib/api";
import { formatDate } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const lienFichier = (chemin) => `${API_BASE}${chemin}`;

/**
 * Documents administratifs déposés par Drive Line Connect dans la fiche
 * du client (contrat, conditions, attestations…). Lecture seule : seul
 * l'administrateur dépose ou retire une pièce.
 */
export default function ClientDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(user?.id || "");

  const accountOptions = [
    {
      id: user?.id || "",
      label: user?.company || user?.full_name || "Mon compte",
    },
    ...(user?.child_accounts || []).map((child) => ({
      id: child.id,
      label:
        child.company || child.full_name || child.email || "Compte associé",
    })),
  ];

  useEffect(() => {
    if (!user) return;

    const effectiveId = selectedClientId || user.id;
    setSelectedClientId((current) => current || user.id);

    api
      .get(
        `/missions/mes-documents${
          effectiveId !== user.id ? `?clientId=${effectiveId}` : ""
        }`,
      )
      .then(({ data }) => {
        setDocuments(data.documents || []);
      })
      .catch((err) => {
        setErreur(
          err.response?.data?.error || "Impossible de charger vos documents.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user?.id, selectedClientId]);

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mes documents</h1>
          <p className="text-dark-400 text-sm mt-1">
            Les documents administratifs transmis par Drive Line Connect.
          </p>
        </div>

        {accountOptions.length > 1 && (
          <select
            value={selectedClientId || user?.id || ""}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setLoading(true);
            }}
            className="input-field min-w-[220px]"
          >
            {accountOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {erreur && (
        <p className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {erreur}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card text-center py-16 text-dark-400">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucun document pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="card flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-2">
                  <FileText size={16} className="text-primary-400" />
                  <span className="truncate">{doc.label}</span>
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  {doc.original_name} · Reçu le {formatDate(doc.created_at)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={lienFichier(doc.file_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-xs"
                >
                  <ExternalLink size={14} />
                  Ouvrir
                </a>
                <a
                  href={lienFichier(doc.file_path)}
                  download
                  className="btn-secondary text-xs"
                >
                  <Download size={14} />
                  Télécharger
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
