/**
 * Diff COMPLET (toutes les clés top-level + quelques clés imbriquées clés)
 * entre un job RÉELLEMENT créé via l'app Kaze (assigné, donc fonctionnel)
 * et un job fraîchement créé via notre vraie fonction createMission().
 *
 * Objectif : trouver LA différence structurelle qui explique pourquoi nos
 * jobs restent bloqués en status "initial" avec job_workflow_id=null.
 *
 * On exclut explicitement tout job dont le titre contient TEST/QA pour être
 * sûr de comparer avec un job 100% authentique (pas un de nos précédents
 * jobs de diagnostic).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const fakeMission = {
  id: "00000000-test-0000-0000-000000000099",
  vehicle_plate: "QA-DIFF-99",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  emergency_phone: "0669583430",
};

function topLevelDiff(real, broken) {
  const realKeys = new Set(Object.keys(real));
  const brokenKeys = new Set(Object.keys(broken));
  const onlyInReal = [...realKeys].filter((k) => !brokenKeys.has(k));
  const onlyInBroken = [...brokenKeys].filter((k) => !realKeys.has(k));
  const common = [...realKeys].filter((k) => brokenKeys.has(k));

  console.log("\n--- Clés SEULEMENT dans le job RÉEL ---");
  console.log(onlyInReal.length ? onlyInReal : "(aucune)");
  console.log("\n--- Clés SEULEMENT dans notre job (broken) ---");
  console.log(onlyInBroken.length ? onlyInBroken : "(aucune)");

  console.log(
    "\n--- Valeurs différentes sur clés communes (scalaires seulement) ---",
  );
  for (const k of common) {
    const rv = real[k];
    const bv = broken[k];
    const isScalar = (v) => v === null || typeof v !== "object";
    if (isScalar(rv) && isScalar(bv) && rv !== bv) {
      console.log(
        `  ${k}: real=${JSON.stringify(rv)}  |  broken=${JSON.stringify(bv)}`,
      );
    }
  }
}

(async () => {
  try {
    await kazeService.authenticate();

    console.log("--- Recherche d'un job RÉEL (assigné, pas TEST/QA) ---");
    const assignedRes = await kazeService.fetchJobs({
      status: "assigned",
      perPage: 30,
    });
    let realSummary = null;
    for (const s of assignedRes.data || []) {
      const t = (s.title || "").toUpperCase();
      if (!t.includes("TEST") && !t.includes("QA")) {
        realSummary = s;
        break;
      }
    }
    if (!realSummary) {
      console.log(
        "❌ Aucun job réel trouvé (tous filtrés) — tentative avec 'started'…",
      );
      const startedRes = await kazeService.fetchJobs({
        status: "started",
        perPage: 30,
      });
      for (const s of startedRes.data || []) {
        const t = (s.title || "").toUpperCase();
        if (!t.includes("TEST") && !t.includes("QA")) {
          realSummary = s;
          break;
        }
      }
    }
    if (!realSummary)
      throw new Error("Impossible de trouver un job réel de référence");

    const realJob = await kazeService.fetchJob(realSummary.id);
    console.log(
      `✅ Job réel choisi: ${realJob.id} "${realJob.title}" status=${realJob.status} job_workflow_id=${realJob.job_workflow_id}`,
    );

    console.log(
      "\n--- Création d'un nouveau job via notre vraie createMission() ---",
    );
    const created = await kazeService.createMission(fakeMission);
    const brokenJob = await kazeService.fetchJob(created.id);
    console.log(
      `✅ Job créé: ${brokenJob.id} "${brokenJob.title}" status=${brokenJob.status} job_workflow_id=${brokenJob.job_workflow_id}`,
    );

    console.log("\n" + "=".repeat(70));
    console.log("DIFF TOP-LEVEL: real vs broken");
    console.log("=".repeat(70));
    topLevelDiff(realJob, brokenJob);

    // Comparaison spécifique du sous-objet workflow s'il existe
    console.log("\n" + "=".repeat(70));
    console.log("Comparaison specifique 'workflow' (si present)");
    console.log("=".repeat(70));
    console.log("real.workflow ?", realJob.workflow ? "présent" : "absent");
    console.log("broken.workflow ?", brokenJob.workflow ? "présent" : "absent");
    if (realJob.workflow && brokenJob.workflow) {
      topLevelDiff(realJob.workflow, brokenJob.workflow);
    }

    console.log("\n--- IDs pour référence ---");
    console.log("real:", realJob.id);
    console.log("broken (nettoyage manuel requis dans Kaze):", brokenJob.id);

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
