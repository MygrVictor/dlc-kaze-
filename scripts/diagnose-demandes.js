/**
 * Pourquoi une demande de contact n'arrive-t-elle pas ?
 *
 * Le formulaire public écrit dans `contact_requests`, table créée par une
 * migration distincte. Si cette migration n'a jamais été jouée, l'envoi
 * échoue en 500 et l'espace d'administration reste vide — sans que rien
 * ne le signale ailleurs que dans les logs.
 *
 *   node scripts/diagnose-demandes.js
 *
 * Le script ne modifie rien.
 */
require("dotenv").config();

const db = require("../server/src/db");

const titre = (t) =>
  console.log(
    `\n\x1b[1m── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}\x1b[0m`,
  );
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const echec = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

async function main() {
  titre("Table contact_requests");

  const { rows: existe } = await db.query(
    `SELECT to_regclass('public.contact_requests') AS table_presente`,
  );

  if (!existe[0].table_presente) {
    echec("La table contact_requests n'existe pas.");
    console.log(
      "\n  C'est la cause : le formulaire renvoie une erreur 500 et rien\n" +
        "  n'est enregistré. Créez-la :\n\n" +
        "      node server/src/db/migrate-demandes.js\n",
    );
    return;
  }

  ok("La table existe.");

  titre("Demandes enregistrées");
  const { rows } = await db.query(
    `SELECT id, type, first_name, last_name, company, email, phone,
            status, created_at
       FROM contact_requests
      ORDER BY created_at DESC
      LIMIT 10`,
  );

  if (rows.length === 0) {
    echec("Aucune demande en base.");
    console.log(
      "\n  La table est prête mais rien n'y arrive : l'envoi échoue avant\n" +
        "  l'écriture. Regardez les logs pendant un essai :\n\n" +
        "      tail -f ~/logs/dlc-kaze.log\n",
    );
    return;
  }

  ok(`${rows.length} demande(s) trouvée(s) :`);
  for (const d of rows) {
    const qui =
      [d.first_name, d.last_name].filter(Boolean).join(" ") ||
      d.company ||
      "(sans nom)";
    console.log(
      `      ${new Date(d.created_at).toLocaleString("fr-FR")}  ` +
        `${d.type.padEnd(9)} ${qui} — ${d.email || d.phone || "sans contact"} [${d.status}]`,
    );
  }

  console.log(
    "\n  Ces demandes doivent apparaître dans Admin → Demandes.\n" +
      "  Si l'écran reste vide alors qu'elles figurent ci-dessus, le\n" +
      "  problème est côté affichage, pas côté enregistrement.",
  );
}

main()
  .catch((err) => {
    console.error("\n❌ Diagnostic interrompu :", err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool?.end?.());
