/**
 * Réduit une photo avant son envoi.
 *
 * Une photo de téléphone pèse facilement 4 à 8 Mo ; sept pièces, c'est
 * 30 Mo envoyés d'un coup, sur une connexion mobile et à travers le serveur
 * web. Redimensionnée à 2000 px et réenregistrée en JPEG, la même pièce
 * tient en 300 à 600 Ko, et reste parfaitement lisible (un permis ou une
 * pièce d'identité se lisent très bien à cette taille).
 *
 * Les PDF, les petits fichiers et tout ce qui échoue sont renvoyés tels
 * quels : réduire est un confort, jamais une condition d'envoi.
 */
const COTE_MAX = 2000;
const QUALITE = 0.82;
// En dessous, la photo est déjà légère : la retoucher n'apporterait rien.
export const SEUIL_OCTETS = 1.2 * 1024 * 1024;
const TYPES_REDUCTIBLES = ["image/jpeg", "image/png", "image/webp"];

export function doitReduire(fichier) {
  return (
    Boolean(fichier) &&
    TYPES_REDUCTIBLES.includes(fichier.type) &&
    fichier.size > SEUIL_OCTETS
  );
}

async function ouvrir(fichier) {
  if (typeof createImageBitmap === "function") {
    try {
      // « from-image » applique l'orientation EXIF : une photo prise
      // en portrait ne ressort pas couchée.
      return await createImageBitmap(fichier, { imageOrientation: "from-image" });
    } catch {
      /* on retombe sur l'élément <img> */
    }
  }
  const url = URL.createObjectURL(fichier);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File} fichier
 * @param {{ delaiMs?: number }} [options] attente maximale du décodage ; au
 *   delà, le fichier part tel quel plutôt que de bloquer le formulaire.
 */
export async function compresserImage(fichier, { delaiMs = 10_000 } = {}) {
  if (!doitReduire(fichier)) return fichier;
  try {
    let minuteur;
    const source = await Promise.race([
      ouvrir(fichier),
      new Promise((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error("décodage trop long")), delaiMs);
      }),
    ]).finally(() => clearTimeout(minuteur));
    const largeur = source.width || source.naturalWidth;
    const hauteur = source.height || source.naturalHeight;
    const echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur));
    const toile = document.createElement("canvas");
    toile.width = Math.round(largeur * echelle);
    toile.height = Math.round(hauteur * echelle);
    const contexte = toile.getContext("2d");
    // Fond blanc : un PNG transparent ne doit pas virer au noir en JPEG.
    contexte.fillStyle = "#fff";
    contexte.fillRect(0, 0, toile.width, toile.height);
    contexte.drawImage(source, 0, 0, toile.width, toile.height);
    if (source.close) source.close();

    const blob = await new Promise((resolve) =>
      toile.toBlob(resolve, "image/jpeg", QUALITE),
    );
    if (!blob || blob.size >= fichier.size) return fichier;

    const nom = fichier.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nom, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return fichier;
  }
}
