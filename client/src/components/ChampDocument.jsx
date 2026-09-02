import { useRef } from "react";
import { UploadCloud, Check, FileText, X } from "lucide-react";

/**
 * Un champ de dépôt de fichier, intégré au formulaire de candidature.
 *
 * Contrairement à un envoi immédiat, le fichier n'est ici que retenu : il
 * partira avec le reste du formulaire. C'est ce qu'impose la règle posée
 * — sans dossier complet, pas de candidature enregistrée : les deux ne
 * peuvent donc pas voyager séparément.
 *
 * Le contrôle de format et de taille se fait dès la sélection. Découvrir
 * qu'une photo dépasse la limite après avoir rempli quinze champs, et
 * devoir tout recommencer, serait décourageant.
 */

export const TAILLE_MAX = 8 * 1024 * 1024;
export const FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** Vérifie un fichier ; renvoie un message d'erreur ou `null`. */
export function verifierFichier(fichier) {
  if (!fichier) return null;
  if (!FORMATS.includes(fichier.type)) {
    return "Format non supporté. Utilisez JPG, PNG, WEBP ou PDF.";
  }
  if (fichier.size > TAILLE_MAX) {
    return "Fichier trop volumineux : 8 Mo maximum.";
  }
  return null;
}

const poids = (octets) => {
  const mo = octets / (1024 * 1024);
  return mo < 0.1 ? "< 0,1 Mo" : `${mo.toFixed(1).replace(".", ",")} Mo`;
};

export default function ChampDocument({
  nom,
  libelle,
  aide,
  fichier,
  onChange,
  accent,
  requis = true,
}) {
  const champ = useRef(null);

  const choisir = (selection) => {
    if (!selection) return;
    const probleme = verifierFichier(selection);
    onChange(probleme ? null : selection, probleme);
    // Autorise la resélection du même fichier après un refus, ce que le
    // navigateur bloquerait autrement.
    if (champ.current) champ.current.value = "";
  };

  const retirer = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null, null);
  };

  return (
    <div className="champ-doc">
      <label
        className={fichier ? "depot-ligne depose" : "depot-ligne"}
        style={fichier ? { borderColor: accent } : undefined}
      >
        <input
          ref={champ}
          type="file"
          name={nom}
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="depot-input"
          onChange={(e) => choisir(e.target.files?.[0])}
        />
        <span
          className="depot-icone"
          style={fichier ? { background: accent, color: "#fff" } : undefined}
        >
          {fichier ? <Check size={17} /> : <UploadCloud size={17} />}
        </span>

        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="depot-libelle">
            {libelle}
            {requis && <span style={{ color: accent }}> *</span>}
          </span>
          <span className="depot-aide">
            {fichier ? (
              <span className="depot-fichier">
                <FileText size={12} />
                {fichier.name} · {poids(fichier.size)}
              </span>
            ) : (
              aide
            )}
          </span>
        </span>

        {fichier && (
          <button
            type="button"
            className="depot-retirer"
            onClick={retirer}
            aria-label={`Retirer ${libelle}`}
          >
            <X size={14} />
          </button>
        )}
      </label>
    </div>
  );
}
