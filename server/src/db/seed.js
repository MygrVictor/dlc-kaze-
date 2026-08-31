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

  // Aucun mot de passe par défaut : le dépôt est public, une valeur en dur
  // ici serait un identifiant d'accès offert à quiconque lit le code.
  const email = process.env.ADMIN_EMAIL || "drivelineconnect@gmail.com";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error(
      "❌ ADMIN_PASSWORD manquant — ajoutez-le à votre .env avant de lancer le seed.",
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
