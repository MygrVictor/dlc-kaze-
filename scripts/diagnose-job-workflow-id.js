/**
 * Compare un job RÉEL assigné (créé via l'app Kaze, donc fonctionnel) avec
 * un job créé par notre API, en particulier le champ job_workflow_id qui
 * semble toujours revenir `null` dans nos jobs de test — peut-être la vraie
 * cause du blocage en status "initial".
 *
 * Vérifie aussi l'endpoint correct pour DELETE (cancelMission renvoie 404).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

(async () => {
  try {
    await kazeService.authenticate();

    console.log("--- Jobs assignés réels (créés via l'app Kaze) ---");
    const assignedRes = await kazeService.fetchJobs({
      status: "assigned",
      perPage: 5,
    });
    for (const summary of assignedRes.data || []) {
      const job = await kazeService.fetchJob(summary.id);
      console.log(`\nJob ${job.id} (${job.title})`);
      console.log(`  status=${job.status}`);
      console.log(`  job_workflow_id=${job.job_workflow_id}`);
      console.log(`  performer=${job.performer?.name}`);
      console.log(`  status_name=${job.status_name}`);
    }

    console.log("\n--- Jobs 'waiting' réels (pas nos tests) ---");
    const waitingRes = await kazeService.fetchJobs({
      status: "waiting",
      perPage: 20,
    });
    for (const summary of (waitingRes.data || []).slice(0, 10)) {
      const job = await kazeService.fetchJob(summary.id);
      console.log(
        `Job ${job.id} (${job.title}) status=${job.status} job_workflow_id=${job.job_workflow_id} created_at=${new Date(job.created_at).toISOString()}`,
      );
    }

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
