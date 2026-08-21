#!/usr/bin/env node
/**
 * Diagnostic Telegram — vérifie que le bot et le salon sont exploitables,
 * puis publie une annonce de test.
 *
 *   node scripts/test-telegram.js
 *
 * Un échec ici signifie que les missions ne seront pas annoncées : le
 * service retombe alors silencieusement sur WhatsApp (payant) ou sur la
 * console.
 */
require("dotenv").config();

const telegram = require("../server/src/services/telegram.service");

const MISSION_TEST = {
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AS-494-DG",
  departure_address: "12 rue de la Paix, 49000 Angers",
  arrival_address: "5 avenue Foch, 75116 Paris",
  price_convoyeur: 180,
  departure_date: new Date(),
};

(async () => {
  const config = await telegram.verifierConfiguration();

  if (!config.actif) {
    console.error(`❌ Telegram inactif : ${config.message}`);
    console.error(
      "   Renseignez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID (cf. .env.example).",
    );
    process.exit(1);
  }

  console.log(`✅ Bot @${config.bot} joignable, salon ${config.salon}`);

  const { publie } = await telegram.annoncerMissionDisponible(
    MISSION_TEST,
    process.env.CLIENT_URL
      ? `${process.env.CLIENT_URL}/convoyeur/missions-disponibles`
      : undefined,
  );

  if (!publie) {
    console.error(
      "❌ Annonce non publiée — le bot est-il bien membre du salon ?",
    );
    process.exit(1);
  }

  console.log("✅ Annonce de test publiée dans le salon.");
  process.exit(0);
})();
