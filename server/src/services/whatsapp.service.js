/**
 * Service de notification WhatsApp — DLC Kaze
 *
 * Notifie les convoyeurs des missions disponibles via WhatsApp Business.
 *
 * Deux fournisseurs, par ordre de priorité :
 *   1. Meta Cloud API — si WHATSAPP_TOKEN et WHATSAPP_PHONE_ID sont définis
 *   2. Console        — repli de développement, aucun envoi réel
 *
 * ── Contrainte Meta ────────────────────────────────────────────
 * Un message envoyé à quelqu'un qui ne nous a pas écrit dans les
 * dernières 24 h doit obligatoirement utiliser un *template* validé
 * par Meta. On envoie donc toujours un template, jamais du texte libre.
 *
 * Variables .env :
 *   WHATSAPP_TOKEN          Jeton permanent de l'application Meta
 *   WHATSAPP_PHONE_ID       Identifiant du numéro expéditeur
 *   WHATSAPP_TEMPLATE       Nom du template (défaut : mission_disponible)
 *   WHATSAPP_TEMPLATE_LANG  Langue du template (défaut : fr)
 *   WHATSAPP_API_VERSION    Version de l'API Graph (défaut : v21.0)
 */
const axios = require("axios");

const VERSION_API = process.env.WHATSAPP_API_VERSION || "v21.0";
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || "mission_disponible";
const LANGUE = process.env.WHATSAPP_TEMPLATE_LANG || "fr";

const actif = Boolean(
  process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID,
);

if (actif) {
  console.log(
    `💬 WhatsApp configuré (numéro ${process.env.WHATSAPP_PHONE_ID}, template « ${TEMPLATE} »)`,
  );
} else {
  console.log("💬 WhatsApp en mode dev (console uniquement)");
}

/**
 * Supprime le zéro de départ conservé à tort après l'indicatif français
 * (« +33 06 38 87 25 75 » → « 33638872575 »). Meta rejette la forme longue.
 */
function retirerZeroNational(chiffres) {
  if (chiffres.startsWith("330")) return "33" + chiffres.slice(3);
  return chiffres;
}

/**
 * Convertit un numéro français en format international sans séparateurs,
 * tel qu'attendu par l'API Meta (ex. « 06 12 34 56 78 » → « 33612345678 »).
 *
 * @returns {string|null} Le numéro normalisé, ou null s'il est inexploitable.
 */
function normaliserNumero(numero, indicatifParDefaut = "33") {
  if (!numero || typeof numero !== "string") return null;

  // On ne garde que les chiffres, en mémorisant un éventuel préfixe « + ».
  const international = numero.trim().startsWith("+");
  let chiffres = numero.replace(/\D/g, "");
  if (!chiffres) return null;

  // « 0033… » est une autre écriture de « +33… »
  if (chiffres.startsWith("00")) {
    chiffres = chiffres.slice(2);
    return chiffres.length >= 8 ? retirerZeroNational(chiffres) : null;
  }

  if (international) {
    return chiffres.length >= 8 ? retirerZeroNational(chiffres) : null;
  }

  // Numéro national français : 0X XX XX XX XX → 33X XX XX XX XX
  if (chiffres.length === 10 && chiffres.startsWith("0")) {
    return indicatifParDefaut + chiffres.slice(1);
  }

  // Déjà sous forme internationale sans « + » (ex. 33612345678)
  if (chiffres.length >= 11) return retirerZeroNational(chiffres);

  return null;
}

/**
 * Tronque une valeur pour respecter les limites d'un paramètre de template
 * et neutralise les retours à la ligne, refusés par Meta.
 */
function parametre(valeur, longueurMax = 60) {
  const texte = String(valeur ?? "—")
    .replace(/\s+/g, " ")
    .trim();
  if (!texte) return "—";
  return texte.length > longueurMax
    ? `${texte.slice(0, longueurMax - 1)}…`
    : texte;
}

/**
 * Envoie un template WhatsApp à un destinataire.
 *
 * @param {string} numero      Numéro au format international sans « + ».
 * @param {string[]} variables Valeurs des paramètres {{1}}, {{2}}… du template.
 * @returns {Promise<{messageId: string}>}
 */
async function envoyerTemplate(numero, variables) {
  if (!actif) {
    console.log("💬 [DEV] WhatsApp non envoyé (aucun fournisseur configuré) :");
    console.log(`   → À : ${numero}`);
    console.log(`   → Template : ${TEMPLATE} [${variables.join(" | ")}]`);
    return { messageId: "dev-" + Date.now() };
  }

  const { data } = await axios.post(
    `https://graph.facebook.com/${VERSION_API}/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: numero,
      type: "template",
      template: {
        name: TEMPLATE,
        language: { code: LANGUE },
        components: [
          {
            type: "body",
            parameters: variables.map((text) => ({ type: "text", text })),
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    },
  );

  return { messageId: data?.messages?.[0]?.id };
}

/**
 * Extrait le message d'erreur utile d'une réponse Meta.
 */
function messageErreur(err) {
  const meta = err.response?.data?.error;
  if (!meta) return err.message;
  const details = meta.error_user_msg || meta.message || "erreur inconnue";
  return meta.code ? `${details} (code ${meta.code})` : details;
}

/**
 * Prévient les convoyeurs qu'une mission vient d'être libérée.
 *
 * Chaque convoyeur reçoit son propre message. Un échec individuel
 * (numéro invalide, destinataire sans WhatsApp) n'interrompt pas les autres.
 *
 * @param {Array<{phone?: string, full_name?: string}>} convoyeurs
 * @param {object} mission
 * @returns {Promise<{envoyes: number, ignores: number, echecs: number}>}
 */
async function notifierMissionDisponible(convoyeurs, mission) {
  const bilan = { envoyes: 0, ignores: 0, echecs: 0 };
  if (!convoyeurs || convoyeurs.length === 0) return bilan;

  // L'urgence est portée par le paramètre véhicule : les templates Meta
  // n'acceptent pas un nombre variable de paramètres.
  const vehicule = parametre(
    (mission.is_urgent ? "\u26a0\ufe0f URGENT \u2014 " : "") +
      [mission.vehicle_brand, mission.vehicle_model, mission.vehicle_plate]
        .filter(Boolean)
        .join(" "),
  );
  const depart = parametre(mission.departure_address);
  const arrivee = parametre(mission.arrival_address);
  const remuneration = parametre(
    mission.price_convoyeur || mission.price
      ? `${mission.price_convoyeur || mission.price} €`
      : "à définir",
    20,
  );

  await Promise.all(
    convoyeurs.map(async (convoyeur) => {
      const numero = normaliserNumero(convoyeur.phone);
      if (!numero) {
        bilan.ignores += 1;
        console.warn(
          `⚠️ WhatsApp ignoré : numéro absent ou invalide pour ${convoyeur.full_name || convoyeur.email || "convoyeur"}`,
        );
        return;
      }

      try {
        await envoyerTemplate(numero, [
          parametre(convoyeur.full_name || "Convoyeur", 40),
          vehicule,
          depart,
          arrivee,
          remuneration,
        ]);
        bilan.envoyes += 1;
      } catch (err) {
        bilan.echecs += 1;
        console.error(
          `⚠️ WhatsApp non envoyé à ${numero} :`,
          messageErreur(err),
        );
      }
    }),
  );

  return bilan;
}

/**
 * Vérifie que les identifiants Meta sont valides.
 * Utilisé par le script de diagnostic.
 */
async function verifierConfiguration() {
  if (!actif) {
    return { actif: false, message: "Aucun identifiant WhatsApp configuré." };
  }

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/${VERSION_API}/${process.env.WHATSAPP_PHONE_ID}`,
      {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        params: { fields: "display_phone_number,verified_name,quality_rating" },
        timeout: 10_000,
      },
    );
    return {
      actif: true,
      numero: data.display_phone_number,
      nom: data.verified_name,
      qualite: data.quality_rating,
    };
  } catch (err) {
    return { actif: true, erreur: messageErreur(err) };
  }
}

module.exports = {
  estActif: () => actif,
  normaliserNumero,
  envoyerTemplate,
  notifierMissionDisponible,
  verifierConfiguration,
};
