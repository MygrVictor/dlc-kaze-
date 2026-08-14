/**
 * Diagnostic ciblé : pourquoi l'assignation du convoyeur "test vico"
 * n'apparaît pas côté Kaze pour la mission d34d2466-fe1e-4608-a3d6-d5021493e9c1
 * (kaze_mission_id = 9ee59e88-03fc-49ee-b957-c210d67563d7,
 *  kaze_driver_id  = 79e92f95-e135-4479-a56f-86e12306fc18).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

const JOB_ID = "9ee59e88-03fc-49ee-b957-c210d67563d7";
const DRIVER_ID = "79e92f95-e135-4479-a56f-86e12306fc18";

(async () => {
  try {
    await kazeService.authenticate();

    console.log("--- 1. Tentative assignDriver ---");
    try {
      const res = await kazeService.assignDriver(JOB_ID, DRIVER_ID);
      console.log("Réponse OK:", JSON.stringify(res, null, 2));
    } catch (e) {
      console.log(
        "Erreur assignDriver:",
        e.response?.status,
        JSON.stringify(e.response?.data),
      );
    }

    console.log("\n--- 2. Recherche user Kaze nom contient vico/test ---");
    const usersRes = await kazeService.fetchUsers({ perPage: 100 });
    const matches = (usersRes.data || []).filter((u) =>
      /vico|test/i.test(u.user_name || ""),
    );
    console.log(
      JSON.stringify(
        matches.map((u) => ({
          id: u.id,
          name: u.user_name,
          email: u.email,
          roles: u.roles,
        })),
        null,
        2,
      ),
    );

    console.log("\n--- 3. Re-fetch job après tentative ---");
    const job = await kazeService.fetchJob(JOB_ID);
    console.log(
      JSON.stringify(
        { id: job.id, status: job.status, performer: job.performer },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(
      "ERREUR GLOBALE:",
      err.response?.status,
      err.response?.data || err.message,
    );
  }
  process.exit(0);
})();
