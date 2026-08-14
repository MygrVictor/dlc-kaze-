#!/usr/bin/env node
/**
 * Vérifie la configuration WhatsApp Business et envoie un message de test.
 *
 * Usage :
 *   node scripts/test-whatsapp.js                 → diagnostic seul
 *   node scripts/test-whatsapp.js 0612345678      → diagnostic + envoi
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const whatsapp = require("../server/src/services/whatsapp.service");

const destinataire = process.argv[2];

const MISSION_TEST = {
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AA-123-BB",
  departure_address: "10 rue de Rivoli, 75004 Paris",
  arrival_address: "1 place Bellecour, 69002 Lyon",
  price_convoyeur: 400,
};

async function principal() {
  console.log("── Vérification WhatsApp Business ──\n");

  if (!whatsapp.estActif()) {
    console.warn(
      "⚠️  WHATSAPP_TOKEN et/ou WHATSAPP_PHONE_ID absents.\n" +
        "   Les notifications sont loggées en console, sans envoi réel.\n",
    );
  }

  const etat = await whatsapp.verifierConfiguration();

  if (etat.actif && !etat.erreur) {
    console.log(`✅ Numéro expéditeur : ${etat.numero}`);
    console.log(`   Nom vérifié       : ${etat.nom}`);
    console.log(`   Qualité           : ${etat.qualite}\n`);
  } else if (etat.erreur) {
    console.error(`❌ Configuration invalide : ${etat.erreur}\n`);
    if (/access token/i.test(etat.erreur)) {
      console.error("   Le jeton WHATSAPP_TOKEN est expiré ou incorrect.");
      console.error(
        "   Générez un jeton permanent via un System User dans Meta Business.",
      );
    }
    process.exit(1);
  }

  if (!destinataire) {
    console.log(
      "Aucun destinataire fourni. Pour tester un envoi :\n" +
        "   node scripts/test-whatsapp.js 0612345678\n",
    );
    return;
  }

  const numero = whatsapp.normaliserNumero(destinataire);
  if (!numero) {
    console.error(`❌ Numéro inexploitable : « ${destinataire} »`);
    process.exit(1);
  }

  console.log(`Envoi du template vers ${numero}…\n`);

  const bilan = await whatsapp.notifierMissionDisponible(
    [{ phone: destinataire, full_name: "Convoyeur Test" }],
    MISSION_TEST,
  );

  console.log(
    `\nBilan : ${bilan.envoyes} envoyé(s), ${bilan.ignores} ignoré(s), ${bilan.echecs} échec(s)`,
  );

  if (bilan.echecs > 0) {
    console.error(
      "\n   Causes fréquentes :\n" +
        "   • Le template n'est pas encore approuvé par Meta\n" +
        "   • Le nombre de paramètres ne correspond pas au template\n" +
        "   • En mode test, le destinataire doit être déclaré dans l'app Meta",
    );
    process.exit(1);
  }
}

principal().catch((err) => {
  console.error("❌ Erreur inattendue :", err.message);
  process.exit(1);
});
