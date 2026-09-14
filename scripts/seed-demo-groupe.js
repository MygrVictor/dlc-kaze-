/**
 * Jeu de démonstration — comptes rattachés (siège et entités)
 *
 * Fabrique un groupe fictif : un siège et trois filiales, chacune avec
 * ses propres missions. Sert à constater de visu ce que la hiérarchie
 * change, chose qu'aucun test ne montre puisqu'ils simulent la base.
 *
 * Ce qu'il faut observer en se connectant :
 *
 *   · le siège voit les missions des trois entités, avec le nom de
 *     l'entité rappelé sur chaque ligne ;
 *   · une entité ne voit que les siennes et n'a aucun moyen de
 *     soupçonner l'existence des deux autres ni celle du siège ;
 *   · le siège peut consulter une mission d'une entité mais ne peut pas
 *     l'annuler — `estTitulaire` réserve l'action au commanditaire.
 *
 * Le siège reçoit volontairement deux missions à son nom : sans cela on
 * ne distinguerait pas « voir ses propres missions » de « voir celles
 * de ses entités », et le mélange des deux est justement le cas qui
 * mérite d'être regardé.
 *
 * Mêmes garde-fous que seed-demo-convoyeur.js : refus hors localhost,
 * et tout porte le domaine @demo.local pour que --nettoyer ne puisse
 * rien effacer d'autre.
 *
 * Usage :
 *   node scripts/seed-demo-groupe.js
 *   node scripts/seed-demo-groupe.js --nettoyer
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const bcrypt = require("bcryptjs");
const db = require("../server/src/db");

const MOT_DE_PASSE = "Demo2026!";
const DOMAINE = "@groupe.demo.local";

// ── Garde-fou ────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(
    "✖ Refus : DATABASE_URL ne pointe pas sur localhost.\n" +
      "  Ce script ne doit jamais toucher la base de production.",
  );
  process.exit(1);
}

const SIEGE = {
  email: `siege${DOMAINE}`,
  full_name: "Hélène Marchand",
  company: "Groupe Vertu Mobilité",
  phone: "0140000001",
};

const ENTITES = [
  {
    email: `lyon${DOMAINE}`,
    full_name: "Karim Belkacem",
    company: "Vertu Mobilité — Lyon Est",
    phone: "0472000002",
  },
  {
    email: `nantes${DOMAINE}`,
    full_name: "Sophie Renard",
    company: "Vertu Mobilité — Nantes",
    phone: "0240000003",
  },
  {
    email: `lille${DOMAINE}`,
    full_name: "Thomas Ferry",
    company: "Vertu Mobilité — Lille Métropole",
    phone: "0320000004",
  },
];

/**
 * Les missions couvrent six des huit statuts, dont `DEVIS_PROPOSE` et
 * `DEVIS_REFUSE` : ce sont les deux que la refonte des tons distingue le
 * plus nettement, et les laisser de côté reviendrait à ne rien montrer.
 */
const MISSIONS = {
  siege: [
    {
      vehicle_plate: "GA-101-VM",
      vehicle_brand: "Volvo",
      vehicle_model: "XC60",
      departure_address: "12 rue de Londres, 75009 Paris",
      arrival_address: "4 place Bellecour, 69002 Lyon",
      status: "LIVREE",
      price: 480,
      jours: -18,
    },
    {
      vehicle_plate: "GA-102-VM",
      vehicle_brand: "Audi",
      vehicle_model: "A6 Avant",
      departure_address: "12 rue de Londres, 75009 Paris",
      arrival_address: "8 rue Nationale, 59000 Lille",
      status: "EN_COURS",
      price: 320,
      jours: -2,
    },
  ],
  lyon: [
    {
      vehicle_plate: "LY-201-VM",
      vehicle_brand: "Renault",
      vehicle_model: "Austral",
      departure_address: "22 avenue Jean Jaurès, 69007 Lyon",
      arrival_address: "9 rue Sainte-Catherine, 33000 Bordeaux",
      status: "DEVIS_PROPOSE",
      price: 540,
      jours: -1,
    },
    {
      vehicle_plate: "LY-202-VM",
      vehicle_brand: "Peugeot",
      vehicle_model: "3008",
      departure_address: "22 avenue Jean Jaurès, 69007 Lyon",
      arrival_address: "3 cours Mirabeau, 13100 Aix-en-Provence",
      status: "ASSIGNEE",
      price: 360,
      jours: -5,
    },
    {
      vehicle_plate: "LY-203-VM",
      vehicle_brand: "Tesla",
      vehicle_model: "Model Y",
      departure_address: "22 avenue Jean Jaurès, 69007 Lyon",
      arrival_address: "17 quai des Bergues, 74100 Annemasse",
      status: "LIVREE",
      price: 290,
      jours: -24,
    },
  ],
  nantes: [
    {
      vehicle_plate: "NT-301-VM",
      vehicle_brand: "Citroën",
      vehicle_model: "C5 Aircross",
      departure_address: "5 rue Crébillon, 44000 Nantes",
      arrival_address: "31 rue du Faubourg, 35000 Rennes",
      status: "EN_ATTENTE_DE_COTATION",
      price: null,
      jours: 0,
    },
    {
      vehicle_plate: "NT-302-VM",
      vehicle_brand: "Ford",
      vehicle_model: "Transit",
      departure_address: "5 rue Crébillon, 44000 Nantes",
      arrival_address: "2 place du Capitole, 31000 Toulouse",
      status: "DEVIS_REFUSE",
      price: 720,
      jours: -9,
    },
  ],
  lille: [
    {
      vehicle_plate: "LI-401-VM",
      vehicle_brand: "Mercedes",
      vehicle_model: "Vito",
      departure_address: "8 rue Nationale, 59000 Lille",
      arrival_address: "14 rue Neuve, 80000 Amiens",
      status: "ACCEPTEE",
      price: 210,
      jours: -3,
    },
    {
      vehicle_plate: null, // repli « Plaque non renseignée » à vérifier
      vehicle_brand: "Dacia",
      vehicle_model: "Duster",
      departure_address: "8 rue Nationale, 59000 Lille",
      arrival_address: "6 place Kléber, 67000 Strasbourg",
      status: "LIVREE",
      price: 640,
      jours: -31,
    },
  ],
};

const dansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function creerCompte(compte, parentId = null) {
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone, company,
                        role, is_validated, parent_id)
     VALUES ($1, $2, $3, $4, $5, 'client', true, $6)
     ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            company   = EXCLUDED.company,
            parent_id = EXCLUDED.parent_id,
            updated_at = NOW()
     RETURNING id`,
    [
      compte.email,
      hash,
      compte.full_name,
      compte.phone,
      compte.company,
      parentId,
    ],
  );
  return rows[0].id;
}

async function creerMissions(clientId, missions) {
  for (const m of missions) {
    const depart = dansNJours(m.jours);
    const arrivee = dansNJours(m.jours + 1);
    await db.query(
      `INSERT INTO missions (client_id, vehicle_plate, vehicle_brand, vehicle_model,
                             departure_address, departure_date, departure_contact_name,
                             departure_contact_phone, arrival_address, arrival_date,
                             arrival_contact_name, arrival_contact_phone,
                             status, price, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Accueil site','0100000000',$7,$8,
               'Réception','0100000000',$9,$10,$11,$11)`,
      [
        clientId,
        m.vehicle_plate,
        m.vehicle_brand,
        m.vehicle_model,
        m.departure_address,
        depart,
        m.arrival_address,
        arrivee,
        m.status,
        m.price,
        depart,
      ],
    );
  }
}

async function nettoyer() {
  // Les missions partent d'abord : la contrainte sur client_id est en
  // cascade, mais compter ce qui est supprimé demande de le faire à la main.
  const { rowCount: nbMissions } = await db.query(
    `DELETE FROM missions
      WHERE client_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`%${DOMAINE}`],
  );
  const { rowCount: nbComptes } = await db.query(
    `DELETE FROM users WHERE email LIKE $1`,
    [`%${DOMAINE}`],
  );
  console.log(`🧹 ${nbMissions} mission(s) et ${nbComptes} compte(s) effacés.`);
}

async function semer() {
  await nettoyer();

  const siegeId = await creerCompte(SIEGE);
  await creerMissions(siegeId, MISSIONS.siege);
  console.log(`✔ Siège  ${SIEGE.email}  (${MISSIONS.siege.length} missions)`);

  const cles = ["lyon", "nantes", "lille"];
  for (let i = 0; i < ENTITES.length; i++) {
    const id = await creerCompte(ENTITES[i], siegeId);
    const missions = MISSIONS[cles[i]];
    await creerMissions(id, missions);
    console.log(
      `  └ Entité ${ENTITES[i].email}  (${missions.length} missions)`,
    );
  }

  const total =
    MISSIONS.siege.length + cles.reduce((s, c) => s + MISSIONS[c].length, 0);

  console.log(`
Mot de passe commun : ${MOT_DE_PASSE}

  Connecte-toi d'abord en tant que siege${DOMAINE} :
  le tableau de bord doit afficher les ${total} missions, chacune
  portant le nom de l'entité qui l'a commandée.

  Puis en tant que lyon${DOMAINE} :
  ${MISSIONS.lyon.length} missions, aucune mention du siège ni des deux autres filiales.

Pour effacer : node scripts/seed-demo-groupe.js --nettoyer`);
}

const action = process.argv.includes("--nettoyer") ? nettoyer : semer;
action()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Échec :", err.message);
    process.exit(1);
  });
