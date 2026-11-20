require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});

const db = require("./index");

/**
 * Abonnements aux notifications de l'application (Web Push).
 *
 * Un convoyeur peut en avoir plusieurs : un par appareil ou navigateur où
 * il a activé les notifications. L'endpoint, fourni par le navigateur,
 * identifie l'abonnement de façon unique.
 */
async function migrate() {
  console.log("Migration — abonnements aux notifications de l'application…");

  await db.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      user_agent  VARCHAR(300),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
      ON push_subscriptions(user_id);
  `);

  console.log("✅ Migration terminée avec succès.");
}

migrate()
  .catch((err) => {
    console.error("❌ Erreur migration notifications push:", err);
    process.exit(1);
  })
  .finally(() => db.pool.end());

module.exports = migrate;
