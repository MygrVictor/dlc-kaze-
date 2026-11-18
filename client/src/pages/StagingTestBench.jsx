import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FlaskConical, Play } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

// Banc de test de recette : génère en un clic des missions réalistes
// pour éprouver toutes les fonctionnalités sans remplir le formulaire.

const VILLES = {
  paris: "10 Rue de Rivoli, 75004 Paris",
  lyon: "20 Place Bellecour, 69002 Lyon",
  marseille: "1 Quai du Port, 13002 Marseille",
  lille: "2 Place du Général de Gaulle, 59800 Lille",
  bordeaux: "1 Place de la Bourse, 33000 Bordeaux",
};

const MODELES = [
  ["Renault", "Clio", "VL", "ESSENCE"],
  ["Peugeot", "308", "VL", "DIESEL"],
  ["Tesla", "Model 3", "VL", "ELECTRIQUE"],
  ["Renault", "Master", "VU", "DIESEL"],
  ["Toyota", "Yaris", "VL", "HYBRIDE"],
];

const L = "ABCDEFGHJKLMNPQRSTVWXYZ";
const lettre = () => L[Math.floor(Math.random() * L.length)];
const plaque = () =>
  `${lettre()}${lettre()}-${String(Math.floor(Math.random() * 900) + 100)}-${lettre()}${lettre()}`;
const vin = () =>
  Array.from(
    { length: 17 },
    () => "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"[Math.floor(Math.random() * 33)],
  ).join("");
const vehicule = () => {
  const [brand, model, vehicleType, energy] =
    MODELES[Math.floor(Math.random() * MODELES.length)];
  return { plate: plaque(), vin: vin(), brand, model, vehicleType, energy };
};
const jour = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
};

export default function StagingTestBench() {
  const { user } = useAuth();
  const estAdmin = user?.role === "admin";

  const [o, setO] = useState({
    type: "simple",
    nombre: 1,
    depart: "paris",
    arrivee: "lyon",
    retourMode: "depart",
    retourVille: "lille",
    urgent: false,
    sansRecap: false,
    avecDates: true,
    avecContacts: true,
    clientId: "",
    priceClient: "250",
    priceConvoyeur: "150",
    repetitions: 1,
  });
  const [clients, setClients] = useState([]);
  const [journal, setJournal] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const maj = (k, v) => setO((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!estAdmin) return;
    api
      .get("/admin/users", { params: { role: "client" } })
      .then((r) => setClients(r.data.users || []))
      .catch(() => toast.error("Liste clients indisponible."));
  }, [estAdmin]);

  const construire = (i) => {
    const contact = (cote) =>
      o.avecContacts
        ? {
            [`${cote}ContactName`]: `Test ${cote}`,
            [`${cote}ContactPhone`]: "0600000000",
            [`${cote}ContactEmail`]: "test@example.com",
            [`${cote}StructureName`]: `Structure ${cote}`,
          }
        : {};
    const p = {
      departureAddress: VILLES[o.depart],
      arrivalAddress: VILLES[o.arrivee],
      ...(o.avecDates
        ? {
            departureDate: jour(2),
            arrivalDate: jour(3),
            desiredDeliveryDate: jour(3).slice(0, 10),
          }
        : {}),
      ...contact("departure"),
      ...contact("arrival"),
      emergencyContactName: "Urgence Test",
      emergencyPhone: "0600000001",
      isUrgent: o.urgent,
      recapDisabled: o.sansRecap,
      recapEmail: o.sansRecap ? null : user?.email,
      comments: "[TEST-BOT] Mission générée par le banc de test",
      purchaseOrderNumber: `TEST-BOT-${Date.now()}-${i}`,
    };
    const n = Math.max(1, Math.min(10, Number(o.nombre) || 1));
    if (o.type === "restitution") {
      p.restitution = {
        paires: Array.from({ length: n }, () => ({
          livre: vehicule(),
          repris: vehicule(),
          dateEnlevement: jour(2),
          dateEchange: jour(3),
          dateRetour: jour(4),
        })),
        retour:
          o.retourMode === "depart"
            ? { mode: "depart" }
            : { mode: "autre", address: VILLES[o.retourVille] },
      };
    } else {
      p.vehicles = Array.from({ length: n }, vehicule);
    }
    if (estAdmin) {
      if (o.clientId) p.clientId = o.clientId;
      p.priceClient = o.priceClient;
      p.priceConvoyeur = o.priceConvoyeur;
    }
    return p;
  };

  const lancer = async () => {
    setEnCours(true);
    const reps = Math.max(1, Math.min(10, Number(o.repetitions) || 1));
    for (let i = 0; i < reps; i++) {
      try {
        const { data } = await api.post("/missions", construire(i));
        setJournal((j) => [
          {
            ok: true,
            txt: `✅ ${data.count ?? 1} mission(s) créée(s) (${o.type})`,
          },
          ...j,
        ]);
      } catch (e) {
        setJournal((j) => [
          { ok: false, txt: `❌ ${e.response?.data?.error || e.message}` },
          ...j,
        ]);
      }
    }
    setEnCours(false);
  };

  const Case = ({ k, label }) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={o[k]}
        onChange={(e) => maj(k, e.target.checked)}
      />
      {label}
    </label>
  );
  const Choix = ({ k, label, options }) => (
    <label className="flex flex-col text-sm gap-1">
      {label}
      <select
        className="input"
        value={o[k]}
        onChange={(e) => maj(k, e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const villes = Object.keys(VILLES).map((v) => [
    v,
    v[0].toUpperCase() + v.slice(1),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-7 h-7 text-yellow-400" />
        <h1 className="text-2xl font-bold">Banc de test (staging)</h1>
      </div>
      <p className="text-sm text-yellow-300">
        Les missions sont marquées « TEST-BOT ». Environnement de recette
        uniquement.
      </p>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Choix
          k="type"
          label="Type"
          options={[
            ["simple", "Mission simple"],
            ["restitution", "Restitution (paires)"],
          ]}
        />
        <label className="flex flex-col text-sm gap-1">
          {o.type === "restitution"
            ? "Nombre de paires"
            : "Nombre de véhicules"}
          <input
            className="input"
            type="number"
            min="1"
            max="10"
            value={o.nombre}
            onChange={(e) => maj("nombre", e.target.value)}
          />
        </label>
        <Choix k="depart" label="Départ" options={villes} />
        <Choix k="arrivee" label="Arrivée" options={villes} />
        {o.type === "restitution" && (
          <>
            <Choix
              k="retourMode"
              label="Retour"
              options={[
                ["depart", "Au point de départ"],
                ["autre", "Autre adresse"],
              ]}
            />
            {o.retourMode === "autre" && (
              <Choix k="retourVille" label="Ville de retour" options={villes} />
            )}
          </>
        )}
        <Case k="urgent" label="Urgent" />
        <Case k="sansRecap" label="Sans récapitulatif" />
        <Case k="avecDates" label="Avec dates" />
        <Case k="avecContacts" label="Avec contacts sur place" />
        {estAdmin && (
          <>
            <label className="flex flex-col text-sm gap-1">
              Client
              <select
                className="input"
                value={o.clientId}
                onChange={(e) => maj("clientId", e.target.value)}
              >
                <option value="">— Aucun —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company || c.full_name || c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm gap-1">
              Prix client (€)
              <input
                className="input"
                type="number"
                value={o.priceClient}
                onChange={(e) => maj("priceClient", e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              Rémunération convoyeur (€)
              <input
                className="input"
                type="number"
                value={o.priceConvoyeur}
                onChange={(e) => maj("priceConvoyeur", e.target.value)}
              />
            </label>
          </>
        )}
        <label className="flex flex-col text-sm gap-1">
          Répétitions (max 10)
          <input
            className="input"
            type="number"
            min="1"
            max="10"
            value={o.repetitions}
            onChange={(e) => maj("repetitions", e.target.value)}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <button
          className="btn-primary flex items-center gap-2"
          disabled={enCours}
          onClick={lancer}
        >
          <Play className="w-4 h-4" />{" "}
          {enCours ? "Création…" : "Créer les missions"}
        </button>
        <Link
          className="btn-secondary"
          to={estAdmin ? "/admin/missions" : "/client"}
        >
          Voir les missions
        </Link>
      </div>

      {journal.length > 0 && (
        <div className="card p-4 space-y-1 text-sm font-mono">
          {journal.map((l, i) => (
            <div key={i} className={l.ok ? "text-green-400" : "text-red-400"}>
              {l.txt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
