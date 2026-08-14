/**
 * Diagnostic : inspecte la structure RAW renvoyée par l'API Kaze pour
 * comprendre comment un "performer" (convoyeur) est réellement représenté
 * sur un job assigné, et comparer avec l'ID que nous stockons en local
 * (kaze_driver_id) pour l'assignation.
 *
 * Usage : node scripts/diagnose-kaze-performer.js
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const kazeService = require("../server/src/services/kaze.service");

const short = (obj) => JSON.stringify(obj, null, 2);

(async () => {
  try {
    console.log("=== 1. Authentification ===");
    await kazeService.authenticate();
    console.log("OK\n");

    console.log("=== 2. GET /users (raw, 5 premiers) ===");
    const usersRes = await kazeService.fetchUsers({ perPage: 100 });
    const users = usersRes.data || [];
    console.log(`Total users: ${usersRes.meta?.total_count ?? users.length}`);
    users.slice(0, 5).forEach((u, i) => {
      console.log(`\n--- User #${i} ---`);
      console.log(
        short({
          id: u.id,
          user_name: u.user_name,
          email: u.email,
          roles: u.roles,
          performer: u.performer ? Object.keys(u.performer) : u.performer,
        }),
      );
    });

    console.log("\n=== 3. GET /jobs?status=assigned (raw) ===");
    const assignedRes = await kazeService.fetchJobs({
      status: "assigned",
      perPage: 5,
    });
    const assignedJobs = assignedRes.data || [];
    console.log(
      `Total assigned jobs: ${assignedRes.meta?.total_count ?? assignedJobs.length}`,
    );
    assignedJobs.slice(0, 3).forEach((j, i) => {
      console.log(`\n--- Assigned job #${i} (id=${j.id}) ---`);
      console.log(
        short({
          id: j.id,
          status: j.status,
          performer: j.performer,
          performer_id: j.performer_id,
          supervisor_users: j.supervisor_users,
        }),
      );
    });

    console.log(
      "\n=== 4. GET /jobs?status=started|completed (raw, fallback si aucun assigned) ===",
    );
    for (const st of ["started", "completed"]) {
      const res = await kazeService.fetchJobs({ status: st, perPage: 3 });
      const jobs = res.data || [];
      if (jobs.length > 0) {
        console.log(`\n[${st}] ${jobs.length} job(s) trouvé(s)`);
        jobs.slice(0, 2).forEach((j, i) => {
          console.log(`--- ${st} job #${i} (id=${j.id}) ---`);
          console.log(
            short({
              id: j.id,
              status: j.status,
              performer: j.performer,
              performer_id: j.performer_id,
            }),
          );
        });
      }
    }

    console.log(
      "\n=== 5. Détail complet (fetchJob) du 1er job assigné/démarré trouvé ===",
    );
    const sample =
      assignedJobs[0] ||
      (await kazeService.fetchJobs({ status: "started", perPage: 1 })).data[0];
    if (sample) {
      const full = await kazeService.fetchJob(sample.id);
      console.log(
        short({
          id: full.id,
          status: full.status,
          performer: full.performer,
          performer_id: full.performer_id,
          owner_name: full.owner_name,
          target_name: full.target_name,
          supervisor_users: full.supervisor_users,
          watcher_ids: full.watcher_ids,
        }),
      );
    } else {
      console.log(
        "Aucun job assigné/démarré trouvé pour inspection détaillée.",
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
