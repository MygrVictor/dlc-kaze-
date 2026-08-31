/**
 * Service d'alerte — Drive Line Connect
 *
 * Prévient l'exploitant sur Telegram dès qu'une erreur anormale survient,
 * pour qu'il n'apprenne plus les pannes par ses clients.
 *
 * ── Ce qui est alerté ─────────────────────────────────────────
 * Uniquement les défaillances *du serveur* : erreurs 500 non rattrapées,
 * échecs d'appel à Kaze, échecs d'envoi d'email, échecs de synchronisation.
 * Les 400/401/403/404 ne sont PAS alertés : un mot de passe erroné ou une
 * URL inconnue est un événement normal, l'alerter noierait les vrais
 * incidents dans le bruit.
 *
 * ── Le salon est distinct de celui des missions ───────────────
 * TELEGRAM_ALERTES_CHAT_ID pointe vers un salon privé à l'équipe DLC.
 * Sans cette variable, les alertes restent en console : jamais de repli
 * sur le salon des convoyeurs, qui n'ont pas à lire les traces techniques.
 *
 * ── Étouffoir ─────────────────────────────────────────────────
 * Une panne de base de données produit une erreur *par requête*. Sans
 * garde-fou, Telegram recevrait des centaines de messages en une minute
 * et finirait par limiter le bot. Chaque erreur est donc réduite à une
 * empreinte (route + message) ; une empreinte déjà signalée est comptée
 * en silence pendant 15 minutes, et le total est rappelé à la prochaine
 * alerte. Le signal passe, le flot est retenu.
 *
 * Variables .env :
 *   TELEGRAM_BOT_TOKEN        Jeton du bot (partagé avec les annonces)
 *   TELEGRAM_ALERTES_CHAT_ID  Salon privé de supervision
 */
const axios = require("axios");
const { echapper } = require("./telegram.service");

const JETON = process.env.TELEGRAM_BOT_TOKEN;
const SALON = process.env.TELEGRAM_ALERTES_CHAT_ID;

const actif = Boolean(JETON && SALON);

/** Durée pendant laquelle une même erreur n'est plus re-signalée. */
const FENETRE_ETOUFFOIR_MS = 15 * 60 * 1000;

/** Plafond d'empreintes mémorisées, pour borner l'occupation mémoire. */
const MAX_EMPREINTES = 200;

/** empreinte → { derniereAlerte: number, occurrences: number } */
const journal = new Map();

if (actif) {
  console.log(`🚨 Alertes Telegram configurées (salon ${SALON})`);
} else {
  console.log("🚨 Alertes en mode console (TELEGRAM_ALERTES_CHAT_ID absent)");
}

/**
 * Réduit une erreur à une empreinte stable.
 *
 * Les identifiants et nombres sont neutralisés : « mission 4127 introuvable »
 * et « mission 9033 introuvable » sont le même incident et ne doivent pas
 * échapper à l'étouffoir.
 */
function empreinter(contexte, message) {
  const normalise = String(message ?? "")
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "#") // UUID
    .replace(/\d+/g, "#")
    .slice(0, 120);
  return `${contexte}|${normalise}`;
}

/**
 * Décide si l'alerte doit partir, et avec quel compteur.
 *
 * @returns {{envoyer: boolean, occurrences: number}}
 */
function consulterEtouffoir(empreinte, maintenant = Date.now()) {
  const entree = journal.get(empreinte);

  if (entree && maintenant - entree.derniereAlerte < FENETRE_ETOUFFOIR_MS) {
    entree.occurrences += 1;
    return { envoyer: false, occurrences: entree.occurrences };
  }

  // Purge paresseuse : au moment d'insérer, on évacue les empreintes
  // dont la fenêtre est écoulée plutôt que d'entretenir un minuteur.
  if (journal.size >= MAX_EMPREINTES) {
    for (const [cle, valeur] of journal) {
      if (maintenant - valeur.derniereAlerte >= FENETRE_ETOUFFOIR_MS) {
        journal.delete(cle);
      }
    }
  }

  const occurrences = entree ? entree.occurrences + 1 : 1;
  journal.set(empreinte, { derniereAlerte: maintenant, occurrences: 0 });
  return { envoyer: true, occurrences };
}

/**
 * Compose le message d'alerte au format MarkdownV2.
 */
function composerAlerte({ contexte, message, detail, occurrences }) {
  const lignes = [
    "🚨 *Erreur DLC*",
    "",
    `*Où* : ${echapper(contexte)}`,
    `*Quoi* : ${echapper(message)}`,
  ];

  if (detail) lignes.push(`*Détail* : ${echapper(detail)}`);

  if (occurrences > 1) {
    lignes.push(
      `*Répétitions* : ${echapper(`${occurrences} fois depuis la dernière alerte`)}`,
    );
  }

  lignes.push(
    "",
    `_${echapper(new Date().toLocaleString("fr-FR"))}_`,
    // Le détail complet reste dans les logs o2switch : l'alerte dit
    // quand et où, le serveur dit pourquoi.
    "_Trace complète dans les logs du serveur_",
  );

  return lignes.join("\n");
}

/**
 * Signale une erreur à l'équipe.
 *
 * Ne lève jamais : une alerte qui échoue ne doit pas aggraver l'incident
 * qu'elle rapporte.
 *
 * @param {object} params
 * @param {string} params.contexte  Où : « POST /api/missions », « sync Kaze »
 * @param {string|Error} params.erreur  L'erreur rencontrée
 * @param {string} [params.detail]  Complément utile (id mission, statut HTTP)
 * @returns {Promise<{alerte: boolean, etouffee?: boolean}>}
 */
async function alerter({ contexte, erreur, detail }) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  const empreinte = empreinter(contexte, message);
  const { envoyer, occurrences } = consulterEtouffoir(empreinte);

  if (!envoyer) return { alerte: false, etouffee: true };

  const texte = composerAlerte({ contexte, message, detail, occurrences });

  if (!actif) {
    console.error(`🚨 [ALERTE] ${contexte} — ${message}`);
    return { alerte: false };
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${JETON}/sendMessage`,
      {
        chat_id: SALON,
        text: texte,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      },
      { timeout: 10_000 },
    );
    return { alerte: true };
  } catch (err) {
    console.error(
      "⚠️ Alerte non transmise :",
      err.response?.data?.description || err.message,
    );
    return { alerte: false };
  }
}

/** Vide le journal — réservé aux tests. */
function reinitialiser() {
  journal.clear();
}

module.exports = {
  alerter,
  actif,
  // Exportés pour les tests
  empreinter,
  consulterEtouffoir,
  composerAlerte,
  reinitialiser,
  FENETRE_ETOUFFOIR_MS,
};
