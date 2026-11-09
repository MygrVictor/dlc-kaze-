import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "../../lib/api";

// ── Dates ──────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
const isoJour = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const versDate = (iso) => {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j || 1);
};
const nf = (n) => Number(n || 0).toLocaleString("fr-FR");

const MOIS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const MODES = [
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "annee", label: "Année" },
  { value: "libre", label: "Personnalisée" },
];

const GRANULARITES_LIBRES = [
  { value: "jour", label: "Jour" },
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "annee", label: "Année" },
];

function lundi(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** Bornes et regroupement d'une période ancrée sur `ref`. */
function bornes(mode, ref) {
  if (mode === "semaine") {
    const debut = lundi(ref);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 6);
    return { debut: isoJour(debut), fin: isoJour(fin), granularite: "jour" };
  }
  if (mode === "mois") {
    const debut = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { debut: isoJour(debut), fin: isoJour(fin), granularite: "jour" };
  }
  return {
    debut: `${ref.getFullYear()}-01-01`,
    fin: `${ref.getFullYear()}-12-31`,
    granularite: "mois",
  };
}

function decaler(mode, ref, sens) {
  const r = new Date(ref);
  if (mode === "semaine") r.setDate(r.getDate() + 7 * sens);
  else if (mode === "mois") r.setMonth(r.getMonth() + sens, 1);
  else r.setFullYear(r.getFullYear() + sens, 0, 1);
  return r;
}

function titrePeriode(mode, ref) {
  if (mode === "semaine") {
    const d = lundi(ref);
    const f = new Date(d);
    f.setDate(f.getDate() + 6);
    const memeMois = d.getMonth() === f.getMonth();
    return `${d.getDate()}${memeMois ? "" : ` ${MOIS[d.getMonth()]}`} – ${f.getDate()} ${MOIS_LONGS[f.getMonth()]} ${f.getFullYear()}`;
  }
  if (mode === "mois")
    return `${MOIS_LONGS[ref.getMonth()]} ${ref.getFullYear()}`;
  return String(ref.getFullYear());
}

function estCourante(mode, ref) {
  const auj = new Date();
  if (mode === "semaine") return isoJour(lundi(ref)) === isoJour(lundi(auj));
  if (mode === "mois")
    return (
      ref.getFullYear() === auj.getFullYear() &&
      ref.getMonth() === auj.getMonth()
    );
  return ref.getFullYear() === auj.getFullYear();
}

const LIBELLE_COURANT = {
  semaine: "Cette semaine",
  mois: "Ce mois-ci",
  annee: "Cette année",
};

function libelleCourt(cle, granularite) {
  if (granularite === "annee") return cle;
  if (granularite === "mois") {
    const [a, m] = cle.split("-");
    return `${MOIS[Number(m) - 1]} ${a.slice(2)}`;
  }
  const [, m, j] = cle.split("-");
  if (granularite === "jour") return `${Number(j)}`;
  return `${j}/${m}`;
}

function libelleLong(cle, granularite) {
  if (granularite === "annee") return `Année ${cle}`;
  if (granularite === "mois") {
    const [a, m] = cle.split("-");
    return `${MOIS_LONGS[Number(m) - 1]} ${a}`;
  }
  const d = versDate(cle);
  if (granularite === "jour")
    return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
  return `Semaine du ${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

function graduations(max) {
  if (max <= 0) return [0, 1];
  const brut = max / 4;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= brut);
  const haut = Math.ceil(max / pas) * pas;
  const ticks = [];
  for (let v = 0; v <= haut + 1e-9; v += pas)
    ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

// ── Composants ─────────────────────────────────────────────────
import "./ClientAnalyse.css";

// ── Composants ─────────────────────────────────────────────────

const NOM_GRANULARITE = {
  jour: "jour",
  semaine: "semaine",
  mois: "mois",
  annee: "année",
};

function Segments({ options, valeur, onChange }) {
  return (
    <div className="a-segments" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={valeur === o.value}
          onClick={() => onChange(o.value)}
          className="a-segment"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Indicateur({ libelle, valeur, unite, note, teinte = "bleu" }) {
  return (
    <div
      className={`a-carte a-teinte a-teinte--${teinte} p-5 relative overflow-hidden`}
    >
      <span className="a-teinte-barre" />
      <div className="a-libelle">{libelle}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="a-valeur">{valeur}</span>
        {unite && <span className="text-sm a-doux">{unite}</span>}
      </div>
      <div className="mt-2 text-xs a-faible min-h-[16px]">{note}</div>
    </div>
  );
}

/** Histogramme : barres bleues, période survolée en jaune. */
function Histogramme({ series, granularite, mesure }) {
  const conteneur = useRef(null);
  const [largeur, setLargeur] = useState(720);
  const [survol, setSurvol] = useState(null);

  useEffect(() => {
    const el = conteneur.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 260;
  const M = { haut: 12, droite: 0, bas: 28, gauche: 36 };
  const l = Math.max(200, largeur) - M.gauche - M.droite;
  const h = H - M.haut - M.bas;

  const valeurs = series.map((p) => p[mesure] || 0);
  const ticks = graduations(Math.max(...valeurs, 0));
  const max = ticks[ticks.length - 1] || 1;
  const n = Math.max(series.length, 1);
  const bande = l / n;
  const barre = Math.max(3, Math.min(36, bande * 0.6));
  const pasEtiquette = Math.max(1, Math.ceil((n * 36) / l));
  const vide = valeurs.every((v) => v === 0);
  const p = survol != null ? series[survol] : null;

  return (
    <div ref={conteneur} className="relative w-full">
      <svg width="100%" height={H} className="block">
        <g transform={`translate(${M.gauche},${M.haut})`}>
          {ticks.map((t) => {
            const y = h - (t / max) * h;
            return (
              <g key={t}>
                <line
                  x1={0}
                  x2={l}
                  y1={y}
                  y2={y}
                  stroke={t === 0 ? "var(--a-bord)" : "var(--a-grille)"}
                />
                <text
                  x={-10}
                  y={y}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--a-faible)"
                  className="a-num"
                >
                  {nf(t)}
                </text>
              </g>
            );
          })}

          {series.map((pt, i) => {
            const v = pt[mesure] || 0;
            const hb = (v / max) * h;
            const actif = survol === i;
            return (
              <g
                key={pt.periode}
                onMouseEnter={() => setSurvol(i)}
                onMouseLeave={() => setSurvol(null)}
              >
                <rect
                  x={i * bande}
                  y={0}
                  width={bande}
                  height={h + 24}
                  fill="transparent"
                />
                <rect
                  x={i * bande + (bande - barre) / 2}
                  y={h - hb}
                  width={barre}
                  height={Math.max(hb, v ? 2 : 0)}
                  rx={Math.min(4, barre / 4)}
                  fill={actif ? "var(--a-jaune)" : "var(--a-bleu)"}
                  style={{ transition: "fill .12s" }}
                />
                {i % pasEtiquette === 0 && (
                  <text
                    x={i * bande + bande / 2}
                    y={h + 19}
                    textAnchor="middle"
                    fontSize="11"
                    fill={actif ? "var(--a-texte)" : "var(--a-faible)"}
                  >
                    {libelleCourt(pt.periode, granularite)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {vide && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm a-faible">
          Aucun convoyage sur cette période
        </div>
      )}

      {p && !vide && (
        <div
          className="a-carte pointer-events-none absolute top-0 -translate-x-1/2 px-3 py-2 text-xs whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(
              Math.max(M.gauche + survol * bande + bande / 2, 100),
              largeur - 100,
            ),
          }}
        >
          <div className="a-doux first-letter:uppercase">
            {libelleLong(p.periode, granularite)}
          </div>
          <div className="mt-1 text-sm font-semibold a-num">
            {mesure === "km"
              ? `${nf(p.km)} km`
              : `${nf(p.convoyages)} convoyage${p.convoyages > 1 ? "s" : ""}`}
          </div>
          <div className="a-faible a-num">
            {nf(p.livres)} livré{p.livres > 1 ? "s" : ""}
            {mesure === "convoyages" ? ` · ${nf(p.km)} km` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

const MODES_PAGE = [
  { value: "semaine", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "annee", label: "Année" },
  { value: "libre", label: "Personnalisée" },
];

export default function ClientAnalyse() {
  const [mode, setMode] = useState("mois");
  const [ref, setRef] = useState(() => new Date());
  const [libre, setLibre] = useState(() => {
    const auj = new Date();
    return {
      debut: `${auj.getFullYear()}-01-01`,
      fin: isoJour(auj),
      granularite: "mois",
    };
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  const requete = useMemo(
    () => (mode === "libre" ? libre : bornes(mode, ref)),
    [mode, ref, libre],
  );

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setErreur(null);
    api
      .get("/missions/mes-statistiques", { params: requete })
      .then(({ data }) => actif && setStats(data))
      .catch(
        () => actif && setErreur("Impossible de charger les statistiques."),
      )
      .finally(() => actif && setLoading(false));
    return () => {
      actif = false;
    };
  }, [requete]);

  const lignes = useMemo(
    () =>
      stats ? [...stats.series].reverse().filter((p) => p.convoyages > 0) : [],
    [stats],
  );

  const auj = new Date();
  const courante = mode !== "libre" && estCourante(mode, ref);
  const annees = Array.from({ length: 6 }, (_, i) => auj.getFullYear() - i);
  const taux = stats?.periode.convoyages
    ? Math.round((stats.periode.livres / stats.periode.convoyages) * 100)
    : 0;

  return (
    <div className="analyse max-w-7xl space-y-5">
      {/* ── En-tête ─────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="a-titre">Analyse</h1>
          <p className="text-sm a-doux mt-1">
            Suivi de vos convoyages et des kilomètres parcourus.
          </p>
        </div>
        <Segments
          options={MODES_PAGE}
          valeur={mode}
          onChange={(m) => {
            setMode(m);
            setRef(new Date());
          }}
        />
      </header>

      {/* ── Période ─────────────────────────────── */}
      <div className="a-carte px-4 py-3 flex flex-wrap items-center gap-3">
        {mode === "libre" ? (
          <>
            <label className="flex items-center gap-2 text-sm a-doux">
              Du
              <input
                type="date"
                className="a-champ"
                value={libre.debut}
                max={libre.fin}
                onChange={(e) =>
                  e.target.value &&
                  setLibre((f) => ({ ...f, debut: e.target.value }))
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm a-doux">
              au
              <input
                type="date"
                className="a-champ"
                value={libre.fin}
                min={libre.debut}
                onChange={(e) =>
                  e.target.value &&
                  setLibre((f) => ({ ...f, fin: e.target.value }))
                }
              />
            </label>
            <label className="sm:ml-auto flex items-center gap-2 text-sm a-doux">
              Regrouper par
              <select
                className="a-champ"
                value={libre.granularite}
                onChange={(e) =>
                  setLibre((f) => ({ ...f, granularite: e.target.value }))
                }
              >
                {GRANULARITES_LIBRES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <button
              type="button"
              className="a-bouton"
              onClick={() => setRef(decaler(mode, ref, -1))}
              aria-label="Période précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[190px] text-center text-[15px] font-semibold first-letter:uppercase">
              {titrePeriode(mode, ref)}
            </div>
            <button
              type="button"
              className="a-bouton"
              onClick={() => setRef(decaler(mode, ref, 1))}
              disabled={courante}
              aria-label="Période suivante"
            >
              <ChevronRight size={16} />
            </button>

            <div className="sm:ml-auto flex items-center gap-3">
              {!courante && (
                <button
                  type="button"
                  className="a-lien"
                  onClick={() => setRef(new Date())}
                >
                  {LIBELLE_COURANT[mode]}
                </button>
              )}
              {mode === "annee" ? (
                <select
                  className="a-champ"
                  value={ref.getFullYear()}
                  onChange={(e) =>
                    setRef(new Date(Number(e.target.value), 0, 1))
                  }
                  aria-label="Année"
                >
                  {annees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              ) : mode === "mois" ? (
                <input
                  type="month"
                  className="a-champ"
                  value={`${ref.getFullYear()}-${pad(ref.getMonth() + 1)}`}
                  max={`${auj.getFullYear()}-${pad(auj.getMonth() + 1)}`}
                  onChange={(e) =>
                    e.target.value && setRef(versDate(`${e.target.value}-01`))
                  }
                  aria-label="Mois"
                />
              ) : (
                <input
                  type="date"
                  className="a-champ"
                  value={isoJour(ref)}
                  max={isoJour(auj)}
                  onChange={(e) =>
                    e.target.value && setRef(versDate(e.target.value))
                  }
                  aria-label="Semaine du"
                />
              )}
            </div>
          </>
        )}
      </div>

      {erreur && <p className="text-sm text-red-500">{erreur}</p>}
      {!stats && loading && <div className="a-carte h-[440px] animate-pulse" />}

      {stats && (
        <div
          className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}
        >
          {/* ── Indicateurs ─────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Indicateur
              teinte="marine"
              libelle="Convoyages"
              valeur={nf(stats.periode.convoyages)}
              note="Commandés sur la période"
            />
            <Indicateur
              teinte="jaune"
              libelle="Livrés"
              valeur={nf(stats.periode.livres)}
              note={
                <span className="flex items-center gap-2">
                  <span
                    className="h-1 flex-1 max-w-[120px] rounded-full"
                    style={{ background: "var(--t-piste)" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${taux}%`,
                        background: "var(--t-fort)",
                      }}
                    />
                  </span>
                  {taux} %
                </span>
              }
            />
            <Indicateur
              teinte="bleu"
              libelle="Kilomètres parcourus"
              valeur={nf(stats.periode.km_total)}
              unite="km"
              note="Convoyages livrés"
            />
            <Indicateur
              teinte="ciel"
              libelle="Distance moyenne"
              valeur={nf(stats.periode.km_moyen_par_convoyage)}
              unite="km"
              note="Par convoyage livré"
            />
          </div>

          {/* ── Synthèse annuelle (bandeau compact) ─── */}
          <section className="a-marine px-5 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="a-libelle">Depuis le 1er janvier</span>
              <span
                className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {stats.annee.annee}
              </span>
            </div>
            {[
              ["Kilomètres", `${nf(stats.annee.km_total)} km`],
              ["Convoyages", nf(stats.annee.convoyages)],
              ["Km / mois", nf(stats.annee.km_moyen_par_mois)],
              ["Conv. / mois", nf(stats.annee.convoyages_moyen_par_mois)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="text-xs" style={{ color: "#9fb0cc" }}>
                  {k}
                </span>
                <span className="text-base font-semibold a-num">{v}</span>
              </div>
            ))}
          </section>

          {/* ── Évolution : deux graphiques côte à côte ─ */}
          <div className="grid grid-cols-2 gap-4">
            {[
              ["convoyages", "Convoyages"],
              ["km", "Kilomètres"],
            ].map(([m, titre]) => (
              <section key={m} className="a-carte p-5 min-w-0">
                <div className="mb-5">
                  <h2 className="text-[15px] font-semibold">{titre}</h2>
                  <p className="text-xs a-faible mt-0.5">
                    Évolution par {NOM_GRANULARITE[stats.granularite]}
                  </p>
                </div>
                <Histogramme
                  series={stats.series}
                  granularite={stats.granularite}
                  mesure={m}
                />
              </section>
            ))}
          </div>

          {/* ── Détail ──────────────────────────────── */}
          <section className="a-carte overflow-hidden">
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ borderColor: "var(--a-bord)" }}
            >
              <h2 className="text-[15px] font-semibold">
                Détail par {NOM_GRANULARITE[stats.granularite]}
              </h2>
              <span className="text-xs a-faible">
                {lignes.length} période{lignes.length > 1 ? "s" : ""} avec
                activité
              </span>
            </div>
            {lignes.length === 0 ? (
              <p className="px-5 py-8 text-sm a-faible">
                Aucun convoyage sur cette période.
              </p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                <table className="a-table w-full text-sm">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="text-left">Période</th>
                      <th className="text-right">Convoyages</th>
                      <th className="text-right">Livrés</th>
                      <th className="text-right">Kilomètres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((p) => (
                      <tr key={p.periode}>
                        <td className="first-letter:uppercase">
                          {libelleLong(p.periode, stats.granularite)}
                        </td>
                        <td className="text-right a-num font-medium">
                          {nf(p.convoyages)}
                        </td>
                        <td className="text-right a-num a-doux">
                          {nf(p.livres)}
                        </td>
                        <td className="text-right a-num a-doux">
                          {nf(p.km)} km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs a-faible leading-relaxed max-w-3xl">
            Convoyages acceptés, en cours ou livrés, comptés à leur date de
            prise en charge. Kilométrage estimé d'après les adresses de départ
            et d'arrivée des convoyages livrés.
            {stats.periode.km_non_calcules > 0 &&
              ` ${stats.periode.km_non_calcules} convoyage(s) à l'adresse non localisée n'y figurent pas.`}
          </p>
        </div>
      )}
    </div>
  );
}
