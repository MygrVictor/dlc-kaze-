/**
 * Migration — pièces jointes aux candidatures convoyeur
 *
 * Le formulaire public demande désormais les cinq justificatifs dès la
 * candidature, afin de n'ouvrir un compte qu'à des convoyeurs dont le
 * dossier est déjà constitué.
 *
 * Ces fichiers ne peuvent pas aller directement dans
 * `convoyeur_documents` : cette table exige un `convoyeur_id` référençant
 * `users`, or le candidat n'a pas encore de compte — il n'existe qu'en
 * tant que ligne de `contact_requests`. On les stocke donc en salle
 * d'attente, puis on les transfère à la création du compte.
 *
 * Une candidature n'a que deux issues, et les pièces suivent chacune :
 * acceptée, elles rejoignent le dossier du convoyeur ; supprimée, la
 * cascade emporte les lignes et l'administration efface les fichiers.
 * Rien ne disparaît sans décision humaine.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — pièces jointes aux candidatures…");

  // Le permis se lit sur ses deux faces : la validité et les catégories
  // figurent au recto, les restrictions et la date de délivrance au
  // verso. Un seul cliché ne permet pas de vérifier le droit de conduire.
  //  // La pièce d'identité suit la même logique, mais à géométrie variable :
  // une carte nationale se lit sur ses deux faces, un passeport tient sur
  // sa seule page d'identification. D'où un verso enregistrable mais non
  // systématique — exiger deux faces d'un passeport n'aurait pas de sens.
  //  // Le Kbis et le W garage rejoignent l'énumération : le premier remplace
  // le SIRET déclaré — un numéro saisi à la main ne prouve rien, l'extrait
  // atteste — le second reste facultatif, tous les convoyeurs n'en
  // disposant pas.
  //
  // ALTER TYPE ... ADD VALUE refuse de s'exécuter dans une transaction,
  // d'où des requêtes isolées. IF NOT EXISTS rend la migration rejouable.
  for (const type of [
    "permis_verso",
    "carte_identite_verso",
    "kbis",
    "w_garage",
  ]) {
    await db.query(`ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '${type}'`);
    console.log(`  · doc_type accepte désormais « ${type} »`);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS demande_documents (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demande_id    UUID NOT NULL REFERENCES contact_requests(id) ON DELETE CASCADE,
      type          doc_type NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_path     VARCHAR(500) NOT NULL,
      mime_type     VARCHAR(100),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Un seul fichier par type et par candidature : un nouveau dépôt
    -- remplace le précédent.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_demande_doc_type
      ON demande_documents(demande_id, type);
  `);
  console.log("  · table demande_documents prête");

  console.log("Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("Erreur migration pièces jointes :", err.message);
  process.exit(1);
});
