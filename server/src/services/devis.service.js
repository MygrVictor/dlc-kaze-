/**
 * Service de génération de devis PDF — DLC Kaze
 *
 * Génère un document PDF professionnel avec toutes les informations
 * de la mission et le prix proposé, prêt à être renvoyé en réponse HTTP.
 */

const PDFDocument = require("pdfkit");

// ─── Couleurs ────────────────────────────────────────────────────
const COLORS = {
  primary: "#6366f1", // indigo-500
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

// ─── Génération du PDF ──────────────────────────────────────────
function generateDevisPDF(mission, client) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Devis Mission ${mission.id.substring(0, 8).toUpperCase()}`,
      Author: "DLC Kaze — Convoyage Automobile",
      Subject: "Devis de mission de convoyage",
    },
  });

  const pageWidth = doc.page.width - 100; // margins

  // ── HEADER ────────────────────────────────────────────────────
  // Bande de couleur en haut
  doc.rect(0, 0, doc.page.width, 8).fill(COLORS.primary);

  // Logo / Nom entreprise
  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("DLC KAZE", 50, 30);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text("Convoyage Automobile Professionnel", 50, 60);

  // Numéro de devis (côté droit)
  const devisNum = `DEV-${mission.id.substring(0, 8).toUpperCase()}`;
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
    .text(`Émis le ${formatDateShort(new Date())}`, 350, 68, {
      width: pageWidth - 300,
      align: "right",
    });

  // Ligne de séparation
  doc
    .moveTo(50, 90)
    .lineTo(50 + pageWidth, 90)
    .strokeColor(COLORS.line)
    .lineWidth(1)
    .stroke();

  // ── INFORMATIONS CLIENT ───────────────────────────────────────
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

  // ── VÉHICULE ──────────────────────────────────────────────────
  y = 105;
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(COLORS.primary)
    .text("VÉHICULE", 320, y);
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
      .text(line.label, 320, y);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text(line.value, 420, y);
    y += 14;
  });

  // ── SÉPARATION ────────────────────────────────────────────────
  y = Math.max(y, 200) + 10;
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
    .fillColor(COLORS.success)
    .text("● ENLÈVEMENT (DÉPART)", 50, y);
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
    .fillColor("#ef4444")
    .text("● LIVRAISON (ARRIVÉE)", 50, y);
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

  // Ligne mission
  const ht = mission.price ? (Number(mission.price) / 1.2).toFixed(2) : "—";
  const ttc = mission.price ? Number(mission.price).toFixed(2) : "—";
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
  const tva = mission.price
    ? (Number(mission.price) - Number(mission.price) / 1.2).toFixed(2)
    : "—";
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
    .text(formatPrice(mission.price), 450, y + 2, {
      width: 85,
      align: "right",
    });

  // ── CONDITIONS ────────────────────────────────────────────────
  y += 55;
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      "Ce devis est valable 30 jours à compter de sa date d'émission.",
      50,
      y,
    )
    .text(
      "Conditions de paiement : à réception de facture. Pénalités de retard : 3 fois le taux d'intérêt légal.",
      50,
      y + 12,
    )
    .text(
      "DLC Kaze — Convoyage Automobile Professionnel — SIRET : XXX XXX XXX XXXXX",
      50,
      y + 24,
    );

  // ── FOOTER ────────────────────────────────────────────────────
  doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(COLORS.primary);

  return doc;
}

module.exports = { generateDevisPDF };
