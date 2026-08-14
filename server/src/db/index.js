const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ── Paramètres production ──────────────────────────────────
  max: 20, // Max connections dans le pool
  idleTimeoutMillis: 30000, // Fermer les idle après 30s
  connectionTimeoutMillis: 5000, // Timeout connexion 5s
});

pool.on("error", (err) => {
  console.error("❌ Erreur inattendue du pool PostgreSQL", err);
  process.exit(-1);
});

// ── Helper transaction ───────────────────────────────────────
// Usage: const result = await db.transaction(async (client) => { ... });
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction,
  pool,
};
