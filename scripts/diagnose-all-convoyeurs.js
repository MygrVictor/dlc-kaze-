/**
 * Vérifie quels convoyeurs DLC ont un kaze_driver_id qui ne correspond à
 * AUCUN utilisateur réel dans Kaze, et affiche l'état réel des missions
 * ASSIGNEE / EN_COURS côté Kaze (statut + performer).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const db = require("../server/src/db");
const kazeService = require("../server/src/services/kaze.service");

(async () => {
  try {
    await kazeService.authenticate();

    console.log(
      "--- Tous les convoyeurs DLC avec kaze_driver_id + vérif existence Kaze ---",
    );
    const { rows: convoyeurs } = await db.query(
      "SELECT id, full_name, kaze_driver_id FROM users WHERE role = 'convoyeur' AND kaze_driver_id IS NOT NULL",
    );
    const kazeUsersRes = await kazeService.fetchUsers({ perPage: 100 });
    const kazeIds = new Set((kazeUsersRes.data || []).map((u) => u.id));

    for (const c of convoyeurs) {
      const existsInKaze = kazeIds.has(c.kaze_driver_id);
      console.log(
        `${existsInKaze ? "OK" : "MANQUANT"} — ${c.full_name} — kaze_driver_id=${c.kaze_driver_id} — ${existsInKaze ? "existe dans Kaze" : "N'EXISTE PAS dans Kaze !"}`,
      );
    }

    console.log("\n--- Missions ASSIGNEE/EN_COURS avec détail sync ---");
    const { rows: missions } = await db.query(
      `SELECT m.id, m.status, m.kaze_mission_id, m.vehicle_plate, u.full_name, u.kaze_driver_id
       FROM missions m LEFT JOIN users u ON u.id = m.convoyeur_id
       WHERE m.status IN ('ASSIGNEE', 'EN_COURS')`,
    );
    for (const m of missions) {
      console.log(
        `Mission ${m.id} (${m.vehicle_plate}) — statut=${m.status} — kaze_mission_id=${m.kaze_mission_id} — convoyeur=${m.full_name} — kaze_driver_id=${m.kaze_driver_id}`,
      );
      if (m.kaze_mission_id) {
        const job = await kazeService.fetchJob(m.kaze_mission_id);
        console.log(
          `   → Kaze job status=${job.status}, performer=${job.performer ? job.performer.name : "AUCUN"}`,
        );
      }
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
