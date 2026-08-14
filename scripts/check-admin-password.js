require("dotenv").config();
const db = require("../server/src/db");
const bcrypt = require("bcryptjs");

(async () => {
  const { rows } = await db.query(
    "SELECT email, password_hash FROM users WHERE role = 'admin'",
  );
  for (const u of rows) {
    const ok = await bcrypt.compare("admin1234", u.password_hash);
    console.log(`${u.email} → "admin1234" ${ok ? "✅ valide" : "❌ invalide"}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
