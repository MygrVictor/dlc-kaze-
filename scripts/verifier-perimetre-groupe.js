/**
 * Contrôle du périmètre des comptes rattachés, via l'API réelle.
 *
 * Les tests du serveur simulent la base : ils vérifient la forme des
 * requêtes SQL, pas ce que voit réellement un utilisateur connecté.
 * Ce script comble cet angle mort en passant par l'authentification
 * et les routes HTTP, comme le ferait le navigateur.
 *
 * Usage :  node scripts/verifier-perimetre-groupe.js
 */
const API = process.env.API_URL || "http://localhost:4000/api";
const COMPTES = ["siege", "lyon", "nantes", "lille"];

async function jeton(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Demo2026!" }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return (await r.json()).token;
}

const get = (chemin, token) =>
  fetch(`${API}${chemin}`, { headers: { Authorization: `Bearer ${token}` } });

(async () => {
  const jetons = {};

  console.log("── Périmètre de chaque compte ──");
  for (const c of COMPTES) {
    const email = `${c}@groupe.demo.local`;
    try {
      const token = await jeton(email);
      jetons[c] = token;
      const j = await (
        await get("/missions/mes-missions?limit=50", token)
      ).json();
      const menu = await (await get("/missions/mes-entites", token)).json();
      const entites = [
        ...new Set(
          j.missions.map((m) => m.entite_company || "— (ses propres missions)"),
        ),
      ];
      console.log(
        `${c.padEnd(7)} missions=${String(j.pagination.total).padEnd(3)} ` +
          `menu=${String(menu.entites.length).padEnd(2)} ${entites.join(" | ")}`,
      );
    } catch (e) {
      console.log(`${c.padEnd(7)} ÉCHEC : ${e.message}`);
    }
  }

  console.log("\n── Filtre par entité, depuis le siège ──");
  const menu = await (await get("/missions/mes-entites", jetons.siege)).json();
  for (const ent of menu.entites) {
    const j = await (
      await get(
        `/missions/mes-missions?limit=50&entite=${ent.id}`,
        jetons.siege,
      )
    ).json();
    const ok = j.pagination.total === ent.nb ? "✓" : "✗ INCOHÉRENT";
    console.log(
      `${ok} ${ent.nom.padEnd(34)} menu annonce ${ent.nb}, filtre renvoie ${j.pagination.total}`,
    );
  }

  console.log("\n── Tentative hors périmètre ──");
  // Lyon réclame les missions de Nantes : le filtre ne doit jamais
  // servir de passe-droit entre filiales d'un même groupe.
  const cible = menu.entites.find((x) => x.nom.includes("Nantes"));
  const r = await get(
    `/missions/mes-missions?limit=50&entite=${cible.id}`,
    jetons.lyon,
  );
  console.log(
    r.status === 403
      ? "✓ Lyon → Nantes refusé (403)"
      : `✗ FUITE : Lyon obtient ${r.status} sur les missions de Nantes`,
  );
})();
