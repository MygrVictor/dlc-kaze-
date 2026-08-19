/**
 * Service d'envoi d'emails — DLC Kaze
 *
 * Trois transporteurs, par ordre de priorité :
 *   1. Resend    — si RESEND_API_KEY est défini (recommandé en production)
 *   2. SMTP      — si SMTP_HOST est défini (Nodemailer)
 *   3. Console   — repli de développement, aucun envoi réel
 *
 * Variables .env :
 *   RESEND_API_KEY, EMAIL_FROM
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const nodemailer = require("nodemailer");

const FROM =
  process.env.EMAIL_FROM ||
  process.env.SMTP_FROM ||
  "DLC Kaze <onboarding@resend.dev>";

// ── Configuration du transporteur ────────────────────────────
let transporter;

if (process.env.RESEND_API_KEY) {
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Adaptateur exposant la même interface que Nodemailer,
  // pour que le reste du service reste inchangé.
  transporter = {
    sendMail: async ({
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments,
    }) => {
      const payload = {
        from: from || FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
      };
      if (html) payload.html = html;
      if (text) payload.text = text;
      if (replyTo) payload.replyTo = replyTo;
      if (attachments?.length) {
        payload.attachments = attachments.map((piece) => ({
          filename: piece.filename,
          content: piece.content,
        }));
      }

      const { data, error } = await resend.emails.send(payload);
      if (error) {
        throw new Error(`Resend : ${error.message || JSON.stringify(error)}`);
      }
      return { messageId: data?.id };
    },
  };
  console.log(`📧 Email configuré via Resend (expéditeur : ${FROM})`);
} else if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log(`📧 Email configuré via ${process.env.SMTP_HOST}`);
} else {
  // Mode dev : on log les emails en console
  transporter = {
    sendMail: async (options) => {
      console.log("📧 [DEV] Email non envoyé (aucun fournisseur configuré) :");
      console.log(`   → À : ${options.to}`);
      console.log(`   → Sujet : ${options.subject}`);
      return { messageId: "dev-" + Date.now() };
    },
  };
  console.log("📧 Email en mode dev (console uniquement)");
}

// ── Filet de sécurité anti-injection ─────────────────────────
//
// Les gabarits ci-dessous assemblent du HTML à partir de données qui
// proviennent parfois de l'extérieur (formulaires publics, API Kaze).
// Le middleware `sanitizeInputs` nettoie déjà tout ce qui entre par
// l'API, mais il ne couvre pas les données tierces. On enveloppe donc
// le transporteur : quel que soit le gabarit, présent ou futur, aucun
// script ni gestionnaire d'événement ne peut sortir d'ici.

/** Échappe une valeur destinée à être insérée dans du HTML. */
function echapperHtml(valeur) {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Retire du HTML assemblé tout ce qui pourrait être exécuté. */
function purgerHtml(html) {
  if (typeof html !== "string") return html;
  return (
    html
      // Balises exécutables, contenu compris.
      .replace(
        /<\s*(script|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
        "",
      )
      .replace(
        /<\s*(script|iframe|object|embed|form|meta\s+http-equiv)\b[^>]*>/gi,
        "",
      )
      // Gestionnaires d'événements inline : onclick, onerror, onload…
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // URL exécutables.
      .replace(
        /(href|src)\s*=\s*(["']?)\s*(?:javascript|vbscript|data):[^"'\s>]*\2/gi,
        '$1="#"',
      )
  );
}

/**
 * Neutralise l'injection d'en-têtes : un retour à la ligne glissé dans
 * un sujet ou une adresse permettrait d'ajouter un Bcc arbitraire.
 */
function purgerEntete(valeur) {
  if (typeof valeur !== "string") return valeur;
  return valeur.replace(/[\r\n]+/g, " ").trim();
}

const transporteurBrut = transporter;
transporter = {
  sendMail: (options = {}) =>
    transporteurBrut.sendMail({
      ...options,
      to: Array.isArray(options.to)
        ? options.to.map(purgerEntete)
        : purgerEntete(options.to),
      replyTo: purgerEntete(options.replyTo),
      subject: purgerEntete(options.subject),
      html: purgerHtml(options.html),
    }),
};

// ── Templates d'emails ───────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .body { background: #1e293b; padding: 30px 20px; border-radius: 0 0 12px 12px; }
    .body h2 { color: #f1f5f9; margin-top: 0; }
    .body p { color: #94a3b8; line-height: 1.6; }
    .info-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; }
    .info-label { color: #64748b; font-size: 13px; }
    .info-value { color: #f1f5f9; font-weight: 600; font-size: 13px; }
    .btn { display: inline-block; background: #6366f1; color: #fff !important; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
    .footer { text-align: center; padding: 20px; color: #475569; font-size: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-info { background: #312e81; color: #a5b4fc; }
    .badge-success { background: #14532d; color: #86efac; }
    .badge-warning { background: #713f12; color: #fde68a; }
    .price { font-size: 28px; font-weight: 700; color: #6366f1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 DLC Kaze</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} DLC Kaze — Convoyage automobile professionnel
    </div>
  </div>
</body>
</html>`;
}

// ── Fonctions d'envoi par événement ──────────────────────────

/**
 * Notifier le client qu'un devis a été proposé.
 */
async function notifyDevisPropose(clientEmail, clientName, mission, price) {
  const priceHT = parseFloat(price).toFixed(2);
  const priceTTC = (parseFloat(price) * 1.2).toFixed(2);

  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Un devis a été proposé pour votre mission de convoyage :</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${mission.vehicle_brand || ""} ${mission.vehicle_model || ""} — ${mission.vehicle_plate || "N/A"}</span></div>
      <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${mission.departure_address}</span></div>
      <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${mission.arrival_address}</span></div>
    </div>
    <p style="text-align: center; margin: 24px 0;">
      <span class="price">${priceHT} € HT</span><br>
      <span style="color: #64748b; font-size: 14px;">soit ${priceTTC} € TTC</span>
    </p>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/client/missions/${mission.id}" class="btn">Voir le devis</a>
    </p>
    <p style="font-size: 13px; color: #64748b;">Vous pouvez accepter ou refuser ce devis depuis votre espace client.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: `Devis DLC Kaze — ${priceHT} € HT — ${mission.vehicle_brand || "Véhicule"} ${mission.vehicle_plate || ""}`,
    html,
  });
}

/**
 * Notifier le client que sa mission a été acceptée et un convoyeur assigné.
 */
async function notifyMissionAssignee(
  clientEmail,
  clientName,
  mission,
  convoyeurName,
) {
  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Bonne nouvelle ! Un convoyeur a été assigné à votre mission :</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Convoyeur</span><span class="info-value">${convoyeurName}</span></div>
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${mission.vehicle_brand || ""} ${mission.vehicle_model || ""}</span></div>
      <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${mission.departure_address}</span></div>
      <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${mission.arrival_address}</span></div>
      <div class="info-row"><span class="info-label">Statut</span><span class="info-value"><span class="badge badge-info">Convoyeur assigné</span></span></div>
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/client/missions/${mission.id}" class="btn">Suivre ma mission</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: `Mission en préparation — Convoyeur assigné — ${mission.vehicle_brand || "Véhicule"}`,
    html,
  });
}

/**
 * Notifier le client que la mission est en cours.
 */
async function notifyMissionEnCours(clientEmail, clientName, mission) {
  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Votre véhicule est en cours de convoyage ! 🚗</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${mission.vehicle_brand || ""} ${mission.vehicle_model || ""} — ${mission.vehicle_plate || ""}</span></div>
      <div class="info-row"><span class="info-label">Trajet</span><span class="info-value">${mission.departure_address} → ${mission.arrival_address}</span></div>
      <div class="info-row"><span class="info-label">Statut</span><span class="info-value"><span class="badge badge-warning">En cours</span></span></div>
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/client/missions/${mission.id}" class="btn">Suivre ma mission</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: `Véhicule en cours de convoyage — ${mission.vehicle_brand || ""} ${mission.vehicle_plate || ""}`,
    html,
  });
}

/**
 * Notifier le client que la mission est livrée.
 */
async function notifyMissionLivree(clientEmail, clientName, mission) {
  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Votre véhicule a été livré avec succès ! ✅</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${mission.vehicle_brand || ""} ${mission.vehicle_model || ""} — ${mission.vehicle_plate || ""}</span></div>
      <div class="info-row"><span class="info-label">Livré à</span><span class="info-value">${mission.arrival_address}</span></div>
      <div class="info-row"><span class="info-label">Statut</span><span class="info-value"><span class="badge badge-success">Livré</span></span></div>
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/client/missions/${mission.id}" class="btn">Voir le détail</a>
    </p>
    <p style="font-size: 13px; color: #64748b;">Merci de votre confiance. N'hésitez pas à nous solliciter pour vos prochains convoyages.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: `✅ Véhicule livré — ${mission.vehicle_brand || ""} ${mission.vehicle_plate || ""}`,
    html,
  });
}

/**
 * Notifier l'admin d'une nouvelle inscription.
 */
async function notifyNewRegistration(user) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@dlc-kaze.fr";

  const html = baseTemplate(`
    <h2>Nouvelle inscription</h2>
    <p>Un nouvel utilisateur s'est inscrit sur la plateforme :</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${user.full_name}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${user.email}</span></div>
      <div class="info-row"><span class="info-label">Rôle</span><span class="info-value">${user.role}</span></div>
      ${user.company ? `<div class="info-row"><span class="info-label">Entreprise</span><span class="info-value">${user.company}</span></div>` : ""}
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/admin/users" class="btn">Gérer les utilisateurs</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: adminEmail,
    subject: `Nouvelle inscription — ${user.full_name} (${user.role})`,
    html,
  });
}

/**
 * Notifier un nouvel utilisateur de la création de son compte avec ses identifiants.
 */
async function notifyAccountCreated(user, clearPassword) {
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  const roleLabel = user.role === "convoyeur" ? "Convoyeur" : "Client";

  const html = baseTemplate(`
    <h2>Bienvenue sur DLC Kaze, ${user.full_name} !</h2>
    <p>Un compte <strong>${roleLabel}</strong> a été créé pour vous par l'administrateur.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${user.email}</span></div>
      <div class="info-row"><span class="info-label">Mot de passe</span><span class="info-value" style="font-family: monospace; letter-spacing: 1px;">${clearPassword}</span></div>
    </div>
    <p style="color: #f59e0b; font-size: 13px;">⚠️ Nous vous recommandons de changer votre mot de passe lors de votre première connexion.</p>
    <p style="text-align: center;">
      <a href="${loginUrl}" class="btn">Se connecter</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: `🎉 Votre compte DLC Kaze a été créé — Vos identifiants`,
    html,
  });
}

/**
 * Confirmer à un utilisateur que son inscription publique a bien été
 * reçue et qu'elle est en attente de validation par un administrateur.
 * (Ne contient jamais de mot de passe — contrairement à
 * notifyAccountCreated qui est réservée aux comptes créés PAR un admin.)
 */
async function notifyRegistrationReceived(clientEmail, clientName) {
  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Votre inscription sur DLC Kaze a bien été reçue. 🎉</p>
    <p>Votre compte est actuellement <strong>en attente de validation</strong> par un administrateur. Vous recevrez un email dès qu'il sera activé.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: "Inscription reçue — En attente de validation",
    html,
  });
}

/**
 * Notifier le client que son compte est validé.
 */
async function notifyAccountValidated(clientEmail, clientName) {
  const html = baseTemplate(`
    <h2>Bonjour ${clientName},</h2>
    <p>Bonne nouvelle ! Votre compte a été validé par un administrateur. 🎉</p>
    <p>Vous pouvez maintenant créer vos missions de convoyage.</p>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/client/nouvelle-mission" class="btn">Créer ma première mission</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: clientEmail,
    subject: "✅ Compte DLC Kaze validé — Vous pouvez créer des missions",
    html,
  });
}

/**
 * Notifier TOUS les convoyeurs qu'une nouvelle mission est disponible.
 * Appelé quand une mission passe au statut ACCEPTEE.
 */
async function notifyMissionDisponible(convoyeurs, mission) {
  if (!convoyeurs || convoyeurs.length === 0) return;

  const html = baseTemplate(`
    <h2>📬 Nouvelle mission disponible !</h2>
    <p>Une mission de convoyage vient d'être libérée. Vous pouvez la prendre :</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${mission.vehicle_brand || ""} ${mission.vehicle_model || ""} — ${mission.vehicle_plate || "N/A"}</span></div>
      <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${mission.departure_address}</span></div>
      <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${mission.arrival_address}</span></div>
      ${mission.price ? `<div class="info-row"><span class="info-label">Rémunération</span><span class="info-value" style="color: #fbbf24; font-weight: bold;">${mission.price_convoyeur || mission.price} €</span></div>` : ""}
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/convoyeur/disponibles" class="btn">Voir les missions</a>
    </p>
    <p style="font-size: 13px; color: #64748b;">Plus rapide tu seras, plus de chances tu auras de la prendre ! 🏃</p>
  `);

  // Envoyer l'email à CHAQUE convoyeur (pas de CC/BCC pour meilleure délivrabilité)
  const promises = convoyeurs.map((convoyeur) =>
    transporter
      .sendMail({
        from: FROM,
        to: convoyeur.email,
        subject: `🚗 Mission disponible — ${mission.vehicle_brand || "Véhicule"} ${mission.vehicle_plate || ""}`,
        html,
      })
      .catch((err) => {
        console.error(
          `⚠️ Email mission dispos non envoyé à ${convoyeur.email}:`,
          err.message,
        );
      }),
  );

  return Promise.all(promises);
}

/**
 * Notifier l'admin d'une nouvelle demande de mise en relation.
 * Aucun compte n'a été créé : c'est un prospect à rappeler.
 */
async function notifyNouvelleDemande(demande) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@dlc-kaze.fr";
  const estConvoyeur = demande.type === "convoyeur";
  const identite = estConvoyeur
    ? `${demande.first_name || ""} ${demande.last_name || ""}`.trim()
    : demande.company || "Structure non précisée";

  const html = baseTemplate(`
    <h2>Nouvelle demande ${estConvoyeur ? "convoyeur" : "client"}</h2>
    <p>Un visiteur souhaite être recontacté :</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">${estConvoyeur ? "Nom" : "Structure"}</span><span class="info-value">${identite}</span></div>
      ${demande.email ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${demande.email}</span></div>` : ""}
      ${demande.phone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${demande.phone}</span></div>` : ""}
      ${demande.message ? `<div class="info-row"><span class="info-label">Message</span><span class="info-value">${demande.message}</span></div>` : ""}
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/admin/demandes" class="btn">Voir les demandes</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: adminEmail,
    replyTo: demande.email || undefined,
    subject: `Nouvelle demande ${estConvoyeur ? "convoyeur" : "client"} — ${identite}`,
    html,
  });
}

/**
 * Alerter l'admin qu'une mission attend une cotation.
 * Sans cet email, une demande de devis peut dormir plusieurs jours si
 * personne n'ouvre le tableau de bord.
 */
async function notifyMissionACoter(mission, client) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@dlc-kaze.fr";
  const vehicule =
    [mission.vehicle_brand, mission.vehicle_model].filter(Boolean).join(" ") ||
    "Véhicule non précisé";

  const html = baseTemplate(`
    <h2>${mission.is_urgent ? "⚠️ Mission URGENTE à coter" : "Nouvelle mission à coter"}</h2>
    <p>${client?.full_name || "Un client"} vient de déposer une demande de convoyage.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${client?.company || client?.full_name || "—"}</span></div>
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${vehicule}${mission.vehicle_plate ? ` (${mission.vehicle_plate})` : ""}</span></div>
      <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${mission.departure_address || "—"}</span></div>
      <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${mission.arrival_address || "—"}</span></div>
      ${mission.departure_date ? `<div class="info-row"><span class="info-label">Date souhaitée</span><span class="info-value">${new Date(mission.departure_date).toLocaleDateString("fr-FR")}</span></div>` : ""}
    </div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/admin/missions" class="btn">Coter cette mission</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: adminEmail,
    replyTo: client?.email || undefined,
    subject: `${mission.is_urgent ? "[URGENT] " : ""}Mission à coter — ${vehicule}`,
    html,
  });
}

/**
 * Alerter l'équipe qu'un client vient de refuser un devis, avec son motif.
 * Le refus est une opportunité commerciale : on transmet aussi ses coordonnées
 * pour pouvoir le rappeler et ajuster la proposition.
 */
async function notifyDevisRefuse(mission, client, motif) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@dlc-kaze.fr";
  const vehicule =
    [mission.vehicle_brand, mission.vehicle_model].filter(Boolean).join(" ") ||
    "Véhicule non précisé";

  const html = baseTemplate(`
    <h2>Devis refusé par le client</h2>
    <p>${client?.full_name || "Un client"} a refusé le devis proposé. Un rappel téléphonique est recommandé.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${client?.company || client?.full_name || "—"}</span></div>
      ${client?.phone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${client.phone}</span></div>` : ""}
      ${client?.email ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${client.email}</span></div>` : ""}
      <div class="info-row"><span class="info-label">Véhicule</span><span class="info-value">${vehicule}${mission.vehicle_plate ? ` (${mission.vehicle_plate})` : ""}</span></div>
      <div class="info-row"><span class="info-label">Trajet</span><span class="info-value">${mission.departure_address || "—"} → ${mission.arrival_address || "—"}</span></div>
      ${mission.price ? `<div class="info-row"><span class="info-label">Prix proposé</span><span class="info-value">${parseFloat(mission.price).toFixed(2)} € HT</span></div>` : ""}
    </div>
    <p><strong style="color:#f1f5f9;">Motif du refus :</strong></p>
    <div class="info-box"><p style="margin:0;">${motif}</p></div>
    <p style="text-align: center;">
      <a href="${process.env.CLIENT_URL}/admin/missions" class="btn">Voir la mission</a>
    </p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: adminEmail,
    replyTo: client?.email || undefined,
    subject: `Devis refusé — ${client?.company || client?.full_name || "Client"} — ${vehicule}`,
    html,
  });
}

/**
 * Accusé de réception au visiteur. Volontairement sobre : aucun compte
 * n'existe encore, il ne faut donc promettre ni identifiants ni accès.
 */
async function notifyDemandeRecue(email, nom, type) {
  const html = baseTemplate(`
    <h2>Bonjour${nom ? ` ${nom}` : ""},</h2>
    <p>Nous avons bien reçu votre demande ${type === "convoyeur" ? "pour rejoindre notre réseau de convoyeurs" : "de mise en relation"}.</p>
    <p>Notre équipe l'étudie et vous recontacte rapidement${type === "convoyeur" ? " pour échanger sur votre profil" : " pour cerner vos besoins"}.</p>
    <p style="font-size: 13px; color: #64748b;">Votre accès à la plateforme sera créé par nos soins à l'issue de cet échange.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Votre demande a bien été reçue — Drive Line Connect",
    html,
  });
}

module.exports = {
  notifyDevisPropose,
  notifyMissionAssignee,
  notifyMissionEnCours,
  notifyMissionLivree,
  notifyNewRegistration,
  notifyRegistrationReceived,
  notifyAccountCreated,
  notifyAccountValidated,
  notifyMissionDisponible,
  notifyNouvelleDemande,
  notifyMissionACoter,
  notifyDevisRefuse,
  notifyDemandeRecue,
  echapperHtml,
  purgerHtml,
  purgerEntete,
};
