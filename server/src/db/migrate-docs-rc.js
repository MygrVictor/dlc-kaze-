/**
 * Migration — Ajoute les responsabilités civiles aux documents convoyeurs.
 *
 *  Nouveaux types :
 *    - rc_circulation : RC circulation, qui couvre le véhicule confié pendant
 *                       le convoyage. C'est la garantie que le donneur d'ordre
 *                       réclame en premier.
 *    - rc_pro         : RC professionnelle, qui couvre les dommages causés à
 *                       des tiers dans l'exercice de l'activité.
 *
 *  Le type doc_type existe déjà en production : on ne peut donc pas le
 *  recréer, il faut lui ajouter des valeurs. ALTER TYPE ... ADD VALUE refuse
 *  de s'exécuter dans une transaction, d'où des requêtes séparées plutôt
 *  qu'un bloc unique. IF NOT EXISTS rend la migration rejouable sans erreur.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

const NOUVEAUX_TYPES = ["rc_circulation", "rc_pro"];

const migrate = async () => {
  console.log("Migration — responsabilités civiles convoyeurs…");

  for (const type of NOUVEAUX_TYPES) {
    await db.query(`ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '${type}'`);
    console.log(`  · doc_type accepte désormais « ${type} »`);
  }

  const { rows } = await db.query(
    `SELECT unnest(enum_range(NULL::doc_type))::text AS type`,
  );
  console.log(
    "Types de documents disponibles :",
    rows.map((r) => r.type).join(", "),
  );
  console.log("Migration terminée avec succès.");
};

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Échec de la migration :", err.message);
    process.exit(1);
  });
