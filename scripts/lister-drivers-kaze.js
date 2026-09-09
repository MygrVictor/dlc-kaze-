// Liste les comptes Kaze dont le nom ou l'email contient un motif.
// La recherche par email exacte échoue dès que l'adresse diffère d'un
// caractère entre DLC et Kaze : ce script retrouve la personne par son nom.
//
//   node scripts/lister-drivers-kaze.js portejoie

require("../server/src/lib/charger-env").chargerEnv();
const kazeService = require("../server/src/services/kaze.service");

const motif = (process.argv[2] || "").toLowerCase();

(async () => {
  try {
    const result = await kazeService.fetchUsers();
    const utilisateurs = result.data || [];
    const texte = (u) =>
      `${u.name || ""} ${u.full_name || ""} ${u.first_name || ""} ${u.last_name || ""} ${u.email || ""}`.toLowerCase();

    const retenus = motif
      ? utilisateurs.filter((u) => texte(u).includes(motif))
      : utilisateurs;

    if (retenus.length === 0) {
      console.log(`Aucun compte Kaze ne correspond à « ${motif} ».`);
      console.log(`(${utilisateurs.length} comptes parcourus)`);
      return;
    }
    for (const u of retenus) {
      const nom =
        u.name ||
        u.full_name ||
        `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
        "—";
      console.log(`${u.id}  ${nom}  ${u.email || "—"}`);
    }
  } catch (err) {
    console.error("Échec :", err.message);
    process.exit(1);
  }
})();
