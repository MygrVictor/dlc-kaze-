/**
 * Test end-to-end du correctif : crée un job Kaze de test avec une vraie
 * adresse (donc géocodée correctement), vérifie qu'il passe bien en statut
 * "waiting" (et non plus "initial"), puis assigne un convoyeur existant et
 * vérifie que l'assignation prend effet réellement (status="assigned" +
 * performer rempli). Supprime le job de test à la fin.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

// Driver de test connu pour exister dans Kaze (cf. diagnostic précédent)
const TEST_DRIVER_ID = "79e92f95-e135-4479-a56f-86e12306fc18";

const fakeMission = {
  id: "00000000-test-0000-0000-000000000001",
  vehicle_plate: "QA-TEST-01",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_vin: "VF1TESTVIN0000001",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  departure_contact_name: "Contact Depart QA",
  departure_contact_phone: "0612345678",
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  arrival_contact_name: "Contact Arrivee QA",
  arrival_contact_phone: "0698765432",
  service_refuel: false,
  emergency_phone: "0669583430",
  comments: "Mission de test QA — correctif géocodage",
};

(async () => {
  let jobId = null;
  try {
    await kazeService.authenticate();

    console.log("--- 1. Création du job de test (avec vraies adresses) ---");
    const created = await kazeService.createMission(fakeMission);
    jobId = created.id;
    console.log("Job créé:", jobId);

    console.log("\n--- 2. Vérification immédiate du statut ---");
    let job = await kazeService.fetchJob(jobId);
    console.log(
      `Statut juste après création: ${job.status} (attendu: "waiting", PAS "initial")`,
    );
    console.log(
      `Adresse job_info location: ${job.raw?.job_location || "(non exposé par kazeJobToLocal, voir raw)"}`,
    );

    console.log("\n--- 3. Assignation du convoyeur de test ---");
    await kazeService.assignDriver(jobId, TEST_DRIVER_ID);

    console.log("\n--- 4. Re-vérification après assignation ---");
    job = await kazeService.fetchJob(jobId);
    console.log(`Statut: ${job.status}`);
    console.log(
      `Performer: ${job.performer ? job.performer.name + " (" + job.performer.id + ")" : "AUCUN — ÉCHEC"}`,
    );

    const success =
      job.status === "assigned" && job.performer?.id === TEST_DRIVER_ID;
    console.log(
      `\n${success ? "✅ SUCCÈS : le correctif résout bien le problème !" : "❌ ÉCHEC : le problème persiste."}`,
    );
  } catch (err) {
    console.error(
      "ERREUR:",
      err.response?.status,
      err.response?.data || err.message,
    );
  } finally {
    if (jobId) {
      console.log("\n--- 5. Nettoyage : suppression du job de test ---");
      try {
        await kazeService.cancelMission(jobId);
        console.log("Job de test supprimé.");
      } catch (cleanupErr) {
        console.error(
          "⚠️ Échec suppression job de test (à supprimer manuellement dans Kaze):",
          jobId,
          cleanupErr.message,
        );
      }
    }
    process.exit(0);
  }
})();
