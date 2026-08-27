-- ══════════════════════════════════════════════════════════════
-- Migration — lot « site vitrine »
--
-- Version SQL des migrations Node, applicable directement avec psql :
--   psql "$DATABASE_URL" -f server/src/db/sql/vitrine.sql
--
-- Les scripts Node dépendent de `dotenv` et `pg`, or l'arborescence npm
-- d'un hébergement mutualisé n'est pas toujours complète dans le shell
-- où l'on joue une migration. Cette version ne dépend que de psql, déjà
-- présent puisque les sauvegardes utilisent pg_dump.
--
-- Idempotente : rejouable sans effet de bord.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ── Poste du prospect ────────────────────────────────────────
-- Le formulaire « Faites-vous rappeler » demande la fonction occupée :
-- un directeur de flotte et un chef d'atelier n'appellent pas la même
-- réponse commerciale. Stocké à part plutôt que noyé dans `message`,
-- pour rester filtrable.
ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(120);

-- ── Qualification des candidatures convoyeur ─────────────────
-- Le formulaire public laissait passer toutes les candidatures, y
-- compris celles qui ne pouvaient aboutir. On demande désormais ce qui
-- conditionne réellement l'accès aux missions.
DO $$ BEGIN
  CREATE TYPE statut_assurance AS ENUM ('oui', 'en_cours', 'non');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS siret          VARCHAR(14),
  ADD COLUMN IF NOT EXISTS rc_circulation statut_assurance,
  ADD COLUMN IF NOT EXISTS rc_pro         statut_assurance,
  ADD COLUMN IF NOT EXISTS w_garage       BOOLEAN;

-- Le filtre principal porte sur l'assurance : sans index, la liste des
-- candidatures se relit intégralement à chaque tri.
CREATE INDEX IF NOT EXISTS idx_demandes_rc_circ
  ON contact_requests(rc_circulation);

COMMIT;

-- Contrôle : les cinq colonnes doivent apparaître.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'contact_requests'
   AND column_name IN ('job_title', 'siret', 'rc_circulation', 'rc_pro', 'w_garage')
 ORDER BY column_name;
