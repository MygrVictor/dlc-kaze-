#!/usr/bin/env node
/**
 * Comptes de test pour l'environnement de STAGING.
 *
 * Crée (ou remet à jour) un admin, deux clients et deux convoyeurs, tous
 * validés, avec des adresses « +alias » d'une boîte que vous lisez : les
 * e-mails du staging partent réellement, ils doivent donc arriver chez
 * vous et jamais chez un vrai client.
 *
 *   vous@gmail.com  →  vous+admin@gmail.com, vous+client1@gmail.com, …
 *
 * Garde-fou : refuse de tourner si le nom de la base ne contient pas
 * « staging ». Sur o2switch la prod est aussi en localhost : le test
 * « localhost » des scripts de démo ne protégerait rien ici.
 *
 * Usage (depuis ~/dlc-kaze-staging) :
 *   node scripts/seed-staging.js vous@gmail.com
 *   node scripts/seed-staging.js vous@gmail.com MotDePasseTest!
 *
 * Relançable sans risque : les comptes existants sont mis à jour.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// ── Garde-fou ────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL || "";
let nomBase = "";
try {
  nomBase = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
} catch {
  /* URL invalide : nomBase reste vide et le garde-fou refuse. */
}
if (!/staging/i.test(nomBase)) {
  console.error(
    `✖ Refus : la base « ${nomBase || "?"} » n'est pas une base de staging.\n` +
      "  Ce script ne s'exécute que sur une base dont le nom contient « staging ».",
  );
  process.exit(1);
}

// ── Arguments ────────────────────────────────────────────────────────────
const [emailBase, motDePasseArg] = process.argv.slice(2);
const formeEmail = /^([^@\s+]+)@([^@\s]+\.[^@\s]+)$/.exec(emailBase || "");
if (!formeEmail) {
  console.error(
    "✖ Indiquez votre adresse e-mail : node scripts/seed-staging.js vous@gmail.com",
  );
  process.exit(1);
}
const [, local, domaine] = formeEmail;
const alias = (suffixe) => `${local}+${suffixe}@${domaine}`.toLowerCase();

const motDePasse =
  motDePasseArg || `Stg-${crypto.randomBytes(6).toString("base64url")}9!`;

const COMPTES = [
  {
    suffixe: "admin",
    role: "admin",
    nom: "Admin Staging",
    societe: "DLC (staging)",
  },
  {
    suffixe: "client1",
    role: "client",
    nom: "Client Test 1",
    societe: "Garage Test 1",
  },
  {
    suffixe: "client2",
    role: "client",
    nom: "Client Test 2",
    societe: "Concession Test 2",
  },
  {
    suffixe: "convoyeur1",
    role: "convoyeur",
    nom: "Convoyeur Test 1",
    societe: null,
  },
  {
    suffixe: "convoyeur2",
    role: "convoyeur",
    nom: "Convoyeur Test 2",
    societe: null,
  },
];

async function main() {
  const db = require("../server/src/db");
  const hash = await bcrypt.hash(motDePasse, 12);

  console.log(`Base : ${nomBase}\n`);
  for (const c of COMPTES) {
    const email = alias(c.suffixe);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, company, role, is_validated)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name     = EXCLUDED.full_name,
             company       = EXCLUDED.company,
             role          = EXCLUDED.role,
             is_validated  = true,
             updated_at    = NOW()
       RETURNING (xmax = 0) AS cree`,
      [email, hash, c.nom, c.societe, c.role],
    );
    console.log(
      `  ${rows[0].cree ? "créé   " : "mis à jour"}  ${c.role.padEnd(9)}  ${email}`,
    );
  }

  console.log(`\nMot de passe commun : ${motDePasse}`);
  console.log("(à conserver : il n'est affiché qu'une fois)");
  process.exit(0);
}

main().catch((err) => {
  console.error("✖ Échec :", err.message);
  process.exit(1);
});
