const DEMO_PLATE_PREFIXES = ["DM-", "DC-", "PD-"];

function isDemoEmail(email) {
  return typeof email === "string" && /@demo\.local$/i.test(email.trim());
}

function isFakeKazeDriverId(id) {
  return typeof id === "string" && /^demo[-_]/i.test(id.trim());
}

function isDemoMissionPayload(mission = {}, clientEmail = null) {
  const plate = String(mission.vehicle_plate || "").toUpperCase();
  const comments = String(mission.comments || "").toUpperCase();
  const email = clientEmail || mission.client_email || null;

  return (
    isDemoEmail(email) ||
    DEMO_PLATE_PREFIXES.some((prefix) => plate.startsWith(prefix)) ||
    comments.startsWith("DEMO-") ||
    comments.startsWith("PROD-DEMO")
  );
}

async function resolveMissionClientEmail(db, mission = {}) {
  if (mission.client_email) return mission.client_email;
  if (!mission.client_id) return null;

  const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [
    mission.client_id,
  ]);
  return rows[0]?.email || null;
}

async function isDemoMission(db, mission = {}) {
  const email = await resolveMissionClientEmail(db, mission);
  return isDemoMissionPayload(mission, email);
}

module.exports = {
  isDemoEmail,
  isFakeKazeDriverId,
  isDemoMissionPayload,
  isDemoMission,
};
