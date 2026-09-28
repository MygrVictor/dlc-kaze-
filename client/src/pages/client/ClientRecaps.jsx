import { useEffect, useState } from "react";
import { FileText, Download, ExternalLink, Inbox } from "lucide-react";
import api from "../../lib/api";
import { formatDate } from "../../lib/utils";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const lienFichier = (chemin) => `${API_BASE}${chemin}`;

export default function ClientRecaps() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let actif = true;
    api
      .get("/missions/mes-recaps")
      .then(({ data }) => {
        if (actif) setDocuments(data.documents || []);
      })
      .catch(() => {
        if (actif) setDocuments([]);
      })
      .finally(() => {
        if (actif) setLoading(false);
      });

    return () => {
      actif = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Récapitulatifs de mission</h1>
        <p className="text-dark-400 text-sm mt-1">
          Tous les résumés Kaze sont archivés ici automatiquement après
          livraison.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card text-center py-16 text-dark-400">
          <Inbox size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucun récapitulatif disponible pour le moment.</p>
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
                  {doc.original_name} · {formatDate(doc.created_at)}
                </p>
                {(doc.owner_company || doc.owner_name) && (
                  <p className="text-xs text-indigo-400 mt-1">
                    {doc.owner_company || doc.owner_name}
                  </p>
                )}
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
