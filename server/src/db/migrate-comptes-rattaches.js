/**
 * Comptes rattachés — un siège, plusieurs entités.
 *
 * Un groupe comme Equans dispose d'un compte principal et de comptes
 * par filiale. Le siège doit voir l'activité de ses entités ; chaque
 * entité ne voit que la sienne et ignore jusqu'à l'existence du parent.
 *
 * Trois précautions dans cette migration, chacune évitant un incident :
 *
 *   ON DELETE SET NULL — et surtout pas CASCADE. Les missions étant
 *   elles-mêmes rattachées aux utilisateurs en cascade, supprimer le
 *   siège d'un groupe effacerait ses filiales *et toutes leurs missions*.
 *   Avec SET NULL, les entités se retrouvent simplement détachées.
 *
 *   CHECK (parent_id <> id) — un compte parent de lui-même ferait
 *   apparaître ses propres missions en double dans son périmètre.
 *
 *   Index sur parent_id — la résolution du périmètre a lieu à chaque
 *   requête d'un compte rattaché ; sans index, chaque appel balaierait
 *   toute la table des utilisateurs.
 *
 * La hiérarchie est volontairement limitée à un seul niveau : le code
 * qui consomme `parent_id` ne descend jamais récursivement. Un
 * petit-enfant ne remonterait donc pas au grand-parent, et c'est un
 * choix — les chaînes profondes rendent les périmètres impossibles à
 * vérifier de tête, alors que la question « qui voit quoi » doit
 * rester répondable en un coup d'œil.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

async function migrate() {
  console.log("🔄 Migration : comptes rattachés (parent_id)…");

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES users(id) ON DELETE SET NULL;
  `);

  // Ajoutée séparément : ADD CONSTRAINT ne connaît pas IF NOT EXISTS,
  // rejouer la migration lèverait une erreur sur une base déjà à jour.
  const { rows: contrainte } = await db.query(`
    SELECT 1 FROM pg_constraint WHERE conname = 'users_parent_pas_soi_meme'
  `);
  if (contrainte.length === 0) {
    await db.query(`
      ALTER TABLE users
        ADD CONSTRAINT users_parent_pas_soi_meme CHECK (parent_id <> id);
    `);
    console.log("  · contrainte users_parent_pas_soi_meme");
  }

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_users_parent_id
      ON users(parent_id) WHERE parent_id IS NOT NULL;
  `);

  const { rows } = await db.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'parent_id'
  `);
  rows.forEach((r) => console.log(`  · users.${r.column_name}`));

  console.log("✅ Migration terminée.");
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration échouée :", err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
