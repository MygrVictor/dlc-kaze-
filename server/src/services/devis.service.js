/**
 * Service de génération de devis PDF — Drive Line Connect
 *
 * Génère un document PDF professionnel avec toutes les informations
 * de la mission et le prix proposé, prêt à être renvoyé en réponse HTTP.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ─── Identité de l'émetteur ───────────────────────────────
const SOCIETE = {
  nom: "DRIVE LINE CONNECT",
  adresse: "25 Rue Lenepveu 49100 Angers, France",
  tel: "+33669583430",
  ville: "Angers",
  siret: "982 423 113 00025",
  tva: "FR11982423113",
  email: "drivelineconnect@gmail.com",
};

const MENTIONS_LEGALES = `${SOCIETE.nom} — ${SOCIETE.ville} — SIRET : ${SOCIETE.siret}`;

// ─── Couleurs ────────────────────────────────────────────────────
const COLORS = {
  // Palette alignée avec le site vitrine Drive Line
  primary: "#0B1D3A", // navy
  accent: "#FFD11A", // amber
  dark: "#1e1e2e",
  text: "#333333",
  muted: "#6b7280",
  line: "#e5e7eb",
  success: "#10b981",
  white: "#ffffff",
};

// ─── Helpers ─────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatPrice = (price) => {
  if (!price) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(price);
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateNumeric = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const energyLabels = {
  essence: "Essence",
  diesel: "Diesel",
  electrique: "Électrique",
  hybride: "Hybride",
  hybride_rechargeable: "Hybride rechargeable",
  gpl: "GPL",
};

const stateLabels = {
  neuf: "Neuf",
  occasion: "Occasion",
  accidente: "Accidenté",
  non_roulant: "Non roulant",
};

const formatDevisNumber = (value) => {
  const n = Number(value);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  return `DEV-${String(safe).padStart(6, "0")}`;
};

const resolveDevisLogoPath = () => {
  const candidates = [
    process.env.DEVIS_LOGO_PATH,
    path.resolve(__dirname, "../../../client/public/logo_devis.png"),
    path.resolve(__dirname, "../../../client/dist/logo_devis.png"),
    path.resolve(__dirname, "../../../client/public/logo.png"),
    path.resolve(__dirname, "../../../client/dist/logo.png"),
  ].filter(Boolean);

  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
};

const drawBrandHeader = (doc) => {
  const logoPath = resolveDevisLogoPath();

  if (logoPath) {
    doc.image(logoPath, 50, 22, { fit: [250, 50], align: "left" });
    return;
  }
};

const drawLegalBlock = (doc, y) => {
  void doc;
  void y;
};

// ─── Génération du PDF ──────────────────────────────────────────
function generateDevisPDF(mission, client) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Devis Mission ${mission.id.substring(0, 8).toUpperCase()}`,
      Author: "Drive Line Connect — Convoyage Automobile",
      Subject: "Devis de mission de convoyage",
    },
  });

  const pageWidth = doc.page.width - 100; // margins

  // ── HEADER ────────────────────────────────────────────────────
  // Bande de couleur en haut
  doc.rect(0, 0, doc.page.width, 8).fill(COLORS.primary);

  // Logo / Nom entreprise
  drawBrandHeader(doc);

  // Numéro de devis (côté droit)
  const devisNum = formatDevisNumber(
    mission.devis_number || mission.devis_numero || mission.quote_number,
  );
  const today = new Date();
  const echeance = mission.arrival_date || mission.departure_date || today;

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(`Devis N° : ${devisNum}`, 300, 30, {
      width: pageWidth - 250,
      align: "right",
    });
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(`Date d'émission : ${formatDateNumeric(today)}`, 300, 48, {
      width: pageWidth - 250,
      align: "right",
    })
    .text(`Date d'échéance : ${formatDateNumeric(echeance)}`, 300, 64, {
      width: pageWidth - 250,
      align: "right",
    });

  // Ligne de séparation
  doc
    .moveTo(50, 98)
    .lineTo(50 + pageWidth, 98)
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .stroke();

  // ── CONTACT + DESTINATAIRE ────────────────────────────────────
  let y = 112;
  let yRight = 112;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("CONTACT", 50, y);
  y += 16;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(SOCIETE.nom, 50, y, { width: 230 });
  y += 14;
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(SOCIETE.adresse, 50, y, { width: 230 });
  y += doc.heightOfString(SOCIETE.adresse, { width: 230 }) + 3;
  doc.text(`Tel: ${SOCIETE.tel}`, 50, y);
  y += 12;
  doc.text(`Email: ${SOCIETE.email}`, 50, y);
  y += 12;
  doc.text(`SIRET: ${SOCIETE.siret}`, 50, y);
  y += 12;
  doc.text(`TVA intracommunautaire: ${SOCIETE.tva}`, 50, y);

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("DESTINATAIRE DE LA FACTURE", 320, yRight, { width: 225 });
  yRight += 16;

  const destinataire = client.company || client.full_name || "—";
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(destinataire, 320, yRight, { width: 225 });
  yRight += 14;
  if (client.full_name && client.company) {
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(client.full_name, 320, yRight, { width: 225 });
    yRight += 12;
  }
  if (client.phone) {
    doc.text(`Tel: ${client.phone}`, 320, yRight, { width: 225 });
    yRight += 12;
  }
  doc.text(`Email: ${client.email || "—"}`, 320, yRight, { width: 225 });
  yRight += 12;

  // ── SÉPARATION ────────────────────────────────────────────────
  y = Math.max(y, yRight) + 14;
  doc
    .moveTo(50, y)
    .lineTo(50 + pageWidth, y)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  y += 15;

  // ── VÉHICULE ──────────────────────────────────────────────────
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("VÉHICULE", 50, y);
  y += 16;

  const vehicleLines = [];
  if (mission.vehicle_brand || mission.vehicle_model) {
    vehicleLines.push({
      label: "Marque / Modèle",
      value:
        `${mission.vehicle_brand || ""} ${mission.vehicle_model || ""}`.trim(),
    });
  }
  if (mission.vehicle_plate) {
    vehicleLines.push({ label: "Plaque", value: mission.vehicle_plate });
  }
  if (mission.vehicle_vin) {
    vehicleLines.push({ label: "VIN", value: mission.vehicle_vin });
  }
  if (mission.vehicle_finish) {
    vehicleLines.push({ label: "Finition", value: mission.vehicle_finish });
  }
  if (mission.vehicle_energy) {
    vehicleLines.push({
      label: "Énergie",
      value: energyLabels[mission.vehicle_energy] || mission.vehicle_energy,
    });
  }
  if (mission.vehicle_state) {
    vehicleLines.push({
      label: "État",
      value: stateLabels[mission.vehicle_state] || mission.vehicle_state,
    });
  }
  if (mission.vehicle_keys != null) {
    vehicleLines.push({
      label: "Clés",
      value: `${mission.vehicle_keys} jeu(x)`,
    });
  }

  vehicleLines.forEach((line) => {
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(line.label, 50, y, { width: 140 });
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text(line.value, 190, y, { width: pageWidth - 140 });
    y += 14;
  });

  // ── SÉPARATION ────────────────────────────────────────────────
  y += 10;
  doc
    .moveTo(50, y)
    .lineTo(50 + pageWidth, y)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  y += 15;

  // ── TRAJET ────────────────────────────────────────────────────
  // Départ
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("ENLÈVEMENT (DÉPART)", 50, y);
  y += 16;

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(mission.departure_address, 65, y, { width: pageWidth / 2 - 30 });
  y += doc.heightOfString(mission.departure_address, {
    width: pageWidth / 2 - 30,
  });
  y += 4;

  if (mission.departure_date) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Date : ${formatDate(mission.departure_date)}`, 65, y);
    y += 12;
  }
  if (mission.departure_contact_name) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Contact : ${mission.departure_contact_name}${mission.departure_contact_phone ? ` — ${mission.departure_contact_phone}` : ""}`,
        65,
        y,
      );
    y += 12;
  }
  if (mission.departure_instructions) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Instructions : ${mission.departure_instructions}`, 65, y, {
        width: pageWidth - 30,
      });
    y +=
      doc.heightOfString(`Instructions : ${mission.departure_instructions}`, {
        width: pageWidth - 30,
      }) + 4;
  }

  y += 10;

  // Arrivée
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("LIVRAISON (ARRIVÉE)", 50, y);
  y += 16;

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(mission.arrival_address, 65, y, { width: pageWidth / 2 - 30 });
  y += doc.heightOfString(mission.arrival_address, {
    width: pageWidth / 2 - 30,
  });
  y += 4;

  if (mission.arrival_date) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Date : ${formatDate(mission.arrival_date)}`, 65, y);
    y += 12;
  }
  if (mission.arrival_contact_name) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Contact : ${mission.arrival_contact_name}${mission.arrival_contact_phone ? ` — ${mission.arrival_contact_phone}` : ""}`,
        65,
        y,
      );
    y += 12;
  }

  // ── SERVICES ──────────────────────────────────────────────────
  const services = [];
  if (mission.service_wash_exterior) services.push("Lavage extérieur");
  if (mission.service_clean_interior) services.push("Nettoyage intérieur");
  if (mission.service_refuel) services.push("Plein de carburant");
  if (mission.service_handover) services.push("Mise en main du véhicule");

  if (services.length > 0) {
    y += 15;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text("SERVICES ADDITIONNELS", 50, y);
    y += 16;
    services.forEach((s) => {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(COLORS.text)
        .text(`✓  ${s}`, 65, y);
      y += 14;
    });
  }

  // ── URGENCE ───────────────────────────────────────────────────
  if (mission.emergency_phone) {
    y += 10;
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(COLORS.muted)
      .text(`Contact d'urgence : ${mission.emergency_phone}`, 50, y);
    y += 12;
  }

  // ── COMMENTAIRES ──────────────────────────────────────────────
  if (mission.comments) {
    y += 10;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(COLORS.primary)
      .text("COMMENTAIRES", 50, y);
    y += 16;
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(COLORS.text)
      .text(mission.comments, 65, y, { width: pageWidth - 30 });
    y += doc.heightOfString(mission.comments, { width: pageWidth - 30 }) + 4;
  }

  // ── TABLEAU DE PRIX ───────────────────────────────────────────
  y += 25;
  doc
    .moveTo(50, y)
    .lineTo(50 + pageWidth, y)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  y += 5;

  // Header du tableau
  doc.rect(50, y, pageWidth, 25).fill("#f3f4f6");
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Désignation", 60, y + 7)
    .text("Montant HT", 350, y + 7, { width: 100, align: "right" })
    .text("TTC", 450, y + 7, { width: 95, align: "right" });
  y += 25;

  // Ligne mission — le prix coté au client est HORS TAXE
  const ht = mission.price ? Number(mission.price).toFixed(2) : "—";
  const ttc = mission.price ? (Number(mission.price) * 1.2).toFixed(2) : "—";
  const description =
    `Convoyage ${mission.vehicle_brand || ""} ${mission.vehicle_model || ""} — ${mission.departure_address} → ${mission.arrival_address}`.trim();

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(description, 60, y + 8, { width: 280 });
  const descH = doc.heightOfString(description, { width: 280 });
  doc
    .fontSize(9)
    .font("Helvetica")
    .text(`${ht} €`, 350, y + 8, { width: 100, align: "right" });
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(`${ttc} €`, 450, y + 8, { width: 95, align: "right" });
  y += Math.max(descH, 14) + 16;

  // Services lines
  if (services.length > 0) {
    services.forEach((s) => {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`   └ ${s}`, 60, y + 4, { width: 280 });
      doc.text("inclus", 350, y + 4, { width: 100, align: "right" });
      doc.text("inclus", 450, y + 4, { width: 95, align: "right" });
      y += 16;
    });
  }

  // Séparation
  doc
    .moveTo(300, y)
    .lineTo(50 + pageWidth, y)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  y += 8;

  // TVA
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text("Total HT", 350, y, { width: 100, align: "right" });
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(`${ht} €`, 450, y, { width: 95, align: "right" });
  y += 15;

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text("TVA (20%)", 350, y, { width: 100, align: "right" });
  const tva = mission.price ? (Number(mission.price) * 0.2).toFixed(2) : "—";
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(`${tva} €`, 450, y, { width: 95, align: "right" });
  y += 18;

  // Total TTC — encadré
  doc.rect(350, y - 3, 195, 28).fill(COLORS.primary);
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.white)
    .text("TOTAL TTC", 360, y + 4, { width: 90, align: "left" });
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.white)
    .text(formatPrice(Number(mission.price) * 1.2), 450, y + 2, {
      width: 85,
      align: "right",
    });

  // ── CONDITIONS ET MENTIONS LÉGALES ───────────────────────────
  y += 55;
  drawLegalBlock(doc, y);

  // ── FOOTER ────────────────────────────────────────────────────
  doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(COLORS.primary);

  return doc;
}

// ─── Devis groupé (plusieurs véhicules, un seul document) ────────
/**
 * Un client qui confie cinq véhicules au départ du même site attend une
 * seule proposition chiffrée, pas cinq PDF à ouvrir un par un. Ce document
 * reprend le trajet commun une fois, puis détaille une ligne par véhicule
 * et n'affiche qu'un total.
 *
 * @param {Array} missions  missions du même lot, toutes cotées
 * @param {Object} client
 */
function generateDevisGroupePDF(missions, client) {
  const first = missions[0];
  const devisNum = formatDevisNumber(
    first.devis_number || first.devis_numero || first.quote_number,
  );

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Devis groupé ${devisNum}`,
      Author: "Drive Line Connect — Convoyage Automobile",
      Subject: `Devis de convoyage — ${missions.length} véhicules`,
    },
  });

  const pageWidth = doc.page.width - 100;

  // ── HEADER ────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 8).fill(COLORS.primary);
  drawBrandHeader(doc);

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("DEVIS", 350, 30, { width: pageWidth - 300, align: "right" });
  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text(devisNum, 350, 45, { width: pageWidth - 300, align: "right" });
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      `${missions.length} véhicules — émis le ${formatDateShort(new Date())}`,
      350,
      68,
      { width: pageWidth - 300, align: "right" },
    );

  doc
    .moveTo(50, 90)
    .lineTo(50 + pageWidth, 90)
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .stroke();

  // ── CLIENT ────────────────────────────────────────────────────
  let y = 105;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("CLIENT", 50, y);
  y += 16;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(client.full_name || "—", 50, y);
  y += 14;
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(client.email || "", 50, y);
  if (client.phone) {
    y += 13;
    doc.text(client.phone, 50, y);
  }
  if (client.company) {
    y += 13;
    doc.text(client.company, 50, y);
  }

  // ── TRAJET COMMUN ─────────────────────────────────────────────
  let yr = 105;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("TRAJET", 320, yr);
  yr += 16;
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text("DÉPART", 320, yr);
  yr += 11;
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.text)
    .text(first.departure_address || "—", 320, yr, { width: 225 });
  yr += doc.heightOfString(first.departure_address || "—", { width: 225 }) + 8;
  doc.fontSize(8).fillColor(COLORS.text).text("ARRIVÉE", 320, yr);
  yr += 11;
  doc
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(first.arrival_address || "—", 320, yr, { width: 225 });
  yr += doc.heightOfString(first.arrival_address || "—", { width: 225 });

  if (first.departure_date) {
    yr += 8;
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Enlèvement : ${formatDateShort(first.departure_date)}`, 320, yr);
    yr += 12;
  }

  // ── TABLEAU DES VÉHICULES ─────────────────────────────────────
  y = Math.max(y, yr) + 30;

  doc.rect(50, y, pageWidth, 25).fill("#f3f4f6");
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text("Véhicule", 60, y + 7)
    .text("Montant HT", 350, y + 7, { width: 100, align: "right" })
    .text("TTC", 450, y + 7, { width: 95, align: "right" });
  y += 25;

  let totalHT = 0;

  missions.forEach((m, index) => {
    // Saut de page si la ligne ne rentre plus : sans cela le tableau
    // déborderait silencieusement sur les conditions de vente.
    if (y > doc.page.height - 220) {
      doc.addPage();
      y = 60;
    }

    const prixHT = Number(m.price) || 0;
    totalHT += prixHT;

    if (index % 2 === 1) doc.rect(50, y, pageWidth, 30).fill("#fafafa");

    const designation =
      `${m.vehicle_brand || ""} ${m.vehicle_model || ""}`.trim() || "Véhicule";
    const identification = [
      m.vehicle_plate,
      m.vehicle_vin ? `VIN ${m.vehicle_vin}` : null,
      m.vehicle_energy ? energyLabels[m.vehicle_energy] : null,
      m.vehicle_state ? stateLabels[m.vehicle_state] : null,
    ]
      .filter(Boolean)
      .join(" — ");

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text(`${index + 1}. ${designation}`, 60, y + 5, { width: 280 });
    if (identification) {
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(identification, 60, y + 17, { width: 280 });
    }

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(COLORS.text)
      .text(`${prixHT.toFixed(2)} €`, 350, y + 9, {
        width: 100,
        align: "right",
      });
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(`${(prixHT * 1.2).toFixed(2)} €`, 450, y + 9, {
        width: 95,
        align: "right",
      });

    y += 30;
  });

  // ── SERVICES ──────────────────────────────────────────────────
  const services = [];
  if (first.service_refuel) services.push("Plein de carburant");
  if (first.service_handover) services.push("Mise en main du véhicule");
  if (first.service_document_management) services.push("Gestion documentaire");

  if (services.length > 0) {
    services.forEach((s) => {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(COLORS.muted)
        .text(`   └ ${s}`, 60, y + 4, { width: 280 });
      doc.text("inclus", 350, y + 4, { width: 100, align: "right" });
      doc.text("inclus", 450, y + 4, { width: 95, align: "right" });
      y += 16;
    });
  }

  // ── TOTAUX ────────────────────────────────────────────────────
  y += 6;
  doc
    .moveTo(300, y)
    .lineTo(50 + pageWidth, y)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  y += 8;

  const tva = totalHT * 0.2;
  const totalTTC = totalHT * 1.2;

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(`Total HT (${missions.length} véhicules)`, 300, y, {
      width: 150,
      align: "right",
    });
  doc
    .fillColor(COLORS.text)
    .text(`${totalHT.toFixed(2)} €`, 450, y, { width: 95, align: "right" });
  y += 15;

  doc
    .fillColor(COLORS.muted)
    .text("TVA (20%)", 350, y, { width: 100, align: "right" });
  doc
    .fillColor(COLORS.text)
    .text(`${tva.toFixed(2)} €`, 450, y, { width: 95, align: "right" });
  y += 18;

  doc.rect(350, y - 3, 195, 28).fill(COLORS.primary);
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.white)
    .text("TOTAL TTC", 360, y + 4, { width: 90, align: "left" });
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(COLORS.white)
    .text(formatPrice(totalTTC), 450, y + 2, { width: 85, align: "right" });

  // ── CONDITIONS ET MENTIONS LÉGALES ───────────────────────────
  y += 55;
  drawLegalBlock(doc, y);

  doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(COLORS.primary);

  return doc;
}

module.exports = { generateDevisPDF, generateDevisGroupePDF };
