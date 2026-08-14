/**
 * Comparaison DÉFINITIVE et EXHAUSTIVE entre :
 *   - Un job RÉEL utilisant VRAIMENT le template CONVOYAGE
 *     (145b4b95-bd43-4980-9991-57e50c6b25e2, status=assigned)
 *   - Un job fraîchement créé via notre vraie createMission()
 *
 * Contrairement aux diffs précédents (scalaires top-level uniquement),
 * ceci fait un diff RÉCURSIF complet, y compris à l'intérieur de
 * `workflow.children[]`, pour détecter toute différence de structure,
 * même profondément imbriquée (ex: un champ présent sur un widget du
 * job réel mais absent sur le nôtre).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const fs = require("fs");
const path = require("path");
const kazeService = require("../server/src/services/kaze.service");

const REAL_CONVOYAGE_JOB_ID = "145b4b95-bd43-4980-9991-57e50c6b25e2";

const fakeMission = {
  id: "00000000-test-0000-0000-000000000077",
  vehicle_plate: "QA-DEEPDIFF-77",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  departure_address: "21 Avenue Léon Jouhaux, 31140 Saint-Alban",
  departure_date: new Date(Date.now() + 86400000).toISOString(),
  arrival_address: "10 Place Bellecour, 69002 Lyon",
  arrival_date: new Date(Date.now() + 2 * 86400000).toISOString(),
  emergency_phone: "0669583430",
};

// Diff récursif générique. Ignore les valeurs de type "contenu variable
// attendu" (dates, titres, adresses, ids générés) en ne signalant que les
// différences de STRUCTURE (clés manquantes/en trop) + les valeurs
// scalaires suspectes (types différents, booleans différents).
function deepStructureDiff(a, b, pathStr = "") {
  const diffs = [];
  if (a === null || b === null) {
    if (a !== b)
      diffs.push(
        `${pathStr}: null-mismatch real=${JSON.stringify(a)} broken=${JSON.stringify(b)}`,
      );
    return diffs;
  }
  if (typeof a !== typeof b) {
    diffs.push(`${pathStr}: type-mismatch real=${typeof a} broken=${typeof b}`);
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(
        `${pathStr}: array-length real=${a.length} broken=${b.length}`,
      );
    }
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      diffs.push(...deepStructureDiff(a[i], b[i], `${pathStr}[${i}]`));
    }
    return diffs;
  }
  if (typeof a === "object") {
    const aKeys = new Set(Object.keys(a));
    const bKeys = new Set(Object.keys(b));
    const onlyA = [...aKeys].filter((k) => !bKeys.has(k));
    const onlyB = [...bKeys].filter((k) => !aKeys.has(k));
    if (onlyA.length)
      diffs.push(`${pathStr}: clés SEULEMENT réel = [${onlyA.join(", ")}]`);
    if (onlyB.length)
      diffs.push(`${pathStr}: clés SEULEMENT broken = [${onlyB.join(", ")}]`);
    for (const k of aKeys) {
      if (bKeys.has(k)) {
        diffs.push(...deepStructureDiff(a[k], b[k], `${pathStr}.${k}`));
      }
    }
    return diffs;
  }
  // Scalaires : on ne signale QUE les différences de type booléen (souvent
  // significatives structurellement) — pas les valeurs de contenu (dates,
  // titres, ids) qui varient légitimement entre 2 jobs différents.
  if (typeof a === "boolean" && a !== b) {
    diffs.push(`${pathStr}: boolean-diff real=${a} broken=${b}`);
  }
  return diffs;
}

(async () => {
  try {
    await kazeService.authenticate();

    console.log(
      `--- Chargement job réel CONVOYAGE ${REAL_CONVOYAGE_JOB_ID} ---`,
    );
    const realJob = await kazeService.fetchJob(REAL_CONVOYAGE_JOB_ID);
    console.log(
      `✅ ${realJob.title} status=${realJob.status} job_workflow_id=${realJob.job_workflow_id}`,
    );
    fs.writeFileSync(
      path.resolve(__dirname, "../real-convoyage-job-dump.json"),
      JSON.stringify(realJob, null, 2),
    );

    console.log(
      "\n--- Création d'un nouveau job via notre vraie createMission() ---",
    );
    const created = await kazeService.createMission(fakeMission);
    const brokenJob = await kazeService.fetchJob(created.id);
    console.log(
      `✅ ${brokenJob.title} status=${brokenJob.status} job_workflow_id=${brokenJob.job_workflow_id}`,
    );
    fs.writeFileSync(
      path.resolve(__dirname, "../broken-job-dump.json"),
      JSON.stringify(brokenJob, null, 2),
    );

    console.log("\n" + "=".repeat(70));
    console.log("DIFF STRUCTUREL RÉCURSIF COMPLET (real vs broken)");
    console.log("=".repeat(70));
    const diffs = deepStructureDiff(realJob, brokenJob);
    if (diffs.length === 0) {
      console.log(
        "Aucune différence structurelle détectée du tout (hors valeurs scalaires non-booléennes) !",
      );
    } else {
      for (const d of diffs) console.log(d);
    }

    console.log(`\n--- IDs (nettoyage manuel requis pour le broken) ---`);
    console.log("real (ne pas toucher):", realJob.id);
    console.log("broken:", brokenJob.id);

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
