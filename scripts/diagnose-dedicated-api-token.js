/**
 * Test du token API DÉDIÉ (obtenu depuis Paramètres > API dans Kaze),
 * différent du JWT de session utilisé jusqu'ici. Teste plusieurs formats
 * d'en-tête d'authentification plausibles, puis tente une création de job
 * fidèle à un vrai job CONVOYAGE pour voir si le comportement diffère
 * (job publié en "waiting" avec job_workflow_id/target_id renseignés,
 * au lieu du statut "initial" bloqué observé avec le JWT).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";
// Lu depuis .env : ne jamais réintroduire le token en dur, le dépôt est public.
const API_TOKEN = process.env.KAZE_API_TOKEN;

if (!API_TOKEN) {
  console.error("❌ KAZE_API_TOKEN absent du .env — script interrompu.");
  process.exit(1);
}

async function loginJwt() {
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

async function tryAuthFormat(label, headers) {
  const client = axios.create({
    baseURL: BASE,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    timeout: 15000,
    validateStatus: () => true,
  });
  const res = await client.get("/jobs", { params: { per_page: 1 } });
  console.log(
    `[${label}] GET /jobs -> HTTP ${res.status}`,
    res.status === 200 ? "✅" : JSON.stringify(res.data)?.slice(0, 150),
  );
  return res.status === 200 ? client : null;
}

async function main() {
  console.log("=".repeat(70));
  console.log(
    "Recherche du bon format d'authentification pour le token API dédié",
  );
  console.log("=".repeat(70));

  let workingClient = null;
  const formats = [
    ["Bearer <token>", { Authorization: `Bearer ${API_TOKEN}` }],
    ["Token brut (sans Bearer)", { Authorization: API_TOKEN }],
    ["Token token=<token>", { Authorization: `Token token=${API_TOKEN}` }],
    ["X-Api-Key", { "X-Api-Key": API_TOKEN }],
    ["X-API-TOKEN", { "X-API-TOKEN": API_TOKEN }],
    ["Api-Token", { "Api-Token": API_TOKEN }],
  ];

  for (const [label, headers] of formats) {
    const client = await tryAuthFormat(label, headers);
    if (client && !workingClient) workingClient = { label, client };
  }

  if (!workingClient) {
    console.log(
      "\n❌ Aucun format d'authentification n'a fonctionné avec ce token pour GET /jobs.",
    );
    console.log(
      "On continue quand même le test de création avec 'Bearer' (format le plus probable) pour voir l'erreur exacte.",
    );
  } else {
    console.log(`\n✅ Format qui fonctionne : ${workingClient.label}`);
  }

  // Utilise le format qui marche, sinon Bearer par défaut pour voir l'erreur
  const client =
    workingClient?.client ||
    axios.create({
      baseURL: BASE,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15000,
      validateStatus: () => true,
    });

  // Récupère un workflow de référence fidèle via le JWT classique (compte admin)
  console.log(
    "\n--- Récupération d'un job CONVOYAGE réel (via JWT) pour copie fidèle ---",
  );
  const jwt = await loginJwt();
  const jwtClient = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });
  const refJobRes = await jwtClient.get(
    "/jobs/145b4b95-bd43-4980-9991-57e50c6b25e2",
  );
  const workflow = JSON.parse(JSON.stringify(refJobRes.data.workflow));
  const jobInfo = workflow.children.find((c) => c.type === "template_job_info");
  const now = Date.now();
  jobInfo.job_title = "QA-APITOKEN-REAL-TEST";
  jobInfo.job_reference = "DLC-QA-APITOKENREAL";
  jobInfo.job_due_date = now + 86400000;
  jobInfo.job_start_date = now + 86400000;
  jobInfo.job_end_date = now + 86400000 + 28800000;
  console.log(`✅ Référence chargée: ${refJobRes.data.title}`);

  console.log("\n" + "=".repeat(70));
  console.log("POST /jobs avec le TOKEN API DÉDIÉ");
  console.log("=".repeat(70));
  const postRes = await client.post("/jobs", {
    job: { job_workflow_id: WORKFLOW_ID },
    workflow,
  });
  console.log(`HTTP ${postRes.status}`);
  console.log(JSON.stringify(postRes.data, null, 2)?.slice(0, 1000));

  if (postRes.data?.id) {
    await new Promise((r) => setTimeout(r, 1500));
    console.log("\n--- Re-fetch (via JWT admin, pour être sûr) ---");
    const checkRes = await jwtClient.get(`/jobs/${postRes.data.id}`);
    const job = checkRes.data;
    console.log(`id=${job.id}`);
    console.log(`status=${job.status}  (status_name=${job.status_name})`);
    console.log(`job_workflow_id=${job.job_workflow_id}`);
    console.log(`target_id=${job.target_id}  target_name=${job.target_name}`);
    console.log(`current_step_id=${job.current_step_id}`);
    console.log(`performer=${job.performer?.name || "AUCUN"}`);

    if (job.status !== "initial" && job.job_workflow_id) {
      console.log("\n🎉🎉🎉 GAGNÉ ! Le token API dédié résout le problème !");
    } else {
      console.log(
        "\n❌ Toujours bloqué en 'initial' même avec le token API dédié.",
      );
    }
    console.log(
      `\n--- ID créé (nettoyage manuel si besoin) : ${postRes.data.id} ---`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(
      "ERREUR FATALE:",
      e.response?.status,
      e.response?.data || e.message,
    );
    process.exit(1);
  });
