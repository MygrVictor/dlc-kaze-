/**
 * Jeu de démonstration — espace convoyeur
 *
 * Sert à enregistrer une présentation vidéo sans filmer de données réelles.
 * Un espace vide donne l'impression d'un outil mort ; montrer la production
 * exposerait des plaques, des adresses de particuliers et des numéros de
 * téléphone. Ce script fabrique donc un convoyeur fictif, son dossier
 * complet, ses missions et ses factures.
 *
 * Deux garde-fous :
 *
 *  1. il refuse de s'exécuter si la base ne tourne pas sur localhost. La
 *     confusion entre le .env local et celui de production est l'accident
 *     classique, et il serait ici irréversible ;
 *  2. tout ce qu'il crée porte le préfixe DEMO- ou le domaine @demo.local,
 *     ce qui rend le nettoyage sûr — `--nettoyer` ne peut rien effacer
 *     d'autre.
 *
 * Usage :
 *   node scripts/seed-demo-convoyeur.js
 *   node scripts/seed-demo-convoyeur.js --nettoyer
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("../server/src/db");

const EMAIL_CONVOYEUR = "demo.convoyeur@demo.local";
const EMAIL_CLIENT = "demo.client@demo.local";
const MOT_DE_PASSE = "Demo2026!";
const RACINE_UPLOADS = path.resolve(__dirname, "../uploads");

// ── Garde-fou ────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(
    "✖ Refus : DATABASE_URL ne pointe pas sur localhost.\n" +
      "  Ce script ne doit jamais toucher la base de production.",
  );
  process.exit(1);
}

// ── Pièces jointes factices ──────────────────────────────────────────────
/**
 * Un PDF minimal mais valide : le navigateur doit pouvoir l'ouvrir à
 * l'écran pendant la démonstration, sinon le clic sur « Voir » aboutit à
 * une page d'erreur qui gâche la présentation.
 */
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

// ── Nettoyage ────────────────────────────────────────────────────────────
const nettoyer = async () => {
  console.log("Nettoyage du jeu de démonstration…");

  // Les fichiers d'abord : une fois les lignes supprimées, on ne saurait
  // plus lesquels retirer du disque.
  const { rows: fichiers } = await db.query(
    `SELECT file_path FROM factures WHERE numero LIKE 'DEMO-%'
     UNION ALL
     SELECT cd.file_path FROM convoyeur_documents cd
       JOIN users u ON u.id = cd.convoyeur_id
      WHERE u.email LIKE '%@demo.local'`,
  );
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
  // ON DELETE CASCADE emporte les documents ; les missions du client de
  // démonstration suivent, celles du convoyeur voient leur lien annulé.
  await db.query("DELETE FROM missions WHERE vehicle_plate LIKE 'DM-%'");
  const { rowCount } = await db.query(
    "DELETE FROM users WHERE email LIKE '%@demo.local'",
  );

  console.log(`✅ ${rowCount} compte(s), ${effaces} fichier(s) supprimé(s).`);
  process.exit(0);
};

// ── Création ─────────────────────────────────────────────────────────────
const creer = async () => {
  console.log("Jeu de démonstration — espace convoyeur\n");

  const hash = await bcrypt.hash(MOT_DE_PASSE, 12);

  // Un client porteur est nécessaire : missions.client_id est obligatoire.
  const { rows: clientRows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated)
     VALUES ($1, $2, 'Sophie Marchand', 'Garage des Trois Ponts', '0102030405', 'client', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [EMAIL_CLIENT, hash],
  );
  const clientId = clientRows[0].id;

  const { rows: convoyeurRows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated)
     VALUES ($1, $2, 'Julien Bertrand', 'JB Convoyage', '0611223344', 'convoyeur', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [EMAIL_CONVOYEUR, hash],
  );
  const convoyeurId = convoyeurRows[0].id;
  console.log("· comptes créés");

  // ── Dossier complet : sans lui, la prise de mission reste bloquée ──
  const pieces = [
    ["permis", "Permis de conduire"],
    ["permis_verso", "Permis de conduire — verso"],
    ["carte_identite", "Carte nationale d'identite"],
    ["carte_identite_verso", "Carte nationale d'identite — verso"],
    ["rc_circulation", "Attestation RC circulation"],
    ["rc_pro", "Attestation RC professionnelle"],
    ["domicile", "Justificatif de domicile"],
  ];

  for (const [type, titre] of pieces) {
    const chemin = ecrireFichier("documents", `demo-${type}.pdf`, titre);
    await db.query(
      `INSERT INTO convoyeur_documents
         (convoyeur_id, type, original_name, file_path, mime_type, status, reviewed_at)
       VALUES ($1, $2, $3, $4, 'application/pdf', 'valide', NOW())
       ON CONFLICT (convoyeur_id, type) DO UPDATE
         SET file_path = EXCLUDED.file_path, status = 'valide'`,
      [convoyeurId, type, `${titre}.pdf`, chemin],
    );
  }
  console.log(`· dossier complet (${pieces.length} pièces validées)`);

  // ── Missions ────────────────────────────────────────────────────────
  // Les plaques commencent par DM- : c'est la marque qui rend le
  // nettoyage sélectif possible.
  const missions = [
    // Assignées au convoyeur — onglet « Mon planning »
    {
      plaque: "DM-101-AA",
      marque: "Peugeot",
      modele: "308",
      de: "12 avenue Jean Jaurès, 69007 Lyon",
      vers: "45 rue de la République, 42000 Saint-Étienne",
      contact: "Marc Dubois",
      tel: "0478112233",
      jours: 1,
      prix: 320,
      remuneration: 180,
      statut: "ASSIGNEE",
      convoyeur: true,
    },
    {
      plaque: "DM-102-BB",
      marque: "Renault",
      modele: "Master",
      de: "8 boulevard Vivier Merle, 69003 Lyon",
      vers: "17 quai Perrache, 69002 Lyon",
      contact: "Nadia Lefèvre",
      tel: "0472445566",
      jours: 2,
      prix: 240,
      remuneration: 140,
      statut: "ASSIGNEE",
      convoyeur: true,
    },
    {
      plaque: "DM-103-CC",
      marque: "Volkswagen",
      modele: "Transporter",
      de: "3 rue du Dauphiné, 38000 Grenoble",
      vers: "22 avenue de Genève, 74000 Annecy",
      contact: "Éric Fontaine",
      tel: "0476778899",
      jours: 0,
      prix: 410,
      remuneration: 230,
      statut: "EN_COURS",
      convoyeur: true,
    },

    // Ouvertes à tous — onglet « Missions disponibles »
    {
      plaque: "DM-201-DD",
      marque: "BMW",
      modele: "Série 3",
      de: "5 place Bellecour, 69002 Lyon",
      vers: "31 rue Sainte-Catherine, 33000 Bordeaux",
      contact: "Claire Vasseur",
      tel: "0556334455",
      jours: 3,
      prix: 780,
      remuneration: 430,
      statut: "ACCEPTEE",
      convoyeur: false,
    },
    {
      plaque: "DM-202-EE",
      marque: "Mercedes",
      modele: "Sprinter",
      de: "9 rue de la Villette, 69003 Lyon",
      vers: "14 cours Lafayette, 21000 Dijon",
      contact: "Thomas Girard",
      tel: "0380667788",
      jours: 2,
      prix: 460,
      remuneration: 260,
      statut: "ACCEPTEE",
      convoyeur: false,
    },
    {
      plaque: "DM-203-FF",
      marque: "Audi",
      modele: "A4",
      de: "27 avenue Berthelot, 69007 Lyon",
      vers: "6 rue Nationale, 59000 Lille",
      contact: "Amélie Roux",
      tel: "0320889900",
      jours: 4,
      prix: 890,
      remuneration: 490,
      statut: "ACCEPTEE",
      convoyeur: false,
    },
    {
      plaque: "DM-204-GG",
      marque: "Citroën",
      modele: "Jumpy",
      de: "18 rue Garibaldi, 69006 Lyon",
      vers: "2 place Masséna, 06000 Nice",
      contact: "Bruno Carpentier",
      tel: "0493221133",
      jours: 5,
      prix: 690,
      remuneration: 380,
      statut: "ACCEPTEE",
      convoyeur: false,
    },

    // Terminées — onglet « Historique »
    {
      plaque: "DM-301-HH",
      marque: "Toyota",
      modele: "Yaris",
      de: "40 rue de Marseille, 69007 Lyon",
      vers: "11 rue du Taur, 31000 Toulouse",
      contact: "Hélène Moreau",
      tel: "0561445566",
      jours: -12,
      prix: 540,
      remuneration: 300,
      statut: "LIVREE",
      convoyeur: true,
    },
    {
      plaque: "DM-302-II",
      marque: "Ford",
      modele: "Transit",
      de: "7 rue Servient, 69003 Lyon",
      vers: "23 rue Saint-Ferréol, 13001 Marseille",
      contact: "Pascal Nguyen",
      tel: "0491667788",
      jours: -20,
      prix: 470,
      remuneration: 265,
      statut: "LIVREE",
      convoyeur: true,
    },
    {
      plaque: "DM-303-JJ",
      marque: "Dacia",
      modele: "Duster",
      de: "16 rue Vendôme, 69006 Lyon",
      vers: "4 rue des Carmes, 45000 Orléans",
      contact: "Sandrine Petit",
      tel: "0238114455",
      jours: -31,
      prix: 620,
      remuneration: 350,
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
        "Véhicule en bon état, carte grise dans la boîte à gants.",
      ],
    );
  }
  console.log(`· ${missions.length} missions créées`);

  // ── Factures ────────────────────────────────────────────────────────
  const factures = [
    [
      "DEMO-2026-07",
      "Prestations de convoyage — juillet 2026",
      168000,
      "2026-07-31",
      "payee",
    ],
    [
      "DEMO-2026-08",
      "Prestations de convoyage — août 2026",
      143500,
      "2026-08-31",
      "payee",
    ],
    [
      "DEMO-2026-09",
      "Prestations de convoyage — septembre 2026",
      91500,
      "2026-09-30",
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
       VALUES ($1, 'convoyeur', $2, $3, $4, $5::date, $6::facture_statut,
               $7, $8, 'application/pdf', $1)
       ON CONFLICT (destinataire_id, numero) DO UPDATE
         SET file_path = EXCLUDED.file_path, statut = EXCLUDED.statut`,
      [
        convoyeurId,
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
  Convoyeur : ${EMAIL_CONVOYEUR}
  Client    : ${EMAIL_CLIENT}
  Mot de passe : ${MOT_DE_PASSE}
────────────────────────────────────────────────
  Planning        3 missions (2 assignées, 1 en cours)
  Disponibles     4 missions à prendre
  Historique      3 missions livrées
  Factures        3 (2 payées, 1 émise)
  Dossier         complet, 7 pièces validées

  Effacer :  node scripts/seed-demo-convoyeur.js --nettoyer
`);
  process.exit(0);
};

const action = process.argv.includes("--nettoyer") ? nettoyer : creer;
action().catch((err) => {
  console.error("✖ Erreur :", err.message);
  process.exit(1);
});
