/**
 * Test l'hypothèse d'un endpoint imbriqué REST : POST /job_workflows/:id/jobs
 * au lieu de POST /jobs avec job_workflow_id dans le body. Si Kaze suit une
 * convention REST classique (ressource enfant sous son parent), c'est
 * probablement là que job_workflow_id (et peut-être target_id) seraient
 * automatiquement associés côté serveur.
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

async function tryEndpoint(client, label, method, url, body) {
  console.log("\n" + "=".repeat(70));
  console.log(`${label}: ${method.toUpperCase()} ${url}`);
  console.log("=".repeat(70));
  try {
    const res = await client.request({ method, url, data: body });
    console.log(`✅ ${res.status} ->`, JSON.stringify(res.data).slice(0, 300));
    return res.data;
  } catch (e) {
    console.log(
      `❌ ${e.response?.status} ->`,
      JSON.stringify(e.response?.data)?.slice(0, 400) || e.message,
    );
    return null;
  }
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
    validateStatus: () => true,
  });
  console.log("✅ Authentifié");

  // Charge un workflow réel complet (fidèle) pour retirer la variable "contenu"
  const assignedRes = await client.get("/jobs", {
    params: { status: "assigned", per_page: 5 },
  });
  const refSummary = assignedRes.data.data.find(
    (j) => !(j.title || "").toUpperCase().includes("TEST"),
  );
  const refJobRes = await client.get(`/jobs/${refSummary.id}`);
  const workflow = JSON.parse(JSON.stringify(refJobRes.data.workflow));
  const jobInfo = workflow.children.find((c) => c.type === "template_job_info");
  const now = Date.now();
  jobInfo.job_title = "QA-NESTED-ENDPOINT-TEST";
  jobInfo.job_reference = "DLC-QA-NESTED";
  jobInfo.job_due_date = now + 86400000;
  jobInfo.job_start_date = now + 86400000;
  jobInfo.job_end_date = now + 86400000 + 28800000;

  // Test 1: POST /job_workflows/:id/jobs avec juste { workflow }
  const r1 = await tryEndpoint(
    client,
    "Nested endpoint, body={workflow}",
    "post",
    `/job_workflows/${WORKFLOW_ID}/jobs`,
    { workflow },
  );

  // Test 2: POST /job_workflows/:id/jobs avec { job: {}, workflow }
  const r2 = await tryEndpoint(
    client,
    "Nested endpoint, body={job:{}, workflow}",
    "post",
    `/job_workflows/${WORKFLOW_ID}/jobs`,
    { job: {}, workflow },
  );

  // Test 3: essaye avec juste job: {} + workflow sur /jobs mais avec job_workflow ("without _id" naming variant)
  const r3 = await tryEndpoint(
    client,
    "Alt field name job_workflow (sans _id)",
    "post",
    `/jobs`,
    { job: { job_workflow: WORKFLOW_ID }, workflow },
  );

  // Test 4: PUT sur un job existant bloqué en initial pour lui injecter job_workflow_id
  // (sur un des jobs déjà créés précédemment, pour voir si un PUT après coup fonctionne)
  const r4 = await tryEndpoint(
    client,
    "PUT job_workflow_id sur job existant bloqué",
    "put",
    `/jobs/a4c65cc4-2a9a-41b8-803a-bbff8fda4bf9`,
    { job: { job_workflow_id: WORKFLOW_ID } },
  );

  console.log("\n\nRésultats bruts:");
  for (const [id, data] of Object.entries({ r1, r2, r3, r4 })) {
    if (data?.id) {
      console.log(`${id}: id créé = ${data.id}`);
    }
  }

  // Re-vérifie chaque job créé avec succès
  for (const [label, data] of [
    ["r1", r1],
    ["r2", r2],
    ["r3", r3],
  ]) {
    if (data?.id) {
      await new Promise((r) => setTimeout(r, 1000));
      const { data: job } = await client.get(`/jobs/${data.id}`);
      console.log(
        `\n[${label}] Re-fetch ${job.id}: status=${job.status} job_workflow_id=${job.job_workflow_id} target_id=${job.target_id}`,
      );
    }
  }
  // Re-check r4 (PUT sur job existant)
  await new Promise((r) => setTimeout(r, 1000));
  const { data: jobAfterPut } = await client.get(
    `/jobs/a4c65cc4-2a9a-41b8-803a-bbff8fda4bf9`,
  );
  console.log(
    `\n[r4] Re-fetch après PUT job_workflow_id: status=${jobAfterPut.status} job_workflow_id=${jobAfterPut.job_workflow_id}`,
  );
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
