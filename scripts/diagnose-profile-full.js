/**
 * Dump complet de /profile (endpoint découvert à l'instant) pour voir
 * s'il y a une info de permission/scope qui expliquerait pourquoi les jobs
 * créés via l'API restent déconnectés de leur workflow.
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

  const res = await client.get("/profile");
  console.log(JSON.stringify(res.data, null, 2));
}

main().catch((e) => console.error(e.response?.data || e.message));
