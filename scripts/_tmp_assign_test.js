const { Pool } = require("pg");

(async () => {
  const pool = new Pool({
    connectionString: "postgresql://arinfo@localhost:5432/dlc_kaze",
  });

  const missionRes = await pool.query(
    "SELECT id, kaze_mission_id FROM missions WHERE kaze_mission_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
  );
  const convoyeurRes = await pool.query(
    "SELECT id FROM users WHERE role='convoyeur' ORDER BY created_at DESC LIMIT 1",
  );
  await pool.end();

  const mission = missionRes.rows[0];
  const convoyeur = convoyeurRes.rows[0];

  if (!mission || !convoyeur) {
    console.log("missing data");
    process.exit(0);
  }

  const missionId = `kaze-${mission.kaze_mission_id}`;

  const loginRes = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@dlc-kaze.fr", password: "admin1234" }),
  });
  const loginData = await loginRes.json();

  console.log("login", loginRes.status);
  if (!loginData.token) {
    console.log(loginData);
    process.exit(1);
  }

  const res = await fetch(
    `http://localhost:4000/api/admin/missions/${missionId}/attribuer-convoyeur`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({ convoyeurId: convoyeur.id }),
    },
  );

  const text = await res.text();
  console.log("assign", res.status);
  console.log(text);
})();
