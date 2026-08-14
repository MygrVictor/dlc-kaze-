/**
 * DÉCOUVERTE : le profil du compte montre des permissions
 * "api_tokens": true, "create_api_tokens": true, "settings_api_config": true.
 * Cela suggère un système de token API DÉDIÉ (différent du JWT de session
 * utilisateur qu'on utilise depuis le début). Un token d'intégration
 * pourrait avoir un comportement différent (publication directe en
 * "waiting" au lieu de "initial") puisqu'il est probablement conçu
 * spécifiquement pour la création d'objets via API tierce.
 *
 * Teste : GET/POST /api_tokens, puis tente une création de job avec ce
 * nouveau token si on arrive à en obtenir un.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";

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

  console.log("=".repeat(70));
  console.log("GET /api_tokens — liste des tokens API existants");
  console.log("=".repeat(70));
  const listRes = await client.get("/api_tokens");
  console.log(`HTTP ${listRes.status}`);
  console.log(JSON.stringify(listRes.data, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log("POST /api_tokens — tentative de création d'un token API dédié");
  console.log("=".repeat(70));
  const createRes = await client.post("/api_tokens", {
    api_token: { name: "DLC-Kaze-Integration-Test" },
  });
  console.log(`HTTP ${createRes.status}`);
  console.log(JSON.stringify(createRes.data, null, 2));

  // Essaye aussi sans le wrapper "api_token" au cas où
  if (createRes.status >= 400) {
    console.log("\n--- Tentative alternative (payload sans wrapper) ---");
    const createRes2 = await client.post("/api_tokens", {
      name: "DLC-Kaze-Integration-Test-2",
    });
    console.log(`HTTP ${createRes2.status}`);
    console.log(JSON.stringify(createRes2.data, null, 2));
  }

  // Si on a obtenu un token, testons-le immédiatement sur la création d'un job
  const newToken =
    createRes.data?.token ||
    createRes.data?.api_token?.token ||
    createRes.data?.key;
  if (newToken) {
    console.log("\n" + "=".repeat(70));
    console.log("🎯 Token obtenu ! Test de création de job avec CE token");
    console.log("=".repeat(70));
    const refJobRes = await client.get(
      "/jobs/145b4b95-bd43-4980-9991-57e50c6b25e2",
    );
    const workflow = JSON.parse(JSON.stringify(refJobRes.data.workflow));
    const jobInfo = workflow.children.find(
      (c) => c.type === "template_job_info",
    );
    jobInfo.job_title = "QA-APITOKEN-TEST";
    jobInfo.job_reference = "DLC-QA-APITOKEN";

    // Essaye avec Bearer
    const apiTokenClient = axios.create({
      baseURL: BASE,
      headers: {
        Authorization: `Bearer ${newToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    const postRes = await apiTokenClient.post("/jobs", {
      job: { job_workflow_id: WORKFLOW_ID },
      workflow,
    });
    console.log(`POST avec nouveau token -> HTTP ${postRes.status}`);
    console.log(JSON.stringify(postRes.data)?.slice(0, 300));

    if (postRes.data?.id) {
      await new Promise((r) => setTimeout(r, 1000));
      const checkRes = await client.get(`/jobs/${postRes.data.id}`);
      console.log(
        `Re-fetch -> status=${checkRes.data.status} job_workflow_id=${checkRes.data.job_workflow_id} target_id=${checkRes.data.target_id}`,
      );
    }
  } else {
    console.log("\n❌ Aucun token exploitable obtenu depuis /api_tokens.");
  }
}

main().catch((e) =>
  console.error("ERREUR:", e.response?.status, e.response?.data || e.message),
);
