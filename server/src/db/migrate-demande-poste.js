/**
 * Migration — colonne `job_title` sur `contact_requests`
 *
 * Le formulaire « Faites-vous rappeler » du site vitrine demande le poste
 * occupé par le prospect : un directeur de flotte et un chef d'atelier
 * n'appellent pas la même réponse commerciale. L'information est stockée à
 * part plutôt que noyée dans `message`, pour rester filtrable côté admin.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("🔄 Ajout de la colonne job_title à contact_requests…");

  await db.query(`
    ALTER TABLE contact_requests
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(120);
  `);

  console.log("✅ Colonne job_title ajoutée.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Erreur de migration :", err);
  process.exit(1);
});
