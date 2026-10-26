const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ── Paramètres production ──────────────────────────────────
  // DB_POOL_MAX : réduire pour les scripts cron (ex: 3) afin de ne pas
  // saturer le PostgreSQL mutualisé en parallèle de l'app.
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  idleTimeoutMillis: 30000, // Fermer les idle après 30s
  connectionTimeoutMillis:
    parseInt(process.env.DB_CONNECT_TIMEOUT_MS, 10) || 15000,
  keepAlive: true,
});

// Une erreur sur un client inactif (ex: connexion coupée par le serveur)
// ne doit pas tuer le process : le pool recrée une connexion au besoin.
pool.on("error", (err) => {
  console.error("⚠️  Erreur pool PostgreSQL (client inactif):", err.message);
});

// ── Retry sur erreurs de connexion transitoires ─────────────
// Uniquement des erreurs survenues AVANT l'exécution de la requête
// (connexion impossible) → retry sûr, pas de double écriture.
const TRANSIENT_DB_PATTERNS = [
  /connection terminated due to connection timeout/i,
  /timeout exceeded when trying to connect/i,
  /ECONNREFUSED|ETIMEDOUT/i,
  /too many (connections|clients)/i,
  /remaining connection slots/i,
];
const isTransientDbError = (err) =>
  !!err &&
  (["57P03", "53300", "08001", "08004"].includes(err.code) ||
    TRANSIENT_DB_PATTERNS.some((re) => re.test(err.message || "")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withDbRetry = async (fn, attempts = 3) => {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || i === attempts) throw err;
      const delay = 500 * 2 ** (i - 1);
      console.warn(
        `⚠️  DB transitoire (${err.message}) — tentative ${i}/${attempts}, retry dans ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
};

// ── Helper transaction ───────────────────────────────────────
// Usage: const result = await db.transaction(async (client) => { ... });
const transaction = async (callback) => {
  const client = await withDbRetry(() => pool.connect());
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
  // pool.query n'exécute rien si la connexion échoue → retry sans risque
  query: (text, params) => withDbRetry(() => pool.query(text, params)),
  transaction,
  pool,
  isTransientDbError,
};
