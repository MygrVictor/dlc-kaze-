import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Paperclip,
  Download,
  ExternalLink,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import api from "../lib/api";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";
const lienFichier = (chemin) => `${API_BASE}${chemin}`;

/**
 * Pièces jointes d'une mission.
 *
 * - `mode="admin"`     : liste complète + case « Visible convoyeur » +
 *                         suppression ;
 * - `mode="convoyeur"` : seules les pièces cochées par l'admin, en
 *                         téléchargement ;
 * - `mode="client"`    : consultation des pièces déposées.
 *
 * Le filtrage réel est fait par l'API : ce composant n'affiche que ce
 * que le serveur renvoie au rôle connecté.
 */
export default function MissionDocuments({ missionId, mode = "client" }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enCours, setEnCours] = useState({});

  const charger = useCallback(async () => {
    if (!missionId) return;
    try {
      const { data } = await api.get(`/mission-documents/mission/${missionId}`);
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    setLoading(true);
    charger();
  }, [charger]);

  const basculer = async (doc) => {
    setEnCours((p) => ({ ...p, [doc.id]: true }));
    try {
      const { data } = await api.patch(`/mission-documents/${doc.id}`, {
        visible_convoyeur: !doc.visible_convoyeur,
      });
      setDocuments((liste) =>
        liste.map((d) => (d.id === doc.id ? data.document : d)),
      );
    } catch (err) {
      toast.error(err.response?.data?.error || "Mise à jour impossible.");
    } finally {
      setEnCours((p) => ({ ...p, [doc.id]: false }));
    }
  };

  const supprimer = async (doc) => {
    if (!confirm(`Supprimer « ${doc.label} » ?`)) return;
    setEnCours((p) => ({ ...p, [doc.id]: true }));
    try {
      await api.delete(`/mission-documents/${doc.id}`);
      setDocuments((liste) => liste.filter((d) => d.id !== doc.id));
    } catch (err) {
      toast.error(err.response?.data?.error || "Suppression impossible.");
      setEnCours((p) => ({ ...p, [doc.id]: false }));
    }
  };

  // Côté convoyeur, un bloc vide n'apporte rien : on le masque.
  if (mode === "convoyeur" && !loading && documents.length === 0) return null;

  const visibles = documents.filter((d) => d.visible_convoyeur).length;

  return (
    <div className="p-3 bg-dark-700/50 rounded-lg">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="text-primary-400" />
          <h4 className="text-sm font-semibold">Documents</h4>
        </div>
        {mode === "admin" && documents.length > 0 && (
          <span className="text-xs text-dark-400">
            {visibles}/{documents.length} visible
            {visibles > 1 ? "s" : ""} du convoyeur
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-dark-400">Chargement…</p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-dark-400">Aucun document joint.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0 flex items-center gap-3">
                {mode === "admin" && (
                  <label
                    className="flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="Rendre visible au convoyeur"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={doc.visible_convoyeur}
                      disabled={enCours[doc.id]}
                      onChange={() => basculer(doc)}
                      aria-label={`Visible convoyeur : ${doc.label}`}
                    />
                    {doc.visible_convoyeur ? (
                      <Eye size={14} className="text-emerald-400" />
                    ) : (
                      <EyeOff size={14} className="text-dark-500" />
                    )}
                  </label>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{doc.label}</p>
                  <p className="text-xs text-dark-400 truncate">
                    {doc.original_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={lienFichier(doc.file_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg text-dark-300 hover:text-primary-300 hover:bg-primary-500/10"
                  title="Ouvrir"
                >
                  <ExternalLink size={15} />
                </a>
                <a
                  href={lienFichier(doc.file_path)}
                  download={doc.original_name}
                  className="p-2 rounded-lg text-dark-300 hover:text-green-300 hover:bg-green-500/10"
                  title="Télécharger"
                >
                  <Download size={15} />
                </a>
                {mode === "admin" && (
                  <button
                    type="button"
                    onClick={() => supprimer(doc)}
                    disabled={enCours[doc.id]}
                    className="p-2 rounded-lg text-dark-300 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                    title="Supprimer"
                  >
                    {enCours[doc.id] ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
