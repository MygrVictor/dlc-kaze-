/**
 * Racine des fichiers déposés.
 *
 * Le chemin était recalculé dans chaque route à partir de `__dirname`,
 * ce qui l'ancrait au dépôt. Deux conséquences gênantes :
 *
 * - en production, les pièces d'identité vivaient au milieu du code,
 *   exposées à un `git clean` malencontreux ;
 * - en test, toutes les suites partageaient un dossier unique. Celles
 *   qui y écrivaient de vrais fichiers polluaient celle qui vérifiait
 *   ce qui reste sur le disque, et l'échec ne dépendait que de l'ordre
 *   d'exécution — donc du nombre de cœurs de la machine.
 *
 * `UPLOADS_DIR` permet désormais de déplacer cette racine : ailleurs sur
 * le serveur en production, dans un dossier propre à chaque worker Jest
 * en test.
 */
const path = require("path");
const fs = require("fs");

const RACINE_UPLOADS = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, "../../../uploads");

/** Sous-dossier garanti présent : Multer refuse d'écrire dans le vide. */
const dossier = (nom) => {
  const chemin = path.join(RACINE_UPLOADS, nom);
  if (!fs.existsSync(chemin)) fs.mkdirSync(chemin, { recursive: true });
  return chemin;
};

/**
 * Traduit un chemin public (`/uploads/documents/abc.pdf`, tel qu'il est
 * stocké en base et servi au navigateur) en chemin disque réel.
 *
 * Indispensable dès que `UPLOADS_DIR` déplace la racine : recalculer ce
 * chemin depuis `__dirname` viserait le dépôt, et la suppression d'un
 * document remplacé échouerait en silence — laissant des pièces
 * d'identité périmées traîner sur le serveur.
 *
 * Renvoie `null` si le chemin sort de la racine, ce qui neutralise une
 * valeur corrompue en base avant qu'elle ne serve à un `unlink`.
 */
const cheminDisque = (cheminPublic) => {
  const relatif = String(cheminPublic || "").replace(/^\/?uploads\//, "");
  const cible = path.resolve(path.join(RACINE_UPLOADS, relatif));
  return cible.startsWith(path.resolve(RACINE_UPLOADS) + path.sep)
    ? cible
    : null;
};

module.exports = { RACINE_UPLOADS, dossier, cheminDisque };
