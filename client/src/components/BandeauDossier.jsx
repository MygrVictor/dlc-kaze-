import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, ArrowRight } from "lucide-react";
import api from "../lib/api";

/**
 * Bandeau d'alerte sur le dossier d'un convoyeur.
 *
 * Sans ses pièces justificatives, un convoyeur ne peut se voir
 * confier aucun véhicule : ni l'assurance ni la responsabilité ne
 * seraient couvertes. Le serveur refuse donc la prise de mission — mais un
 * refus au clic, après avoir parcouru les annonces et choisi un trajet,
 * est une déconvenue évitable.
 *
 * Le bandeau annonce l'obstacle en amont et nomme les pièces qui manquent,
 * plutôt que de renvoyer à un décompte abstrait. Il disparaît de lui-même
 * dès le dossier complet : un bandeau permanent finit par ne plus être lu.
 */

const LIBELLES = {
  permis: "permis de conduire (recto)",
  permis_verso: "permis de conduire (verso)",
  carte_identite: "carte d'identité",
  carte_identite_verso: "carte d'identité (verso)",
  kbis: "extrait Kbis",
  rc_circulation: "RC circulation",
  rc_pro: "RC professionnelle",
  domicile: "justificatif de domicile",
  w_garage: "certification W garage",
};

/** « a, b et c » — l'énumération française, sans virgule avant le dernier. */
function enumerer(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export default function BandeauDossier({ dossier: fourni }) {
  const [dossier, setDossier] = useState(fourni || null);

  useEffect(() => {
    if (fourni) {
      setDossier(fourni);
      return;
    }
    // Les pages qui ne chargent pas déjà les documents interrogent
    // elles-mêmes le serveur. L'échec est silencieux : un bandeau absent
    // vaut mieux qu'un message d'erreur sur une page qui traite d'autre
    // chose, et le serveur reste de toute façon seul juge.
    let vivant = true;
    api
      .get("/convoyeur/documents")
      .then((res) => vivant && setDossier(res.data.dossier))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [fourni]);

  if (!dossier || dossier.complet) return null;

  const manquants = dossier.manquants.map((t) => LIBELLES[t] || t);
  const refuses = (dossier.refuses || []).map((t) => LIBELLES[t] || t);

  return (
    <div
      role="status"
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-orange-500/30 bg-orange-500/10"
    >
      <ShieldAlert className="w-5 h-5 shrink-0 text-orange-400" />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-orange-400">
          Dossier incomplet — {dossier.deposes} document
          {dossier.deposes > 1 ? "s" : ""} sur {dossier.requis}
        </p>
        <p className="text-sm text-dark-300 mt-0.5">
          Vous ne pouvez pas encore prendre de mission. Il manque{" "}
          {enumerer(manquants)}.
          {refuses.length > 0 && (
            <>
              {" "}
              À redéposer, car refusé
              {refuses.length > 1 ? "s" : ""} : {enumerer(refuses)}.
            </>
          )}
        </p>
      </div>

      <Link
        to="/convoyeur/profil?onglet=documents"
        className="shrink-0 inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors"
      >
        Compléter mon dossier
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
