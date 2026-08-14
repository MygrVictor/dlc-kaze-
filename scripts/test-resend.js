#!/usr/bin/env node
/**
 * Vérifie la configuration Resend en envoyant un email de test.
 *
 * Usage :
 *   node scripts/test-resend.js destinataire@exemple.fr
 *
 * Sans argument, l'email part vers ADMIN_EMAIL.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const destinataire = process.argv[2] || process.env.ADMIN_EMAIL;

async function principal() {
  console.log("── Vérification de la configuration email ──\n");

  const fournisseur = process.env.RESEND_API_KEY
    ? "Resend"
    : process.env.SMTP_HOST
      ? `SMTP (${process.env.SMTP_HOST})`
      : "aucun (mode console)";

  console.log(`Fournisseur   : ${fournisseur}`);
  console.log(
    `Expéditeur    : ${process.env.EMAIL_FROM || process.env.SMTP_FROM || "(défaut)"}`,
  );
  console.log(`Destinataire  : ${destinataire || "(non défini)"}\n`);

  if (!destinataire) {
    console.error(
      "❌ Aucun destinataire. Passez-le en argument ou définissez ADMIN_EMAIL.",
    );
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "⚠️  RESEND_API_KEY absent : aucun email réel ne sera envoyé.\n" +
        "   Ajoutez la clé dans .env puis relancez ce script.\n",
    );
  }

  const emailService = require("../server/src/services/email.service");

  try {
    await emailService.notifyAccountValidated(destinataire, "Test DLC Kaze");
    console.log("✅ Email envoyé sans erreur.");
    if (process.env.RESEND_API_KEY) {
      console.log(
        "   Vérifiez la boîte de réception et le journal sur https://resend.com/emails",
      );
    }
  } catch (err) {
    console.error("❌ Échec de l'envoi :", err.message);
    if (/domain is not verified|not verified/i.test(err.message)) {
      console.error(
        "\n   Le domaine de l'expéditeur n'est pas vérifié dans Resend.\n" +
          "   Solution immédiate : EMAIL_FROM=DLC Kaze <onboarding@resend.dev>\n" +
          "   (ce domaine de test n'envoie qu'à l'adresse de votre compte Resend)",
      );
    }
    if (/API key is invalid|unauthorized/i.test(err.message)) {
      console.error("\n   La clé RESEND_API_KEY est invalide ou révoquée.");
    }
    process.exit(1);
  }
}

principal();
