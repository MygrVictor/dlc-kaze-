/**
 * Statistiques d'activité d'un compte client : nombre de convoyages par
 * période et kilométrage parcouru.
 *
 * Les missions ne stockent pas de distance. Le kilométrage est estimé
 * comme au devis automatique : distance à vol d'oiseau entre les deux
 * adresses × coefficient routier. Seules les adresses déjà présentes dans
 * le cache de géocodage sont utilisées, pour que la page reste instantanée ;
 * les missions non localisées sont comptées à part (`km_non_calcules`).
 */
const db = require("../db");
const { geocode, geocodeDepuisCache } = require("./geocoding.service");

/** Même coefficient que le devis automatique (pricing.service.js). */
const ROAD_FACTOR = 1.22;

/** Statuts comptés comme convoyages (commandés et non annulés). */
const STATUTS_CONVOYAGE = ["ACCEPTEE", "ASSIGNEE", "EN_COURS", "LIVREE"];

const GRANULARITES = ["jour", "semaine", "mois", "annee"];

/** Date de référence d'un convoyage : prise en charge, sinon création. */
const DATE_REF = "COALESCE(departure_date, desired_pickup_date, created_at)";

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const pad = (n) => String(n).padStart(2, "0");
const isoJour = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Clé de regroupement d'une date selon la granularité. */
function clePeriode(date, granularite) {
  const d = new Date(date);
  if (granularite === "annee") return String(d.getUTCFullYear());
  if (granularite === "jour") return isoJour(d);
  if (granularite === "mois") {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  }
  // Semaine : le lundi qui l'ouvre.
  const lundi = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
  return isoJour(lundi);
}

/** Toutes les périodes entre deux dates, vides comprises. */
function listerPeriodes(debut, fin, granularite) {
  const cles = [];
  const curseur = new Date(debut);
  // Borne de sécurité : jamais plus de quelques centaines de barres.
  while (curseur <= fin && cles.length < 600) {
    const cle = clePeriode(curseur, granularite);
    if (cles[cles.length - 1] !== cle) cles.push(cle);
    if (granularite === "annee")
      curseur.setUTCFullYear(curseur.getUTCFullYear() + 1, 0, 1);
    else if (granularite === "mois")
      curseur.setUTCMonth(curseur.getUTCMonth() + 1, 1);
    else if (granularite === "jour")
      curseur.setUTCDate(curseur.getUTCDate() + 1);
    else curseur.setUTCDate(curseur.getUTCDate() + 7);
  }
  const derniere = clePeriode(fin, granularite);
  if (cles[cles.length - 1] !== derniere) cles.push(derniere);
  return cles;
}

/** Lit une date AAAA-MM-JJ ; null si invalide. */
function lireDate(valeur) {
  if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(String(valeur))) return null;
  const d = new Date(`${valeur}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function chargerMissions(perimetre, debut, finExclue) {
  const { rows } = await db.query(
    `SELECT id, status, ${DATE_REF} AS date_ref,
            departure_address, arrival_address
       FROM missions
      WHERE client_id = ANY($1)
        AND status = ANY($2::mission_status[])
        AND ${DATE_REF} >= $3 AND ${DATE_REF} < $4`,
    [perimetre, STATUTS_CONVOYAGE, debut, finExclue],
  );
  return rows;
}

/**
 * Nombre maximal d'adresses géocodées en direct par requête. Le résultat
 * est mis en cache : chaque visite complète le stock, et la page reste
 * rapide une fois les adresses du client connues.
 */
const MAX_GEOCODAGES_DIRECTS = 25;

/** Ajoute `km` (ou null) à chaque mission livrée. */
async function estimerKilometres(missions) {
  const livrees = missions.filter((m) => m.status === "LIVREE");
  const adresses = livrees.flatMap((m) => [
    m.departure_address?.trim(),
    m.arrival_address?.trim(),
  ]);
  const coords = await geocodeDepuisCache(adresses);

  const manquantes = [...new Set(adresses.filter((a) => a && !coords.has(a)))];
  for (const adresse of manquantes.slice(0, MAX_GEOCODAGES_DIRECTS)) {
    try {
      const point = await geocode(adresse);
      if (point) coords.set(adresse, point);
    } catch {
      /* adresse ignorée : comptée dans km_non_calcules */
    }
  }

  for (const m of livrees) {
    const a = coords.get(m.departure_address?.trim());
    const b = coords.get(m.arrival_address?.trim());
    m.km = a && b ? Math.max(5, haversineKm(a, b) * ROAD_FACTOR) : null;
  }
  return livrees;
}

const arrondi = (n) => Math.round(n);

/**
 * @param {string[]} perimetre  comptes visibles (voir db/perimetre.js)
 * @param {{debut?: string, fin?: string, granularite?: string}} options
 * @param {Date} [maintenant]
 */
async function statistiquesClient(
  perimetre,
  options = {},
  maintenant = new Date(),
) {
  const aujourdhui = new Date(
    Date.UTC(
      maintenant.getUTCFullYear(),
      maintenant.getUTCMonth(),
      maintenant.getUTCDate(),
    ),
  );
  const debutAnnee = new Date(Date.UTC(aujourdhui.getUTCFullYear(), 0, 1));

  const granularite = GRANULARITES.includes(options.granularite)
    ? options.granularite
    : "mois";
  let debut = lireDate(options.debut) || debutAnnee;
  let fin = lireDate(options.fin) || aujourdhui;
  if (debut > fin) [debut, fin] = [fin, debut];
  const finExclue = new Date(fin);
  finExclue.setUTCDate(finExclue.getUTCDate() + 1);

  // ── Période choisie ─────────────────────────────────────────
  const missions = await chargerMissions(perimetre, debut, finExclue);
  const livrees = await estimerKilometres(missions);

  const series = new Map(
    listerPeriodes(debut, fin, granularite).map((cle) => [
      cle,
      { periode: cle, convoyages: 0, livres: 0, km: 0 },
    ]),
  );
  for (const m of missions) {
    const p = series.get(clePeriode(m.date_ref, granularite));
    if (!p) continue;
    p.convoyages += 1;
    if (m.status === "LIVREE") {
      p.livres += 1;
      p.km += m.km || 0;
    }
  }

  const kmPeriode = livrees.reduce((s, m) => s + (m.km || 0), 0);

  // ── Depuis le début de l'année ──────────────────────────────
  const finAujourdhui = new Date(aujourdhui);
  finAujourdhui.setUTCDate(finAujourdhui.getUTCDate() + 1);
  const missionsAnnee = await chargerMissions(
    perimetre,
    debutAnnee,
    finAujourdhui,
  );
  const livreesAnnee = await estimerKilometres(missionsAnnee);
  const kmAnnee = livreesAnnee.reduce((s, m) => s + (m.km || 0), 0);
  const moisEcoules = aujourdhui.getUTCMonth() + 1;

  return {
    debut: isoJour(debut),
    fin: isoJour(fin),
    granularite,
    periode: {
      convoyages: missions.length,
      livres: livrees.length,
      km_total: arrondi(kmPeriode),
      km_moyen_par_convoyage: (() => {
        const localisees = livrees.filter((m) => m.km != null).length;
        return localisees ? arrondi(kmPeriode / localisees) : 0;
      })(),
      km_non_calcules: livrees.filter((m) => m.km == null).length,
    },
    annee: {
      annee: aujourdhui.getUTCFullYear(),
      convoyages: missionsAnnee.length,
      km_total: arrondi(kmAnnee),
      km_moyen_par_mois: arrondi(kmAnnee / moisEcoules),
      convoyages_moyen_par_mois:
        Math.round((missionsAnnee.length / moisEcoules) * 10) / 10,
      km_non_calcules: livreesAnnee.filter((m) => m.km == null).length,
    },
    series: [...series.values()].map((p) => ({ ...p, km: arrondi(p.km) })),
  };
}

module.exports = {
  statistiquesClient,
  clePeriode,
  listerPeriodes,
  STATUTS_CONVOYAGE,
};
