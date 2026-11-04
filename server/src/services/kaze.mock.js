/**
 * Faux Kaze — STAGING / DÉMO UNIQUEMENT (KAZE_MOCK=true).
 *
 * Remplace toutes les fonctions réseau de kaze.service par des réponses
 * factices de même forme. Aucun appel ne part vers app.kaze.so : aucune
 * mission réelle, aucun SMS ni notification aux vrais convoyeurs.
 *
 * État en mémoire (remis à zéro au redémarrage) : une petite équipe de
 * convoyeurs fictifs et les jobs créés depuis le staging. Un job inconnu
 * (identifiant venant de la base) est fabriqué à la volée pour que les
 * écrans de détail ne cassent pas.
 */
const crypto = require("crypto");

const ETAPES = [
  "Prise en charge",
  "État des lieux départ",
  "Trajet",
  "État des lieux arrivée",
  "Signature livraison",
];

// Statut Kaze → index de l'étape courante (-1 = rien commencé).
const AVANCEMENT = {
  waiting: -1,
  assigned: 0,
  started: 2,
  completed: ETAPES.length,
  cancelled: ETAPES.length,
};

const CONVOYEURS = [
  ["Julien Martin", "+33600000001", 48.8566, 2.3522],
  ["Sarah Benali", "+33600000002", 45.764, 4.8357],
  ["Thomas Leroy", "+33600000003", 43.2965, 5.3698],
  ["Camille Dubois", "+33600000004", 47.2184, -1.5536],
  ["Nicolas Petit", "+33600000005", 44.8378, -0.5792],
].map(([nom, phone, lat, lng], i) => ({
  id: `fake-driver-${i + 1}`,
  user_name: `${nom} (TEST)`,
  email: `convoyeur${i + 1}@staging.invalid`,
  phone,
  roles: ["performer"],
  disabled_at: null,
  tags: ["staging"],
  last_sign_in_at: new Date().toISOString(),
  performer: {
    location: `${lat},${lng}`,
    location_updated_at: new Date().toISOString(),
    rating: 4.8,
  },
  device: {
    device_name: "Simulateur",
    platform: "staging",
    app_version: "0.0.0",
    app_status: "active",
  },
}));

const jobs = new Map();
let compteur = 1000;

function construireJob({ id, title, depart, arrivee, status = "waiting" }) {
  const now = new Date().toISOString();
  return {
    id: id || `fake-job-${crypto.randomUUID()}`,
    reference: `FAKE-${++compteur}`,
    title: title || "Convoyage (staging)",
    status,
    status_name: status,
    performer: null,
    work_order_address: { address: depart || null, location: null },
    workflow: {
      children: [
        { id: "start_address", type: "widget", data: depart || null },
        { id: "end_address", type: "widget", data: arrivee || null },
      ],
    },
    due_date: now,
    start_date: null,
    end_date: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    owner_name: "Drive Line Connect (staging)",
    target_name: "Staging",
    tags: ["staging"],
  };
}

/** Recalcule les étapes et horodatages après un changement de statut. */
function rafraichir(job) {
  const courant = AVANCEMENT[job.status] ?? -1;
  job.steps = ETAPES.map((name, i) => ({
    id: `step-${i + 1}`,
    name,
    status: i < courant ? "done" : i === courant ? "current" : "todo",
  }));
  job.status_name = job.status;
  job.updated_at = new Date().toISOString();
  if (job.status === "completed" && !job.completed_at) {
    job.completed_at = job.updated_at;
  }
  return job;
}

function trouverOuCreer(jobId) {
  if (!jobs.has(jobId)) {
    jobs.set(jobId, rafraichir(construireJob({ id: jobId })));
  }
  return jobs.get(jobId);
}

const pagine = (liste, page = 1, perPage = 100) => ({
  data: liste.slice((page - 1) * perPage, page * perPage),
  meta: {
    total_count: liste.length,
    total_pages: Math.max(1, Math.ceil(liste.length / perPage)),
    page,
  },
});

const filtrerStatut = (status) => {
  const voulus = status
    ? Array.isArray(status)
      ? status
      : String(status).split(",")
    : null;
  return [...jobs.values()].filter((j) => !voulus || voulus.includes(j.status));
};

const chiffres = (p) =>
  String(p || "")
    .replace(/\D/g, "")
    .slice(-9);

function log(...args) {
  console.log("🧪 [faux Kaze]", ...args);
}

/**
 * @param {object} reel exports du vrai kaze.service (fonctions pures,
 *   constantes de statut) : on ne remplace que ce qui touche le réseau.
 */
function creerFauxKaze(reel) {
  const faux = {
    async authenticate() {
      return true;
    },

    async testConnection() {
      return {
        connected: true,
        authenticated: true,
        baseUrl: "faux-kaze (staging)",
        login: "staging",
        totalAssignedJobs: filtrerStatut("assigned").length,
        mock: true,
      };
    },

    getKazeHealth() {
      return {
        circuitBreaker: { open: false, failures: 0, threshold: 5 },
        token: { hasJwt: true, expiresAt: null },
        mock: true,
      };
    },

    async fetchJobs({ status, page = 1, perPage = 100 } = {}) {
      return pagine(filtrerStatut(status), page, perPage);
    },
    async fetchAllJobs() {
      return [...jobs.values()];
    },
    async fetchRecentJobs() {
      return [...jobs.values()];
    },
    async fetchJob(jobId) {
      return trouverOuCreer(jobId);
    },

    async fetchUsers({ page = 1, perPage = 100 } = {}) {
      return pagine(CONVOYEURS, page, perPage);
    },
    async getDriver(driverId) {
      const d = CONVOYEURS.find((u) => u.id === driverId);
      if (!d) {
        const err = new Error("Driver introuvable (faux Kaze)");
        err.response = { status: 404 };
        throw err;
      }
      return d;
    },
    async getDriverByEmail(email) {
      const cible = String(email || "").toLowerCase();
      return CONVOYEURS.find((u) => u.email === cible) || null;
    },
    async getDriverByPhone(phone) {
      const cible = chiffres(phone);
      return (
        (cible && CONVOYEURS.find((u) => chiffres(u.phone) === cible)) || null
      );
    },
    async getMissionsByDriver(driverId) {
      const missions = [...jobs.values()]
        .filter(
          (j) =>
            j.performer?.id === driverId &&
            ["assigned", "started"].includes(j.status),
        )
        .map(reel.kazeJobToLocal);
      return { missions, meta: { total_count: missions.length } };
    },
    async listAvailablePerformers() {
      return { data: CONVOYEURS };
    },

    async fetchInvoices({ page = 1, perPage = 100 } = {}) {
      return pagine([], page, perPage);
    },
    async fetchJobWorkflows() {
      return { data: [] };
    },

    async createMission(mission) {
      const job = rafraichir(
        construireJob({
          title:
            [mission.vehicle_brand, mission.vehicle_model]
              .filter(Boolean)
              .join(" ") || `Mission ${mission.id || ""}`.trim(),
          depart: mission.departure_address,
          arrivee: mission.arrival_address,
        }),
      );
      jobs.set(job.id, job);
      log("mission créée →", job.id, `(${job.title})`);
      return job;
    },

    async cancelMission(jobId) {
      const job = trouverOuCreer(jobId);
      job.status = "cancelled";
      rafraichir(job);
      log("mission annulée →", jobId);
      return {};
    },

    async assignDriver(jobId, driverId) {
      const job = trouverOuCreer(jobId);
      const d = CONVOYEURS.find((u) => u.id === driverId);
      job.performer = d
        ? { id: d.id, name: d.user_name, phone: d.phone }
        : { id: driverId, name: "Convoyeur (staging)", phone: null };
      if (job.status === "waiting") job.status = "assigned";
      rafraichir(job);
      log("assignation →", jobId, job.performer.name);
      return true;
    },

    async unassignDriver(jobId) {
      const job = trouverOuCreer(jobId);
      job.performer = null;
      if (job.status === "assigned") job.status = "waiting";
      rafraichir(job);
      log("désassignation →", jobId);
      return true;
    },

    async updateMissionStatus(jobId, localStatus) {
      const kazeStatus = reel.LOCAL_TO_KAZE_STATUS[localStatus];
      if (!kazeStatus) throw new Error(`Statut local inconnu: ${localStatus}`);
      const job = trouverOuCreer(jobId);
      job.status = kazeStatus;
      rafraichir(job);
      log("statut →", jobId, kazeStatus);
      return job;
    },

    async updateKazeJob(jobId, jobData = {}) {
      const job = trouverOuCreer(jobId);
      Object.assign(job, jobData);
      return rafraichir(job);
    },

    async downloadFile() {
      // PDF minimal valide : les écrans de documents restent utilisables.
      const pdf =
        "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\n" +
        "trailer<</Root 1 0 R>>\n%%EOF";
      return { data: Buffer.from(pdf), mimeType: "application/pdf" };
    },
  };

  return { ...reel, ...faux, _mock: true };
}

module.exports = { creerFauxKaze, _etat: { jobs, CONVOYEURS } };
