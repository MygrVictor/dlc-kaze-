import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  LayerGroup,
  CircleMarker,
  Polyline,
  Popup,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../lib/api";
import useSondage from "../../lib/useSondage";
import {
  TEINTES,
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  formatPrice,
  villeDe,
} from "../../lib/utils";
import {
  STATUTS_CARTE,
  PHASES,
  PRIORITE,
  phaseDeStatut,
  phaseDeKaze,
  depuis,
  gpsPerime,
  actionDe,
  lienMission,
  referenceDe,
} from "../../lib/carte";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Users,
  Truck,
  Zap,
  Maximize2,
  MapPinOff,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

const ORANGE_KAZE = "#f97316";

// ── Cadrage ─────────────────────────────────────────────────
/**
 * Cadre la carte sur les missions au premier affichage, puis seulement
 * quand on le demande (« Tout afficher »). Recadrer à chaque bascule de
 * filtre faisait perdre la zone sur laquelle on travaillait.
 */
function Cadrage({ points, demande }) {
  const map = useMap();
  const dejaCadre = useRef(false);
  const derniereDemande = useRef(demande);

  useEffect(() => {
    const nouvelleDemande = derniereDemande.current !== demande;
    if (dejaCadre.current && !nouvelleDemande) return;
    if (points.length === 0) return;
    derniereDemande.current = demande;
    dejaCadre.current = true;
    map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
  }, [points, demande, map]);

  return null;
}

/** Remonte la zone affichée, pour la liste « dans la zone ». */
function SuiviZone({ onChange }) {
  const map = useMap();
  useEffect(() => {
    const signaler = () => onChange(map.getBounds());
    signaler();
    map.on("moveend", signaler);
    return () => map.off("moveend", signaler);
  }, [map, onChange]);
  return null;
}

/** Déplace la carte vers l'élément choisi dans la liste. */
function Survol({ cible }) {
  const map = useMap();
  useEffect(() => {
    if (!cible) return;
    if (cible.bounds) {
      map.flyToBounds(cible.bounds, { padding: [60, 60], maxZoom: 11 });
    } else {
      map.flyTo([cible.lat, cible.lng], Math.max(map.getZoom(), 10));
    }
  }, [cible, map]);
  return null;
}

// ── Formes des marqueurs ───────────────────────────────────
// La couleur dit la phase ; la forme dit le rôle du point. Auparavant le
// remplissage codait départ/arrivée (vert/rouge) et la phase n'était
// qu'un liseré, invisible en vue éloignée.
function iconeArrivee(couleur, attenue) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:${couleur};border:2px solid #ffffff;opacity:${attenue ? 0.5 : 1};box-shadow:0 0 0 1px rgba(15,23,42,.35);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

function Point({ point }) {
  if (point.forme === "carre") {
    return (
      <Marker
        position={[point.lat, point.lng]}
        icon={iconeArrivee(point.color, point.attenue)}
      >
        <Popup>{point.popup}</Popup>
      </Marker>
    );
  }
  return (
    <CircleMarker
      center={[point.lat, point.lng]}
      radius={point.attenue ? 5 : 7}
      pathOptions={{
        fillColor: point.color,
        fillOpacity: point.attenue ? 0.5 : 1,
        color: point.forme === "kaze" ? ORANGE_KAZE : "#ffffff",
        weight: point.forme === "kaze" ? 3 : 2,
      }}
    >
      <Popup>{point.popup}</Popup>
    </CircleMarker>
  );
}

// ── Regroupement des marqueurs superposés ───────────────────
/**
 * Plusieurs missions partent souvent du même point (une concession, un
 * parking de flotte). Superposés, leurs marqueurs sont indiscernables et
 * seul celui du dessus est cliquable.
 *
 * Le regroupement se fait en coordonnées écran, pas géographiques : deux
 * points distants de 30 km se chevauchent au zoom 6 mais se séparent au
 * zoom 12. Le seuil est donc exprimé en pixels et recalculé à chaque
 * changement de zoom — les groupes se défont naturellement quand on
 * approche.
 */
function MarqueursGroupes({ points }) {
  const map = useMap();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const rafraichir = () => setVersion((v) => v + 1);
    map.on("zoomend", rafraichir);
    return () => map.off("zoomend", rafraichir);
  }, [map]);

  const groupes = useMemo(() => {
    const SEUIL_PX = 30;
    const resultat = [];
    for (const point of points) {
      const ecran = map.latLngToLayerPoint([point.lat, point.lng]);
      const proche = resultat.find(
        (g) =>
          Math.abs(g.ecran.x - ecran.x) < SEUIL_PX &&
          Math.abs(g.ecran.y - ecran.y) < SEUIL_PX,
      );
      if (proche) {
        proche.points.push(point);
      } else {
        resultat.push({ ecran, lat: point.lat, lng: point.lng, points: [point] });
      }
    }
    return resultat;
    // `version` force le recalcul au zoom : les positions écran ont changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map, version]);

  return (
    <>
      {groupes.map((groupe) => {
        const premier = groupe.points[0];
        if (groupe.points.length === 1) {
          return <Point key={premier.key} point={premier} />;
        }

        // Groupe : pastille chiffrée, à la couleur de la phase la plus
        // urgente présente, pour qu'un point « à traiter » ne se cache pas
        // derrière une pile de missions livrées.
        const dominant = groupe.points.reduce((a, b) =>
          PRIORITE.indexOf(a.phase) <= PRIORITE.indexOf(b.phase) ? a : b,
        );
        const taille = groupe.points.length > 9 ? 32 : 26;
        // L'ambre est clair : texte bleu nuit dessus, blanc sur le reste.
        const texte = dominant.phase === "A_TRAITER" ? "#0b1d3a" : "#ffffff";

        return (
          <Marker
            key={`groupe-${groupe.lat}-${groupe.lng}-${groupe.points.length}`}
            position={[groupe.lat, groupe.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:${taille}px;height:${taille}px;
                background:${dominant.color};
                border:2px solid #ffffff;
                border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                color:${texte};font-weight:700;
                font-size:${groupe.points.length > 99 ? 10 : 12}px;
                font-family:Inter,sans-serif;
              ">${groupe.points.length}</div>`,
              iconSize: [taille, taille],
              iconAnchor: [taille / 2, taille / 2],
            })}
            eventHandlers={{
              // Un clic rapproche : à ce zoom, le groupe se scinde de
              // lui-même et chaque mission redevient accessible.
              click: () =>
                map.setView([groupe.lat, groupe.lng], map.getZoom() + 3),
            }}
          >
            <Popup>
              <div className="min-w-[210px] text-sm">
                <p className="font-bold text-slate-900 mb-2">
                  {groupe.points.length} points à cet endroit
                </p>
                <ul className="space-y-1 max-h-52 overflow-y-auto">
                  {groupe.points.map((p) => (
                    <li
                      key={p.key}
                      className="flex items-center gap-2 text-xs text-slate-700"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="truncate">{p.resume}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 mt-2">
                  Cliquez sur la pastille pour zoomer et les séparer.
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// ── Fiches ──────────────────────────────────────────────────
/**
 * Fiche d'une mission DLC, dans une infobulle (fond blanc) ou dans la
 * liste latérale (fond du thème). Elle porte l'action attendue : la carte
 * sert à décider, il faut pouvoir agir sans chercher la mission ailleurs.
 */
function FicheMission({ mission, surPopup = true }) {
  const action = actionDe(mission.status);
  const ton = surPopup
    ? { titre: "text-slate-900", texte: "text-slate-700", doux: "text-slate-500" }
    : { titre: "text-dark-100", texte: "text-dark-200", doux: "text-dark-400" };

  const lignes = [
    ["Enlèvement", mission.departureDate ? formatDate(mission.departureDate) : "Non fixé"],
    ["Prix", mission.price ? `${formatPrice(mission.price)} HT` : "À coter"],
    ["Client", mission.company || mission.client],
    ["Véhicule", [mission.vehicle, mission.plate].filter(Boolean).join(" · ")],
    ["Convoyeur", mission.convoyeur || "Non assigné"],
  ].filter(([, valeur]) => valeur);

  return (
    <div className={`text-sm ${surPopup ? "min-w-[240px]" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`font-mono text-xs ${ton.doux}`}>
          {referenceDe(mission.id)}
        </span>
        <span className={`badge text-[11px] px-2 py-0.5 ${STATUS_COLORS[mission.status] || ""}`}>
          {STATUS_LABELS[mission.status] || mission.status}
        </span>
      </div>
      <p className={`font-semibold leading-snug ${ton.titre}`}>
        {mission.departure?.address || "Départ non localisé"}
      </p>
      <p className={`text-xs my-0.5 ${ton.doux}`}>↓</p>
      <p className={`font-semibold leading-snug mb-2 ${ton.titre}`}>
        {mission.arrival?.address || "Arrivée non localisée"}
      </p>
      <dl className="space-y-0.5 text-xs">
        {lignes.map(([etiquette, valeur]) => (
          <div key={etiquette} className="flex justify-between gap-3">
            <dt className={ton.doux}>{etiquette}</dt>
            <dd className={`font-medium text-right ${ton.texte}`}>{valeur}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 mt-3">
        {action && (
          <Link
            to={lienMission(mission.id, action.action)}
            className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold bg-amber text-navy hover:bg-amber-deep"
          >
            {action.libelle}
          </Link>
        )}
        <Link
          to={lienMission(mission.id)}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold border ${
            surPopup
              ? "border-slate-300 text-slate-700 hover:bg-slate-100"
              : "border-dark-600 text-dark-200 hover:bg-dark-700"
          }`}
        >
          Ouvrir la mission
          <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

function FicheKaze({ job }) {
  return (
    <div className="min-w-[220px] text-sm">
      <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
        <Zap size={13} style={{ color: ORANGE_KAZE }} /> Kaze —{" "}
        {job.kaze_reference}
      </div>
      <p className="font-medium text-slate-800 mb-1">{job.title}</p>
      <p className="text-slate-500 text-xs mb-2">{job.address}</p>
      <dl className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Statut</dt>
          <dd className="font-medium text-slate-800">{job.status_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Convoyeur</dt>
          <dd className="font-medium text-slate-800">
            {job.performer_name || "Non assigné"}
          </dd>
        </div>
        {job.due_date && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Date</dt>
            <dd className="text-slate-700">{formatDate(job.due_date)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ── Légende ─────────────────────────────────────────────────
function Legende() {
  const [ouverte, setOuverte] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );
  return (
    // Fond posé en ligne : le thème clair remplace les `bg-white/…` par un
    // voile presque transparent, et la légende se mêlait aux libellés de
    // la carte.
    <div
      className="absolute bottom-3 left-3 z-[1000] rounded-lg text-slate-700 text-[11px] border border-slate-200 max-w-[230px]"
      style={{ background: "#ffffff" }}
    >
      <button
        type="button"
        onClick={() => setOuverte((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 font-semibold text-slate-800"
        aria-expanded={ouverte}
      >
        Légende
        <ChevronDown
          size={13}
          className={`transition-transform ${ouverte ? "rotate-180" : ""}`}
        />
      </button>
      {ouverte && (
        <ul className="px-3 pb-2.5 space-y-1">
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,.35)]" style={{ background: TEINTES.bleu }} />
            Départ
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,.35)]" style={{ background: TEINTES.bleu }} />
            Arrivée
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-[3px]" style={{ borderColor: TEINTES.bleu }} />
            Itinéraire routier
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-[3px] border-dashed" style={{ borderColor: TEINTES.bleu }} />
            Ligne droite (itinéraire non calculé)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dotted opacity-60" style={{ borderColor: TEINTES.gris }} />
            Mission terminée
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: TEINTES.bleu, border: `3px solid ${ORANGE_KAZE}` }} />
            Mission Kaze
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-600 border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,.35)]" />
            Convoyeur (GPS)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-400 opacity-60" />
            GPS de plus de 2 h
          </li>
          <li className="pt-1 text-slate-500">La couleur indique la phase.</li>
        </ul>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
export default function AdminMap() {
  const [missions, setMissions] = useState([]);
  const [nonLocalisees, setNonLocalisees] = useState([]);
  const [voirNonLocalisees, setVoirNonLocalisees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actualiseA, setActualiseA] = useState(null);
  // Par défaut, l'historique est masqué : la carte sert d'abord à piloter
  // ce qui reste à faire.
  const [activePhases, setActivePhases] = useState(
    new Set(["A_TRAITER", "PLANIFIEE", "EN_COURS"]),
  );

  // Kaze
  const [kazeJobs, setKazeJobs] = useState([]);
  const [kazeUsers, setKazeUsers] = useState([]);
  const [showKazeJobs, setShowKazeJobs] = useState(true);
  const [showKazeDrivers, setShowKazeDrivers] = useState(true);

  // Période d'historique : s'applique aux missions terminées (DLC et Kaze).
  // Les missions actives restent affichées quelle que soit leur date.
  const [jours, setJours] = useState(60);

  // Cadrage, zone affichée, sélection depuis la liste
  const [demandeCadrage, setDemandeCadrage] = useState(0);
  const [zone, setZone] = useState(null);
  const [limiterZone, setLimiterZone] = useState(true);
  const [selection, setSelection] = useState(null);
  const [cible, setCible] = useState(null);

  const fetchMapData = useCallback(
    async (silencieux = false) => {
      if (!silencieux) {
        setLoading(true);
        setError(null);
      }
      try {
        // On charge tous les statuts : le tri par phase se fait ensuite en
        // mémoire, ce qui rend les bascules instantanées.
        const [mapRes, kazeUsersRes] = await Promise.all([
          api.get(
            `/admin/missions/map?statuses=${STATUTS_CARTE.join(",")}&jours=${jours}`,
          ),
          api.get("/admin/kaze/users").catch(() => ({ data: { data: [] } })),
        ]);
        setMissions(mapRes.data.missions || []);
        setNonLocalisees(mapRes.data.nonLocalisees || []);
        setKazeJobs(mapRes.data.kazeMissions || []);
        setKazeUsers(kazeUsersRes.data.data || []);
        setActualiseA(new Date());
        setError(null);
      } catch (err) {
        console.error(err);
        // Une actualisation automatique qui échoue garde la carte affichée.
        if (!silencieux) {
          setError("Impossible de charger les données de la carte.");
        }
      } finally {
        if (!silencieux) setLoading(false);
      }
    },
    [jours],
  );

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // Écran de pilotage : statuts et positions GPS se rafraîchissent seuls,
  // sans recadrer ni réafficher le chargement.
  useSondage(() => fetchMapData(true), 60000);

  const togglePhase = (phase) => {
    setActivePhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  const filtered = useMemo(
    () => missions.filter((m) => activePhases.has(phaseDeStatut(m.status))),
    [missions, activePhases],
  );

  // Itinéraires routiers (OpenRouteService, mis en cache côté serveur).
  // Sans clé ORS, le serveur ne renvoie rien et on garde les lignes droites.
  const [itineraires, setItineraires] = useState({});
  useEffect(() => {
    const trajets = filtered
      .filter((m) => m.departure && m.arrival && !itineraires[m.id])
      .slice(0, 100)
      .map((m) => ({ id: m.id, from: m.departure, to: m.arrival }));
    if (!trajets.length) return undefined;
    let annule = false;
    let timer;
    api
      .post("/admin/missions/itineraires", { trajets })
      .then((res) => {
        if (annule) return;
        const recu = { ...(res.data?.itineraires || {}) };
        // Échecs et trajets non calculés ce tour-ci : marqués pour ne pas
        // être redemandés en boucle (ligne droite conservée).
        for (const id of res.data?.echecs || []) recu[id] = { echec: true };
        if (!res.data?.ors_configure) {
          for (const t of trajets) recu[t.id] = recu[t.id] || { echec: true };
        }
        if (Object.keys(recu).length) {
          setItineraires((prev) => ({ ...prev, ...recu }));
        }
        // Limite ORS (40/min) : on reprend plus tard pour le reste.
        if (res.data?.ors_configure && res.data?.restants > 0) {
          timer = setTimeout(() => {
            if (!annule) setItineraires((prev) => ({ ...prev }));
          }, 25000);
        }
      })
      .catch(() => {});
    return () => {
      annule = true;
      clearTimeout(timer);
    };
  }, [filtered, itineraires]);

  const kazeJobsDedupes = useMemo(() => {
    // Kaze nomme nos missions « DLC-<8 premiers caractères de l'id> » :
    // un job qui porte cette référence est déjà affiché comme mission DLC.
    const linkedRefs = new Set(missions.map((m) => referenceDe(m.id)));
    return kazeJobs.filter(
      (j) => !linkedRefs.has(String(j.kaze_reference || "").toUpperCase()),
    );
  }, [missions, kazeJobs]);

  const kazeFiltres = useMemo(
    () => kazeJobsDedupes.filter((j) => activePhases.has(phaseDeKaze(j))),
    [kazeJobsDedupes, activePhases],
  );

  const conducteursGps = useMemo(
    () =>
      kazeUsers
        .filter((u) => u.latitude)
        .map((u) => ({ ...u, perime: gpsPerime(u.location_updated_at) })),
    [kazeUsers],
  );

  // Liste plate de tous les marqueurs (DLC + Kaze), pour le regroupement.
  const pointsCarte = useMemo(() => {
    const points = [];
    filtered.forEach((m) => {
      const phase = phaseDeStatut(m.status);
      const commun = {
        phase,
        color: PHASES[phase].color,
        attenue: phase === "TERMINEE",
        popup: <FicheMission mission={m} />,
      };
      const resume = `${referenceDe(m.id)} — ${m.vehicle || "Mission"}`;
      if (m.departure) {
        points.push({
          ...commun,
          key: `dep-${m.id}`,
          lat: m.departure.lat,
          lng: m.departure.lng,
          forme: "rond",
          resume: `Départ · ${resume}`,
        });
      }
      if (m.arrival) {
        points.push({
          ...commun,
          key: `arr-${m.id}`,
          lat: m.arrival.lat,
          lng: m.arrival.lng,
          forme: "carre",
          resume: `Arrivée · ${resume}`,
        });
      }
    });
    if (showKazeJobs) {
      kazeFiltres.forEach((job) => {
        const phase = phaseDeKaze(job);
        points.push({
          key: `kaze-${job.kaze_job_id}`,
          lat: job.latitude,
          lng: job.longitude,
          phase,
          color: PHASES[phase].color,
          attenue: phase === "TERMINEE",
          forme: "kaze",
          resume: `Kaze · ${job.kaze_reference || job.title}`,
          popup: <FicheKaze job={job} />,
        });
      });
    }
    return points;
  }, [filtered, kazeFiltres, showKazeJobs]);

  const coordonneesCadrage = useMemo(
    () => pointsCarte.map((p) => [p.lat, p.lng]),
    [pointsCarte],
  );

  const stats = useMemo(() => {
    const counts = { A_TRAITER: 0, PLANIFIEE: 0, EN_COURS: 0, TERMINEE: 0 };
    missions.forEach((m) => counts[phaseDeStatut(m.status)]++);
    kazeJobsDedupes.forEach((j) => counts[phaseDeKaze(j)]++);
    return counts;
  }, [missions, kazeJobsDedupes]);

  // ── Liste latérale ──
  const elementsListe = useMemo(() => {
    const dans = (lat, lng) =>
      !limiterZone || !zone || (lat != null && zone.contains([lat, lng]));
    const dlc = filtered
      .filter(
        (m) =>
          (m.departure && dans(m.departure.lat, m.departure.lng)) ||
          (m.arrival && dans(m.arrival.lat, m.arrival.lng)),
      )
      .map((m) => ({
        key: `m-${m.id}`,
        phase: phaseDeStatut(m.status),
        date: m.departureDate,
        mission: m,
      }));
    const kaze = showKazeJobs
      ? kazeFiltres
          .filter((j) => dans(j.latitude, j.longitude))
          .map((j) => ({
            key: `k-${j.kaze_job_id}`,
            phase: phaseDeKaze(j),
            date: j.due_date,
            job: j,
          }))
      : [];
    return [...dlc, ...kaze].sort(
      (a, b) =>
        PRIORITE.indexOf(a.phase) - PRIORITE.indexOf(b.phase) ||
        new Date(a.date || 0) - new Date(b.date || 0),
    );
  }, [filtered, kazeFiltres, showKazeJobs, zone, limiterZone]);

  const choisir = (element) => {
    const deja = selection === element.key;
    setSelection(deja ? null : element.key);
    if (deja) return;
    if (element.mission) {
      const { departure, arrival } = element.mission;
      if (departure && arrival) {
        setCible({
          key: element.key,
          bounds: [
            [departure.lat, departure.lng],
            [arrival.lat, arrival.lng],
          ],
        });
      } else {
        const p = departure || arrival;
        setCible({ key: element.key, lat: p.lat, lng: p.lng });
      }
    } else {
      setCible({ key: element.key, lat: element.job.latitude, lng: element.job.longitude });
    }
  };

  const changerZone = useCallback((b) => setZone(b), []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={36} className="animate-spin text-dark-400 mb-4" />
        <p className="text-dark-400 text-sm">Chargement de la carte…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-red-400">
        <AlertCircle size={40} className="mb-4" />
        <p className="text-lg font-medium">{error}</p>
        <button onClick={() => fetchMapData()} className="btn-primary mt-4">
          Réessayer
        </button>
      </div>
    );
  }

  const nbVisibles = filtered.length + (showKazeJobs ? kazeFiltres.length : 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ── En-tête ──────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Carte des missions</h1>
          <p className="text-dark-400 text-xs sm:text-sm mt-1">
            {nbVisibles} sur la carte
            {actualiseA &&
              ` · actualisée à ${actualiseA.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}, puis chaque minute`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-dark-400">
            <span className="hidden sm:inline">Historique</span>
            <select
              value={jours}
              onChange={(e) => setJours(Number(e.target.value))}
              className="input-field !w-auto !py-1.5 text-sm"
              title="Période des missions terminées affichées (DLC et Kaze). Les missions en cours restent toujours visibles."
            >
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={60}>60 jours</option>
              <option value={180}>6 mois</option>
              <option value={365}>1 an</option>
            </select>
          </label>
          <button
            onClick={() => fetchMapData(true)}
            className="btn-secondary !py-1.5 flex items-center gap-2 text-sm"
            aria-label="Actualiser"
            title="Actualiser"
          >
            <RefreshCw size={15} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>

      {/* ── Filtres par phase ────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {PRIORITE.map((key) => {
          const cfg = PHASES[key];
          const isActive = activePhases.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => togglePhase(key)}
              aria-pressed={isActive}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                isActive
                  ? "bg-dark-800 border-dark-600"
                  : "bg-transparent border-dark-800 opacity-50"
              }`}
              style={isActive ? { borderLeft: `4px solid ${cfg.color}` } : undefined}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                {/* Retour à la ligne plutôt que troncature : « Acceptées /
                    assignées » doit rester lisible sur mobile. */}
                <span className="leading-tight">{cfg.label}</span>
                <span className="ml-auto pl-1">{stats[key] || 0}</span>
              </span>
              <span className="hidden sm:block text-[11px] text-dark-400 mt-0.5 pl-[18px]">
                {cfg.aide}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Kaze + missions non localisées ───── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setShowKazeJobs((v) => !v)}
          aria-pressed={showKazeJobs}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium border ${
            showKazeJobs
              ? "border-dark-600 text-dark-200"
              : "border-dark-800 text-dark-500 opacity-60"
          }`}
        >
          <Truck size={12} style={{ color: ORANGE_KAZE }} />
          Missions Kaze
          <span className="font-bold">{kazeFiltres.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowKazeDrivers((v) => !v)}
          aria-pressed={showKazeDrivers}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium border ${
            showKazeDrivers
              ? "border-dark-600 text-dark-200"
              : "border-dark-800 text-dark-500 opacity-60"
          }`}
        >
          <Users size={12} className="text-cyan-600" />
          Convoyeurs GPS
          <span className="font-bold">{conducteursGps.length}</span>
        </button>

        {nonLocalisees.length > 0 && (
          <button
            type="button"
            onClick={() => setVoirNonLocalisees((v) => !v)}
            aria-expanded={voirNonLocalisees}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium border"
            style={{ borderColor: TEINTES.ambre, color: TEINTES.ambre }}
          >
            <MapPinOff size={12} />
            {nonLocalisees.length} mission
            {nonLocalisees.length > 1 ? "s" : ""} hors carte
            <ChevronDown
              size={12}
              className={voirNonLocalisees ? "rotate-180" : ""}
            />
          </button>
        )}
      </div>

      {voirNonLocalisees && nonLocalisees.length > 0 && (
        <div className="card !p-3">
          <p className="text-xs text-dark-400 mb-2">
            Adresses pas encore géocodées : ces missions existent mais ne
            peuvent pas être placées sur la carte.
          </p>
          <ul className="divide-y divide-dark-700 max-h-56 overflow-y-auto">
            {nonLocalisees.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`badge text-[11px] px-2 py-0.5 ${STATUS_COLORS[m.status] || ""}`}>
                  {STATUS_LABELS[m.status]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.departure_address || "—"} → {m.arrival_address || "—"}
                  {m.client && (
                    <span className="text-dark-400"> · {m.client}</span>
                  )}
                </span>
                <Link
                  to={lienMission(m.id)}
                  className="shrink-0 text-xs font-semibold underline"
                >
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Carte + liste ────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* `min-w-0` sur les deux colonnes : sans lui, un élément de grille
            s'élargit à la taille de son contenu (adresse longue dans la
            liste) et la page déborde sur mobile. */}
        <div className="relative min-w-0 rounded-xl overflow-hidden border border-dark-700 h-[60vh] min-h-[380px] lg:h-[70vh] lg:min-h-[520px]">
          <MapContainer
            center={[46.603354, 1.888334]} // Centre France
            zoom={6}
            style={{ height: "100%", width: "100%" }}
          >
            {/*
              Fonds de carte. Le fond par défaut est une véritable carte
              routière : hiérarchie des axes marquée, numéros d'autoroutes
              et de nationales lisibles dès le zoom régional. C'est ce qu'il
              faut pour juger un trajet de convoyage.
            */}
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Carte routière">
                <TileLayer
                  attribution="Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Routière (nuit)">
                <LayerGroup>
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
                    maxZoom={20}
                  />
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png"
                    maxZoom={20}
                  />
                </LayerGroup>
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Relief">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tuiles <a href="https://opentopomap.org">OpenTopoMap</a>'
                  url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  maxZoom={17}
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <Cadrage points={coordonneesCadrage} demande={demandeCadrage} />
            <SuiviZone onChange={changerZone} />
            <Survol cible={cible} />

            {/* Tracés : cliquables (même fiche que les points) et mis en
                évidence au survol ou à la sélection dans la liste. */}
            {filtered.map((m) => {
              if (!m.departure || !m.arrival) return null;
              const phase = phaseDeStatut(m.status);
              const terminee = phase === "TERMINEE";
              const choisie = selection === `m-${m.id}`;
              const epaisseur = choisie ? 6 : terminee ? 1.5 : 3;
              const coords = itineraires[m.id]?.coords;
              return (
                <Polyline
                  key={`trajet-${m.id}-${choisie ? "sel" : "n"}`}
                  positions={
                    coords || [
                      [m.departure.lat, m.departure.lng],
                      [m.arrival.lat, m.arrival.lng],
                    ]
                  }
                  pathOptions={{
                    color: PHASES[phase].color,
                    weight: epaisseur,
                    opacity: terminee && !choisie ? 0.4 : 0.9,
                    // Route réelle : trait plein ; ligne droite : tirets ;
                    // terminée : pointillés pâles.
                    dashArray: terminee ? "2 6" : coords ? null : "8 6",
                  }}
                  eventHandlers={{
                    mouseover: (e) => e.target.setStyle({ weight: epaisseur + 3 }),
                    mouseout: (e) => e.target.setStyle({ weight: epaisseur }),
                  }}
                >
                  <Popup>
                    <FicheMission mission={m} />
                  </Popup>
                </Polyline>
              );
            })}

            <MarqueursGroupes points={pointsCarte} />

            {/* Convoyeurs : position GPS remontée par Kaze. Grisée quand
                elle date de plus de 2 h : une position de la veille ne
                doit pas passer pour une position actuelle. */}
            {showKazeDrivers &&
              conducteursGps.map((user) => (
                <CircleMarker
                  key={`driver-${user.kaze_user_id}`}
                  center={[user.latitude, user.longitude]}
                  radius={6}
                  pathOptions={{
                    fillColor: user.perime ? "#94a3b8" : "#0891b2",
                    fillOpacity: user.perime ? 0.6 : 1,
                    color: "#ffffff",
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="min-w-[180px] text-sm">
                      <p className="font-bold text-slate-900 mb-1">{user.name}</p>
                      <p
                        className={`text-xs font-medium ${
                          user.perime ? "text-red-700" : "text-slate-700"
                        }`}
                      >
                        Position{" "}
                        {user.location_updated_at
                          ? depuis(user.location_updated_at)
                          : "sans date"}
                        {user.perime && " — probablement plus à jour"}
                      </p>
                      {user.device && (
                        <p className="text-xs text-slate-500 mt-1">
                          {user.device.name || user.device.platform}
                        </p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
          </MapContainer>

          {/* Recentrer sur l'ensemble : le cadrage n'est plus automatique
              après le premier affichage. */}
          <button
            type="button"
            onClick={() => setDemandeCadrage((n) => n + 1)}
            className="absolute top-[86px] left-[10px] z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded"
            // Style posé en ligne : les règles génériques des boutons du
            // tableau de bord l'assombrissaient, alors qu'il doit ressembler
            // aux boutons de zoom Leaflet juste au-dessus.
            style={{
              background: "#ffffff",
              color: "#334155",
              border: "2px solid rgba(0,0,0,0.2)",
            }}
            aria-label="Tout afficher"
            title="Tout afficher"
          >
            <Maximize2 size={15} />
          </button>

          <Legende />
        </div>

        {/* ── Liste des missions ─────────────── */}
        <aside className="card !p-0 min-w-0 flex flex-col lg:h-[70vh] lg:min-h-[520px] max-h-[60vh] lg:max-h-none">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-dark-700">
            <p className="text-sm font-semibold">
              {elementsListe.length} mission
              {elementsListe.length > 1 ? "s" : ""}
            </p>
            <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer">
              <input
                type="checkbox"
                checked={limiterZone}
                onChange={(e) => setLimiterZone(e.target.checked)}
              />
              Zone affichée
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-dark-800">
            {elementsListe.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-dark-400">
                Aucune mission
                {limiterZone ? " dans cette zone" : " pour ces filtres"}.
              </li>
            )}
            {elementsListe.map((el) => {
              const ouvert = selection === el.key;
              const couleur = PHASES[el.phase].color;
              const m = el.mission;
              const titre = m
                ? `${villeDe(m.departure?.address)} → ${villeDe(m.arrival?.address)}`
                : el.job.title || el.job.kaze_reference;
              return (
                <li key={el.key}>
                  <button
                    type="button"
                    onClick={() => choisir(el)}
                    aria-expanded={ouvert}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-dark-800 ${
                      ouvert ? "bg-dark-800" : ""
                    }`}
                  >
                    <span
                      className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: couleur }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">
                        {!m && (
                          <Zap
                            size={11}
                            className="inline mr-1 -mt-0.5"
                            style={{ color: ORANGE_KAZE }}
                          />
                        )}
                        {titre}
                      </span>
                      <span className="block text-xs text-dark-400 truncate">
                        {m
                          ? [
                              STATUS_LABELS[m.status],
                              m.departureDate && formatDate(m.departureDate),
                              m.company || m.client,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : [el.job.status_name, el.job.performer_name]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                    </span>
                  </button>
                  {ouvert && m && (
                    <div className="px-4 pb-3 pt-1">
                      <FicheMission mission={m} surPopup={false} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
