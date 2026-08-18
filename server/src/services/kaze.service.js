/**
 * Service d'intégration avec l'API Kaze (app.kaze.so).
 *
 * Authentification :
 *   POST /api/login → JWT access_token + token constant
 *   Header « Authorization: Bearer <jwt> » sur chaque requête /api/*
 *
 * Endpoints découverts :
 *   GET  /api/jobs            – liste missions (filtrable par status)
 *   GET  /api/jobs/:id        – détail mission complète
 *   GET  /api/users           – performers & admins (+ GPS temps réel)
 *   GET  /api/invoices        – factures
 *   GET  /api/job_workflows   – modèles de workflow
 *   POST /api/job_workflows/:id/job.json – création d'un job depuis un workflow
 *   POST /api/login           – authentification
 *
 * Statuts Kaze :  waiting | assigned | started | completed | cancelled
 *
 * ┌──────────────────────────────────────────────────┐
 * │  Fiabilité production :                          │
 * │  • Auto-login + refresh JWT quand expiré         │
 * │  • Retry automatique (3 tentatives, backoff exp) │
 * │  • Circuit breaker (évite de surcharger Kaze)    │
 * │  • Timeout 15s                                   │
 * └──────────────────────────────────────────────────┘
 */
const axios = require("axios");
const geocodingService = require("./geocoding.service");
const { lundiDeLaSemaine } = require("../lib/dates");
const { libelle: libelleVehicule, classeDePeage } = require("../lib/vehicules");

// ─── Configuration ───────────────────────────────────────────
const KAZE_BASE_URL =
  process.env.KAZE_API_BASE_URL || "https://app.kaze.so/api";
const KAZE_LOGIN = process.env.KAZE_LOGIN;
const KAZE_PASSWORD = process.env.KAZE_PASSWORD;
const KAZE_API_KEY = process.env.KAZE_API_KEY;
const KAZE_TARGET_ID =
  process.env.KAZE_TARGET_ID || "ffbb89b8-b714-4fe3-9d7b-42dfafdbe6ba";

// ─── Token store ─────────────────────────────────────────────
let jwtToken = null;
let constantToken = null;
let tokenExpiresAt = 0;

// ─── Client Axios (Authorization ajouté dynamiquement) ───────
const kazeClient = axios.create({
  baseURL: KAZE_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

// ─── Circuit Breaker ─────────────────────────────────────────
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  threshold: 5,
  resetMs: 60000,

  isOpen() {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.lastFailure > this.resetMs) {
      this.failures = Math.floor(this.threshold / 2);
      return false;
    }
    return true;
  },
  recordSuccess() {
    this.failures = 0;
    this.lastFailure = null;
  },
  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
  },
};

// ─── Retry avec backoff exponentiel ──────────────────────────
async function withRetry(fn, { maxRetries = 3, label = "Kaze" } = {}) {
  if (circuitBreaker.isOpen()) {
    throw new Error(
      `Circuit breaker ouvert — API Kaze indisponible (${circuitBreaker.failures} échecs)`,
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      const st = err.response?.status;
      // 401 = JWT expiré → re-login et retenter
      if (st === 401 && attempt === 1) {
        console.warn("🔑 Kaze JWT expiré, re-login…");
        jwtToken = null;
        tokenExpiresAt = 0;
        await authenticate();
        continue;
      }
      // Pas de retry sur erreurs client (4xx sauf 429)
      if (st && st >= 400 && st < 500 && st !== 429) {
        circuitBreaker.recordSuccess();
        throw err;
      }
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(
          `⏳ ${label} — tentative ${attempt}/${maxRetries} échouée, retry ${delayMs}ms…`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        circuitBreaker.recordFailure();
        throw err;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ─── AUTHENTIFICATION ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/login
 * Body: { user: { login, password, api_key? } }
 * Response: { token, jwt: { access_token, token_type }, ... }
 */
async function authenticate() {
  if (!KAZE_LOGIN || !KAZE_PASSWORD) {
    throw new Error(
      "KAZE_LOGIN et KAZE_PASSWORD doivent être configurés dans .env",
    );
  }

  // Token encore valide (>5 min restantes) → skip
  if (jwtToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return;
  }

  console.log("🔑 Kaze: authentification en cours…");

  const body = {
    user: {
      login: KAZE_LOGIN,
      password: KAZE_PASSWORD,
    },
  };
  if (KAZE_API_KEY) {
    body.user.api_key = KAZE_API_KEY;
  } else if (constantToken) {
    body.user.api_key = constantToken;
  }

  try {
    const { data } = await axios.post(`${KAZE_BASE_URL}/login`, body, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    constantToken = data.token;
    jwtToken = data.jwt?.access_token;
    tokenExpiresAt = Date.now() + 60 * 60 * 1000; // 1h conservateur

    console.log(`✅ Kaze: authentifié (sign_in_count: ${data.sign_in_count})`);
  } catch (err) {
    console.error(
      "❌ Kaze auth error:",
      err.response?.status,
      err.response?.data || err.message,
    );
    throw new Error(
      `Kaze auth échouée: ${err.response?.data?.message || err.message}`,
    );
  }
}

/** Retourne les headers d'auth (re-login auto si nécessaire) */
async function getAuthHeaders() {
  await authenticate();
  return { Authorization: `Bearer ${jwtToken}` };
}

// ─── Intercepteur : injecte le JWT automatiquement ───────────
kazeClient.interceptors.request.use(async (config) => {
  const headers = await getAuthHeaders();
  Object.assign(config.headers, headers);
  return config;
});

kazeClient.interceptors.response.use(
  (res) => res,
  (error) => {
    console.error(
      "❌ Kaze API:",
      error.config?.method?.toUpperCase(),
      error.config?.url,
      error.response?.status,
      error.response?.data || error.message,
    );
    throw error;
  },
);

// ═══════════════════════════════════════════════════════════════
// ─── JOBS (Missions) ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const KAZE_TO_LOCAL_STATUS = {
  draft: "EN_ATTENTE_DE_COTATION",
  initial: "EN_ATTENTE_DE_COTATION",
  pending: "EN_ATTENTE_DE_COTATION",
  proposed: "EN_ATTENTE_DE_COTATION",
  sent: "EN_ATTENTE_DE_COTATION",
  accepted: "ASSIGNEE",
  rejected: "ANNULEE",
  waiting: "EN_ATTENTE_DE_COTATION",
  assigned: "ASSIGNEE",
  started: "EN_COURS",
  processing: "EN_COURS",
  completed: "LIVREE",
  cancelled: "ANNULEE",
  expired: "ANNULEE",
};

const LOCAL_TO_KAZE_STATUS = {
  EN_ATTENTE_DE_COTATION: "waiting",
  DEVIS_PROPOSE: "waiting",
  ACCEPTEE: "waiting",
  ASSIGNEE: "assigned",
  EN_COURS: "started",
  LIVREE: "completed",
  ANNULEE: "cancelled",
};

/**
 * Récupère les missions Kaze (avec pagination).
 * @param {Object} [opts]
 * @param {string|string[]} [opts.status] – "assigned", ["waiting","assigned"]
 * @param {number} [opts.page=1]
 * @param {number} [opts.perPage=100]
 */
const fetchJobs = async ({ status, page = 1, perPage = 100 } = {}) => {
  return withRetry(
    async () => {
      const params = { page, per_page: perPage };
      if (status) {
        params["filter[status]"] = Array.isArray(status)
          ? status.join(",")
          : status;
      }
      const { data } = await kazeClient.get("/jobs", { params });
      return data;
    },
    { label: "fetchJobs" },
  );
};

/** Récupère TOUTES les missions (toutes pages, tous statuts). */
const fetchAllJobs = async () => {
  const allJobs = [];
  for (const st of [
    "waiting",
    "assigned",
    "started",
    "completed",
    "cancelled",
  ]) {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const result = await fetchJobs({ status: st, page, perPage: 100 });
      allJobs.push(...result.data);
      totalPages = result.meta.total_pages;
      page++;
    }
  }
  return allJobs;
};

// ─── Cache simple pour les missions récentes ─────────────────
let _recentJobsCache = null;
let _recentJobsCacheTime = 0;
const RECENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Récupère les missions Kaze des N derniers jours (toutes pages, tous statuts).
 * Utilise un cache en mémoire de 5 min pour éviter de surcharger l'API.
 *
 * Pour les statuts actifs (waiting, assigned, started) : récupère toutes les pages.
 * Pour les statuts terminés (completed, cancelled) : s'arrête dès qu'une page
 * entière ne contient que des missions plus anciennes que la limite.
 *
 * @param {number} [days=60] – nombre de jours en arrière
 * @returns {Object[]} – jobs bruts Kaze (non transformés)
 */
const fetchRecentJobs = async (days = 60) => {
  // Retourner le cache s'il est encore frais
  if (
    _recentJobsCache &&
    Date.now() - _recentJobsCacheTime < RECENT_CACHE_TTL
  ) {
    console.log(
      `📦 Kaze: cache récent valide (${_recentJobsCache.length} missions)`,
    );
    return _recentJobsCache;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  const allJobs = [];
  const activeStatuses = ["waiting", "assigned", "started"];
  const closedStatuses = ["completed", "cancelled"];

  console.log(`🔍 Kaze: récupération missions des ${days} derniers jours…`);

  // Statuts actifs : on prend tout (peu de missions en général)
  for (const st of activeStatuses) {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const result = await fetchJobs({ status: st, page, perPage: 100 });
      const jobs = result.data || [];
      allJobs.push(
        ...jobs.filter((j) => {
          const d = j.created_at
            ? new Date(j.created_at).getTime()
            : Date.now();
          return d >= cutoffMs;
        }),
      );
      totalPages = result.meta?.total_pages || 1;
      page++;
    }
  }

  // Statuts fermés : pagination avec arrêt anticipé
  for (const st of closedStatuses) {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const result = await fetchJobs({ status: st, page, perPage: 100 });
      const jobs = result.data || [];
      const recentJobs = jobs.filter((j) => {
        const d = j.created_at ? new Date(j.created_at).getTime() : 0;
        return d >= cutoffMs;
      });
      allJobs.push(...recentJobs);
      totalPages = result.meta?.total_pages || 1;

      // Arrêt anticipé : si aucune mission récente sur cette page,
      // les suivantes seront encore plus anciennes → on arrête
      if (recentJobs.length === 0 && jobs.length > 0) {
        console.log(
          `⏭️  Kaze [${st}]: arrêt page ${page}/${totalPages} (missions trop anciennes)`,
        );
        break;
      }
      page++;
    }
  }

  console.log(`✅ Kaze: ${allJobs.length} missions récentes (${days}j)`);

  // Déduplication défensive par ID (certaines réponses Kaze peuvent contenir
  // des doublons entre requêtes filtrées par statut).
  const dedupedJobsById = new Map();
  for (const job of allJobs) {
    if (!job?.id) continue;
    const prev = dedupedJobsById.get(job.id);
    if (!prev) {
      dedupedJobsById.set(job.id, job);
      continue;
    }
    const prevTs = prev.updated_at
      ? new Date(prev.updated_at).getTime()
      : prev.created_at
        ? new Date(prev.created_at).getTime()
        : 0;
    const nextTs = job.updated_at
      ? new Date(job.updated_at).getTime()
      : job.created_at
        ? new Date(job.created_at).getTime()
        : 0;
    if (nextTs >= prevTs) {
      dedupedJobsById.set(job.id, job);
    }
  }

  const dedupedJobs = Array.from(dedupedJobsById.values());
  if (dedupedJobs.length !== allJobs.length) {
    console.log(
      `🧹 Kaze: déduplication ${allJobs.length} → ${dedupedJobs.length} mission(s)`,
    );
  }

  // Mettre en cache
  _recentJobsCache = dedupedJobs;
  _recentJobsCacheTime = Date.now();

  return dedupedJobs;
};

/** Récupère le détail complet d'une mission. */
const fetchJob = async (jobId) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get(`/jobs/${jobId}`);
      return data;
    },
    { label: "fetchJob" },
  );
};

/** Transforme un job Kaze → données compatibles DLC. */
const kazeJobToLocal = (job) => {
  const loc = job.work_order_address?.location?.split(",") || [];

  // Les adresses d'enlèvement et de livraison ne sont pas exposées à plat
  // par l'API : elles vivent dans l'arbre du workflow, soit sur les widgets
  // `start_address`/`end_address` (propriété `data`), soit sur les étapes de
  // navigation `start_navigation`/`end_navigation` (propriété `address`).
  // Certaines réponses (listes allégées) fournissent aussi un tableau
  // `steps` : on l'accepte en dernier recours.
  const lireAdresse = (idAdresse, idNavigation) => {
    if (job.workflow) {
      const widget = findNode(job.workflow, { id: idAdresse });
      if (widget?.data) return widget.data;
      const nav = findNode(job.workflow, { id: idNavigation });
      if (nav?.address) return nav.address;
    }
    const etape = (job.steps || []).find((s) => s.id === idNavigation);
    return etape?.address || null;
  };

  const departureAddress = lireAdresse("start_address", "start_navigation");
  const arrivalAddress = lireAdresse("end_address", "end_navigation");

  return {
    kaze_job_id: job.id,
    kaze_reference: job.reference,
    title: job.title,
    status: KAZE_TO_LOCAL_STATUS[job.status] || job.status,
    kaze_status: job.status,
    status_name: job.status_name,
    performer_name: job.performer?.name || null,
    performer_id: job.performer?.id || null,
    performer_phone: job.performer?.phone || null,
    address: job.work_order_address?.address || null,
    departure_address:
      departureAddress || job.work_order_address?.address || null,
    arrival_address: arrivalAddress,
    latitude: loc[0] ? parseFloat(loc[0]) : null,
    longitude: loc[1] ? parseFloat(loc[1]) : null,
    due_date: job.due_date ? new Date(job.due_date) : null,
    start_date: job.start_date ? new Date(job.start_date) : null,
    end_date: job.end_date ? new Date(job.end_date) : null,
    completed_at: job.completed_at ? new Date(job.completed_at) : null,
    created_at: job.created_at ? new Date(job.created_at) : null,
    updated_at: job.updated_at ? new Date(job.updated_at) : null,
    owner_name: job.owner_name,
    target_name: job.target_name,
    tags: job.tags || [],
    steps: job.steps || [],
    raw: job,
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── USERS (Performers / Convoyeurs) ─────────────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * Récupère les performers depuis Kaze (inclut GPS temps réel).
 */
const fetchUsers = async ({ page = 1, perPage = 100 } = {}) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get("/users", {
        params: { page, per_page: perPage },
      });
      return data;
    },
    { label: "fetchUsers" },
  );
};

/** Transforme un user Kaze → données performer DLC. */
const kazeUserToLocal = (user) => {
  const loc = user.performer?.location?.split(",") || [];
  return {
    kaze_user_id: user.id,
    name: user.user_name,
    email: user.email,
    phone: user.phone,
    roles: user.roles || [],
    latitude: loc[0] ? parseFloat(loc[0]) : null,
    longitude: loc[1] ? parseFloat(loc[1]) : null,
    location_updated_at: user.performer?.location_updated_at
      ? new Date(user.performer.location_updated_at)
      : null,
    rating: user.performer?.rating,
    last_sign_in_at: user.last_sign_in_at
      ? new Date(user.last_sign_in_at)
      : null,
    disabled: !!user.disabled_at,
    device: user.device
      ? {
          name: user.device.device_name,
          platform: user.device.platform,
          app_version: user.device.app_version,
          app_status: user.device.app_status,
        }
      : null,
    tags: user.tags || [],
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── INVOICES ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const fetchInvoices = async ({ page = 1, perPage = 100 } = {}) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get("/invoices", {
        params: { page, per_page: perPage },
      });
      return data;
    },
    { label: "fetchInvoices" },
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── JOB WORKFLOWS ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const fetchJobWorkflows = async () => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get("/job_workflows");
      return data;
    },
    { label: "fetchJobWorkflows" },
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── CRÉATION DE MISSION KAZE ────────────────────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * ID du workflow template CONVOYAGE dans Kaze.
 * Récupéré à la main via GET /api/job_workflows.
 */
const CONVOYAGE_WORKFLOW_ID = "16fcd561-f3b8-4a20-9f05-5bd3b7edb279";

/**
 * ID de l'étape "Signature Client" (livraison) du workflow CONVOYAGE.
 * C'est cette étape qui porte la configuration d'envoi du mail
 * récapitulatif de fin de mission (envoyé par Kaze lui-même).
 */
const SIGNATURE_CLIENT_NODE_ID = "e319864c-907d-42ce-b406-579a59666e19";

/** Cache du workflow template (chargé une seule fois). */
let cachedWorkflowTemplate = null;

/**
 * Récupère le workflow template CONVOYAGE (avec cache).
 */
async function getWorkflowTemplate() {
  if (cachedWorkflowTemplate) return cachedWorkflowTemplate;

  const { data } = await kazeClient.get(
    `/job_workflows/${CONVOYAGE_WORKFLOW_ID}`,
  );
  cachedWorkflowTemplate = data;
  console.log("✅ Kaze: workflow template CONVOYAGE mis en cache");
  return data;
}

/**
 * Cherche un nœud par type ou id dans l'arbre du workflow.
 */
function findNode(node, { type, id }) {
  if (type && node.type === type) return node;
  if (id && node.id === id) return node;
  for (const c of node.children || []) {
    const found = findNode(c, { type, id });
    if (found) return found;
  }
  return null;
}

/**
 * Met à jour la propriété `data` d'un widget par son id.
 */
function setWidgetData(root, widgetId, data) {
  const w = findNode(root, { id: widgetId });
  if (w) {
    w.data = data;
    return true;
  }
  return false;
}

/**
 * Construit le payload attendu par :
 *   POST /job_workflows/:job_workflow_id/job.json
 *
 * Format cible :
 * {
 *   data: {
 *     [stepId]: {
 *       [stepId]: { ...champs de l'étape },
 *       [widgetId]: { data: ... }
 *     }
 *   }
 * }
 */
function buildWorkflowJobDataPayload(workflow, opts = {}) {
  const payload = { data: {} };
  if (opts.targetId) payload.target_id = opts.targetId;
  if (opts.performerId) payload.performer_id = opts.performerId;

  const pickDefined = (obj) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, value]) => value !== undefined),
    );

  const walkWidgets = (node, acc) => {
    for (const child of node.children || []) {
      const t = child.type || "";

      if (t.startsWith("widget_")) {
        if (t === "widget_address") {
          const widgetData = pickDefined({
            data: child.data || child.address,
            location: child.location,
            place_id: child.place_id,
          });
          if (Object.keys(widgetData).length > 0) {
            acc[child.id] = widgetData;
          }
        } else if (child.data !== undefined) {
          acc[child.id] = { data: child.data };
        }
      }

      if (child.children?.length) {
        walkWidgets(child, acc);
      }
    }
  };

  for (const step of workflow.children || []) {
    if (!step?.id) continue;

    const stepData = {};

    // Champs portés par l'étape elle-même
    if (step.type === "template_job_info") {
      const jobInfoData = pickDefined({
        job_title: step.job_title,
        job_reference: step.job_reference,
        job_due_date: step.job_due_date,
        job_start_date: step.job_start_date,
        job_end_date: step.job_end_date,
        job_address: step.job_address,
        job_location: step.job_location,
        performer_estimation: step.performer_estimation,
      });
      if (Object.keys(jobInfoData).length > 0) {
        stepData[step.id] = jobInfoData;
      }
    }

    if (step.type === "template_navigation") {
      const navData = pickDefined({
        address: step.address,
        location: step.location,
        place_id: step.place_id,
      });
      if (Object.keys(navData).length > 0) {
        stepData[step.id] = navData;
      }
    }

    // Étapes qui déclenchent un envoi de mail à la complétion
    // (signature client, document CMR…). Kaze envoie lui-même le récap
    // au(x) destinataire(s) listé(s) dans email_addresses.
    if (step.type === "template_signature" || step.type === "template_blank") {
      const notifyData = pickDefined({
        notify_when_completed: step.notify_when_completed,
        email_send: step.email_send,
        email_link: step.email_link,
        email_subject: step.email_subject,
        email_body: step.email_body,
        email_addresses: step.email_addresses,
        email_provider_logo: step.email_provider_logo,
        sms_send: step.sms_send,
      });
      if (Object.keys(notifyData).length > 0) {
        stepData[step.id] = { ...(stepData[step.id] || {}), ...notifyData };
      }
    }

    // Widgets de l'étape
    walkWidgets(step, stepData);

    if (Object.keys(stepData).length > 0) {
      payload.data[step.id] = stepData;
    }
  }

  return payload;
}

/**
 * Formate un numéro de téléphone français pour Kaze.
 * Kaze attend un entier (33612345678), pas une string.
 */
function formatPhone(phone) {
  if (!phone) return 33;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("33")) return parseInt(digits) || 33;
  if (digits.startsWith("0")) return parseInt("33" + digits.slice(1)) || 33;
  return parseInt(digits) || 33;
}

/**
 * Formatte une date en string lisible "Le DD/MM à HHhMM".
 */
function formatDateSlot(date) {
  if (!date) return "";
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Le ${dd}/${mm} à ${hh}h${mi}`;
}

/**
 * Crée une mission dans Kaze à partir d'une mission DLC.
 *
 * Payload :
 *   POST /job_workflows/:job_workflow_id/job.json
 *   { data: { [stepId]: { [stepId]: {...}, [widgetId]: {data} } } }
 *
 * Le workflow est une copie profonde du template CONVOYAGE dans lequel
 * on injecte les données de la mission DLC :
 *   - template_job_info : titre, référence, dates, adresse, estimation
 *   - widget_address    : adresses de départ / arrivée
 *   - template_navigation : GPS enlèvement / livraison
 *   - widget_text        : immat, marque, modèle, contacts, services
 *
 * @param {Object} mission - Ligne de la table `missions` (PostgreSQL)
 * @returns {Object} { id: "uuid-kaze" }
 */
const createMission = async (mission) => {
  // Email du client : utilisé pour le récap de fin de mission envoyé
  // automatiquement par Kaze à la signature de livraison.
  if (!mission.client_email && mission.client_id) {
    try {
      const db = require("../db");
      const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [
        mission.client_id,
      ]);
      if (rows[0]?.email) {
        mission = { ...mission, client_email: rows[0].email };
      }
    } catch (dbErr) {
      console.warn(
        "⚠️ Kaze: impossible de récupérer l'email client :",
        dbErr.message,
      );
    }
  }

  // Géocoder les vraies adresses AVANT de construire le workflow.
  // Des coordonnées cohérentes améliorent fortement la qualité des missions
  // (étapes, navigation, affichage), même si la sortie du statut "initial"
  // dépend surtout de la présence explicite de target_id dans le payload.
  const FALLBACK_LOCATION = "48.8566,2.3522"; // Paris — dernier recours
  let departureLocation = FALLBACK_LOCATION;
  let arrivalLocation = FALLBACK_LOCATION;
  try {
    const departureCoords = await geocodingService.geocode(
      mission.departure_address,
    );
    if (departureCoords) {
      departureLocation = `${departureCoords.lat},${departureCoords.lng}`;
    } else {
      console.warn(
        `⚠️ Kaze: géocodage échoué pour l'adresse de départ "${mission.departure_address}" — fallback Paris utilisé.`,
      );
    }
  } catch (geoErr) {
    console.warn(`⚠️ Kaze: erreur géocodage départ :`, geoErr.message);
  }
  try {
    const arrivalCoords = await geocodingService.geocode(
      mission.arrival_address,
    );
    if (arrivalCoords) {
      arrivalLocation = `${arrivalCoords.lat},${arrivalCoords.lng}`;
    } else {
      console.warn(
        `⚠️ Kaze: géocodage échoué pour l'adresse d'arrivée "${mission.arrival_address}" — fallback Paris utilisé.`,
      );
    }
  } catch (geoErr) {
    console.warn(`⚠️ Kaze: erreur géocodage arrivée :`, geoErr.message);
  }

  return withRetry(
    async () => {
      // 1. Charger le template
      const template = await getWorkflowTemplate();
      const workflow = JSON.parse(JSON.stringify(template.workflow)); // deep clone

      const title = `Livraison ${mission.vehicle_plate || "N/A"}`;
      const ref = `DLC-${mission.id.substring(0, 8).toUpperCase()}`;

      // Règle métier : toute mission Kaze est datée du lundi de la semaine en
      // cours, quelle que soit la date stockée en base. La date souhaitée par
      // le client n'est jamais transmise à Kaze.
      const lundi = lundiDeLaSemaine();
      const debut = new Date(lundi);
      debut.setHours(8, 0, 0, 0);
      const fin = new Date(lundi);
      fin.setHours(18, 0, 0, 0);

      // Dates en ms (Kaze attend des timestamps Unix ms)
      const startMs = debut.getTime();
      const endMs = fin.getTime();

      // ──────────────────────────────────────────────────────
      // 2. Remplir le template_job_info (premier enfant)
      // ──────────────────────────────────────────────────────
      const jobInfo = workflow.children[0]; // type: template_job_info
      jobInfo.job_title = title;
      jobInfo.job_reference = ref;
      jobInfo.job_due_date = startMs;
      jobInfo.job_start_date = startMs;
      jobInfo.job_end_date = endMs;
      jobInfo.job_address = mission.departure_address;
      jobInfo.job_location = departureLocation;
      jobInfo.performer_estimation = 480; // 8h par défaut

      // ──────────────────────────────────────────────────────
      // 3. Remplir les widgets de la section "Plage de mission"
      // ──────────────────────────────────────────────────────
      setWidgetData(
        workflow,
        "320d66e9-2fa9-4b49-a46f-e28ce05ea971",
        formatDateSlot(debut),
      );
      setWidgetData(
        workflow,
        "3e23e9d6-5673-4eb9-b25e-96c954bf3bd9",
        formatDateSlot(fin),
      );
      // Le workflow Kaze n'expose pas de widget dédié à la mise en main :
      // on l'annonce en tête des observations pour que le convoyeur la voie.
      const observations = [
        mission.vehicle_type
          ? `Gabarit : ${libelleVehicule(mission.vehicle_type)} — péage classe ${classeDePeage(mission.vehicle_type)}.`
          : null,
        mission.service_handover ? "Mise en main du véhicule demandée." : null,
        mission.comments || null,
      ]
        .filter(Boolean)
        .join("\n");

      setWidgetData(
        workflow,
        "42ba4f33-0b59-4bea-a2e9-8f449fb8edf0",
        observations,
      );

      // ──────────────────────────────────────────────────────
      // 4. Véhicule
      // ──────────────────────────────────────────────────────
      setWidgetData(workflow, "immat", mission.vehicle_plate || "");
      setWidgetData(workflow, "brand", mission.vehicle_brand || "Autre");
      setWidgetData(workflow, "model", mission.vehicle_model || "");
      setWidgetData(
        workflow,
        "925b6c5e-254c-4722-83dc-0cb2b40fce0c",
        mission.vehicle_vin || "",
      );
      // Véhicule utilitaire >= 12m3
      setWidgetData(
        workflow,
        "4a18c284-d1e9-4446-ad91-485d22a4b59f",
        mission.vehicle_utility_12m3 || "NON",
      );

      // ──────────────────────────────────────────────────────
      // 5. Contact de départ
      // ──────────────────────────────────────────────────────
      // Structure / Nom de la structure
      setWidgetData(
        workflow,
        "f4f71351-99e0-4231-86c8-e8e0ae1966cc",
        mission.departure_structure || "",
      );
      setWidgetData(
        workflow,
        "3afb874b-1b48-42c5-a546-9c65cf95fb02",
        mission.departure_structure_name || "",
      );
      setWidgetData(
        workflow,
        "start_contact",
        mission.departure_contact_name || "",
      );
      setWidgetData(
        workflow,
        "tel_contact",
        formatPhone(mission.departure_contact_phone),
      );
      // Email contact de départ
      setWidgetData(
        workflow,
        "76f43f34-f1f7-4428-b43a-718db56ebb60",
        mission.departure_contact_email || mission.client_email || "",
      );
      // Remarques enlèvement
      setWidgetData(
        workflow,
        "f860f2b2-4584-4683-95d4-38c699fa4422",
        mission.departure_instructions || "",
      );

      // Adresse d'enlèvement (widget_address)
      const startAddr = findNode(workflow, { id: "start_address" });
      if (startAddr) {
        startAddr.data = mission.departure_address;
        startAddr.location = departureLocation;
        startAddr.place_id = startAddr.location;
      }

      // ──────────────────────────────────────────────────────
      // 6. Contact d'arrivée
      // ──────────────────────────────────────────────────────
      setWidgetData(
        workflow,
        "end_contact",
        mission.arrival_contact_name || "",
      );
      setWidgetData(
        workflow,
        "end_tel",
        formatPhone(mission.arrival_contact_phone),
      );
      // Email contact de livraison
      setWidgetData(
        workflow,
        "0a1b5854-2535-416f-9650-264edd61ba7c",
        mission.arrival_contact_email || mission.client_email || "",
      );
      // Remarques livraison
      setWidgetData(
        workflow,
        "c9489f7b-dcb8-4529-8387-2ef9a70c8fc9",
        mission.arrival_instructions || "",
      );

      // Adresse de livraison (widget_address)
      const endAddr = findNode(workflow, { id: "end_address" });
      if (endAddr) {
        endAddr.data = mission.arrival_address;
        endAddr.location = arrivalLocation;
        endAddr.place_id = endAddr.location;
      }

      // ──────────────────────────────────────────────────────
      // 7. Navigation (template_navigation — obligatoires)
      // ──────────────────────────────────────────────────────
      for (const child of workflow.children) {
        if (child.type === "template_navigation") {
          if (child.id === "start_navigation") {
            child.address = mission.departure_address;
            child.location = startAddr?.location || departureLocation;
            child.place_id = child.location;
          } else if (child.id === "end_navigation") {
            child.address = mission.arrival_address;
            child.location = endAddr?.location || arrivalLocation;
            child.place_id = child.location;
          }
        }
      }

      // ──────────────────────────────────────────────────────
      // 8. Rétribution & Services
      // ──────────────────────────────────────────────────────
      setWidgetData(
        workflow,
        "85ea9290-9232-4066-bf87-2a481e85e43a",
        mission.retribution_details || "",
      );
      setWidgetData(
        workflow,
        "09014fe6-e71f-4c8e-b559-f65ee52a3c1c",
        mission.service_refuel ? "OUI" : "NON",
      );
      setWidgetData(
        workflow,
        "448e194d-82aa-4acb-8a71-e3dc747de6e5",
        mission.service_document_management || "",
      );

      // ──────────────────────────────────────────────────────
      // 9. Contact d'urgence (valeurs DLC par défaut si non fourni)
      // ──────────────────────────────────────────────────────
      setWidgetData(
        workflow,
        "88a0b007-f16b-4420-bfd7-8b07c5e35f33",
        mission.emergency_contact_name || "Drive Line Connect",
      );
      setWidgetData(
        workflow,
        "fa105cea-4f16-4dc9-aeb3-2b206c4c4baf",
        formatPhone(mission.emergency_phone || "0669583430"),
      );
      setWidgetData(
        workflow,
        "6d15e944-f878-4e2c-ba59-932dc08b1442",
        mission.emergency_contact_email || "drivelineconnect@gmail.com",
      );

      // ──────────────────────────────────────────────────────
      // 9 bis. Récapitulatif de fin de mission envoyé par Kaze
      //
      // La signature client de l'étape de livraison porte la config
      // d'envoi du mail de clôture. Kaze envoie automatiquement le
      // récap (PDF + lien) quand cette étape est complétée : on n'a
      // donc rien à gérer côté DLC, il suffit de renseigner
      // l'adresse à la création du job.
      //
      // Un seul destinataire : le contact de livraison renseigné sur
      // la mission, car c'est lui qui réceptionne le véhicule. On ne
      // retombe sur l'email du compte client que si aucun contact
      // d'arrivée n'a été saisi — sans quoi la même personne reçoit
      // deux fois le récap.
      // ──────────────────────────────────────────────────────
      const recapEmails = mission.arrival_contact_email || mission.client_email;

      if (recapEmails) {
        const clientSignature = findNode(workflow, {
          id: SIGNATURE_CLIENT_NODE_ID,
        });
        if (clientSignature) {
          clientSignature.notify_when_completed = true;
          clientSignature.email_send = true;
          clientSignature.email_link = true;
          clientSignature.email_provider_logo = true;
          clientSignature.email_addresses = recapEmails;
          clientSignature.email_subject =
            `Convoyage ${mission.vehicle_plate || ""} ${mission.vehicle_brand || ""}`.trim();
          clientSignature.email_body = "Livraison véhicule effectuée.";
        } else {
          console.warn(
            "⚠️ Kaze: étape 'Signature Client' introuvable — récap de fin de mission non configuré.",
          );
        }
      } else {
        console.warn(
          `⚠️ Kaze: aucun email client pour la mission ${mission.id} — récap de fin de mission non configuré.`,
        );
      }

      // ──────────────────────────────────────────────────────
      // 10. POST /api/job_workflows/:id/job.json
      // ──────────────────────────────────────────────────────
      console.log(`📤 Kaze: création mission "${title}" (ref: ${ref})…`);

      const payload = buildWorkflowJobDataPayload(workflow, {
        targetId: KAZE_TARGET_ID,
      });

      if (!payload.target_id) {
        throw new Error(
          "Kaze createMission: target_id manquant (configurez KAZE_TARGET_ID).",
        );
      }

      const { data } = await kazeClient.post(
        `/job_workflows/${CONVOYAGE_WORKFLOW_ID}/job.json`,
        payload,
      );

      console.log(`✅ Kaze: mission créée → ${data.id}`);
      return data;
    },
    { label: "createMission" },
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── ANNULATION / SUPPRESSION DE MISSION KAZE ─────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * Annule (supprime) une mission Kaze.
 * DELETE /api/jobs/:id
 *
 * @param {string} kazeJobId - UUID du job Kaze
 */
const cancelMission = async (kazeJobId) => {
  return withRetry(
    async () => {
      console.log(`🗑️  Kaze: annulation mission ${kazeJobId}…`);
      const { data } = await kazeClient.delete(`/jobs/${kazeJobId}`);
      console.log(`✅ Kaze: mission ${kazeJobId} annulée`);
      return data;
    },
    { label: "cancelMission" },
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── HEALTH CHECK / TEST ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const testConnection = async () => {
  try {
    await authenticate();
    const jobs = await fetchJobs({ status: "assigned", perPage: 1 });
    return {
      connected: true,
      authenticated: true,
      baseUrl: KAZE_BASE_URL,
      login: KAZE_LOGIN,
      totalAssignedJobs: jobs.meta.total_count,
    };
  } catch (err) {
    return {
      connected: false,
      authenticated: false,
      baseUrl: KAZE_BASE_URL,
      login: KAZE_LOGIN,
      error: err.message,
    };
  }
};

const getKazeHealth = () => ({
  circuitBreaker: {
    open: circuitBreaker.isOpen(),
    failures: circuitBreaker.failures,
    threshold: circuitBreaker.threshold,
  },
  token: {
    hasJwt: !!jwtToken,
    expiresAt: tokenExpiresAt ? new Date(tokenExpiresAt).toISOString() : null,
  },
});

// ═══════════════════════════════════════════════════════════════
// ─── EXPORTS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ─── DRIVER MANAGEMENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * Récupère un driver/performer Kaze par son ID.
 */
const getDriver = async (driverId) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get(`/users/${driverId}`);
      return data;
    },
    { label: "getDriver" },
  );
};

/**
 * Recherche un driver/performer Kaze par email.
 */
const getDriverByEmail = async (email) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get("/users", {
        params: { "filter[email]": email, per_page: 10 },
      });
      if (data.data && data.data.length > 0) {
        const found = data.data.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase(),
        );
        return found || null;
      }
      return null;
    },
    { label: "getDriverByEmail" },
  );
};

/**
 * Normalise un numéro de téléphone pour comparaison fiable :
 * ne garde que les 9 derniers chiffres significatifs (sans indicatif
 * pays ni le 0 initial), ce qui permet de matcher "0612345678",
 * "+33612345678", "33612345678", "33 6 12 34 56 78", etc.
 */
function normalizePhoneDigits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-9);
}

/**
 * Recherche un driver/performer Kaze par numéro de téléphone.
 * Essaie d'abord un filtre serveur (si supporté par l'API Kaze),
 * puis vérifie/affine toujours par comparaison normalisée côté client
 * pour éviter les faux positifs (formats variés : 06…, +336…, 336…).
 */
const getDriverByPhone = async (phone) => {
  const targetDigits = normalizePhoneDigits(phone);
  if (!targetDigits) return null;

  return withRetry(
    async () => {
      // 1ʳᵉ tentative : filtre serveur avec le format international Kaze
      const { data } = await kazeClient.get("/users", {
        params: { "filter[phone]": formatPhone(phone), per_page: 20 },
      });
      const candidates = data.data || [];
      let found = candidates.find(
        (u) => normalizePhoneDigits(u.phone) === targetDigits,
      );
      if (found) return found;

      // 2ᵉ tentative (fallback) : parcourir les premières pages d'utilisateurs
      // au cas où le filtre serveur ne serait pas supporté par l'API Kaze.
      for (let page = 1; page <= 10; page++) {
        const { data: pageData } = await kazeClient.get("/users", {
          params: { page, per_page: 100 },
        });
        const users = pageData.data || [];
        found = users.find(
          (u) => normalizePhoneDigits(u.phone) === targetDigits,
        );
        if (found) return found;
        const totalPages = pageData.meta?.total_pages || 1;
        if (page >= totalPages) break;
      }
      return null;
    },
    { label: "getDriverByPhone" },
  );
};

/**
 * Récupère les missions Kaze assignées à un driver.
 */
const getMissionsByDriver = async (driverId) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get("/jobs", {
        params: {
          "filter[performer_id]": driverId,
          "filter[status]": "assigned,started",
          per_page: 100,
        },
      });
      const missions = (data.data || []).map(kazeJobToLocal);
      return { missions, meta: data.meta };
    },
    { label: "getMissionsByDriver" },
  );
};

/**
 * Assigne un driver à une mission Kaze.
 *
 * Endpoint dédié Kaze : PUT /jobs/{jobId}/performers/{driverId}.json
 * Réponse attendue : 204 No Content.
 */
const assignDriver = async (jobId, driverId) => {
  return withRetry(
    async () => {
      await kazeClient.put(`/jobs/${jobId}/performers/${driverId}.json`);
      console.log(`✅ Kaze : job ${jobId} → performer ${driverId} assigné`);
      _recentJobsCache = null;
      _recentJobsCacheTime = 0;
      return true;
    },
    { label: "assignDriver" },
  );
};

/**
 * Liste les performers éligibles pour une mission Kaze.
 */
const listAvailablePerformers = async (jobId) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.get(`/jobs/${jobId}/performers.json`);
      return data;
    },
    { label: "listAvailablePerformers" },
  );
};

/**
 * Désassigne un driver d'une mission Kaze.
 */
const unassignDriver = async (jobId, driverId) => {
  return withRetry(
    async () => {
      await kazeClient.delete(`/jobs/${jobId}/performers/${driverId}.json`);
      console.log(`✅ Kaze : job ${jobId} → performer ${driverId} désassigné`);
      _recentJobsCache = null;
      _recentJobsCacheTime = 0;
      return true;
    },
    { label: "unassignDriver" },
  );
};

/**
 * Met à jour le statut d'une mission dans Kaze.
 * @param {string} jobId - ID de la mission Kaze
 * @param {string} localStatus - Statut DLC (EN_COURS, LIVREE, etc.)
 */
const updateMissionStatus = async (jobId, localStatus) => {
  const kazeStatus = LOCAL_TO_KAZE_STATUS[localStatus];
  if (!kazeStatus) {
    throw new Error(`Statut local inconnu: ${localStatus}`);
  }

  return withRetry(
    async () => {
      // Kaze API : transition de statut via PUT /jobs/:id
      const { data } = await kazeClient.put(`/jobs/${jobId}`, {
        job: { status: kazeStatus },
      });
      console.log(`✅ Kaze : mission ${jobId} → ${kazeStatus}`);
      return data;
    },
    { label: "updateMissionStatus" },
  );
};

/**
 * Met à jour les données d'une mission Kaze (champs libres).
 */
const updateKazeJob = async (jobId, jobData) => {
  return withRetry(
    async () => {
      const { data } = await kazeClient.put(`/jobs/${jobId}`, {
        job: jobData,
      });
      return data;
    },
    { label: "updateKazeJob" },
  );
};

module.exports = {
  authenticate,
  testConnection,
  fetchJobs,
  fetchAllJobs,
  fetchRecentJobs,
  fetchJob,
  kazeJobToLocal,
  fetchUsers,
  kazeUserToLocal,
  fetchInvoices,
  fetchJobWorkflows,
  createMission,
  cancelMission,
  getKazeHealth,
  getDriver,
  getDriverByEmail,
  getDriverByPhone,
  getMissionsByDriver,
  assignDriver,
  listAvailablePerformers,
  unassignDriver,
  updateMissionStatus,
  updateKazeJob,
  KAZE_TO_LOCAL_STATUS,
  LOCAL_TO_KAZE_STATUS,
  // Helpers purs exposés pour les tests unitaires
  _internal: {
    buildWorkflowJobDataPayload,
    formatPhone,
    formatDateSlot,
    findNode,
    setWidgetData,
    normalizePhoneDigits,
    SIGNATURE_CLIENT_NODE_ID,
  },
};
