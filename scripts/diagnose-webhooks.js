/**
 * Inspecte la configuration des webhooks côté Kaze.
 *
 * Objectif : savoir si Kaze a bien pour consigne de prévenir DLC quand
 * un statut de mission change. Sans cela, la synchronisation repose
 * entièrement sur le cron.
 *
 * Le script est en lecture seule : il ne crée ni ne modifie rien.
 */
require("dotenv").config();
const axios = require("axios");
const kaze = require("../server/src/services/kaze.service");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";

/** Chemins plausibles : l'API Kaze n'est pas documentée sur ce point. */
const CHEMINS = [
  "/webhooks.json",
  "/webhooks",
  "/web_hooks.json",
  "/hooks.json",
  "/account/webhooks.json",
  "/settings/webhooks.json",
  "/companies/webhooks.json",
  "/notifications.json",
];

(async () => {
  if (!process.env.KAZE_LOGIN || !process.env.KAZE_PASSWORD) {
    console.log("❌ Identifiants Kaze absents du .env.");
    process.exit(1);
  }

  // L'authentification passe par le service : il gère le JWT et son
  // renouvellement, inutile de réimplémenter la connexion ici.
  try {
    await kaze.authenticate();
    console.log("✅ Authentifié auprès de Kaze.\n");
  } catch (err) {
    console.log(`❌ Authentification échouée : ${err.message}`);
    process.exit(1);
  }

  const { data: session } = await axios.post(
    `${BASE}/login`,
    {
      user: {
        login: process.env.KAZE_LOGIN,
        password: process.env.KAZE_PASSWORD,
        ...(process.env.KAZE_API_KEY
          ? { api_key: process.env.KAZE_API_KEY }
          : {}),
      },
    },
    // Kaze répond 406 sans ces en-têtes explicites.
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );

  const entetes = { Authorization: `Bearer ${session.access_token}` };
  let trouve = false;

  console.log("Recherche d'un endpoint de webhooks :");
  for (const chemin of CHEMINS) {
    try {
      const { data, status } = await axios.get(`${BASE}${chemin}`, {
        headers: entetes,
        timeout: 8000,
      });
      console.log(`\n   ✅ ${chemin} → ${status}`);
      console.log(JSON.stringify(data, null, 2).slice(0, 1200));
      trouve = true;
    } catch (err) {
      console.log(`   • ${chemin} → ${err.response?.status || err.code}`);
    }
  }

  if (!trouve) {
    console.log(
      "\n⚠️  Aucun endpoint de webhooks accessible par l'API.\n" +
        "   Cela ne prouve pas l'absence de webhook : Kaze peut ne les\n" +
        "   exposer que dans son interface web (app.kaze.so > Paramètres).",
    );
  }

  process.exit(0);
})();
