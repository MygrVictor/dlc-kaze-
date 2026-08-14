/**
 * Identifie ce qu'est `target_id` (trouvé manquant sur nos jobs créés vs
 * présent = "ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba" / "Drive Line Connect"
 * sur les jobs réels). Cherche parmi /users, décode le JWT courant, et
 * inspecte plusieurs jobs réels pour voir si target_id est toujours la
 * même valeur (constante = compte/société) ou variable (par ex. = client).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const kazeService = require("../server/src/services/kaze.service");

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
}

(async () => {
  try {
    await kazeService.authenticate();

    console.log("--- Jobs réels : valeurs de target_id/target_name ---");
    const assignedRes = await kazeService.fetchJobs({
      status: "assigned",
      perPage: 30,
    });
    const seen = new Map();
    for (const s of assignedRes.data || []) {
      const job = await kazeService.fetchJob(s.id);
      const key = `${job.target_id}::${job.target_name}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(job.title);
    }
    for (const [key, titles] of seen) {
      console.log(
        `  target=${key}  (${titles.length} jobs, ex: ${titles.slice(0, 3).join(", ")})`,
      );
    }

    console.log(
      "\n--- Recherche dans /users d'un match pour target_id/target_name ---",
    );
    const usersRes = await kazeService.fetchUsers();
    const users = usersRes.data || usersRes;
    const list = Array.isArray(users) ? users : users.data || [];
    console.log(`Total users: ${list.length}`);
    for (const u of list) {
      const name =
        `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
        u.name ||
        u.email;
      if (
        u.id === "ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba" ||
        (name && name.toLowerCase().includes("drive line"))
      ) {
        console.log("  MATCH:", JSON.stringify(u, null, 2).slice(0, 1000));
      }
    }
    // Affiche aussi juste la liste complète succincte pour référence
    console.log("\n--- Liste succincte de tous les users ---");
    for (const u of list) {
      const name =
        `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
        u.name ||
        u.email;
      console.log(
        `  id=${u.id}  name=${name}  role=${u.role || u.type || ""}  email=${u.email || ""}`,
      );
    }

    console.log(
      "\n--- Décodage du JWT courant (sub = user id authentifié) ---",
    );
    // On force une ré-authentification pour être sûrs d'avoir un jwtToken frais en mémoire.
    // Comme jwtToken est privé au module, on refait un login brut ici.
    const axios = require("axios");
    const BASE = process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
    const { data } = await axios.post(`${BASE}/login`, {
      user: {
        login: process.env.KAZE_LOGIN,
        password: process.env.KAZE_PASSWORD,
        api_key: process.env.KAZE_API_KEY,
      },
    });
    const decoded = decodeJwtPayload(data.jwt.access_token);
    console.log("JWT payload:", JSON.stringify(decoded, null, 2));
    console.log("Autres clés de la réponse /login:", Object.keys(data));
    console.log(
      "Réponse /login complète (tronquée):",
      JSON.stringify(data, null, 2).slice(0, 1500),
    );

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
