/**
 * Chargement du fichier .env sans dépendance externe.
 *
 * Les scripts de migration s'exécutent en dehors de l'application, dans un
 * shell où l'arborescence npm n'est pas toujours celle du serveur en
 * fonctionnement — sur un hébergement mutualisé, `node_modules` est un lien
 * vers un environnement virtuel dont le contenu varie. Faire dépendre une
 * migration de la présence de `dotenv` revient alors à la rendre
 * impossible à jouer au moment précis où l'on en a besoin.
 *
 * On utilise donc `dotenv` s'il est disponible, et on retombe sinon sur une
 * lecture directe du fichier, largement suffisante pour les quelques
 * variables dont une migration a besoin.
 */

const fs = require("fs");
const path = require("path");

/** Retire les guillemets encadrants d'une valeur, s'il y en a. */
function nettoyerValeur(brut) {
  const valeur = brut.trim();
  if (
    (valeur.startsWith('"') && valeur.endsWith('"')) ||
    (valeur.startsWith("'") && valeur.endsWith("'"))
  ) {
    return valeur.slice(1, -1);
  }
  return valeur;
}

/**
 * Analyse minimale d'un fichier .env : commentaires, lignes vides et
 * valeurs entre guillemets. Les variables déjà définies dans
 * l'environnement ne sont jamais écrasées, comme le fait dotenv.
 */
function chargerManuellement(fichier) {
  const contenu = fs.readFileSync(fichier, "utf8");

  for (const ligne of contenu.split(/\r?\n/)) {
    const texte = ligne.trim();
    if (!texte || texte.startsWith("#")) continue;

    const separateur = texte.indexOf("=");
    if (separateur === -1) continue;

    const cle = texte.slice(0, separateur).trim();
    if (!cle || cle in process.env) continue;

    process.env[cle] = nettoyerValeur(texte.slice(separateur + 1));
  }
}

/**
 * @param {string} [fichier] chemin du .env ; par défaut, la racine du dépôt.
 */
function chargerEnv(fichier) {
  const cible = fichier || path.resolve(__dirname, "../../../.env");

  if (!fs.existsSync(cible)) {
    console.warn(`⚠️  Fichier .env introuvable : ${cible}`);
    return;
  }

  try {
    require("dotenv").config({ path: cible });
  } catch (err) {
    if (err.code !== "MODULE_NOT_FOUND") throw err;
    chargerManuellement(cible);
  }
}

module.exports = { chargerEnv };
