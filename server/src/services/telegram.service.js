/**
 * Service de notification Telegram — Drive Line Connect
 *
 * Publie les missions disponibles dans un salon Telegram unique, partagé
 * par tous les convoyeurs.
 *
 * ── Pourquoi Telegram plutôt que WhatsApp ──────────────────────
 * L'API WhatsApp Business est conçue pour la relation client un-à-un et
 * se facture au message : diffuser une mission à 50 convoyeurs coûte 50
 * messages, et Meta n'expose aucune API d'envoi en groupe. Telegram
 * publie dans un salon en une seule requête, gratuitement et sans
 * limite. Une mission = un message, quel que soit le nombre de lecteurs.
 *
 * WhatsApp reste pertinent pour l'individuel (mission attribuée, rappel
 * de départ) : les deux services coexistent.
 *
 * ── Mise en place ──────────────────────────────────────────────
 *   1. Créer le bot via @BotFather sur Telegram → jeton
 *   2. Créer le groupe « Missions DLC », y ajouter le bot
 *   3. Récupérer l'identifiant du salon (négatif pour un groupe) :
 *      https://api.telegram.org/bot<JETON>/getUpdates après un message
 *
 * Variables .env :
 *   TELEGRAM_BOT_TOKEN  Jeton fourni par @BotFather
 *   TELEGRAM_CHAT_ID    Identifiant du salon (ex. -1001234567890)
 */
const axios = require("axios");

const JETON = process.env.TELEGRAM_BOT_TOKEN;
const SALON = process.env.TELEGRAM_CHAT_ID;

const actif = Boolean(JETON && SALON);

if (actif) {
  console.log(`📣 Telegram configuré (salon ${SALON})`);
} else {
  console.log("📣 Telegram en mode dev (console uniquement)");
}

/** Caractères réservés par le mode MarkdownV2 de Telegram. */
const CARACTERES_RESERVES = /[_*[\]()~`>#+\-=|{}.!\\]/g;

/**
 * Échappe une valeur destinée à un message MarkdownV2.
 *
 * Indispensable : une adresse contient presque toujours un tiret ou un
 * point, et Telegram rejette le message entier (400) si un caractère
 * réservé n'est pas échappé. C'est aussi ce qui empêche une donnée
 * client d'injecter du balisage dans l'annonce.
 */
function echapper(valeur) {
  return String(valeur ?? "—")
    .replace(/\s+/g, " ")
    .trim()
    .replace(CARACTERES_RESERVES, "\\$&");
}

/**
 * Compose l'annonce d'une mission.
 *
 * @param {object} mission
 * @param {string} [lienMission] URL vers la fiche, ajoutée en pied.
 * @returns {string} Message au format MarkdownV2.
 */
function composerAnnonce(mission, lienMission) {
  // La plaque n'entre pas dans l'annonce : associée aux adresses et à la
  // date, elle désigne un véhicule identifiable à un endroit connu, à une
  // heure connue. Le convoyeur n'en a pas besoin pour décider s'il prend
  // la mission ; elle lui est communiquée une fois celle-ci attribuée.
  const vehicule =
    [mission.vehicle_brand, mission.vehicle_model].filter(Boolean).join(" ") ||
    "Véhicule non précisé";

  const remuneration =
    mission.price_convoyeur || mission.price
      ? `${mission.price_convoyeur || mission.price} €`
      : "à définir";

  const lignes = [
    mission.is_urgent ? "*MISSION URGENTE*" : "*Nouvelle mission disponible*",
    "",
    `*Véhicule* : ${echapper(vehicule)}`,
    `*Départ* : ${echapper(mission.departure_address)}`,
    `*Arrivée* : ${echapper(mission.arrival_address)}`,
    `*Rémunération* : ${echapper(remuneration)}`,
  ];

  if (mission.departure_date) {
    const date = new Date(mission.departure_date);
    if (!Number.isNaN(date.getTime())) {
      lignes.push(`*Date* : ${echapper(date.toLocaleDateString("fr-FR"))}`);
    }
  }

  if (lienMission) {
    lignes.push("", `[Prendre la mission](${lienMission})`);
  }

  return lignes.join("\n");
}

/**
 * Publie un message dans le salon.
 *
 * @param {string} texte Message au format MarkdownV2.
 * @returns {Promise<{messageId: number}>}
 */
async function publier(texte) {
  if (!actif) {
    console.log("📣 [DEV] Telegram non envoyé (aucun salon configuré) :");
    console.log(texte.replace(/\\(.)/g, "$1"));
    return { messageId: 0 };
  }

  const { data } = await axios.post(
    `https://api.telegram.org/bot${JETON}/sendMessage`,
    {
      chat_id: SALON,
      text: texte,
      parse_mode: "MarkdownV2",
      // Les URL de missions ne méritent pas un encart de prévisualisation
      // qui doublerait la hauteur du message dans le fil.
      disable_web_page_preview: true,
    },
    { timeout: 10_000 },
  );

  return { messageId: data?.result?.message_id };
}

/**
 * Extrait le message d'erreur utile d'une réponse Telegram.
 */
function messageErreur(err) {
  const description = err.response?.data?.description;
  return description ? `${description}` : err.message;
}

/**
 * Annonce une mission disponible dans le salon des convoyeurs.
 *
 * Contrairement à son équivalent WhatsApp, cette fonction envoie
 * **un seul** message quel que soit le nombre de convoyeurs.
 *
 * L'échec est signalé mais jamais propagé : une annonce manquée ne doit
 * pas faire échouer l'acceptation d'un devis.
 *
 * @param {object} mission
 * @param {string} [lienMission]
 * @returns {Promise<{publie: boolean}>}
 */
async function annoncerMissionDisponible(mission, lienMission) {
  if (!mission) return { publie: false };

  try {
    await publier(composerAnnonce(mission, lienMission));
    return { publie: true };
  } catch (err) {
    console.error("⚠️ Telegram non publié :", messageErreur(err));
    return { publie: false };
  }
}

/**
 * Vérifie que le jeton et le salon sont exploitables.
 * Utilisé par le script de diagnostic.
 */
async function verifierConfiguration() {
  if (!actif) {
    return {
      actif: false,
      message: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID absent",
    };
  }

  try {
    const { data } = await axios.get(
      `https://api.telegram.org/bot${JETON}/getMe`,
      { timeout: 10_000 },
    );
    return {
      actif: true,
      bot: data?.result?.username,
      salon: SALON,
    };
  } catch (err) {
    return { actif: false, message: messageErreur(err) };
  }
}

module.exports = {
  annoncerMissionDisponible,
  verifierConfiguration,
  // Exportés pour les tests
  composerAnnonce,
  echapper,
  actif,
};
