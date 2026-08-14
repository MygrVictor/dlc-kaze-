/**
 * Cherche un job RÉEL (pas TEST/QA) dont job_workflow_id correspond
 * EXACTEMENT au template CONVOYAGE (16fcd561-f3b8-4a20-9f05-5bd3b7edb279).
 * La comparaison précédente utilisait par erreur un job basé sur un AUTRE
 * template ("ALPHABET CHILLY MAZARIN"), ce qui invalide cette comparaison.
 *
 * Scanne TOUS les statuts (waiting/assigned/started/completed/cancelled)
 * et affiche la répartition des job_workflow_id trouvés.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const CONVOYAGE_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";
const STATUSES = ["waiting", "assigned", "started", "completed", "cancelled"];

(async () => {
  try {
    await kazeService.authenticate();

    const distribution = new Map();
    let convoyageJob = null;

    for (const status of STATUSES) {
      const res = await kazeService.fetchJobs({ status, perPage: 50 });
      console.log(
        `\n--- status=${status}: ${(res.data || []).length} jobs (page 1) ---`,
      );
      for (const s of res.data || []) {
        const job = await kazeService.fetchJob(s.id);
        const key = `${job.job_workflow_id}`;
        distribution.set(key, (distribution.get(key) || 0) + 1);
        if (
          job.job_workflow_id === CONVOYAGE_ID &&
          !convoyageJob &&
          !(job.title || "").toUpperCase().includes("TEST") &&
          !(job.title || "").toUpperCase().includes("QA")
        ) {
          convoyageJob = job;
          console.log(
            `  🎯 TROUVÉ job CONVOYAGE réel: ${job.id} "${job.title}" status=${job.status}`,
          );
        }
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log(
      "Répartition des job_workflow_id (tous statuts, toutes pages 1)",
    );
    console.log("=".repeat(70));
    for (const [id, count] of distribution) {
      console.log(`  ${id}: ${count} jobs`);
    }

    if (convoyageJob) {
      console.log("\n✅ Un job réel utilisant CONVOYAGE existe:");
      console.log(JSON.stringify(convoyageJob, null, 2).slice(0, 500));
    } else {
      console.log(
        "\n❌ AUCUN job réel (non-test) n'utilise le template CONVOYAGE !",
      );
      console.log(
        "   Cela suggère que CONVOYAGE n'a peut-être jamais été utilisé avec succès,",
      );
      console.log(
        "   ou que TOUS les jobs CONVOYAGE existants sont nos propres tests bloqués.",
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
