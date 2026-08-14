/**
 * Dump COMPLET (brut, toutes profondeurs) d'un job réel assigné, sauvegardé
 * dans un fichier JSON pour inspection visuelle exhaustive. Contrairement
 * aux scripts précédents qui ne comparaient que les clés top-level
 * scalaires, ceci permet de repérer un éventuel champ objet/array
 * (supervisor_users, watcher_ids, flags cachés...) qui expliquerait
 * pourquoi nos jobs restent bloqués en "initial".
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const fs = require("fs");
const path = require("path");
const kazeService = require("../server/src/services/kaze.service");

(async () => {
  try {
    await kazeService.authenticate();

    const assignedRes = await kazeService.fetchJobs({
      status: "assigned",
      perPage: 30,
    });
    const summary = (assignedRes.data || []).find(
      (s) => !(s.title || "").toUpperCase().includes("TEST"),
    );
    if (!summary) throw new Error("Aucun job réel trouvé");

    const job = await kazeService.fetchJob(summary.id);
    const outPath = path.resolve(__dirname, "../real-job-dump.json");
    fs.writeFileSync(outPath, JSON.stringify(job, null, 2));
    console.log(`✅ Job réel ${job.id} sauvegardé dans ${outPath}`);
    console.log(`Taille: ${fs.statSync(outPath).size} bytes`);
    console.log("\nToutes les clés top-level:");
    console.log(Object.keys(job).sort());

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
