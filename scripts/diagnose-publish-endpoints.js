/**
 * Dernière hypothèse testée : un endpoint dédié pour faire progresser
 * (compléter) la première étape du workflow ("job_info"), ce qui
 * pourrait être ce qui déclenche le passage "initial" -> "waiting" et
 * la fixation de job_workflow_id/target_id/current_step_id.
 *
 * Teste plusieurs patterns d'endpoints REST plausibles.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");
const axios = require("axios");

const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";

const fakeMission = {
  id: "00000000-test-0000-0000-000000000088",
  vehicle_plate: "QA-STEP-88",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  emergency_phone: "0669583430",
};

(async () => {
  try {
    await kazeService.authenticate();
    const created = await kazeService.createMission(fakeMission);
    const jobId = created.id;
    console.log(`Job créé: ${jobId}`);

    // Récupère un token brut pour des essais axios directs (hors withRetry)
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

    const attempts = [
      ["POST", `/jobs/${jobId}/steps/job_info/complete`, {}],
      ["POST", `/jobs/${jobId}/complete_step`, { step_id: "job_info" }],
      ["PUT", `/jobs/${jobId}`, { job: { current_step_id: "job_info" } }],
      [
        "PUT",
        `/jobs/${jobId}`,
        { job: { status: "waiting", current_step_id: "job_info" } },
      ],
      ["POST", `/jobs/${jobId}/publish`, {}],
      ["POST", `/jobs/${jobId}/activate`, {}],
      ["POST", `/jobs/${jobId}/submit`, {}],
      ["POST", `/jobs/${jobId}/confirm`, {}],
      ["PUT", `/jobs/${jobId}/job_info`, { data: {} }],
      ["POST", `/jobs/${jobId}/send`, {}],
    ];

    for (const [method, url, body] of attempts) {
      try {
        const res = await client.request({ method, url, data: body });
        console.log(`\n[${method} ${url}] -> HTTP ${res.status}`);
        console.log(JSON.stringify(res.data)?.slice(0, 300));
      } catch (e) {
        console.log(`\n[${method} ${url}] -> ERREUR ${e.message}`);
      }
    }

    console.log("\n--- État final du job après toutes les tentatives ---");
    const { data: finalJob } = await client.get(`/jobs/${jobId}`);
    console.log(
      `status=${finalJob.status} job_workflow_id=${finalJob.job_workflow_id} current_step_id=${finalJob.current_step_id}`,
    );

    console.log(`\n--- ID créé (nettoyage manuel) : ${jobId} ---`);
    process.exit(0);
  } catch (err) {
    console.error(
      "ERREUR:",
      err.response?.status,
      err.response?.data || err.message,
    );
    process.exit(1);
  }
})();
