/**
 * Migration — révocation des sessions et verrouillage de compte
 *
 * `token_version` : recopiée dans chaque JWT ; l'incrémenter (à chaque
 * changement de mot de passe) invalide toutes les sessions ouvertes du
 * compte. Voir lib/session.js.
 *
 * `failed_login_count` / `locked_until` : compteur d'échecs de connexion
 * tenu par compte, en base, pour résister aux attaques réparties sur
 * plusieurs adresses IP et aux redémarrages qui vident les limiteurs en
 * mémoire.
 *
 * ⚠️ À exécuter AVANT de déployer le code qui lit ces colonnes : sans
 * elles, l'authentification échoue pour tout le monde.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — sécurité des sessions…");

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
  `);
  console.log("  · colonnes token_version, failed_login_count, locked_until");

  console.log("Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("Erreur migration sécurité des sessions :", err.message);
  process.exit(1);
});
