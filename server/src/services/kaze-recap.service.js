const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const kazeService = require("./kaze.service");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
const USER_DOCS_DIR = path.join(UPLOADS_DIR, "documents");

function normaliserNomFichier(nom) {
  return String(nom || "")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

function extensionDepuisMime(mime) {
  if (!mime) return ".pdf";
  const m = String(mime).toLowerCase();
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  return ".pdf";
}

function extraireNomDepuisUrl(url) {
  try {
    const u = new URL(url, "https://kaze.local");
    return path.basename(u.pathname || "");
  } catch {
    return "";
  }
}

function extraireCandidatsDocumentsKaze(job) {
  const candidats = [];
  const vus = new Set();

  const estUrl = (v) => {
    if (typeof v !== "string") return false;
    const t = v.trim();
    return /^https?:\/\//i.test(t) || t.startsWith("/");
  };

  const pousser = ({ url, key = "", node = {} }) => {
    if (!estUrl(url)) return;
    const propre = String(url).trim();
    const keyTxt = String(key || "").toLowerCase();
    const nom =
      node.file_name ||
      node.filename ||
      node.name ||
      node.label ||
      extraireNomDepuisUrl(propre);

    const indicateurDoc =
      /(pdf|document|recap|r[eé]sum|summary|report|download|attachment|file)/i;
    const mime = String(node.mime_type || node.content_type || "");
    const likelyPdf = /\.pdf($|[?#])/i.test(propre) || /pdf/i.test(mime);
    const accepte =
      likelyPdf ||
      indicateurDoc.test(keyTxt) ||
      indicateurDoc.test(String(nom || ""));

    if (!accepte) return;

    const fingerprint = `${propre}::${nom || ""}`;
    if (vus.has(fingerprint)) return;
    vus.add(fingerprint);

    candidats.push({
      url: propre,
      name: String(nom || "recap-kaze.pdf"),
      mimeType: mime || null,
    });
  };

  const parcourir = (valeur) => {
    if (!valeur) return;
    if (Array.isArray(valeur)) {
      for (const item of valeur) parcourir(item);
      return;
    }
    if (typeof valeur !== "object") return;

    for (const [k, v] of Object.entries(valeur)) {
      if (typeof v === "string") {
        pousser({ url: v, key: k, node: valeur });
      } else if (Array.isArray(v) || (v && typeof v === "object")) {
        parcourir(v);
      }
    }
  };

  parcourir(job);
  return candidats;
}

async function importerRecapMissionKaze({ missionId, kazeMissionId }) {
  if (!missionId || !kazeMissionId)
    return { imported: 0, skipped: 0, found: 0 };

  const { rows: missions } = await db.query(
    `SELECT m.id, m.client_id, m.kaze_mission_id, m.vehicle_plate,
            u.role AS client_role
       FROM missions m
       LEFT JOIN users u ON u.id = m.client_id
      WHERE m.id = $1`,
    [missionId],
  );
  const mission = missions[0];
  if (!mission?.client_id || mission.client_role !== "client") {
    return { imported: 0, skipped: 0, found: 0 };
  }

  const job = await kazeService.fetchJob(kazeMissionId);
  const candidats = extraireCandidatsDocumentsKaze(job);
  if (candidats.length === 0) {
    return { imported: 0, skipped: 0, found: 0 };
  }

  fs.mkdirSync(USER_DOCS_DIR, { recursive: true });

  let imported = 0;
  let skipped = 0;

  for (const candidat of candidats) {
    const hash = crypto
      .createHash("sha1")
      .update(`${kazeMissionId}::${candidat.url}`)
      .digest("hex");
    const sourceRef = `job:${kazeMissionId}:${hash}`;

    const { rows: deja } = await db.query(
      `SELECT id
         FROM user_documents
        WHERE user_id = $1
          AND source = 'kaze_recap'
          AND source_ref = $2
        LIMIT 1`,
      [mission.client_id, sourceRef],
    );
    if (deja.length > 0) {
      skipped++;
      continue;
    }

    let telechargement;
    try {
      telechargement = await kazeService.downloadFile(candidat.url);
    } catch (err) {
      console.warn(
        `⚠️ Kaze recap: téléchargement impossible (${candidat.url}) : ${err.message}`,
      );
      skipped++;
      continue;
    }

    const originalName =
      normaliserNomFichier(candidat.name) || "recap-kaze.pdf";
    const ext =
      path.extname(originalName) ||
      extensionDepuisMime(telechargement.mimeType || candidat.mimeType);
    const finalName = `kaze-recap-${mission.id.slice(0, 8)}-${hash.slice(0, 12)}${ext}`;
    const disque = path.join(USER_DOCS_DIR, finalName);
    fs.writeFileSync(disque, telechargement.data);

    const labelMission = mission.vehicle_plate
      ? `Résumé Kaze mission ${mission.vehicle_plate}`
      : "Résumé Kaze de mission";

    await db.query(
      `INSERT INTO user_documents
         (user_id, label, original_name, file_path, mime_type, uploaded_by, kind, source, source_ref)
       VALUES ($1, $2, $3, $4, $5, NULL, 'kaze_recap', 'kaze_recap', $6)`,
      [
        mission.client_id,
        labelMission,
        originalName,
        `/uploads/documents/${finalName}`,
        telechargement.mimeType || candidat.mimeType || "application/pdf",
        sourceRef,
      ],
    );

    imported++;
  }

  return { imported, skipped, found: candidats.length };
}

module.exports = {
  importerRecapMissionKaze,
  _internal: {
    extraireCandidatsDocumentsKaze,
    normaliserNomFichier,
  },
};
