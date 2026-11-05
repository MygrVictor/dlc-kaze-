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

// Identités inventées mais crédibles. Les e-mails restent des alias de
// VOTRE boîte : aucun message ne part chez un tiers.
const COMPTES = [
  {
    suffixe: "admin",
    role: "admin",
    nom: "Victor Admin",
    societe: "Drive Line Connect",
    tel: "06 12 34 56 78",
  },
  {
    suffixe: "client1",
    role: "client",
    nom: "Sophie Marchand",
    societe: "Garage Marchand Automobiles",
    tel: "04 72 18 45 90",
  },
  {
    suffixe: "client2",
    role: "client",
    nom: "Julien Perrot",
    societe: "Perrot Auto Lyon Est",
    tel: "04 78 26 31 07",
  },
  {
    suffixe: "client3",
    role: "client",
    nom: "Nadia Benali",
    societe: "Rent&Go Location",
    tel: "01 45 67 22 98",
  },
  {
    suffixe: "client4",
    role: "client",
    nom: "Thomas Girard",
    societe: "Concession Girard Peugeot",
    tel: "03 80 41 52 63",
  },
  {
    suffixe: "convoyeur1",
    role: "convoyeur",
    nom: "Karim Haddad",
    societe: null,
    tel: "06 21 43 65 87",
  },
  {
    suffixe: "convoyeur2",
    role: "convoyeur",
    nom: "Lucas Fontaine",
    societe: null,
    tel: "07 68 12 90 34",
  },
  {
    suffixe: "convoyeur3",
    role: "convoyeur",
    nom: "Mehdi Rousseau",
    societe: null,
    tel: "06 55 78 21 46",
  },
  {
    suffixe: "convoyeur4",
    role: "convoyeur",
    nom: "Antoine Leclerc",
    societe: null,
    tel: "07 81 09 33 52",
  },
];

const ADRESSES = [
  "12 rue de la République, 69002 Lyon",
  "45 avenue Jean Jaurès, 69007 Lyon",
  "8 boulevard Haussmann, 75009 Paris",
  "102 rue de Rivoli, 75001 Paris",
  "3 place Bellecour, 69002 Lyon",
  "27 cours Mirabeau, 13100 Aix-en-Provence",
  "56 rue Sainte-Catherine, 33000 Bordeaux",
  "14 quai de la Fosse, 44000 Nantes",
  "9 rue de la Liberté, 21000 Dijon",
  "71 avenue de la Libération, 42000 Saint-Étienne",
  "22 rue Nationale, 59000 Lille",
  "5 allée Jean Jaurès, 31000 Toulouse",
  "18 avenue Félix Faure, 38000 Grenoble",
  "33 rue d'Alsace, 67000 Strasbourg",
  "60 promenade des Anglais, 06000 Nice",
];

const VEHICULES = [
  ["Peugeot", "308", "Allure", "Diesel"],
  ["Renault", "Clio V", "Intens", "Essence"],
  ["Citroën", "C5 Aircross", "Shine", "Hybride"],
  ["Volkswagen", "Golf 8", "Life", "Essence"],
  ["Tesla", "Model 3", "Grande Autonomie", "Électrique"],
  ["BMW", "Série 3", "M Sport", "Diesel"],
  ["Audi", "A3 Sportback", "S line", "Essence"],
  ["Toyota", "Yaris Cross", "Design", "Hybride"],
  ["Dacia", "Sandero", "Stepway", "Essence"],
  ["Mercedes", "Classe A", "AMG Line", "Diesel"],
  ["Renault", "Master", "L2H2", "Diesel"],
  ["Peugeot", "2008", "GT", "Électrique"],
];

const CONTACTS = [
  "Marc Lefèvre",
  "Claire Dubois",
  "Patrick Morel",
  "Émilie Garnier",
  "Hugo Lambert",
  "Sarah Petit",
  "Olivier Roux",
  "Camille Faure",
];

// Générateur pseudo-aléatoire déterministe : même jeu de données à chaque run.
let graine = 20261104;
const rnd = () =>
  (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const lettres = "ABCDEFGHJKLMNPQRSTVWXYZ";
const plaque = () =>
  `${pick(lettres)}${pick(lettres)}-${String(100 + Math.floor(rnd() * 900))}-${pick(lettres)}${pick(lettres)}`;
const tel = () =>
  `06 ${[0, 0, 0, 0].map(() => String(10 + Math.floor(rnd() * 90))).join(" ")}`;
const jours = (n) => new Date(Date.now() - n * 86400000);

async function seedMissions(db, ids) {
  const clients = COMPTES.filter((c) => c.role === "client").map(
    (c) => ids[c.suffixe],
  );
  const convoyeurs = COMPTES.filter((c) => c.role === "convoyeur").map(
    (c) => ids[c.suffixe],
  );

  // Repart d'une base propre pour les missions des comptes de démo.
  await db.query(`DELETE FROM missions WHERE client_id = ANY($1::uuid[])`, [
    clients,
  ]);

  const devisParClient = {};
  let n = 0;
  // ~90 missions réparties sur 12 semaines.
  for (let i = 0; i < 90; i++) {
    const age = Math.floor(rnd() * 84); // jours depuis la création
    const creee = jours(age);
    let status;
    if (age > 14)
      status =
        rnd() < 0.85 ? "LIVREE" : rnd() < 0.5 ? "ANNULEE" : "DEVIS_REFUSE";
    else if (age > 7)
      status = pick(["LIVREE", "LIVREE", "EN_COURS", "ASSIGNEE"]);
    else if (age > 3)
      status = pick(["ASSIGNEE", "ACCEPTEE", "EN_COURS", "DEVIS_PROPOSE"]);
    else status = pick(["EN_ATTENTE_DE_COTATION", "DEVIS_PROPOSE", "ACCEPTEE"]);

    const client = pick(clients);
    const [marque, modele, finition, energie] = pick(VEHICULES);
    let dep = pick(ADRESSES);
    let arr = pick(ADRESSES);
    while (arr === dep) arr = pick(ADRESSES);

    const avecPrix = status !== "EN_ATTENTE_DE_COTATION";
    const prix = avecPrix ? 180 + Math.round(rnd() * 520) : null;
    const prixConv = avecPrix ? Math.round(prix * (0.62 + rnd() * 0.13)) : null;
    const assigne = ["ASSIGNEE", "EN_COURS", "LIVREE"].includes(status);
    const enlevement = new Date(
      creee.getTime() + (2 + Math.floor(rnd() * 4)) * 86400000,
    );
    const livraison = new Date(
      enlevement.getTime() + (1 + Math.floor(rnd() * 2)) * 86400000,
    );
    const livreeLe =
      status === "LIVREE"
        ? livraison > new Date()
          ? jours(0)
          : livraison
        : null;

    let devis = null;
    if (avecPrix)
      devis = devisParClient[client] = (devisParClient[client] || 0) + 1;

    await db.query(
      `INSERT INTO missions (
         client_id, vehicle_plate, vehicle_brand, vehicle_model, vehicle_finish, vehicle_energy,
         vehicle_state, vehicle_keys, vehicle_year, vehicle_type,
         departure_address, departure_date, departure_contact_name, departure_contact_phone,
         arrival_address, arrival_date, arrival_contact_name, arrival_contact_phone,
         desired_pickup_date, desired_delivery_date, is_urgent,
         price, price_convoyeur, status, convoyeur_id, devis_number,
         created_at, updated_at, delivered_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Roulant',$7,$8,'VL',
               $9,$10,$11,$12,$13,$14,$15,$16,$10,$14,$17,
               $18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        client,
        plaque(),
        marque,
        modele,
        finition,
        energie,
        1 + Math.floor(rnd() * 2),
        2018 + Math.floor(rnd() * 7),
        dep,
        enlevement,
        pick(CONTACTS),
        tel(),
        arr,
        livraison,
        pick(CONTACTS),
        tel(),
        rnd() < 0.12,
        prix,
        prixConv,
        status,
        assigne ? pick(convoyeurs) : null,
        devis,
        creee,
        livreeLe || creee,
        livreeLe,
      ],
    );
    n++;
  }
  console.log(`\n  ${n} missions générées sur les 12 dernières semaines.`);
}

async function main() {
  const db = require("../server/src/db");
  const hash = await bcrypt.hash(motDePasse, 12);
  const ids = {};

  console.log(`Base : ${nomBase}\n`);
  for (const c of COMPTES) {
    const email = alias(c.suffixe);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, company, role, phone, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name     = EXCLUDED.full_name,
             company       = EXCLUDED.company,
             role          = EXCLUDED.role,
             phone         = EXCLUDED.phone,
             is_validated  = true,
             updated_at    = NOW()
       RETURNING id, (xmax = 0) AS cree`,
      [email, hash, c.nom, c.societe, c.role, c.tel],
    );
    ids[c.suffixe] = rows[0].id;
    console.log(
      `  ${rows[0].cree ? "créé   " : "mis à jour"}  ${c.role.padEnd(9)}  ${c.nom.padEnd(18)} ${email}`,
    );
  }

  await seedMissions(db, ids);

  console.log(`\nMot de passe commun : ${motDePasse}`);
  console.log("(à conserver : il n'est affiché qu'une fois)");
  process.exit(0);
}

main().catch((err) => {
  console.error("✖ Échec :", err.message);
  process.exit(1);
});
