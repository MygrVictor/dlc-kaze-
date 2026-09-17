#!/usr/bin/env node
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const target = process.env.TARGET_EMAIL || "victormasoyguellrivet@gmail.com";

// Force les templates orientés admin/commercial vers la même boîte de réception.
process.env.ADMIN_EMAIL = target;
process.env.SALES_EMAIL = target;

if (!process.env.CLIENT_URL) {
  process.env.CLIENT_URL = "https://app.drivelineconnect.com";
}

const emailService = require("../server/src/services/email.service");

const mission = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  vehicle_brand: "Renault",
  vehicle_model: "Clio",
  vehicle_plate: "AA-123-BB",
  departure_address: "10 rue de Rivoli, Paris",
  arrival_address: "1 place Bellecour, Lyon",
  departure_date: new Date().toISOString(),
  price: 650,
  price_convoyeur: 420,
  is_urgent: false,
};

const client = {
  full_name: "Client Démo",
  email: target,
  phone: "+33 6 12 34 56 78",
  company: "Entreprise Démo",
};

const user = {
  full_name: "Utilisateur Démo",
  email: target,
  role: "client",
  company: "Entreprise Démo",
};

const demandeClient = {
  type: "client",
  first_name: "Victor",
  last_name: "Rivet",
  company: "Atelier Démo",
  job_title: "Responsable flotte",
  email: target,
  phone: "+33 6 12 34 56 78",
  message: "Besoin d'un devis récurrent.",
};

const demandeConvoyeur = {
  type: "convoyeur",
  first_name: "Paul",
  last_name: "Martin",
  siret: "12345678901234",
  rc_circulation: "oui",
  rc_pro: "en_cours",
  w_garage: false,
  email: target,
  phone: "+33 6 11 22 33 44",
  message: "Disponible en région lyonnaise.",
};

async function run() {
  const checks = [
    [
      "notifyDevisPropose",
      () => emailService.notifyDevisPropose(target, "Victor", mission, 500),
    ],
    [
      "notifyMissionAssignee",
      () =>
        emailService.notifyMissionAssignee(
          target,
          "Victor",
          mission,
          "Paul Convoyeur",
        ),
    ],
    [
      "notifyMissionEnCours",
      () => emailService.notifyMissionEnCours(target, "Victor", mission),
    ],
    [
      "notifyMissionLivree",
      () => emailService.notifyMissionLivree(target, "Victor", mission),
    ],
    ["notifyNewRegistration", () => emailService.notifyNewRegistration(user)],
    [
      "notifyRegistrationReceived",
      () => emailService.notifyRegistrationReceived(target, "Victor"),
    ],
    [
      "notifyAccountCreated",
      () => emailService.notifyAccountCreated(user, "MotDePasse#2026"),
    ],
    [
      "notifyAccountValidated",
      () => emailService.notifyAccountValidated(target, "Victor"),
    ],
    [
      "notifyMissionDisponible",
      () => emailService.notifyMissionDisponible([{ email: target }], mission),
    ],
    [
      "notifyNouvelleDemande(client)",
      () => emailService.notifyNouvelleDemande(demandeClient),
    ],
    [
      "notifyNouvelleDemande(convoyeur)",
      () => emailService.notifyNouvelleDemande(demandeConvoyeur),
    ],
    [
      "notifyMissionACoter",
      () => emailService.notifyMissionACoter(mission, client),
    ],
    [
      "notifyDevisRefuse",
      () =>
        emailService.notifyDevisRefuse(
          mission,
          client,
          "Tarif au-dessus du budget prévu",
        ),
    ],
    [
      "notifyDemandeRecue(client)",
      () => emailService.notifyDemandeRecue(target, "Victor", "client"),
    ],
    [
      "notifyDemandeRecue(convoyeur)",
      () => emailService.notifyDemandeRecue(target, "Victor", "convoyeur"),
    ],
    [
      "notifyPasswordReset",
      () =>
        emailService.notifyPasswordReset(
          target,
          "Victor",
          `${process.env.CLIENT_URL}/reset?token=demo`,
          30,
        ),
    ],
    [
      "notifyPasswordChanged",
      () => emailService.notifyPasswordChanged(target, "Victor"),
    ],
  ];

  const sent = [];
  for (const [name, fn] of checks) {
    try {
      const res = await fn();
      sent.push({ name, messageId: res?.messageId || "ok" });
      console.log(`✅ ${name} -> ${res?.messageId || "ok"}`);
    } catch (err) {
      console.error(`❌ ${name} -> ${err.message}`);
      throw err;
    }
  }

  console.log(`\nTerminé: ${sent.length} template(s) envoyés vers ${target}.`);
}

run().catch((err) => {
  console.error("Échec de l'envoi des templates:", err);
  process.exit(1);
});
