#!/usr/bin/env node
/**
 * Relève l'identifiant des salons Telegram connus du bot.
 *
 * Piège : un bot ajouté à un groupe a le « mode confidentialité » actif
 * par défaut et ne voit QUE les messages commençant par « / ». Écrire
 * « salut » dans le groupe ne produit donc aucune trace ici — il faut
 * envoyer « /start ».
 *
 * Second piège : getUpdates purge la file dès qu'elle est lue avec un
 * offset. Ce script lit sans consommer, on peut donc le relancer.
 *
 * Usage : node scripts/telegram-chat-id.js
 */
require("dotenv").config();
const axios = require("axios");

const JETON = process.env.TELEGRAM_BOT_TOKEN;

if (!JETON) {
  console.error("✖ TELEGRAM_BOT_TOKEN absent du .env");
  process.exit(1);
}

const CHAMPS = [
  "message",
  "edited_message",
  "channel_post",
  "my_chat_member",
  "chat_member",
];

async function main() {
  const { data } = await axios.get(
    `https://api.telegram.org/bot${JETON}/getUpdates`,
    { params: { timeout: 0, allowed_updates: JSON.stringify(CHAMPS) } },
  );

  const salons = new Map();

  for (const maj of data.result || []) {
    for (const champ of CHAMPS) {
      const chat = maj[champ]?.chat;
      if (chat) {
        salons.set(chat.id, {
          type: chat.type,
          nom: chat.title || chat.first_name || "—",
        });
      }
    }
  }

  if (salons.size === 0) {
    console.log("Aucun salon détecté.\n");
    console.log("À faire dans le groupe « Alertes DLC » :");
    console.log("  1. Vérifier que @Drivelineconnect_bot en est membre");
    console.log("  2. Y envoyer le message : /start");
    console.log("     (le mode confidentialité masque les messages");
    console.log("      ordinaires — seul « / » est visible du bot)");
    console.log("  3. Relancer ce script\n");
    return;
  }

  console.log("Salons connus du bot :\n");
  for (const [id, { type, nom }] of salons) {
    const usage =
      type === "private"
        ? "conversation privée — ne pas utiliser"
        : "→ candidat pour TELEGRAM_ALERTES_CHAT_ID";
    console.log(
      `  ${id}\n     type : ${type}\n     nom  : ${nom}\n     ${usage}\n`,
    );
  }
}

main().catch((err) => {
  console.error("✖", err.response?.data?.description || err.message);
  process.exit(1);
});
