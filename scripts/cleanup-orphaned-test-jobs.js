/**
 * Tentative de nettoyage des jobs de test orphelins créés pendant le
 * diagnostic. DELETE /jobs/:id renvoie 404 (confirmé précédemment), donc
 * on tente ici PUT { job: { status: "cancelled" } } (statut documenté)
 * comme alternative, sur chaque job de test connu.
 *
 * IMPORTANT: n'inclut PAS 9ee59e88-03fc-49ee-b957-c210d67563d7 (mission
 * RÉELLE de production, à ne surtout pas annuler).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const ORPHANED_TEST_JOB_IDS = [
  "79dcda8c-6e31-4437-a39c-0ba8a5c30fc6",
  "9ed868b0-93f2-4acc-9536-c41ba1108df2",
  "9835c32a-79a5-4502-b95a-9c7079eeb5ba",
  "84eb6f02-3084-4d35-b7c0-1307d97a6bff",
  "22c5a3d0-75c5-40d3-a56f-4ee55167e284",
  "a4c65cc4-2a9a-41b8-803a-bbff8fda4bf9",
  "c4e8ea77-e8d3-4a91-8f91-299c13760a8b",
  "46d7beab-c577-4e81-a1ff-452bbbcb20ff",
  "3b9135d8-bdb6-49d7-b0cf-9edaa8090618",
  "26f3fbf3-d859-48bc-be6a-969333ed4dad",
];

(async () => {
  await kazeService.authenticate();
  const results = [];

  for (const jobId of ORPHANED_TEST_JOB_IDS) {
    console.log(`\n--- Job ${jobId} ---`);
    // 1. Vérifie l'état actuel
    let job;
    try {
      job = await kazeService.fetchJob(jobId);
      console.log(`  état actuel: status=${job.status} title="${job.title}"`);
    } catch (e) {
      console.log(`  ⚠️ introuvable (peut-être déjà supprimé) — skip`);
      results.push({ jobId, outcome: "introuvable" });
      continue;
    }

    // 2. Tente DELETE (on sait que ça 404 normalement, mais on revérifie)
    try {
      await kazeService.cancelMission(jobId);
      console.log(`  ✅ DELETE a fonctionné !`);
    } catch (e) {
      console.log(`  ❌ DELETE échoué: ${e.response?.status}`);
    }

    // 3. Tente PUT status=cancelled
    try {
      await kazeService.updateMissionStatus(jobId, "ANNULEE");
      console.log(`  PUT status=cancelled envoyé sans erreur`);
    } catch (e) {
      console.log(
        `  ❌ PUT status=cancelled échoué: ${e.response?.status} ${JSON.stringify(e.response?.data)?.slice(0, 200)}`,
      );
    }

    // 4. Revérifie l'état final
    await new Promise((r) => setTimeout(r, 800));
    try {
      const finalJob = await kazeService.fetchJob(jobId);
      console.log(`  état final: status=${finalJob.status}`);
      results.push({ jobId, before: job.status, after: finalJob.status });
    } catch (e) {
      console.log(`  ✅ Le job a disparu (supprimé avec succès) !`);
      results.push({ jobId, outcome: "supprimé" });
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("RÉSUMÉ");
  console.log("=".repeat(70));
  console.log(JSON.stringify(results, null, 2));

  process.exit(0);
})().catch((e) => {
  console.error(
    "ERREUR FATALE:",
    e.response?.status,
    e.response?.data || e.message,
  );
  process.exit(1);
});
