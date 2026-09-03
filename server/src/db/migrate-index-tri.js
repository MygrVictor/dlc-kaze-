/**
 * Migration — index de tri
 *
 * Toutes les listes de l'application se terminent par `ORDER BY created_at
 * DESC LIMIT n` : missions d'un client, missions filtrées par statut,
 * historique d'un convoyeur, annuaire des comptes, candidatures reçues.
 *
 * Les index existants ne portaient que sur la colonne de filtrage
 * (`client_id`, `status`…). PostgreSQL sait donc restreindre rapidement les
 * lignes, mais doit ensuite les trier intégralement en mémoire avant d'en
 * garder vingt. Tant que les tables sont petites, la différence est
 * invisible ; passé quelques dizaines de milliers de lignes, ce tri devient
 * le poste de dépense principal de chaque affichage.
 *
 * Un index composite (colonne de filtrage, puis `created_at DESC`) restitue
 * les lignes déjà ordonnées : la base lit les vingt premières et s'arrête.
 * Le coût devient indépendant de la taille de la table.
 *
 * Ces index remplacent fonctionnellement les index simples de même
 * préfixe — PostgreSQL sait utiliser un index composite pour un filtre qui
 * ne porte que sur sa première colonne. Les anciens sont néanmoins
 * conservés : les supprimer n'apporterait qu'un gain d'espace marginal,
 * pour un risque inutile sur une base en production.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const migrate = async () => {
  console.log("Migration — index de tri…");

  // Missions d'un client donné, page par page.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_client_date
      ON missions(client_id, created_at DESC);
  `);
  console.log("  · idx_missions_client_date");

  // Tableau d'exploitation filtré par statut.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_status_date
      ON missions(status, created_at DESC);
  `);
  console.log("  · idx_missions_status_date");

  // Historique d'un convoyeur. L'index partiel ignore les missions non
  // encore attribuées, qui forment le gros de la table et n'ont aucune
  // raison d'y figurer.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_convoyeur_date
      ON missions(convoyeur_id, created_at DESC)
      WHERE convoyeur_id IS NOT NULL;
  `);
  console.log("  · idx_missions_convoyeur_date");

  // Vue admin sans filtre de statut : le tri seul doit être couvert.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_missions_date
      ON missions(created_at DESC);
  `);
  console.log("  · idx_missions_date");

  // Annuaire des comptes, filtré ou non par rôle.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_users_role_date
      ON users(role, created_at DESC);
  `);
  console.log("  · idx_users_role_date");

  // Candidatures et demandes de rappel.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_requests_date
      ON contact_requests(created_at DESC);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_requests_status_date
      ON contact_requests(status, created_at DESC);
  `);
  console.log(
    "  · idx_contact_requests_date, idx_contact_requests_status_date",
  );

  // Rattachement des pièces à leur candidature : c'est la sous-requête
  // exécutée pour chaque ligne de la liste des demandes.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_demande_documents_demande
      ON demande_documents(demande_id, created_at);
  `);
  console.log("  · idx_demande_documents_demande");

  // ANALYZE met à jour les statistiques du planificateur : sans cela, il
  // pourrait continuer d'ignorer les index fraîchement créés.
  await db.query("ANALYZE missions;");
  await db.query("ANALYZE users;");
  await db.query("ANALYZE contact_requests;");

  console.log("Migration terminée avec succès.");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("Erreur migration index :", err.message);
  process.exit(1);
});
