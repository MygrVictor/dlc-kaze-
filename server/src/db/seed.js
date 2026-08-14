/**
 * Seed — crée un compte Admin par défaut.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const bcrypt = require("bcryptjs");
const db = require("./index");

const seed = async () => {
  console.log("🌱 Seeding de la base…");

  // Le mot de passe par défaut ne convient qu'au développement. En production,
  // fournir ADMIN_EMAIL / ADMIN_PASSWORD pour éviter un compte dont les
  // identifiants figurent en clair dans le dépôt.
  const email = process.env.ADMIN_EMAIL || "admin@dlc-kaze.fr";
  const password = process.env.ADMIN_PASSWORD || "admin1234";

  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    console.error(
      "❌ ADMIN_PASSWORD obligatoire en production — seed interrompu.",
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_validated)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin',
           is_validated = true`,
    [email, passwordHash, "Administrateur DLC"],
  );

  console.log(`✅ Seed terminé — Admin : ${email}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error("❌ Erreur de seed :", err);
  process.exit(1);
});
