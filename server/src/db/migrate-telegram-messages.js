require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});

const db = require("./index");

async function migrate() {
  console.log("Migration — traces d'annonces Telegram…");

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32);
  `);

  await db.query(`
    ALTER TABLE missions
      ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_telegram_message
      ON missions(telegram_message_id)
      WHERE telegram_message_id IS NOT NULL;
  `);

  console.log("✅ Migration terminée avec succès.");
}

migrate()
  .catch((err) => {
    console.error("❌ Erreur migration Telegram:", err);
    process.exit(1);
  })
  .finally(() => db.end());

module.exports = migrate;
