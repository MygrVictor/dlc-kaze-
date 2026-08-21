/**
 * Missions en double : même véhicule, plusieurs enregistrements.
 *
 * Une mission créée deux fois pointe vers deux jobs Kaze distincts.
 * Le convoyeur n'en termine qu'un ; l'autre reste éternellement
 * « assigned » et pollue les tableaux de bord.
 *
 *   node scripts/diagnose-doublons.js
 *
 * Le script ne modifie rien.
 */
require("dotenv").config();

const db = require("../server/src/db");

const titre = (t) =>
  console.log(
    `\n\x1b[1m── ${t} ${"─".repeat(Math.max(2, 58 - t.length))}\x1b[0m`,
  );

async function main() {
  titre("Toutes les missions");
  const { rows } = await db.query(
    `SELECT id, vehicle_plate, status, kaze_mission_id,
            departure_address, arrival_address,
            client_id, created_at
       FROM missions
      ORDER BY vehicle_plate, created_at`,
  );

  for (const m of rows) {
    console.log(
      `  ${m.id.substring(0, 8)}  ${(m.vehicle_plate || "—").padEnd(12)} ` +
        `${m.status.padEnd(16)} kaze=${m.kaze_mission_id || "aucun"}`,
    );
    console.log(
      `            créée le ${new Date(m.created_at).toLocaleString("fr-FR")}`,
    );
  }

  titre("Regroupement par plaque");
  const { rows: groupes } = await db.query(
    `SELECT vehicle_plate, COUNT(*) AS total,
            array_agg(status) AS statuts,
            array_agg(kaze_mission_id) AS jobs_kaze
       FROM missions
      WHERE vehicle_plate IS NOT NULL
      GROUP BY vehicle_plate
     HAVING COUNT(*) > 1`,
  );

  if (groupes.length === 0) {
    console.log("  Aucun doublon de plaque.");
  } else {
    for (const g of groupes) {
      console.log(
        `  \x1b[33m!\x1b[0m ${g.vehicle_plate} : ${g.total} missions ` +
          `[${g.statuts.join(", ")}]`,
      );
      console.log(`      jobs Kaze : ${g.jobs_kaze.join(", ")}`);
    }
  }

  await db.pool.end();
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
