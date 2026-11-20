/**
 * Notifications de l'application (Web Push) — Drive Line Connect
 *
 * Complète le salon Telegram : à chaque mission annoncée, les convoyeurs
 * qui ont activé les notifications dans l'application reçoivent une
 * alerte sur leur téléphone. En la touchant, ils arrivent dans
 * l'application, déjà connectés, sur la liste des missions disponibles.
 *
 * Les deux canaux sont indépendants : chacun a son interrupteur admin, et
 * l'échec de l'un n'empêche jamais l'autre.
 *
 * ── Mise en place ──────────────────────────────────────────────
 *   Générer une paire de clés une fois pour toutes :
 *     npx web-push generate-vapid-keys
 *   Variables .env :
 *     VAPID_PUBLIC_KEY   clé publique (transmise aux navigateurs)
 *     VAPID_PRIVATE_KEY  clé privée (ne quitte jamais le serveur)
 *     VAPID_SUBJECT      contact, ex. mailto:contact@drivelineconnect.com
 *   Changer les clés invalide tous les abonnements existants.
 */
const webpush = require("web-push");
const db = require("../db");

const CLE_PUBLIQUE = process.env.VAPID_PUBLIC_KEY;
const CLE_PRIVEE = process.env.VAPID_PRIVATE_KEY;
const SUJET =
  process.env.VAPID_SUBJECT || "mailto:contact@drivelineconnect.com";

let actif = false;
if (CLE_PUBLIQUE && CLE_PRIVEE) {
  try {
    webpush.setVapidDetails(SUJET, CLE_PUBLIQUE, CLE_PRIVEE);
    actif = true;
    console.log("🔔 Notifications de l'application configurées");
  } catch (err) {
    console.error("⚠️ Clés VAPID invalides :", err.message);
  }
} else {
  console.log("🔔 Notifications de l'application non configurées (VAPID)");
}

// ── Interrupteur admin ──────────────────────────────────────────
// Même principe que Telegram : absent ou illisible = actif.
const CLE_REGLAGE = "push_annonces_actives";

async function annoncesActivees() {
  try {
    const { rows } = await db.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [CLE_REGLAGE],
    );
    return rows[0] ? rows[0].value !== "false" : true;
  } catch {
    return true;
  }
}

async function definirAnnoncesActivees(valeur) {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CLE_REGLAGE, valeur ? "true" : "false"],
  );
  return Boolean(valeur);
}

// ── Abonnements ─────────────────────────────────────────────────

/**
 * Vérifie la forme d'un abonnement envoyé par le navigateur. L'endpoint
 * doit être une URL https : c'est le serveur de notifications du
 * navigateur (Google, Apple, Mozilla) que DLC appellera ensuite.
 */
function abonnementValide(abonnement) {
  const endpoint = abonnement?.endpoint;
  const cles = abonnement?.keys;
  if (typeof endpoint !== "string" || endpoint.length > 2000) return false;
  try {
    if (new URL(endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return (
    typeof cles?.p256dh === "string" &&
    typeof cles?.auth === "string" &&
    cles.p256dh.length > 0 &&
    cles.p256dh.length < 200 &&
    cles.auth.length > 0 &&
    cles.auth.length < 100
  );
}

/**
 * Enregistre (ou rattache) un abonnement à un utilisateur. Un même
 * appareil peut changer de compte : l'endpoint est alors réattribué.
 */
async function enregistrerAbonnement(userId, abonnement, userAgent) {
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           updated_at = NOW()`,
    [
      userId,
      abonnement.endpoint,
      abonnement.keys.p256dh,
      abonnement.keys.auth,
      userAgent ? String(userAgent).slice(0, 300) : null,
    ],
  );
}

async function supprimerAbonnement(userId, endpoint) {
  await db.query(
    "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
    [userId, endpoint],
  );
}

// ── Annonce d'une mission ───────────────────────────────────────

/** Garde la ville d'une adresse (« 12 rue X, 49000 Angers » → « Angers »). */
function ville(adresse) {
  const texte = String(adresse || "").trim();
  if (!texte) return "—";
  const morceaux = texte.split(",").map((m) => m.trim()).filter(Boolean);
  // Le dernier morceau est souvent le pays : on le saute s'il n'a pas de
  // chiffre et qu'il en reste un avec un code postal avant lui.
  let dernier = morceaux[morceaux.length - 1];
  if (morceaux.length > 1 && !/\d/.test(dernier)) {
    const avant = morceaux[morceaux.length - 2];
    if (/\d{5}/.test(avant)) dernier = avant;
  }
  return dernier.replace(/^\d{5}\s*/, "") || dernier;
}

/**
 * Contenu de la notification. La plaque et l'adresse précise ne sont pas
 * transmises : une notification s'affiche sur l'écran verrouillé.
 */
function composerNotification(mission, lien) {
  const remuneration = mission.price_convoyeur || mission.price;
  const restitution = Boolean(mission.restitution_retour_address);
  const titre = mission.is_urgent
    ? restitution
      ? "Restitution urgente"
      : "Mission urgente"
    : restitution
      ? "Nouvelle restitution (aller + retour)"
      : "Nouvelle mission disponible";

  const trajet = `${ville(mission.departure_address)} → ${ville(mission.arrival_address)}`;
  const corps = remuneration ? `${trajet} · ${remuneration} €` : trajet;

  return {
    title: titre,
    body: corps,
    url: lien || "/convoyeur/disponibles",
    // Même mission annoncée deux fois (relance) : la notification
    // remplace la précédente au lieu de s'empiler.
    tag: mission.id ? `mission-${mission.id}` : undefined,
  };
}

/**
 * Envoie la notification d'une mission à tous les convoyeurs validés qui
 * l'ont activée. Ne lève jamais : une notification manquée ne doit pas
 * faire échouer l'acceptation d'un devis.
 *
 * @returns {Promise<{envoyees: number, echecs: number}>}
 */
async function annoncerMission(mission, lien) {
  const bilan = { envoyees: 0, echecs: 0 };
  if (!mission || !actif) return bilan;

  // Restitution : comme sur Telegram, seul l'aller est annoncé.
  if (mission.paire_id && Number(mission.ordre_trajet) === 2) return bilan;

  try {
    if (!(await annoncesActivees())) return bilan;

    // L'aller d'une restitution porte la paire : retour et rémunération
    // totale, comme dans l'annonce Telegram.
    if (mission.paire_id) {
      const { rows: retour } = await db.query(
        `SELECT arrival_address, price_convoyeur
           FROM missions
          WHERE paire_id = $1 AND ordre_trajet = 2
          LIMIT 1`,
        [mission.paire_id],
      );
      if (retour[0]) {
        const total =
          Number(mission.price_convoyeur || 0) +
          Number(retour[0].price_convoyeur || 0);
        mission = {
          ...mission,
          restitution_retour_address: retour[0].arrival_address,
          price_convoyeur: total || mission.price_convoyeur,
        };
      }
    }

    const { rows } = await db.query(
      `SELECT ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
        WHERE u.role = 'convoyeur' AND u.is_validated = true`,
    );
    if (rows.length === 0) return bilan;

    const charge = JSON.stringify(composerNotification(mission, lien));

    await Promise.all(
      rows.map(async (abo) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: abo.endpoint,
              keys: { p256dh: abo.p256dh, auth: abo.auth },
            },
            charge,
            // Une mission vieille de 12 h a sans doute été prise : inutile
            // de réveiller un téléphone resté éteint jusque-là.
            { TTL: 12 * 60 * 60, urgency: mission.is_urgent ? "high" : "normal" },
          );
          bilan.envoyees += 1;
        } catch (err) {
          bilan.echecs += 1;
          // 404 / 410 : l'abonnement n'existe plus (appli désinstallée,
          // notifications retirées). On le supprime pour ne plus l'appeler.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await db
              .query("DELETE FROM push_subscriptions WHERE endpoint = $1", [
                abo.endpoint,
              ])
              .catch(() => {});
          } else {
            console.error("⚠️ Notification non envoyée :", err.message);
          }
        }
      }),
    );

    console.log(
      `🔔 Mission annoncée dans l'application : ${bilan.envoyees} envoyée(s), ${bilan.echecs} échec(s)`,
    );
  } catch (err) {
    console.error("⚠️ Erreur lors des notifications :", err.message);
  }

  return bilan;
}

module.exports = {
  get actif() {
    return actif;
  },
  clePublique: () => (actif ? CLE_PUBLIQUE : null),
  annoncesActivees,
  definirAnnoncesActivees,
  abonnementValide,
  enregistrerAbonnement,
  supprimerAbonnement,
  annoncerMission,
  // Exportés pour les tests
  composerNotification,
  ville,
};
