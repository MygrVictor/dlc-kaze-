#!/usr/bin/env node
/**
 * Jeu de démonstration — groupe parent / 3 comptes enfants
 *
 * Crée localement un compte parent client et 3 comptes enfants.
 * Chaque enfant reçoit des missions, factures et documents pour
 * démontrer le comportement de filtrage et de sélection parent/enfant.
 *
 * Usage :
 *   node scripts/seed-demo-parent-group.js
 *   node scripts/seed-demo-parent-group.js --nettoyer
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../server/src/db");

const PARENT_EMAIL = "demo.parent@demo.local";
const CHILDREN = [
  {
    email: "demo.enfant1@demo.local",
    company: "Alpha Mobilités",
    full_name: "Sophie Martin",
  },
  {
    email: "demo.enfant2@demo.local",
    company: "Beta Logistics",
    full_name: "Jean Dupont",
  },
  {
    email: "demo.enfant3@demo.local",
    company: "Gamma Transit",
    full_name: "Claire Bernard",
  },
];
const MOT_DE_PASSE = "DemoParent2026!";
const UPLOAD_DIR = path.resolve(__dirname, "../uploads");

const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(
    "✖ Refus : DATABASE_URL ne pointe pas sur localhost.\n" +
      "  Ce script ne doit jamais toucher la base de production.",
  );
  process.exit(1);
}

function pdfFactice(titre) {
  const contenu = `BT /F1 22 Tf 60 720 Td (${titre}) Tj ET\nBT /F1 12 Tf 60 690 Td (Demonstration - Drive Line Connect) Tj ET`;
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
}

const ecrireFichier = (sousDossier, nom, titre) => {
  const dossier = path.join(UPLOAD_DIR, sousDossier);
  fs.mkdirSync(dossier, { recursive: true });
  const destination = path.join(dossier, nom);
  fs.writeFileSync(destination, pdfFactice(titre));
  return `/uploads/${sousDossier}/${nom}`;
};

async function ensureMissionDateColumns() {
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'missions' AND table_schema = 'public'`,
  );

  const existing = new Set(rows.map((row) => row.column_name));

  if (!existing.has("desired_pickup_date")) {
    await db.query(
      `ALTER TABLE missions ADD COLUMN desired_pickup_date TIMESTAMPTZ;`,
    );
  }

  if (!existing.has("desired_delivery_date")) {
    await db.query(
      `ALTER TABLE missions ADD COLUMN desired_delivery_date TIMESTAMPTZ;`,
    );
  }
}

async function nettoyer() {
  const emails = [PARENT_EMAIL, ...CHILDREN.map((c) => c.email)];

  const { rows: factures } = await db
    .query(
      `SELECT file_path FROM factures WHERE destinataire_id IN (
         SELECT id FROM users WHERE email = ANY($1)
       )`,
      [emails],
    )
    .catch(() => ({ rows: [] }));

  factures.forEach(({ file_path }) => {
    const absolute = path.join(
      UPLOAD_DIR,
      file_path.replace(/^\/uploads\//, ""),
    );
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  });

  const { rows: docs } = await db
    .query(
      `SELECT file_path FROM user_documents WHERE user_id IN (
         SELECT id FROM users WHERE email = ANY($1)
       )`,
      [emails],
    )
    .catch(() => ({ rows: [] }));

  docs.forEach(({ file_path }) => {
    const absolute = path.join(
      UPLOAD_DIR,
      file_path.replace(/^\/uploads\//, ""),
    );
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  });

  await db.query(
    `DELETE FROM user_documents
      WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await db.query(
    `DELETE FROM factures
      WHERE destinataire_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await db.query(
    `DELETE FROM missions
      WHERE client_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  const result = await db.query(`DELETE FROM users WHERE email = ANY($1)`, [
    emails,
  ]);

  console.log(`✅ ${result.rowCount} utilisateur(s) supprimé(s).`);
  console.log("✅ fichiers démo supprimés.");
  process.exit(0);
}

async function creer() {
  await ensureMissionDateColumns();

  const hash = await bcrypt.hash(MOT_DE_PASSE, 12);

  const parentRes = await db.query(
    `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated)
     VALUES ($1, $2, 'Groupe Demo Parent', 'Groupe Demo Parent', '0600000000', 'client', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           company = EXCLUDED.company,
           phone = EXCLUDED.phone,
           role = 'client',
           is_validated = true
     RETURNING id`,
    [PARENT_EMAIL, hash],
  );

  const parentId = parentRes.rows[0].id;

  for (const enfant of CHILDREN) {
    const res = await db.query(
      `INSERT INTO users (email, password_hash, full_name, company, phone, role, is_validated, parent_id)
       VALUES ($1, $2, $3, $4, '060000000' || $5, 'client', true, $6)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             company = EXCLUDED.company,
             phone = EXCLUDED.phone,
             role = 'client',
             is_validated = true,
             parent_id = EXCLUDED.parent_id
       RETURNING id`,
      [
        enfant.email,
        hash,
        enfant.full_name,
        enfant.company,
        String(CHILDREN.indexOf(enfant) + 1),
        parentId,
      ],
    );

    const childId = res.rows[0].id;

    const missions = [
      {
        plaque: `DG-${String(CHILDREN.indexOf(enfant) + 1).padStart(3, "0")}-A1`,
        marque: ["Peugeot", "Renault", "Audi"][CHILDREN.indexOf(enfant)],
        modele: ["208", "Scénic", "Q5"][CHILDREN.indexOf(enfant)],
        depart: [
          "12 avenue Jean Jaurès, 69007 Lyon",
          "23 rue de la République, 75011 Paris",
          "8 boulevard de la Liberté, 13001 Marseille",
        ][CHILDREN.indexOf(enfant)],
        arrivee: [
          "45 rue du 8 Mai 1945, 69009 Lyon",
          "14 avenue Foch, 75116 Paris",
          "10 boulevard du Prado, 13006 Marseille",
        ][CHILDREN.indexOf(enfant)],
        statut: ["EN_ATTENTE_DE_COTATION", "DEVIS_PROPOSE", "LIVREE"][
          CHILDREN.indexOf(enfant) % 3
        ],
        desired_pickup_date: new Date(
          Date.now() + 2 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        desired_delivery_date: new Date(
          Date.now() + 5 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        prix:
          ["EN_ATTENTE_DE_COTATION", "DEVIS_PROPOSE", "LIVREE"][
            CHILDREN.indexOf(enfant) % 3
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 420 + CHILDREN.indexOf(enfant) * 110,
        remuneration:
          ["EN_ATTENTE_DE_COTATION", "DEVIS_PROPOSE", "LIVREE"][
            CHILDREN.indexOf(enfant) % 3
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 210 + CHILDREN.indexOf(enfant) * 50,
      },
      {
        plaque: `DG-${String(CHILDREN.indexOf(enfant) + 1).padStart(3, "0")}-B2`,
        marque: ["Volkswagen", "Mercedes", "BMW"][CHILDREN.indexOf(enfant)],
        modele: ["Transporter", "Classe V", "X5"][CHILDREN.indexOf(enfant)],
        depart: [
          "2 rue des Fêtes, 31000 Toulouse",
          "17 quai de la Loire, 44000 Nantes",
          "7 avenue de la Gare, 59000 Lille",
        ][CHILDREN.indexOf(enfant)],
        arrivee: [
          "28 boulevard de la Paix, 31000 Toulouse",
          "50 rue de la Boulangerie, 44000 Nantes",
          "9 place du Général Leclerc, 59000 Lille",
        ][CHILDREN.indexOf(enfant)],
        statut: ["ASSIGNEE", "DEVIS_PROPOSE", "EN_ATTENTE_DE_COTATION"][
          CHILDREN.indexOf(enfant)
        ],
        desired_pickup_date: new Date(
          Date.now() + 3 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        desired_delivery_date: new Date(
          Date.now() + 7 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        prix:
          ["ASSIGNEE", "DEVIS_PROPOSE", "EN_ATTENTE_DE_COTATION"][
            CHILDREN.indexOf(enfant)
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 610 + CHILDREN.indexOf(enfant) * 120,
        remuneration:
          ["ASSIGNEE", "DEVIS_PROPOSE", "EN_ATTENTE_DE_COTATION"][
            CHILDREN.indexOf(enfant)
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 330 + CHILDREN.indexOf(enfant) * 60,
      },
      {
        plaque: `DG-${String(CHILDREN.indexOf(enfant) + 1).padStart(3, "0")}-C3`,
        marque: ["Tesla", "Ford", "Citroën"][CHILDREN.indexOf(enfant)],
        modele: ["Model 3", "Transit", "C4"][CHILDREN.indexOf(enfant)],
        depart: [
          "5 rue du Port, 33000 Bordeaux",
          "30 avenue du Général de Gaulle, 75014 Paris",
          "15 boulevard du Midi, 31000 Toulouse",
        ][CHILDREN.indexOf(enfant)],
        arrivee: [
          "18 rue de la Madeleine, 33000 Bordeaux",
          "22 rue de l'Université, 75007 Paris",
          "24 avenue de la Mer, 31000 Toulouse",
        ][CHILDREN.indexOf(enfant)],
        statut: ["LIVREE", "ASSIGNEE", "DEVIS_PROPOSE"][
          CHILDREN.indexOf(enfant)
        ],
        desired_pickup_date: new Date(
          Date.now() + 4 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        desired_delivery_date: new Date(
          Date.now() + 9 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        prix: 750 + CHILDREN.indexOf(enfant) * 130,
        remuneration: 390 + CHILDREN.indexOf(enfant) * 70,
      },
      {
        plaque: `DG-${String(CHILDREN.indexOf(enfant) + 1).padStart(3, "0")}-D4`,
        marque: ["Fiat", "Kia", "Volvo"][CHILDREN.indexOf(enfant)],
        modele: ["500", "Sportage", "XC60"][CHILDREN.indexOf(enfant)],
        depart: [
          "9 rue des Écoles, 69003 Lyon",
          "41 avenue de la République, 75010 Paris",
          "25 boulevard Saint-Charles, 13005 Marseille",
        ][CHILDREN.indexOf(enfant)],
        arrivee: [
          "51 route de Vienne, 38200 Grenoble",
          "11 rue du Faubourg Saint-Honoré, 75008 Paris",
          "72 avenue de la Corse, 13008 Marseille",
        ][CHILDREN.indexOf(enfant)],
        statut: ["DEVIS_PROPOSE", "LIVREE", "ASSIGNEE"][
          CHILDREN.indexOf(enfant)
        ],
        desired_pickup_date: new Date(
          Date.now() + 6 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        desired_delivery_date: new Date(
          Date.now() + 11 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        prix: 880 + CHILDREN.indexOf(enfant) * 140,
        remuneration: 430 + CHILDREN.indexOf(enfant) * 75,
      },
      {
        plaque: `DG-${String(CHILDREN.indexOf(enfant) + 1).padStart(3, "0")}-E5`,
        marque: ["Seat", "Porsche", "Mini"][CHILDREN.indexOf(enfant)],
        modele: ["Leon", "Cayenne", "Countryman"][CHILDREN.indexOf(enfant)],
        depart: [
          "14 rue Saint-Pierre, 33000 Bordeaux",
          "6 place de la Victoire, 44000 Nantes",
          "2 avenue du Château, 59000 Lille",
        ][CHILDREN.indexOf(enfant)],
        arrivee: [
          "31 rue de la Mairie, 33300 Mérignac",
          "13 rue de l'Hôtel de Ville, 44100 Nantes",
          "60 boulevard d'Alsace, 59800 Lille",
        ][CHILDREN.indexOf(enfant)],
        statut: ["EN_ATTENTE_DE_COTATION", "ASSIGNEE", "DEVIS_PROPOSE"][
          CHILDREN.indexOf(enfant)
        ],
        desired_pickup_date: new Date(
          Date.now() + 8 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        desired_delivery_date: new Date(
          Date.now() + 14 * 86400000 + CHILDREN.indexOf(enfant) * 86400000,
        ),
        prix:
          ["EN_ATTENTE_DE_COTATION", "ASSIGNEE", "DEVIS_PROPOSE"][
            CHILDREN.indexOf(enfant)
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 960 + CHILDREN.indexOf(enfant) * 170,
        remuneration:
          ["EN_ATTENTE_DE_COTATION", "ASSIGNEE", "DEVIS_PROPOSE"][
            CHILDREN.indexOf(enfant)
          ] === "EN_ATTENTE_DE_COTATION"
            ? null
            : 500 + CHILDREN.indexOf(enfant) * 80,
      },
    ];

    for (const mission of missions) {
      await db.query(
        `INSERT INTO missions (
          client_id, vehicle_plate, vehicle_brand, vehicle_model,
          departure_address, departure_date, arrival_address, arrival_date,
          desired_pickup_date, desired_delivery_date,
          price, price_convoyeur, status, comments, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, NOW() - interval '7 days', $6, NOW() - interval '2 days',
          $7, $8,
          $9, $10, $11::mission_status, $12,
          NOW() - interval '12 days', NOW() - interval '1 day'
        )`,
        [
          childId,
          mission.plaque,
          mission.marque,
          mission.modele,
          mission.depart,
          mission.arrivee,
          mission.desired_pickup_date,
          mission.desired_delivery_date,
          mission.prix,
          mission.remuneration,
          mission.statut,
          `DEMO-PARENT-GROUP ${mission.plaque}`,
        ],
      );
    }

    const factures = [
      {
        numero: `DEMO-${String(CHILDREN.indexOf(enfant) + 1).padStart(2, "0")}-A`,
        libelle: `${enfant.company} — facture juillet`,
        montant: 78000 + CHILDREN.indexOf(enfant) * 1800,
        statut: ["payee", "emise", "annulee"][CHILDREN.indexOf(enfant)],
      },
      {
        numero: `DEMO-${String(CHILDREN.indexOf(enfant) + 1).padStart(2, "0")}-B`,
        libelle: `${enfant.company} — facture août`,
        montant: 92000 + CHILDREN.indexOf(enfant) * 2200,
        statut: ["emise", "payee", "emise"][CHILDREN.indexOf(enfant)],
      },
    ];

    for (const facture of factures) {
      const fichier = ecrireFichier(
        "factures",
        `${facture.numero}.pdf`,
        `${facture.libelle}`,
      );

      await db.query(
        `INSERT INTO factures (
          destinataire_id, destinataire_role, numero, libelle, montant_ttc,
          date_emission, statut, original_name, file_path, mime_type, deposee_par
        ) VALUES ($1, 'client', $2, $3, $4, NOW() - interval '14 days', $5::facture_statut, $6, $7, 'application/pdf', $1)`,
        [
          childId,
          facture.numero,
          facture.libelle,
          facture.montant,
          facture.statut,
          `${facture.numero}.pdf`,
          fichier,
        ],
      );
    }

    const docFiles = [
      {
        label: "Contrat de prestations",
        file: `doc-${CHILDREN.indexOf(enfant) + 1}-contrat.pdf`,
      },
      {
        label: "Attestation de prise en charge",
        file: `doc-${CHILDREN.indexOf(enfant) + 1}-attestation.pdf`,
      },
    ];

    for (const doc of docFiles) {
      const filePath = ecrireFichier("documents", doc.file, doc.label);

      await db.query(
        `INSERT INTO user_documents (
          user_id, label, original_name, file_path, mime_type, kind, uploaded_by
        ) VALUES ($1, $2, $3, $4, 'application/pdf', 'client_extra', $1)`,
        [childId, doc.label, doc.file, filePath],
      );
    }

    const recapPath = ecrireFichier(
      "documents",
      `kaze-recap-${CHILDREN.indexOf(enfant) + 1}.pdf`,
      `Résumé Kaze - ${enfant.company}`,
    );

    await db.query(
      `INSERT INTO user_documents (
        user_id, label, original_name, file_path, mime_type, kind, source, source_ref
      ) VALUES ($1, $2, $3, $4, 'application/pdf', 'kaze_recap', 'kaze_recap', $5)`,
      [
        childId,
        `Résumé Kaze - ${enfant.company}`,
        `kaze-recap-${CHILDREN.indexOf(enfant) + 1}.pdf`,
        recapPath,
        `demo-parent-group:${enfant.email}`,
      ],
    );
  }

  console.log("\n✅ Compte parent et 3 comptes enfants créés avec succès.");
  console.log("\nIdentifiants de démonstration :");
  console.log(`  Parent : ${PARENT_EMAIL} / ${MOT_DE_PASSE}`);
  CHILDREN.forEach((enfant, idx) => {
    console.log(`  Enfant ${idx + 1} : ${enfant.email} / ${MOT_DE_PASSE}`);
  });
  console.log("\nÀ tester sur la page client :");
  console.log("  - Mes missions avec sélecteur de compte");
  console.log("  - Mes devis et factures par compte");
  console.log("  - Mes documents / recaps par compte");
  process.exit(0);
}

async function main() {
  if (process.argv.includes("--nettoyer")) {
    await nettoyer();
    return;
  }

  await creer();
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
