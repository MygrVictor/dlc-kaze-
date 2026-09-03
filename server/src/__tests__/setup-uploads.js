/**
 * Isole les fichiers déposés, worker par worker.
 *
 * Plusieurs suites envoient de vrais fichiers à Multer, et l'une d'elles
 * vérifie ce qui subsiste sur le disque après un refus — c'est même tout
 * son objet. Tant qu'elles partageaient un dossier unique, ce contrôle
 * dépendait de l'ordre d'exécution : les pièces laissées par une autre
 * suite s'y ajoutaient, et l'assertion tombait selon le nombre de cœurs
 * de la machine. Vert en local, rouge en intégration continue.
 *
 * Chaque worker reçoit donc sa propre racine. Le fichier est chargé avant
 * les modules testés, car les routes figent leur chemin de dépôt dès le
 * `require`.
 */
const os = require("os");
const path = require("path");
const fs = require("fs");

const racine = path.join(
  os.tmpdir(),
  `dlc-kaze-tests-${process.pid}-${process.env.JEST_WORKER_ID || "1"}`,
);

process.env.UPLOADS_DIR = racine;

// Les pièces déposées pendant les tests n'ont aucune raison de survivre
// à la suite qui les a produites.
process.on("exit", () => {
  try {
    fs.rmSync(racine, { recursive: true, force: true });
  } catch {
    // Un temporaire qui résiste ne doit pas faire échouer la suite.
  }
});
