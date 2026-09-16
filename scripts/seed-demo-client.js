#!/usr/bin/env node
/**
 * Jeu de démonstration — espace client
 *
 * Prévu pour une présentation locale, jamais pour la production.
 * Il crée un client fictif, quelques missions à différents stades et
 * des factures/devis visibles dans l'espace client.
 *
 * Garde-fou : la base doit pointer vers localhost/127.0.0.1, sinon le
 * script s'arrête immédiatement.
 *
 * Usage :
 *   node scripts/seed-demo-client.js
 *   node scripts/seed-demo-client.js --nettoyer
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("../server/src/db");

const EMAIL_CLIENT = "demo.client@demo.local";
const EMAIL_CONVOYEUR = "demo.convoyeur@demo.local";
const MOT_DE_PASSE = "Demo2026!";
const RACINE_UPLOADS = path.resolve(__dirname, "../uploads");

const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(
    "✖ Refus : DATABASE_URL ne pointe pas sur localhost.\n" +
      "  Ce script ne doit jamais toucher la base de production.",
  );
  process.exit(1);
}

const pdfFactice = (titre) => {
  const contenu = `BT /F1 22 Tf 60 720 Td (${titre}) Tj ET\nBT /F1 12 Tf 60 690 Td (Document de demonstration - Drive Line Connect) Tj ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const positions = [];
  objets.forEach((corps, i) => {
    positions.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corps}\nendobj\n`;
  });

  const debutXref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  positions.forEach((p) => {
    pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
};

const ecrireFichier = (sousDossier, nom, titre) => {
  const dossier = path.join(RACINE_UPLOADS, sousDossier);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, nom), pdfFactice(titre));
  return `/uploads/${sousDossier}/${nom}`;
};

const nettoyer = async () => {
  console.log("Nettoyage du jeu de démonstration client…");

  const { rows: fichiers } = await db
    .query(`SELECT file_path FROM factures WHERE numero LIKE 'DEMO-%'`)
    .catch(() => ({ rows: [] }));

  let effaces = 0;
  fichiers.forEach(({ file_path: chemin }) => {
    const disque = path.join(
      RACINE_UPLOADS,
      chemin.replace(/^\/?uploads\//, ""),
    );
    if (fs.existsSync(disque)) {
      fs.unlinkSync(disque);
      effaces += 1;
    }
  });

  await db.query("DELETE FROM factures WHERE numero LIKE 'DEMO-%'");
  await db.query(
    "DELETE FROM missions WHERE vehicle_plate LIKE 'DC-%' OR comments LIKE 'DEMO-CLIENT%'",
  );
  const { rowCount } = await db.query(
    "DELETE FROM users WHERE email IN ($1, $2)",
    [EMAIL_CLIENT, EMAIL_CONVOYEUR],
  );

  console.log(`✅ ${rowCount} compte(s), ${effaces} fichier(s) supprimé(s).`);
  process.exit(0);
};

const creer = async () => {
  console.log("Jeu de démonstration — espace client\n");

  const hash = await bcrypt.hash(MOT_DE_PASSE, 12);

  const { rows: clientRows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated)
     VALUES ($1, $2, 'Marine Dubois', 'Atelier Demo Client', '0601020304', 'client', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           company = EXCLUDED.company,
           phone = EXCLUDED.phone,
           role = 'client',
           is_validated = true
     RETURNING id`,
    [EMAIL_CLIENT, hash],
  );
  const clientId = clientRows[0].id;

  const { rows: convoyeurRows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated, kaze_driver_id)
     VALUES ($1, $2, 'Julien Bertrand', 'JB Convoyage', '0611223344', 'convoyeur', true, $3)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           kaze_driver_id = EXCLUDED.kaze_driver_id
     RETURNING id`,
    [EMAIL_CONVOYEUR, hash, "demo-driver-0000"],
  );
  const convoyeurId = convoyeurRows[0].id;

  console.log("· comptes créés");

  const missions = [
    {
      plaque: "DC-101-AA",
      marque: "Peugeot",
      modele: "208",
      de: "12 avenue Jean Jaurès, 69007 Lyon",
      vers: "45 rue de la République, 42000 Saint-Étienne",
      contact: "Marine Dubois",
      tel: "0601020304",
      jours: 0,
      prix: null,
      remuneration: null,
      statut: "EN_ATTENTE_DE_COTATION",
      convoyeur: null,
    },
    {
      plaque: "DC-102-BB",
      marque: "Renault",
      modele: "Scénic",
      de: "8 boulevard Vivier Merle, 69003 Lyon",
      vers: "17 quai Perrache, 69002 Lyon",
      contact: "Marine Dubois",
      tel: "0601020304",
      jours: 2,
      prix: 420,
      remuneration: 240,
      statut: "DEVIS_PROPOSE",
      convoyeur: null,
    },
    {
      plaque: "DC-103-CC",
      marque: "Audi",
      modele: "Q5",
      de: "9 chemin des Vignes, 69400 Villefranche-sur-Saône",
      vers: "140 rue du Faubourg Saint-Honoré, 75008 Paris",
      contact: "Marine Dubois",
      tel: "0601020304",
      jours: 3,
      prix: 560,
      remuneration: 320,
      statut: "ASSIGNEE",
      convoyeur: true,
    },
    {
      plaque: "DC-104-DD",
      marque: "Volkswagen",
      modele: "Transporter",
      de: "3 rue du Dauphiné, 38000 Grenoble",
      vers: "22 avenue de Genève, 74000 Annecy",
      contact: "Marine Dubois",
      tel: "0601020304",
      jours: -4,
      prix: 410,
      remuneration: 230,
      statut: "LIVREE",
      convoyeur: true,
    },
  ];

  for (const m of missions) {
    await db.query(
      `INSERT INTO missions (
         client_id, convoyeur_id, vehicle_plate, vehicle_brand, vehicle_model,
         vehicle_type, vehicle_energy, vehicle_keys,
         departure_address, departure_date, departure_contact_name, departure_contact_phone,
         arrival_address, arrival_date, arrival_contact_name, arrival_contact_phone,
         price, price_convoyeur, status, comments, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         'vl', 'essence', 1,
         $6, NOW() + ($7 || ' days')::interval, $8, $9,
         $10, NOW() + (($7::int + 1) || ' days')::interval, 'Service réception', '0400000000',
         $11, $12, $13::mission_status, $14,
         NOW() - ((30 - $7::int) || ' days')::interval,
         NOW() - (CASE WHEN $7::int < 0 THEN 1 ELSE 0 END || ' days')::interval
       )`,
      [
        clientId,
        m.convoyeur ? convoyeurId : null,
        m.plaque,
        m.marque,
        m.modele,
        m.de,
        String(m.jours),
        m.contact,
        m.tel,
        m.vers,
        m.prix,
        m.remuneration,
        m.statut,
        `DEMO-CLIENT mission ${m.plaque}`,
      ],
    );
  }
  console.log(`· ${missions.length} missions créées`);

  const factures = [
    [
      "DEMO-CLIENT-2026-07",
      "Facture client — juillet 2026",
      78000,
      "2026-07-31",
      "payee",
    ],
    [
      "DEMO-CLIENT-2026-08",
      "Facture client — août 2026",
      56000,
      "2026-08-31",
      "emise",
    ],
  ];

  for (const [numero, libelle, montant, emission, statut] of factures) {
    const chemin = ecrireFichier(
      "factures",
      `${numero}.pdf`,
      `Facture ${numero}`,
    );
    await db.query(
      `INSERT INTO factures
         (destinataire_id, destinataire_role, numero, libelle, montant_ttc,
          date_emission, statut, original_name, file_path, mime_type, deposee_par)
       VALUES ($1, 'client', $2, $3, $4, $5::date, $6::facture_statut,
               $7, $8, 'application/pdf', $1)
       ON CONFLICT (destinataire_id, numero) DO UPDATE
         SET file_path = EXCLUDED.file_path, statut = EXCLUDED.statut`,
      [
        clientId,
        numero,
        libelle,
        montant,
        emission,
        statut,
        `${numero}.pdf`,
        chemin,
      ],
    );
  }
  console.log(`· ${factures.length} factures créées`);

  console.log(`
────────────────────────────────────────────────
  Client    : ${EMAIL_CLIENT}
  Mot de passe : ${MOT_DE_PASSE}
────────────────────────────────────────────────
  Missions   : 4 (1 à créer/coter, 1 devis prêt, 1 assignée, 1 livrée)
  Factures   : 2
  Démo Kaze  : compte convoyeur fictif créé pour le rendu

  Effacer :  node scripts/seed-demo-client.js --nettoyer
`);
  process.exit(0);
};

const action = process.argv.includes("--nettoyer") ? nettoyer : creer;
action().catch((err) => {
  console.error("✖ Erreur :", err.message);
  process.exit(1);
});
