/**
 * Migration — table `kaze_job_positions`
 *
 * La liste `/jobs` de Kaze est allégée : ni coordonnées, ni adresse
 * exploitable. Seul le détail `/jobs/{id}` porte les adresses, cachées
 * dans l'arbre du workflow. Positionner un historique de plusieurs
 * milliers de missions demanderait donc autant d'appels à chaque
 * affichage de la carte — impensable.
 *
 * Cette table conserve le résultat de ce travail : une position par job,
 * calculée une fois hors ligne par scripts/backfill-geocodage-kaze.js,
 * puis relue en une seule requête SQL.
 *
 * Elle ne duplique pas `geocode_cache` : celui-ci associe une adresse à
 * des coordonnées, celle-ci associe un job Kaze à son adresse. Sans le
 * second lien, connaître les coordonnées ne sert à rien puisqu'on ignore
 * quelle adresse correspond à quel job.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Création de la table kaze_job_positions…");

  await db.query(`
    CREATE TABLE IF NOT EXISTS kaze_job_positions (
      kaze_job_id   TEXT PRIMARY KEY,
      address       TEXT,
      arrival_address TEXT,
      lat           DOUBLE PRECISION,
      lng           DOUBLE PRECISION,
      -- Un job dont l'adresse reste introuvable est tout de même
      -- enregistré : sans cette trace, chaque passe du script le
      -- retenterait indéfiniment.
      resolved      BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kaze_positions_resolved
      ON kaze_job_positions(resolved);
  `);

  console.log("✅ Table kaze_job_positions prête.");
};

if (require.main === module) {
  migrate()
    .catch((err) => {
      console.error("❌ Migration échouée :", err.message);
      process.exitCode = 1;
    })
    .finally(() => db.pool?.end?.());
}

module.exports = migrate;
