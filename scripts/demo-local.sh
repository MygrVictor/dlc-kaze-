#!/usr/bin/env bash
#
# Démarre l'application en mode démonstration.
#
# Le .env local porte les vrais identifiants Kaze et Telegram. Sans
# précaution, deux choses arriveraient pendant l'enregistrement :
#
#  · l'onglet « Missions disponibles » interroge Kaze et affiche à la suite
#    des missions de démonstration les vraies missions en attente — avec
#    leurs adresses et leurs références clients, en pleine vidéo ;
#  · une action mal placée pourrait écrire dans Kaze ou déclencher une
#    notification Telegram vers le groupe des convoyeurs.
#
# Les variables vidées ci-dessous coupent ces liaisons. dotenv ne remplace
# jamais une variable déjà présente dans l'environnement : ces valeurs vides
# l'emportent donc sur le contenu du .env, sans le modifier.
#
# Usage :  bash scripts/demo-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ Mode démonstration — Kaze, Telegram et WhatsApp déconnectés"
echo

env \
  KAZE_API_BASE_URL= \
  KAZE_API_TOKEN= \
  KAZE_API_KEY= \
  KAZE_LOGIN= \
  KAZE_PASSWORD= \
  KAZE_TARGET_ID= \
  TELEGRAM_BOT_TOKEN= \
  TELEGRAM_CHAT_ID= \
  TELEGRAM_ALERTES_CHAT_ID= \
  WHATSAPP_TOKEN= \
  WHATSAPP_PHONE_ID= \
  RESEND_API_KEY= \
  SYNC_ENABLED=false \
  npm run dev
