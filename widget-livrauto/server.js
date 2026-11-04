/**
 * Prototype autonome du widget Livr'Auto — TEST LOCAL UNIQUEMENT.
 *
 * Totalement séparé de l'application : aucune base de données, aucun
 * import depuis server/, aucun effet réel (pas de mission, d'email, de
 * Kaze ni de Telegram). Les commandes sont simplement écrites dans
 * commandes-test.json.
 *
 * Lancement : node widget-livrauto/server.js
 * Démo      : http://localhost:4100/widget/demo/
 *
 * Le jour de la fusion, il suffira de brancher /api/widget/* sur le vrai
 * service de tarification et de création de mission.
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
// Configuration propre au widget (ORS_API_KEY…), distincte du .env de l'app.
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const { distanceRoutiere } = require("./distance");
const { prixVL } = require("./grille");

const PORT = process.env.WIDGET_PORT || 4100;
const VAT_RATE = 0.2;
const QUOTE_TTL_MS = 30 * 24 * 3600 * 1000;
const FICHIER_COMMANDES = path.join(__dirname, "commandes-test.json");

const quotes = new Map(); // en mémoire : perdu au redémarrage, c'est voulu

// Comptes partenaires simulés (futur rôle `partenaire` de la table users,
// voir SPEC-PARTENAIRE.md §7). Clé = partner_code, en minuscules.
const PARTENAIRES = {
  interencheres: {
    id: "partner-interencheres",
    nom: "Interenchères",
    actif: true,
    commission_type: "pourcentage",
    commission_value: 10,
  },
};

function trouverPartenaire(nom) {
  const p = PARTENAIRES[texte(nom, 50).toLowerCase()];
  return p && p.actif ? p : null;
}

/** Commission figée au moment de la commande (SPEC §8). */
function calculerCommission(partenaire, prixHT) {
  return partenaire.commission_type === "fixe"
    ? round2(partenaire.commission_value)
    : round2((prixHT * partenaire.commission_value) / 100);
}

const app = express();
// Limité aux routes du widget : monté dans l'app (staging), il ne doit pas
// imposer sa limite de 20 ko aux autres routes.
app.use("/api/widget", express.json({ limit: "20kb" }));

// ── Page du widget : seule autorisée en iframe ──────────────
app.use("/widget", (_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self' https://api-adresse.data.gouv.fr",
      "object-src 'none'",
      "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.interencheres.com",
    ].join("; "),
  );
  next();
});
app.use("/widget", express.static(path.join(__dirname, "public")));

// ── Outils ──────────────────────────────────────────────────
const round2 = (n) => Math.round(n * 100) / 100;
const texte = (v, max = 200) =>
  v == null ? "" : String(v).trim().slice(0, max);

async function geocode(adresse) {
  const url = `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(adresse)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const f = (await res.json()).features?.[0];
  if (!f || f.properties.score < 0.4) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat, lng };
}

// ── API ─────────────────────────────────────────────────────
app.post("/api/widget/estimation", async (req, res) => {
  try {
    const {
      partner,
      external_id,
      depart = {},
      adresse_arrivee,
    } = req.body || {};
    const arrivee = texte(adresse_arrivee, 300);
    const adresseDep = [
      texte(depart.street),
      `${texte(depart.postcode)} ${texte(depart.city)}`.trim(),
    ]
      .filter(Boolean)
      .join(", ");

    const partenaire = trouverPartenaire(partner);
    if (!partenaire) {
      return res.status(403).json({ error: "Partenaire inconnu." });
    }
    if (!adresseDep || arrivee.length < 5) {
      return res
        .status(400)
        .json({ error: "Adresse de départ ou de destination manquante." });
    }

    const lat = Number(depart.lat);
    const lng = Number(depart.lng);
    const from =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : await geocode(adresseDep);
    // Les coordonnées d'arrivée ne sont jamais prises du navigateur :
    // l'acheteur pourrait les modifier pour payer moins. Le serveur
    // géocode lui-même l'adresse saisie (BAN), puis calcule l'itinéraire.
    const to = await geocode(arrivee);
    if (!from || !to) {
      return res.status(422).json({
        error:
          "Adresse introuvable. Vérifiez le numéro, la rue et le code postal.",
      });
    }

    const distance = await distanceRoutiere(from, to);
    const km = Math.round(distance.km);
    // Grille VL Interenchères (HT), sur les km affichés à l'acheteur.
    const tarif = prixVL(km);
    const ht = tarif.price_ht;
    const ttc = round2(ht * (1 + VAT_RATE));

    const quote = {
      quote_id: crypto.randomUUID(),
      partner_id: partenaire.id,
      partner_reference: texte(external_id, 50),
      adresse_depart: adresseDep,
      pickup: {
        name: texte(depart.name, 150),
        phone: texte(depart.phone, 25),
        email: texte(depart.email, 150),
      },
      insured_value: Number(depart.insurance_value) || null,
      adresse_arrivee: arrivee,
      distance_km: km,
      distance_methode: distance.methode, // 'ors' ou 'estimation'
      tarif: {
        grille: "interencheres-vl",
        prix_km: tarif.prix_km,
        forfait: tarif.forfait,
      },
      coords_depart: from,
      coords_arrivee: to,
      price_ht: ht,
      price_ttc: ttc,
      expires_at: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    };
    quotes.set(quote.quote_id, quote);

    const { quote_id, distance_km, price_ht, price_ttc, expires_at } = quote;
    return res
      .status(201)
      .json({ quote_id, distance_km, price_ht, price_ttc, expires_at });
  } catch (err) {
    console.error(err);
    return res
      .status(503)
      .json({ error: "Service momentanément indisponible." });
  }
});

// ── Signature des CGV (simulée) ───────────────────────────
// Remplace DocuSign dans le prototype. Le serveur, et non le navigateur,
// enregistre la preuve : version des CGV, devis, signataire, horodatage,
// IP et navigateur, scellés par une empreinte SHA-256. La commande exige
// ensuite une signature valide pour ce devis et ce signataire.
const CGV_VERSION = "2026-11-v1";
const signatures = new Map(); // signature_ref → preuve

app.post("/api/widget/signature", (req, res) => {
  const { quote_id, client = {}, cgv_version, accepte } = req.body || {};
  const quote = quotes.get(quote_id);

  if (!quote || quote.consumed) {
    return res.status(404).json({
      error:
        "Ce devis a expiré ou a déjà été utilisé. Relancez une estimation.",
    });
  }
  if (accepte !== true) {
    return res
      .status(400)
      .json({ error: "Vous devez accepter les conditions générales." });
  }
  if (cgv_version !== CGV_VERSION) {
    return res.status(409).json({
      error:
        "Les conditions générales ont été mises à jour. Rechargez la page.",
    });
  }
  const email = texte(client.email, 150).toLowerCase();
  const nom =
    `${texte(client.first_name, 80)} ${texte(client.last_name, 80)}`.trim();
  if (!email || !nom) {
    return res
      .status(400)
      .json({ error: "Coordonnées du signataire manquantes." });
  }

  const signed_at = new Date().toISOString();
  const preuve = {
    cgv_version: CGV_VERSION,
    quote_id,
    signataire_nom: nom,
    signataire_email: email,
    signed_at,
    ip: req.ip,
    user_agent: texte(req.get("user-agent"), 300),
  };
  const empreinte = crypto
    .createHash("sha256")
    .update(JSON.stringify(preuve))
    .digest("hex");
  const signature_ref = `SIG-${empreinte.slice(0, 12).toUpperCase()}`;
  signatures.set(signature_ref, { ...preuve, empreinte });

  console.log("Signature CGV :", signature_ref, nom, signed_at);
  return res
    .status(201)
    .json({ signature_ref, signed_at, cgv_version: CGV_VERSION });
});

app.post("/api/widget/commande", (req, res) => {
  const { quote_id, client = {}, signature_ref } = req.body || {};
  const quote = quotes.get(quote_id);

  if (!quote || quote.consumed) {
    return res.status(404).json({
      error:
        "Ce devis a expiré ou a déjà été utilisé. Relancez une estimation.",
    });
  }
  const signature = signatures.get(signature_ref);
  if (
    !signature ||
    signature.quote_id !== quote_id ||
    signature.signataire_email !== texte(client.email, 150).toLowerCase()
  ) {
    return res
      .status(400)
      .json({ error: "Les conditions générales doivent être signées." });
  }
  if (
    !client.first_name ||
    !client.last_name ||
    !client.email ||
    !client.phone
  ) {
    return res
      .status(400)
      .json({ error: "Coordonnées incomplètes ou invalides." });
  }

  const partenaire = Object.values(PARTENAIRES).find(
    (p) => p.id === quote.partner_id,
  );

  quote.consumed = true;
  // Même forme que la future ligne `missions` (SPEC §7) : le jour de la
  // jonction, ces champs deviennent des colonnes.
  const commande = {
    id: `TEST-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString(),
    client_id: partenaire.id, // compte partenaire, pas l'acheteur
    source: "widget",
    status: "ACCEPTEE", // pas de cotation : prix issu de la grille
    partner_reference: quote.partner_reference,
    departure_address: quote.adresse_depart,
    arrival_address: quote.adresse_arrivee,
    distance_km: quote.distance_km,
    distance_methode: quote.distance_methode,
    pickup_contact_name: quote.pickup.name || null,
    pickup_contact_phone: quote.pickup.phone || null,
    pickup_contact_email: quote.pickup.email || null,
    delivery_contact_name: `${texte(client.first_name, 80)} ${texte(client.last_name, 80)}`,
    delivery_contact_phone: texte(client.phone, 25),
    delivery_contact_email: texte(client.email, 150).toLowerCase(),
    insured_value: quote.insured_value,
    price: quote.price_ht,
    price_ttc: quote.price_ttc,
    signature_ref,
    signed_at: signature.signed_at,
    cgv_version: signature.cgv_version,
    signature_hash: signature.empreinte,
    stripe_session_id: null, // étape 4
    paid_at: null,
    partner_commission: calculerCommission(partenaire, quote.price_ht),
    commission_status: "a_facturer",
  };

  const existantes = fs.existsSync(FICHIER_COMMANDES)
    ? JSON.parse(fs.readFileSync(FICHIER_COMMANDES, "utf8"))
    : [];
  existantes.push(commande);
  fs.writeFileSync(FICHIER_COMMANDES, JSON.stringify(existantes, null, 2));
  console.log(
    "Mission partenaire de test :",
    commande.id,
    `${commande.price_ttc} € TTC`,
    `commission ${commande.partner_commission} €`,
  );

  return res.status(201).json({
    mission_id: commande.id,
    price_ttc: quote.price_ttc,
    paiement: "a_regler",
  });
});

// Lancé seul (node widget-livrauto/server.js) : serveur autonome sur 4100.
// Requis par l'app (staging, WIDGET_ENABLED=true) : simple sous-application.
if (require.main === module) {
  app.get("/", (_req, res) => res.redirect("/widget/demo/"));
  app.listen(PORT, () => {
    console.log(
      `Widget Livr'Auto (test local) : http://localhost:${PORT}/widget/demo/`,
    );
  });
}

module.exports = app;
