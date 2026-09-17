/**
 * Migration — un compte Kaze ne peut appartenir qu'à un seul convoyeur
 *
 * Le planning d'un convoyeur est bâti à partir de son `kaze_driver_id` :
 * on demande à Kaze « quels jobs sont assignés à ce performer ? ». Si deux
 * comptes DLC portent le même identifiant, les deux convoyeurs voient le
 * même planning — celui d'un collègue, missions d'autrui comprises.
 *
 * Cette migration :
 *   1. délie les doublons en ne conservant la liaison que sur le compte le
 *      plus anciennement créé (le titulaire historique) ;
 *   2. délie les identifiants manifestement invalides (un nom saisi à la
 *      place d'un UUID) : mal formés, ils sont ignorés par l'API Kaze qui
 *      renvoie alors la totalité des jobs du compte ;
 *   3. pose un index unique pour que la situation ne puisse plus se
 *      reproduire, quelle que soit la voie d'écriture.
 *
 * Les comptes déliés ne perdent rien : ils retombent sur leurs missions
 * locales (`missions.convoyeur_id`) et peuvent se relier proprement depuis
 * « Mon profil » ou via l'espace admin.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env"),
});
const db = require("./index");

// Les identifiants de démonstration sont volontairement non-UUID et ne
// partent jamais vers Kaze : on les laisse tranquilles.
const EST_DEMO = "kaze_driver_id LIKE 'demo-%'";
const EST_UUID =
  "kaze_driver_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

const migrate = async () => {
  console.log("Migration — unicité du compte Kaze par convoyeur…");

  // 1. Identifiants mal formés (nom, email, texte libre…).
  const malFormes = await db.query(
    `UPDATE users
        SET kaze_driver_id = NULL, updated_at = NOW()
      WHERE kaze_driver_id IS NOT NULL
        AND NOT (${EST_UUID})
        AND NOT (${EST_DEMO})
      RETURNING email, full_name`,
  );
  for (const u of malFormes.rows) {
    console.log(
      `  · identifiant Kaze invalide délié — ${u.full_name} (${u.email})`,
    );
  }

  // 2. Doublons : on garde le compte créé en premier.
  const doublons = await db.query(
    `WITH classement AS (
       SELECT id, email, full_name, kaze_driver_id,
              ROW_NUMBER() OVER (
                PARTITION BY kaze_driver_id ORDER BY created_at ASC, id ASC
              ) AS rang
         FROM users
        WHERE kaze_driver_id IS NOT NULL
          AND NOT (${EST_DEMO})
     )
     UPDATE users u
        SET kaze_driver_id = NULL, updated_at = NOW()
       FROM classement c
      WHERE u.id = c.id AND c.rang > 1
      RETURNING u.email, u.full_name, c.kaze_driver_id`,
  );
  for (const u of doublons.rows) {
    console.log(
      `  · doublon délié — ${u.full_name} (${u.email}) partageait ${u.kaze_driver_id}`,
    );
  }

  // 3. Garde-fou définitif.
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kaze_driver_unique
      ON users(kaze_driver_id)
      WHERE kaze_driver_id IS NOT NULL;
  `);
  console.log("  · idx_users_kaze_driver_unique");

  console.log(
    `✅ Migration terminée — ${malFormes.rowCount} identifiant(s) invalide(s), ${doublons.rowCount} doublon(s) corrigé(s).`,
  );
};

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Migration échouée :", err.message);
      process.exit(1);
    });
}

module.exports = migrate;
