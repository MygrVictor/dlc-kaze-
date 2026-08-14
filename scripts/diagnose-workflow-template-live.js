/**
 * Vérifie les champs TOP-LEVEL du job_workflow (template CONVOYAGE) tels
 * que retournés EN DIRECT par l'API (pas notre copie locale en cache),
 * en particulier `supervisor_users` et `watcher_ids` — des champs que
 * notre createMission() ignore complètement (on ne copie que le sous-objet
 * `workflow`, jamais les champs frères comme supervisor_users).
 *
 * Hypothèse : un job doit avoir un superviseur pour être "publié" (sortir
 * de "initial"), et ce superviseur doit venir du template job_workflow au
 * moment de la création (job: { supervisor_users: [...] }).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";

async function login() {
  const { data } = await axios.post(
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
  return data.jwt.access_token;
}

async function main() {
  console.log("🔑 Login…");
  const jwt = await login();
  const client = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
  console.log("✅ Authentifié\n");

  console.log("=".repeat(70));
  console.log("GET /job_workflows/:id — template CONVOYAGE EN DIRECT");
  console.log("=".repeat(70));
  const { data: liveTemplate } = await client.get(
    `/job_workflows/${WORKFLOW_ID}`,
  );
  const { workflow, ...topLevel } = liveTemplate;
  console.log("Champs top-level (hors 'workflow'):");
  console.log(JSON.stringify(topLevel, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log(
    "GET /job_workflows (liste complète) — pour comparer plusieurs templates",
  );
  console.log("=".repeat(70));
  try {
    const { data: list } = await client.get("/job_workflows");
    const arr = list.data || list;
    console.log(`Total templates: ${Array.isArray(arr) ? arr.length : "?"}`);
    if (Array.isArray(arr)) {
      for (const wf of arr) {
        console.log(
          `  id=${wf.id} title=${wf.title} draft=${wf.draft} supervisor_users=${JSON.stringify(wf.supervisor_users)} watcher_ids=${JSON.stringify(wf.watcher_ids)} white_label_id=${wf.white_label_id}`,
        );
      }
    }
  } catch (e) {
    console.log(
      "❌ Erreur liste:",
      e.response?.status,
      JSON.stringify(e.response?.data)?.slice(0, 300),
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(
    "ERREUR FATALE:",
    e.response?.status,
    e.response?.data || e.message,
  );
  process.exit(1);
});
