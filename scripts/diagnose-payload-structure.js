/**
 * Test DÉFINITIF : compare les 2 structures de payload POST /api/jobs
 * trouvées dans l'historique (scripts Python) pour voir laquelle fait
 * réellement persister `job_workflow_id` et sortir le job du statut
 * "initial" bloqué.
 *
 * Structure A ("sibling", utilisée actuellement par kaze.service.js) :
 *   { job: { job_workflow_id }, workflow }
 *
 * Structure B ("nested", trouvée dans test-create-job.py / job2.py) :
 *   { job: { job_workflow_id, workflow } }
 *
 * IMPORTANT : on ne se fie PAS au simple code 200 / présence d'un `id`
 * dans la réponse POST (piège rencontré précédemment). On RE-FETCH
 * chaque job après création pour vérifier son état réel.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const TEST_DRIVER_ID = "79e92f95-e135-4479-a56f-86e12306fc18"; // "test vico"

function buildWorkflow(template, titleSuffix) {
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  const now = Date.now();
  const tomorrow = now + 86400000;

  const jobInfo = workflow.children[0]; // template_job_info
  jobInfo.job_title = `QA-STRUCT-${titleSuffix}`;
  jobInfo.job_reference = `DLC-QA-STRUCT-${titleSuffix}`;
  jobInfo.job_due_date = tomorrow;
  jobInfo.job_start_date = tomorrow;
  jobInfo.job_end_date = tomorrow + 28800000;
  jobInfo.job_address = "21 Avenue Léon Jouhaux, 31140 Saint-Alban";
  jobInfo.job_location = "43.6743,1.5041";
  jobInfo.performer_estimation = 480;

  return workflow;
}

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
  const template = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../kaze-workflow-template.json"),
      "utf-8",
    ),
  );
  const WORKFLOW_ID = template.id;

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

  const results = {};

  // ── Structure A: sibling (actuelle dans kaze.service.js) ──
  console.log("=".repeat(70));
  console.log("STRUCTURE A — workflow SIBLING de job (code actuel)");
  console.log("=".repeat(70));
  try {
    const wfA = buildWorkflow(template, "A-SIBLING");
    const payloadA = {
      job: { job_workflow_id: WORKFLOW_ID },
      workflow: wfA,
    };
    const postA = await client.post("/jobs", payloadA);
    console.log(`POST -> id=${postA.data.id}`);
    results.A = { id: postA.data.id };
  } catch (e) {
    console.log(
      "❌ POST A error:",
      e.response?.status,
      JSON.stringify(e.response?.data)?.slice(0, 500),
    );
  }

  await new Promise((r) => setTimeout(r, 1500));

  // ── Structure B: nested (test-create-job.py / job2.py) ──
  console.log("\n" + "=".repeat(70));
  console.log(
    "STRUCTURE B — workflow NESTED dans job (scripts .py historiques)",
  );
  console.log("=".repeat(70));
  try {
    const wfB = buildWorkflow(template, "B-NESTED");
    const payloadB = {
      job: { job_workflow_id: WORKFLOW_ID, workflow: wfB },
    };
    const postB = await client.post("/jobs", payloadB);
    console.log(`POST -> id=${postB.data.id}`);
    results.B = { id: postB.data.id };
  } catch (e) {
    console.log(
      "❌ POST B error:",
      e.response?.status,
      JSON.stringify(e.response?.data)?.slice(0, 500),
    );
  }

  await new Promise((r) => setTimeout(r, 1500));

  // ── Re-fetch les deux jobs pour vérifier l'état RÉEL ──
  console.log("\n" + "=".repeat(70));
  console.log(
    "RE-FETCH — état réel après création (pas de confiance au 200 OK)",
  );
  console.log("=".repeat(70));

  for (const key of ["A", "B"]) {
    if (!results[key]?.id) {
      console.log(`\n[${key}] pas d'id — création échouée, skip`);
      continue;
    }
    const { data: job } = await client.get(`/jobs/${results[key].id}`);
    console.log(`\n[${key}] Job ${job.id}`);
    console.log(`  title=${job.title}`);
    console.log(`  status=${job.status}`);
    console.log(`  job_workflow_id=${job.job_workflow_id}`);
    console.log(`  performer=${job.performer?.name || "AUCUN"}`);
    results[key].status = job.status;
    results[key].job_workflow_id = job.job_workflow_id;
  }

  // ── Tenter assignDriver sur les jobs valides pour voir si ça prend ──
  console.log("\n" + "=".repeat(70));
  console.log("TEST ASSIGNATION — sur chaque job créé avec succès");
  console.log("=".repeat(70));

  for (const key of ["A", "B"]) {
    if (!results[key]?.id) continue;
    console.log(
      `\n[${key}] assignDriver(${results[key].id}, ${TEST_DRIVER_ID})…`,
    );
    try {
      const putRes = await client.put(`/jobs/${results[key].id}`, {
        job: { performer_id: TEST_DRIVER_ID, status: "assigned" },
      });
      console.log(`  PUT -> status HTTP OK, id retour=${putRes.data?.id}`);
    } catch (e) {
      console.log(
        `  ❌ PUT error:`,
        e.response?.status,
        JSON.stringify(e.response?.data)?.slice(0, 300),
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
    const { data: job2 } = await client.get(`/jobs/${results[key].id}`);
    console.log(
      `  Après assignation -> status=${job2.status} performer=${job2.performer?.name || "AUCUN"} job_workflow_id=${job2.job_workflow_id}`,
    );
    results[key].finalStatus = job2.status;
    results[key].finalPerformer = job2.performer?.name || null;
  }

  // ── Résumé comparatif ──
  console.log("\n" + "=".repeat(70));
  console.log("RÉSUMÉ COMPARATIF");
  console.log("=".repeat(70));
  console.log(JSON.stringify(results, null, 2));

  console.log("\n--- IDs créés (pour nettoyage manuel dans Kaze) ---");
  for (const key of ["A", "B"]) {
    if (results[key]?.id) console.log(`${key}: ${results[key].id}`);
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
