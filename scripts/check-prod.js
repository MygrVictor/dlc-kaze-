/**
 * Contrôle de configuration avant mise en production.
 *
 * À exécuter sur le serveur, une fois le .env rempli :
 *   node scripts/check-prod.js
 *
 * Le script ne modifie rien : il signale ce qui empêcherait
 * l'application de fonctionner, et ce qui la ferait fonctionner
 * en mode dégradé sans que ce soit visible.
 */
require("dotenv").config();

const bloquants = [];
const avertissements = [];
const ok = [];

const defini = (cle) => {
  const v = process.env[cle];
  return typeof v === "string" && v.trim() !== "";
};

/**
 * Une variable laissée à sa valeur d'exemple est pire qu'une variable
 * absente : l'application démarre en croyant être configurée.
 */
const EXEMPLES = /^(votre|changez|a_generer|remplir|mot-de-passe|exemple)/i;
const estExemple = (cle) =>
  defini(cle) && EXEMPLES.test(process.env[cle].trim());

for (const cle of [
  "DATABASE_URL",
  "CLIENT_URL",
  "KAZE_LOGIN",
  "KAZE_PASSWORD",
  "KAZE_WEBHOOK_SECRET",
  "SMTP_HOST",
  "SMTP_PASS",
  "ADMIN_EMAIL",
  "EMAIL_FROM",
]) {
  if (estExemple(cle)) {
    bloquants.push(`${cle} est resté la valeur d'exemple.`);
  }
}

// ── Bloquants ────────────────────────────────────────────────
if (!defini("DATABASE_URL")) {
  bloquants.push("DATABASE_URL absent — aucune connexion à la base.");
} else {
  ok.push("DATABASE_URL défini");
}

if (!defini("JWT_SECRET")) {
  bloquants.push("JWT_SECRET absent — impossible de signer les sessions.");
} else if (process.env.JWT_SECRET.length < 32) {
  bloquants.push(
    `JWT_SECRET trop court (${process.env.JWT_SECRET.length} caractères, minimum 32).`,
  );
} else if (/CHANGEZ|A_GENERER/i.test(process.env.JWT_SECRET)) {
  bloquants.push("JWT_SECRET est resté la valeur d'exemple.");
} else {
  ok.push("JWT_SECRET défini et suffisamment long");
}

if (process.env.NODE_ENV !== "production") {
  bloquants.push(
    `NODE_ENV vaut "${process.env.NODE_ENV || "(vide)"}" — le client React ne sera pas servi.`,
  );
} else {
  ok.push("NODE_ENV=production");
}

if (!defini("CLIENT_URL")) {
  bloquants.push("CLIENT_URL absent — CORS rejettera le navigateur.");
} else if (!process.env.CLIENT_URL.startsWith("https://")) {
  avertissements.push(
    `CLIENT_URL n'est pas en HTTPS (${process.env.CLIENT_URL}).`,
  );
} else {
  ok.push(`CLIENT_URL = ${process.env.CLIENT_URL}`);
}

// ── Fonctionnalités qui dégradent en silence ─────────────────
if (!defini("RESEND_API_KEY") && !defini("SMTP_HOST")) {
  avertissements.push(
    "Ni RESEND_API_KEY ni SMTP_HOST — les emails clients seront seulement affichés en console.",
  );
} else {
  ok.push(defini("RESEND_API_KEY") ? "Emails via Resend" : "Emails via SMTP");
}

if (!defini("WHATSAPP_TOKEN") || !defini("WHATSAPP_PHONE_NUMBER_ID")) {
  avertissements.push(
    "WhatsApp non configuré — les convoyeurs ne recevront aucune notification.",
  );
} else {
  ok.push("WhatsApp configuré");
}

if (!defini("KAZE_LOGIN") || !defini("KAZE_PASSWORD")) {
  avertissements.push(
    "Identifiants Kaze absents — aucune mission ne partira vers Kaze.",
  );
} else {
  ok.push("Identifiants Kaze présents");
}

if (!defini("KAZE_WEBHOOK_SECRET")) {
  avertissements.push(
    "KAZE_WEBHOOK_SECRET absent — les webhooks entrants ne seront pas authentifiés.",
  );
}

if (!defini("INTERENCHERES_API_KEY")) {
  avertissements.push(
    "INTERENCHERES_API_KEY absent — l'API partenaire démarre NON sécurisée.",
  );
}

// ── Build client ─────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const indexHtml = path.resolve(__dirname, "../client/dist/index.html");
if (!fs.existsSync(indexHtml)) {
  bloquants.push(
    "client/dist/index.html introuvable — lancez `npm run build` avant de déployer.",
  );
} else {
  ok.push("Build client présent");
}

// ── Restitution ──────────────────────────────────────────────
const titre = (t) => console.log(`\n${t}`);

titre("✅ Configuration correcte");
for (const l of ok) console.log(`   • ${l}`);

if (avertissements.length) {
  titre("⚠️  Fonctionnera, mais en mode dégradé");
  for (const l of avertissements) console.log(`   • ${l}`);
}

if (bloquants.length) {
  titre("❌ Bloquant — à corriger avant de démarrer");
  for (const l of bloquants) console.log(`   • ${l}`);
}

// ── Test de connexion réelle à la base ───────────────────────
(async () => {
  if (!defini("DATABASE_URL")) return finir();

  try {
    const db = require("../server/src/db");
    const { rows } = await db.query("SELECT COUNT(*)::int AS total FROM users");
    titre("🗄️  Base de données");
    console.log(`   • Connexion établie — ${rows[0].total} utilisateur(s)`);
  } catch (err) {
    titre("🗄️  Base de données");
    console.log(`   • ❌ Connexion impossible : ${err.message}`);
    bloquants.push("Connexion à la base impossible.");
  }
  finir();
})();

function finir() {
  console.log("");
  process.exit(bloquants.length ? 1 : 0);
}
