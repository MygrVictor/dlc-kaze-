/**
 * /api_tokens n'existe pas tel quel. Essaye des variations de nommage
 * plausibles pour la même fonctionnalité (settings_api_config: true dans
 * le profil suggère qu'une gestion de tokens API existe quelque part).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";

async function main() {
  const { data: loginData } = await axios.post(
    `${BASE}/login`,
    {
      user: {
        login: process.env.KAZE_LOGIN,
        password: process.env.KAZE_PASSWORD,
        api_key: process.env.KAZE_API_KEY,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );
  const client = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${loginData.jwt.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  const candidates = [
    "/api-tokens",
    "/api_token",
    "/settings/api_tokens",
    "/settings/api_config",
    "/settings/api",
    "/company/api_tokens",
    "/companies/api_tokens",
    "/integrations",
    "/integrations/api_tokens",
    "/tokens",
    "/access_tokens",
    "/personal_access_tokens",
    "/oauth/applications",
    "/webhooks",
    "/company",
    "/companies",
  ];

  for (const url of candidates) {
    const res = await client.get(url);
    const marker =
      res.status === 200 ? "✅" : res.status === 404 ? "  " : "⚠️ ";
    console.log(`${marker} GET ${url} -> HTTP ${res.status}`);
    if (res.status === 200) {
      console.log("   " + JSON.stringify(res.data).slice(0, 400));
    }
  }
}

main().catch((e) =>
  console.error("ERREUR:", e.response?.status, e.response?.data || e.message),
);
