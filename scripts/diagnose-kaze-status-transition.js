/**
 * Explore le statut "initial" de Kaze : teste si on peut le faire
 * transitionner vers "waiting" via PUT, et si la création avec un champ
 * `status` explicite dans le payload POST change le comportement.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const TEST_DRIVER_ID = "79e92f95-e135-4479-a56f-86e12306fc18";

const fakeMission = {
  id: "00000000-test-0000-0000-000000000002",
  vehicle_plate: "QA-TEST-02",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  emergency_phone: "0669583430",
};

(async () => {
  let jobId = null;
  try {
    await kazeService.authenticate();

    console.log("--- 1. Création normale (comme avant) ---");
    const created = await kazeService.createMission(fakeMission);
    jobId = created.id;
    let job = await kazeService.fetchJob(jobId);
    console.log(`Job ${jobId} -> statut initial apres creation: ${job.status}`);

    console.log(
      "\n--- 2. Tentative PUT status=waiting (avant assignation) ---",
    );
    try {
      const putRes = await kazeService.updateKazeJob(jobId, {
        status: "waiting",
      });
      console.log("Reponse PUT:", JSON.stringify(putRes));
    } catch (e) {
      console.log(
        "Erreur PUT waiting:",
        e.response?.status,
        JSON.stringify(e.response?.data),
      );
    }
    job = await kazeService.fetchJob(jobId);
    console.log(`Statut apres PUT waiting: ${job.status}`);

    console.log("\n--- 3. Tentative assignDriver apres passage en waiting ---");
    try {
      await kazeService.assignDriver(jobId, TEST_DRIVER_ID);
    } catch (e) {
      console.log(
        "Erreur assignDriver:",
        e.response?.status,
        JSON.stringify(e.response?.data),
      );
    }
    job = await kazeService.fetchJob(jobId);
    console.log(
      `Statut final: ${job.status}, performer: ${job.performer?.name || "AUCUN"}`,
    );
  } catch (err) {
    console.error(
      "ERREUR GLOBALE:",
      err.response?.status,
      err.response?.data || err.message,
    );
  } finally {
    if (jobId) {
      console.log("\n--- Nettoyage ---");
      try {
        await kazeService.cancelMission(jobId);
        console.log("Supprime.");
      } catch (e) {
        console.log(
          "Suppression echouee (a faire a la main):",
          jobId,
          e.response?.status,
        );
      }
    }
    process.exit(0);
  }
})();
