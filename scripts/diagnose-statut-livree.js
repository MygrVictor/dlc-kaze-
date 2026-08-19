/**
 * Pourquoi aucune mission ne passe-t-elle en LIVREE ?
 *
 * Le statut LIVREE n'est jamais posé à la main : il vient de Kaze, par
 * deux chemins indépendants (webhook temps réel, ou polling de secours).
 * Si aucune mission n'atteint ce statut, la cause est forcément l'un des
 * maillons suivants — ce script les remonte dans l'ordre.
 *
 *   node scripts/diagnose-statut-livree.js
 *
 * Le script ne modifie rien.
 */
require("dotenv").config();

const db = require("../server/src/db");
const kazeService = require("../server/src/services/kaze.service");

const SYNC_STATUS_MAP = {
  started: "EN_COURS",
  completed: "LIVREE",
  cancelled: "ANNULEE",
};

const titre = (t) => console.log(`\n\x1b[1m── ${t} ${"─".repeat(58 - t.length)}\x1b[0m`);
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const alerte = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const echec = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

async function main() {
  // ── 1. Ce que contient réellement la base ──────────────────
  titre("Répartition des missions par statut");
  const { rows: repartition } = await db.query(
    `SELECT status,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE kaze_mission_id IS NOT NULL) AS liees
       FROM missions
      GROUP BY status
      ORDER BY total DESC`,
  );

  if (repartition.length === 0) {
    echec("Aucune mission en base — rien à diagnostiquer.");
    return;
  }

  for (const r of repartition) {
    console.log(
      `  ${String(r.total).padStart(5)}  ${r.status.padEnd(24)} dont ${r.liees} liée(s) à Kaze`,
    );
  }

  const livrees = repartition.find((r) => r.status === "LIVREE");
  if (livrees) {
    ok(`${livrees.total} mission(s) en LIVREE : le mécanisme fonctionne.`);
  } else {
    alerte("Aucune mission en LIVREE — on cherche pourquoi ci-dessous.");
  }

  // ── 2. Le lien avec Kaze ───────────────────────────────────
  // Sans kaze_mission_id, ni le webhook ni le polling ne peuvent
  // retrouver la mission : elle est invisible aux deux mécanismes.
  titre("Missions actives non liées à Kaze");
  const { rows: orphelines } = await db.query(
    `SELECT id, reference, status, created_at
       FROM missions
      WHERE kaze_mission_id IS NULL
        AND status NOT IN ('LIVREE', 'ANNULEE', 'EN_ATTENTE_DE_COTATION', 'DEVIS_PROPOSE')
      ORDER BY created_at DESC
      LIMIT 10`,
  );

  if (orphelines.length === 0) {
    ok("Toutes les missions engagées ont un identifiant Kaze.");
  } else {
    echec(
      `${orphelines.length} mission(s) engagée(s) sans kaze_mission_id : ` +
        `elles ne passeront JAMAIS en LIVREE.`,
    );
    for (const m of orphelines) {
      console.log(`      ${m.reference || m.id} — ${m.status}`);
    }
  }

  // ── 3. Configuration du webhook ────────────────────────────
  titre("Webhook Kaze (transition temps réel)");
  if (process.env.KAZE_WEBHOOK_SECRET) {
    ok("KAZE_WEBHOOK_SECRET est défini.");
    console.log(
      "      Vérifiez côté Kaze que l'URL pointe vers /api/webhooks/kaze",
    );
  } else {
    echec(
      "KAZE_WEBHOOK_SECRET absent — en production les webhooks sont REJETÉS.",
    );
  }

  // ── 4. Configuration du polling ────────────────────────────
  titre("Polling de secours");
  const intervalle = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);
  if (intervalle > 0) {
    ok(`Polling interne actif (${Math.round(intervalle / 1000)} s).`);
    alerte(
      "En hébergement mutualisé, Passenger endort le processus : " +
        "le polling interne ne tourne pas de façon fiable.",
    );
  } else {
    alerte(
      "Polling interne désactivé (SYNC_INTERVAL_MS=0). " +
        "La synchronisation dépend donc entièrement du cron scripts/sync-once.js. " +
        "Vérifiez dans cPanel > Tâches Cron qu'il est bien programmé.",
    );
  }

  // ── 5. Ce que Kaze dit vraiment de nos missions ────────────
  // C'est le test décisif : si Kaze annonce « completed » pour des
  // missions que nous croyons encore en cours, la remontée est bien
  // le maillon rompu.
  titre("Confrontation avec les statuts réels chez Kaze");
  const { rows: aVerifier } = await db.query(
    `SELECT id, reference, status, kaze_mission_id
       FROM missions
      WHERE kaze_mission_id IS NOT NULL
        AND status NOT IN ('LIVREE', 'ANNULEE')
      ORDER BY created_at DESC
      LIMIT 25`,
  );

  if (aVerifier.length === 0) {
    ok("Aucune mission en cours liée à Kaze à confronter.");
    return;
  }

  console.log(`  ${aVerifier.length} mission(s) interrogée(s) chez Kaze…\n`);

  let decalages = 0;
  let introuvables = 0;

  for (const m of aVerifier) {
    try {
      const job = await kazeService.fetchJob(m.kaze_mission_id);
      const attendu = SYNC_STATUS_MAP[job.status];
      const nom = m.reference || m.id;

      if (attendu && attendu !== m.status) {
        decalages++;
        echec(
          `${nom} : DLC dit "${m.status}", Kaze dit "${job.status}" → devrait être ${attendu}`,
        );
      } else {
        console.log(`      ${nom} : ${m.status} (Kaze: ${job.status}) — cohérent`);
      }
    } catch (err) {
      introuvables++;
      alerte(
        `${m.reference || m.id} : job Kaze ${m.kaze_mission_id} injoignable (${err.response?.status || err.message})`,
      );
    }
  }

  titre("Conclusion");
  if (decalages > 0) {
    echec(
      `${decalages} mission(s) terminée(s) chez Kaze mais pas chez nous : ` +
        `la remontée de statut ne s'exécute pas.`,
    );
    console.log(
      "\n  Correction immédiate (applique les transitions en attente) :\n" +
        "      node scripts/sync-once.js\n" +
        "\n  Correction durable : programmer ce script en tâche cron " +
        "(toutes les 5 minutes) dans cPanel.",
    );
  } else if (introuvables === aVerifier.length) {
    echec(
      "Aucun job Kaze joignable : identifiants Kaze invalides, " +
        "ou kaze_mission_id ne correspondant pas à des jobs existants.",
    );
  } else {
    ok(
      "Aucun décalage : les missions ne sont simplement pas encore " +
        "terminées côté Kaze.",
    );
  }
}

main()
  .catch((err) => {
    console.error("\n❌ Diagnostic interrompu :", err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool?.end?.());
