/**
 * Service de synchronisation automatique Kaze → DLC Kaze
 *
 * Interroge l'API Kaze à intervalle régulier pour détecter
 * les changements de statut sur les missions liées (qui ont un kaze_mission_id).
 *
 * Seules 2 transitions nous intéressent :
 *   - started  → EN_COURS  (le convoyeur a démarré la mission sur Kaze)
 *   - completed → LIVREE   (le convoyeur a terminé la mission sur Kaze)
 *
 * Ce polling est un complément aux webhooks Kaze qui ne fonctionnent
 * que si le serveur est accessible depuis Internet.
 */

const db = require("../db");
const kazeService = require("./kaze.service");

// Mapping simplifié : on ne gère que démarrage et fin
const SYNC_STATUS_MAP = {
  started: "EN_COURS",
  completed: "LIVREE",
  cancelled: "ANNULEE",
};

/**
 * Au-delà de ce nombre de missions à vérifier, on cesse d'interroger
 * Kaze mission par mission pour récupérer les statuts par pages de 100.
 *
 * Un appel unitaire et un appel groupé coûtent le même temps réseau
 * (~630 ms mesurés). Interroger 500 missions une à une prend donc plus
 * de 5 minutes — davantage que l'intervalle de synchronisation, si bien
 * que les passes finissent par se chevaucher. En groupé, les mêmes 500
 * missions tiennent en quelques secondes.
 *
 * Le seuil est bas car le point d'équilibre se situe vers 3 missions ;
 * en deçà, l'unitaire évite de rapatrier des pages entières pour rien.
 */
const SEUIL_RECUPERATION_GROUPEE = 5;

/** Statuts Kaze qui déclenchent une transition côté DLC. */
const STATUTS_SUIVIS = Object.keys(SYNC_STATUS_MAP);

let syncInterval = null;
let isSyncing = false;

/**
 * Construit un index { identifiant Kaze → statut } en récupérant les
 * missions par pages, plutôt qu'une par une.
 *
 * On ne demande que les statuts porteurs d'une transition : inutile de
 * rapatrier les missions encore en attente, elles ne changeraient rien.
 *
 * @returns {Promise<Map<string, string>>}
 */
async function indexerStatutsKaze() {
  const index = new Map();

  for (const statut of STATUTS_SUIVIS) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const resultat = await kazeService.fetchJobs({
        status: statut,
        page,
        perPage: 100,
      });

      for (const job of resultat.data || []) {
        if (job?.id) index.set(job.id, job.status || statut);
      }

      totalPages = resultat.meta?.total_pages || 1;
      page++;
    }
  }

  return index;
}

/**
 * Applique les transitions détectées, en groupant les écritures par
 * statut cible : au plus une requête SQL par statut, quel que soit le
 * nombre de missions concernées.
 *
 * @param {Array<{id: string, statut: string}>} transitions
 * @returns {Promise<number>} nombre de missions mises à jour
 */
async function appliquerTransitions(transitions) {
  if (transitions.length === 0) return 0;

  const parStatut = new Map();
  for (const { id, statut } of transitions) {
    if (!parStatut.has(statut)) parStatut.set(statut, []);
    parStatut.get(statut).push(id);
  }

  let total = 0;
  for (const [statut, identifiants] of parStatut) {
    // On ne touche pas à updated_at : la date Kaze n'est pas fiable.
    await db.query(`UPDATE missions SET status = $1 WHERE id = ANY($2)`, [
      statut,
      identifiants,
    ]);
    total += identifiants.length;
  }

  return total;
}

// Clé arbitraire mais stable du verrou consultatif PostgreSQL. `isSyncing`
// ne protège que le processus courant : le serveur web et le cron
// `sync-once.js` sont deux processus distincts qui écriraient les mêmes
// lignes. Le verrou, lui, est partagé par toute la base.
const VERROU_SYNC = 4_073_219_001;

/**
 * Exécute `travail` seulement si aucune autre synchronisation ne tourne,
 * tous processus confondus. Retourne `false` si le verrou est déjà pris.
 *
 * Le verrou est de portée transactionnelle : PostgreSQL le relâche à la
 * fin de la transaction, y compris si le processus meurt en cours de
 * route. Aucun risque de verrou orphelin.
 */
async function avecVerrouSync(travail) {
  // Les tests unitaires ne simulent que `db.query` ; sans transaction
  // disponible, on retombe sur la seule protection intra-processus.
  if (typeof db.transaction !== "function") {
    await travail();
    return true;
  }

  return db.transaction(async (client) => {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_xact_lock($1) AS obtenu",
      [VERROU_SYNC],
    );

    if (!rows[0]?.obtenu) {
      console.log(
        "ℹ️  Sync Kaze: une autre synchronisation est déjà en cours — passe ignorée.",
      );
      return false;
    }

    await travail();
    return true;
  });
}

/**
 * Synchronise les statuts Kaze → DLC pour toutes les missions liées.
 */
async function syncKazeStatuses() {
  if (isSyncing) return; // Éviter les exécutions parallèles
  isSyncing = true;

  try {
    await avecVerrouSync(syncKazeStatusesInterne);
  } catch (err) {
    console.error("❌ Erreur sync Kaze:", err.message);
  } finally {
    isSyncing = false;
  }
}

async function syncKazeStatusesInterne() {
  try {
    // 1. Récupérer toutes les missions DLC qui ont un kaze_mission_id
    //    et qui ne sont pas déjà terminées (LIVREE, ANNULEE)
    const { rows: linkedMissions } = await db.query(
      `SELECT id, kaze_mission_id, status 
       FROM missions 
       WHERE kaze_mission_id IS NOT NULL 
         AND status NOT IN ('LIVREE', 'ANNULEE')`,
    );

    if (linkedMissions.length === 0) {
      console.log(
        "ℹ️  Sync Kaze: aucune mission liée en cours — rien à synchroniser.",
      );
      return;
    }

    // 2. Au-delà du seuil, un balayage groupé remplace les appels
    //    unitaires. En cas d'échec, on retombe sur l'unitaire plutôt
    //    que de sauter entièrement la synchronisation.
    if (linkedMissions.length > SEUIL_RECUPERATION_GROUPEE) {
      try {
        const index = await indexerStatutsKaze();
        const transitions = [];

        for (const mission of linkedMissions) {
          const statutKaze = index.get(mission.kaze_mission_id);
          if (!statutKaze) continue; // Statut sans transition, ou job absent

          const statutLocal = SYNC_STATUS_MAP[statutKaze];
          if (statutLocal && statutLocal !== mission.status) {
            transitions.push({ id: mission.id, statut: statutLocal });
          }
        }

        const misesAJour = await appliquerTransitions(transitions);

        if (misesAJour > 0) {
          console.log(
            `✅ Sync Kaze terminée: ${misesAJour} mission(s) mise(s) à jour sur ${linkedMissions.length} vérifiée(s)`,
          );
        }
        return;
      } catch (err) {
        console.warn(
          `⚠️  Sync groupée indisponible (${err.message}) — bascule en mode unitaire.`,
        );
      }
    }

    let updated = 0;
    let echecs = 0;

    console.log(
      `🔎 Sync Kaze: ${linkedMissions.length} mission(s) liée(s) à vérifier (mode unitaire).`,
    );

    // 2. Pour chaque mission liée, vérifier le statut côté Kaze
    for (const mission of linkedMissions) {
      try {
        const kazeJob = await kazeService.fetchJob(mission.kaze_mission_id);
        const kazeStatus = kazeJob.status;
        const newLocalStatus = SYNC_STATUS_MAP[kazeStatus];

        // Si le statut Kaze correspond à une transition valide et est différent du statut actuel
        if (newLocalStatus && newLocalStatus !== mission.status) {
          // Ne pas toucher à updated_at — on n'a pas la vraie date Kaze fiable
          await db.query(`UPDATE missions SET status = $1 WHERE id = $2`, [
            newLocalStatus,
            mission.id,
          ]);
          updated++;
          console.log(
            `🔄 Sync Kaze: mission ${mission.id} → ${newLocalStatus} (Kaze: ${kazeStatus})`,
          );
        } else {
          // Tracer aussi l'inaction : une passe qui ne dit rien est
          // indiscernable d'une passe qui n'a pas tourné.
          console.log(
            `   ${mission.id} : ${mission.status} (Kaze: ${kazeStatus}) — inchangé`,
          );
        }
      } catch (err) {
        echecs++;
        // Toute erreur était auparavant tue « pour éviter le spam », si
        // bien qu'une synchronisation entièrement en échec se terminait
        // par un ✅ trompeur. Le volume de missions ne justifie pas ce
        // silence : mieux vaut un log de trop qu'une panne invisible.
        console.warn(
          `⚠️  Sync: mission ${mission.id} (job ${mission.kaze_mission_id}) — ${
            err.response?.status === 404 ? "job introuvable (404)" : err.message
          }`,
        );
      }
    }

    if (echecs > 0) {
      console.warn(
        `⚠️  Sync Kaze: ${echecs} mission(s) non vérifiée(s) sur ${linkedMissions.length}.`,
      );
    }

    if (updated > 0) {
      console.log(
        `✅ Sync Kaze terminée: ${updated} mission(s) mise(s) à jour sur ${linkedMissions.length} vérifiée(s)`,
      );
    }
  } catch (err) {
    console.error("❌ Erreur sync Kaze:", err.message);
  }
}

/**
 * S'assure qu'une mission DLC existe bien côté Kaze.
 *
 * Si `mission.kaze_mission_id` est déjà renseigné, le retourne tel quel.
 * Sinon, tente de créer le job correspondant dans Kaze et persiste
 * l'identifiant obtenu en base.
 *
 * Sert de filet de rattrapage : la création Kaze a normalement lieu quand
 * le client accepte le devis (mission.routes.js `/:id/accepter`). Si cet
 * appel échoue silencieusement (Kaze indisponible, erreur réseau…), la
 * mission reste bloquée sans kaze_mission_id — et toute action ultérieure
 * du convoyeur (prise, démarrage, livraison) n'a alors aucun effet côté
 * Kaze, même si tout se passe normalement côté DLC. Appeler cette fonction
 * avant chaque synchronisation permet de rattraper ce cas.
 *
 * @param {Object} mission - Ligne de la table `missions`
 * @returns {Promise<string|null>} kaze_mission_id (existant ou nouveau), ou null si la création échoue
 */
async function ensureKazeMission(mission) {
  if (mission.kaze_mission_id) return mission.kaze_mission_id;

  try {
    const kazeResponse = await kazeService.createMission(mission);
    const kazeMissionId = kazeResponse.id || kazeResponse.mission_id;
    if (!kazeMissionId) {
      console.error(
        `⚠️ Sync Kaze : réponse de création sans ID pour la mission ${mission.id}`,
      );
      return null;
    }

    await db.query(
      `UPDATE missions SET kaze_mission_id = $1, updated_at = NOW() WHERE id = $2`,
      [kazeMissionId, mission.id],
    );
    console.log(
      `✅ Sync Kaze (rattrapage) : mission ${mission.id} créée → Kaze ${kazeMissionId}`,
    );
    return kazeMissionId;
  } catch (err) {
    console.error(
      `⚠️ Sync Kaze (rattrapage) : échec création de la mission ${mission.id} :`,
      err.message,
    );
    return null;
  }
}

/**
 * Démarre le polling automatique.
 * @param {number} intervalMs - Intervalle en ms (défaut: 60 secondes)
 */
function startSync(intervalMs = 60_000) {
  // Ne pas démarrer si Kaze n'est pas configuré
  if (!process.env.KAZE_LOGIN || !process.env.KAZE_PASSWORD) {
    console.log("⏸️  Sync Kaze désactivée (identifiants Kaze non configurés)");
    return;
  }

  // Première sync après 10 secondes (laisser le serveur démarrer)
  setTimeout(() => {
    syncKazeStatuses();
  }, 10_000);

  // Puis à intervalle régulier
  syncInterval = setInterval(syncKazeStatuses, intervalMs);

  const intervalSec = Math.round(intervalMs / 1000);
  console.log(
    `🔄 Sync Kaze activée — polling toutes les ${intervalSec}s pour les missions liées`,
  );
}

/**
 * Arrête le polling.
 */
function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("⏹️  Sync Kaze arrêtée");
  }
}

module.exports = {
  syncKazeStatuses,
  startSync,
  stopSync,
  ensureKazeMission,
};
