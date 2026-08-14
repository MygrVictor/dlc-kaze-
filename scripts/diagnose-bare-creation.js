/**
 * Test ULTRA-MINIMAL : POST /jobs avec SEULEMENT job_workflow_id, sans
 * AUCUNE clé `workflow` du tout. Voir ce que Kaze crée par défaut :
 * - Un squelette de workflow copié automatiquement du template ?
 * - job_workflow_id est-il enfin préservé quand on ne fournit PAS `workflow` ?
 * - current_step_id est-il non-null cette fois ?
 *
 * Si CE job bare a aussi job_workflow_id=null -> le problème n'est pas lié
 * au contenu du workflow qu'on envoie, mais à autre chose (endpoint,
 * permissions, ou processus de publication en plusieurs étapes).
 *
 * Si CE job bare a job_workflow_id NON-null -> le problème vient
 * spécifiquement du fait qu'on inclut `workflow` dans le POST initial,
 * et il faudra probablement le remplir via des PUT successifs après coup.
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
  console.log(
    "POST /jobs avec SEULEMENT { job: { job_workflow_id } } — pas de workflow",
  );
  console.log("=".repeat(70));

  let newId;
  try {
    const postRes = await client.post("/jobs", {
      job: { job_workflow_id: WORKFLOW_ID },
    });
    newId = postRes.data.id;
    console.log(`✅ POST -> id=${newId}`);
    console.log("Réponse POST complète:");
    console.log(JSON.stringify(postRes.data, null, 2).slice(0, 2000));
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
  console.log(`first_not_completed_step_id=${job.first_not_completed_step_id}`);
  console.log(`workflow present? ${job.workflow ? "OUI" : "NON"}`);
  if (job.workflow) {
    console.log(`workflow.children.length = ${job.workflow.children?.length}`);
    console.log(
      `workflow.children[0].type = ${job.workflow.children?.[0]?.type}`,
    );
    console.log(
      `workflow.children[0].job_title = ${JSON.stringify(job.workflow.children?.[0]?.job_title)}`,
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
