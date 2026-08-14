/**
 * Compare la structure JSON complète (au niveau top-level "job", PAS le
 * detail du workflow) d'un job réel créé via l'app Kaze (status="waiting")
 * et d'un job créé via notre API (status="initial" bloqué), pour repérer
 * un champ manquant qui empêcherait la publication automatique.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const fakeMission = {
  id: "00000000-test-0000-0000-000000000003",
  vehicle_plate: "QA-TEST-03",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  emergency_phone: "0669583430",
};

function topLevelKeys(job) {
  const out = {};
  for (const [k, v] of Object.entries(job)) {
    if (k === "workflow") {
      out[k] = `[workflow object, ${(v?.children || []).length} children]`;
    } else if (typeof v === "object" && v !== null) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

(async () => {
  let jobId = null;
  try {
    await kazeService.authenticate();

    console.log("--- A. Récupération d'un job réel EXISTANT en 'waiting' ---");
    const waitingRes = await kazeService.fetchJobs({
      status: "waiting",
      perPage: 1,
    });
    const realWaitingSummary = waitingRes.data?.[0];
    if (!realWaitingSummary) {
      console.log("Aucun job 'waiting' trouvé pour comparaison.");
    } else {
      const realJob = await kazeService.fetchJob(realWaitingSummary.id);
      console.log(
        "Job réel (waiting) top-level keys:\n",
        JSON.stringify(topLevelKeys(realJob), null, 2),
      );
    }

    console.log("\n--- B. Création d'un job de test via notre API ---");
    const created = await kazeService.createMission(fakeMission);
    jobId = created.id;
    const ourJob = await kazeService.fetchJob(jobId);
    console.log(
      "Notre job (initial) top-level keys:\n",
      JSON.stringify(topLevelKeys(ourJob), null, 2),
    );
  } catch (err) {
    console.error(
      "ERREUR:",
      err.response?.status,
      err.response?.data || err.message,
    );
  } finally {
    if (jobId) {
      try {
        await kazeService.cancelMission(jobId);
        console.log("\nJob de test supprimé.");
      } catch (e) {
        console.log("\nSuppression échouée (à faire à la main):", jobId);
      }
    }
    process.exit(0);
  }
})();
