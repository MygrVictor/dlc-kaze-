/**
 * TEST DÉCISIF : crée un job en ajoutant `target_id` (constant Kaze pour
 * le compte "Drive Line Connect" : ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba)
 * dans le payload `job`, en plus de `job_workflow_id`. Vérifie si le job
 * sort enfin du statut "initial" et si job_workflow_id persiste.
 *
 * Structure testée :
 *   { job: { job_workflow_id, target_id }, workflow }
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const TARGET_ID = "ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba"; // "Drive Line Connect"
const TEST_DRIVER_ID = "79e92f95-e135-4479-a56f-86e12306fc18"; // "test vico"

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

  // Charge le workflow COMPLET d'un job réel existant pour être sûr que
  // TOUS les champs requis (navigation, adresses...) sont bien remplis,
  // en ne modifiant que job_info (titre/ref/dates) pour identifier ce test.
  console.log(
    "--- Récupération du workflow d'un vrai job pour copie fidèle ---",
  );
  const assignedRes = await client.get("/jobs", {
    params: { status: "assigned", per_page: 5 },
  });
  const refSummary = assignedRes.data.data.find(
    (j) => !(j.title || "").toUpperCase().includes("TEST"),
  );
  const refJob = await client.get(`/jobs/${refSummary.id}`);
  const workflow = JSON.parse(JSON.stringify(refJob.data.workflow));

  // Modifie juste job_info pour un titre de test identifiable
  const jobInfo = workflow.children.find((c) => c.type === "template_job_info");
  const now = Date.now();
  jobInfo.job_title = "QA-TARGETID-TEST";
  jobInfo.job_reference = "DLC-QA-TARGETID";
  jobInfo.job_due_date = now + 86400000;
  jobInfo.job_start_date = now + 86400000;
  jobInfo.job_end_date = now + 86400000 + 28800000;

  console.log("\n" + "=".repeat(70));
  console.log("POST avec target_id ajouté");
  console.log("=".repeat(70));
  const payload = {
    job: { job_workflow_id: WORKFLOW_ID, target_id: TARGET_ID },
    workflow,
  };
  let newId;
  try {
    const postRes = await client.post("/jobs", payload);
    newId = postRes.data.id;
    console.log(`✅ POST -> id=${newId}`);
  } catch (e) {
    console.log(
      "❌ POST error:",
      e.response?.status,
      JSON.stringify(e.response?.data)?.slice(0, 800),
    );
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n--- Re-fetch pour vérifier l'état réel ---");
  const { data: job } = await client.get(`/jobs/${newId}`);
  console.log(`id=${job.id}`);
  console.log(`title=${job.title}`);
  console.log(`status=${job.status}  (status_name=${job.status_name})`);
  console.log(`job_workflow_id=${job.job_workflow_id}`);
  console.log(`target_id=${job.target_id}  target_name=${job.target_name}`);
  console.log(`current_step_id=${job.current_step_id}`);
  console.log(`performer=${job.performer?.name || "AUCUN"}`);

  if (job.status !== "initial" && job.job_workflow_id) {
    console.log(
      "\n🎉 GAGNÉ ! Le job n'est PLUS bloqué en 'initial' — target_id était bien la clé manquante !",
    );

    console.log("\n--- Test assignation du convoyeur test vico ---");
    await client.put(`/jobs/${newId}`, {
      job: { performer_id: TEST_DRIVER_ID, status: "assigned" },
    });
    await new Promise((r) => setTimeout(r, 1500));
    const { data: job2 } = await client.get(`/jobs/${newId}`);
    console.log(
      `Après assignation -> status=${job2.status} performer=${job2.performer?.name || "AUCUN"}`,
    );
  } else {
    console.log(
      "\n❌ Toujours bloqué en 'initial' malgré target_id. Il faut chercher autre chose.",
    );
  }

  console.log(`\n--- ID créé (nettoyage manuel si besoin) : ${newId} ---`);
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
