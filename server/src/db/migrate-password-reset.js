/**
 * Migration — réinitialisation de mot de passe
 *
 * Jusqu'ici, un client ou un convoyeur ayant perdu son mot de passe
 * devait écrire à l'équipe, qui lui en régénérait un. Procédure lente,
 * et surtout peu sûre : le nouveau mot de passe transitait en clair.
 *
 * Le jeton n'est jamais stocké tel quel. Seule son empreinte SHA-256
 * l'est : une fuite de la table ne permettrait à personne de fabriquer
 * un lien valide. C'est le même raisonnement que pour `password_hash`,
 * appliqué à un secret temporaire.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — réinitialisation de mot de passe…");

  await db.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- La vérification d'un lien se fait par empreinte : sans index, elle
    -- imposerait un parcours complet à chaque tentative, ce qu'un
    -- attaquant pourrait exploiter pour saturer la base.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token
      ON password_resets(token_hash);

    -- Invalider les demandes antérieures d'un utilisateur suppose de les
    -- retrouver toutes.
    CREATE INDEX IF NOT EXISTS idx_password_reset_user
      ON password_resets(user_id);
  `);
  console.log("  · table password_resets prête");

  console.log("Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("Erreur migration réinitialisation :", err.message);
  process.exit(1);
});
