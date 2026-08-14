/**
 * Deux dernières pistes non testées :
 *
 * A) Utiliser le "token" constant (data.token du /login) comme Bearer au
 *    lieu du JWT (data.jwt.access_token). Hypothèse : le JWT est peut-être
 *    scope "session utilisateur" (app web/mobile) tandis que le token
 *    constant serait le vrai "token d'intégration API" avec plus de droits
 *    (permettant de publier un job directement en "waiting").
 *
 * B) Inclure performer_id + status directement dans le POST /jobs initial
 *    (au lieu d'un PUT séparé après coup) — au cas où Kaze exigerait que
 *    l'assignation soit faite ATOMIQUEMENT à la création pour que le job
 *    sorte de "initial".
 *
 * C) Vérifier /me (ou équivalent) pour voir le scope/permissions du compte.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
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
  return data;
}

function buildWorkflow(template, refJobWorkflow, titleSuffix) {
  // Copie fidèle du workflow d'un vrai job existant (refJobWorkflow) —
  // pattern qui avait déjà donné le résultat le plus "propre" précédemment.
  const workflow = JSON.parse(JSON.stringify(refJobWorkflow));
  const jobInfo = workflow.children.find((c) => c.type === "template_job_info");
  const now = Date.now();
  jobInfo.job_title = `QA-${titleSuffix}`;
  jobInfo.job_reference = `DLC-QA-${titleSuffix}`;
  jobInfo.job_due_date = now + 86400000;
  jobInfo.job_start_date = now + 86400000;
  jobInfo.job_end_date = now + 86400000 + 28800000;
  return workflow;
}

async function main() {
  console.log("🔑 Login…");
  const loginData = await login();
  console.log("Clés de la réponse /login:", Object.keys(loginData));
  console.log(`  token (constant) = ${loginData.token}`);
  console.log(
    `  jwt.access_token = ${loginData.jwt?.access_token?.slice(0, 40)}…`,
  );
  console.log(`  jwt.token_type   = ${loginData.jwt?.token_type}`);

  const WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";

  // Client avec le JWT classique, pour aller chercher un vrai job de référence
  const jwtClient = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${loginData.jwt.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log(
    "\n--- Récupération d'un job CONVOYAGE réel pour copie fidèle du workflow ---",
  );
  const refJobRes = await jwtClient.get(
    "/jobs/145b4b95-bd43-4980-9991-57e50c6b25e2",
  );
  const refWorkflow = refJobRes.data.workflow;
  console.log(`✅ Référence chargée: ${refJobRes.data.title}`);

  // ── TEST A: créer avec le token CONSTANT comme Bearer ──
  console.log("\n" + "=".repeat(70));
  console.log("TEST A — Bearer = token CONSTANT (pas le JWT)");
  console.log("=".repeat(70));
  const constantClient = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });
  const wfA = buildWorkflow(null, refWorkflow, "CONSTTOKEN");
  const resA = await constantClient.post("/jobs", {
    job: { job_workflow_id: WORKFLOW_ID },
    workflow: wfA,
  });
  console.log(`HTTP ${resA.status}`, JSON.stringify(resA.data).slice(0, 300));

  // ── TEST B: essayer aussi le token constant comme header "Token" brut (sans Bearer) ──
  console.log("\n" + "=".repeat(70));
  console.log("TEST B — Header 'Authorization: <token>' SANS 'Bearer'");
  console.log("=".repeat(70));
  const rawTokenClient = axios.create({
    baseURL: BASE,
    headers: {
      Authorization: loginData.token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });
  const wfB = buildWorkflow(null, refWorkflow, "RAWTOKEN");
  const resB = await rawTokenClient.post("/jobs", {
    job: { job_workflow_id: WORKFLOW_ID },
    workflow: wfB,
  });
  console.log(`HTTP ${resB.status}`, JSON.stringify(resB.data).slice(0, 300));

  // ── TEST C: assignation ATOMIQUE dès la création (JWT normal) ──
  console.log("\n" + "=".repeat(70));
  console.log(
    "TEST C — performer_id + status='assigned' DANS le POST initial (JWT)",
  );
  console.log("=".repeat(70));
  const wfC = buildWorkflow(null, refWorkflow, "INLINEASSIGN");
  const resC = await jwtClient.post("/jobs", {
    job: {
      job_workflow_id: WORKFLOW_ID,
      performer_id: TEST_DRIVER_ID,
      status: "assigned",
    },
    workflow: wfC,
  });
  console.log(`HTTP ${resC.status}`, JSON.stringify(resC.data).slice(0, 300));

  // ── TEST D: status="waiting" dès la création (JWT normal) ──
  console.log("\n" + "=".repeat(70));
  console.log("TEST D — status='waiting' DANS le POST initial (JWT)");
  console.log("=".repeat(70));
  const wfD = buildWorkflow(null, refWorkflow, "INLINEWAITING");
  const resD = await jwtClient.post("/jobs", {
    job: { job_workflow_id: WORKFLOW_ID, status: "waiting" },
    workflow: wfD,
  });
  console.log(`HTTP ${resD.status}`, JSON.stringify(resD.data).slice(0, 300));

  // ── Re-fetch tous les jobs créés avec succès pour vérifier l'état réel ──
  console.log("\n" + "=".repeat(70));
  console.log("RE-FETCH — vérification de l'état réel de chaque test");
  console.log("=".repeat(70));
  const created = {
    A: resA.data?.id,
    B: resB.data?.id,
    C: resC.data?.id,
    D: resD.data?.id,
  };
  for (const [label, id] of Object.entries(created)) {
    if (!id) {
      console.log(`[${label}] pas d'id créé — skip`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 800));
    const { data: job } = await jwtClient.get(`/jobs/${id}`);
    console.log(
      `[${label}] id=${id} status=${job.status} job_workflow_id=${job.job_workflow_id} performer=${job.performer?.name || "AUCUN"} target_id=${job.target_id}`,
    );
  }

  console.log("\n--- IDs créés (nettoyage manuel si besoin) ---");
  console.log(JSON.stringify(created, null, 2));

  // ── Vérifie s'il existe un endpoint /me pour voir les scopes/permissions ──
  console.log("\n" + "=".repeat(70));
  console.log("Vérification endpoint /me (scopes/permissions du compte)");
  console.log("=".repeat(70));
  for (const url of ["/me", "/account", "/users/me", "/profile"]) {
    const res = await jwtClient.get(url);
    console.log(
      `GET ${url} -> HTTP ${res.status}`,
      JSON.stringify(res.data)?.slice(0, 300),
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
