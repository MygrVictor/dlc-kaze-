import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  parCategorie,
  classeDePeage,
  estUtilitaire12m3,
} from "../../lib/vehicules";
import {
  Car,
  MapPin,
  Truck,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Send,
  Fuel,
  Phone,
  User,
  Building2,
  Mail,
  ShieldAlert,
  Sparkles,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

const ENERGIES = ["Essence", "Diesel", "Électrique", "Hybride"];

// Liste des marques strictement identique au widget « Marque »
// du workflow CONVOYAGE de Kaze (widget_select id="brand").
const BRANDS = [
  "Abarth",
  "Alpha Roméo",
  "Alpine",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Bugatti",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Citroën",
  "Cupra",
  "Dacia",
  "DAF",
  "Dodge",
  "DS",
  "Ferrari",
  "Fiat",
  "Ford",
  "GMC",
  "Honda",
  "Hyundai",
  "Infinti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Lancia",
  "Land Rover",
  "Lexus",
  "Lotus",
  "Maserati",
  "Maybach",
  "Mazda",
  "McLaren",
  "Mercedes",
  "MG Motor",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Opel",
  "Pagani",
  "Peugeot",
  "Polestar",
  "Porsche",
  "Renault",
  "Rolls Royce",
  "Saab",
  "Scania",
  "Seat",
  "Skoda",
  "Smart",
  "Ssangyong",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Venturi",
  "Volkswagen",
  "Volvo",
  "Autre",
];

const OUI_NON = ["OUI", "NON"];

const STEPS = [
  { label: "Récapitulatif", icon: Mail },
  { label: "Véhicule", icon: Car },
  { label: "Départ", icon: MapPin },
  { label: "Livraison", icon: Truck },
  { label: "Services", icon: Sparkles },
  { label: "Observations", icon: FileText },
];

const emptyVehicle = () => ({
  plate: "",
  vin: "",
  brand: "",
  model: "",
  vehicleType: "",
  energy: "",
});

export default function NewMission() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const estAdmin = user?.role === "admin";
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── Saisie administrative ──────────────────────────────────
  //
  // L'administration saisit des missions déjà négociées : le prix est
  // connu, l'accord est passé, elles rejoignent directement les missions
  // disponibles. Le commanditaire peut être un compte existant, ou
  // personne — une course prise en direct n'a pas toujours de client
  // enregistré sur la plateforme.
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [priceConvoyeur, setPriceConvoyeur] = useState("");
  const [priceClient, setPriceClient] = useState("");

  useEffect(() => {
    if (!estAdmin) return;
    api
      .get("/admin/users", { params: { role: "client" } })
      .then(({ data }) => {
        // La liste sert à retrouver un compte, pas à consulter les
        // dernières inscriptions : l'ordre alphabétique est le seul
        // dans lequel on cherche un nom.
        const liste = (data.users || []).sort((a, b) =>
          (a.company || a.full_name || "").localeCompare(
            b.company || b.full_name || "",
            "fr",
          ),
        );
        setClients(liste);
      })
      .catch(() => toast.error("Liste des clients indisponible."));
  }, [estAdmin]);

  // Destinataire du récapitulatif de fin de mission (PV, photos,
  // réserves) émis par Kaze. Pré-rempli avec l'adresse du compte : le
  // cas courant est que le commanditaire le reçoive lui-même, mais il
  // peut vouloir le router ailleurs — comptabilité, gestionnaire de
  // flotte, client final.
  const [recapEmail, setRecapEmail] = useState("");

  useEffect(() => {
    // L'utilisateur arrive parfois avant que le contexte soit résolu :
    // on ne pré-remplit que si le champ n'a pas déjà été modifié.
    if (user?.email) setRecapEmail((actuel) => actuel || user.email);
  }, [user?.email]);

  const [vehicles, setVehicles] = useState([emptyVehicle()]);

  const [departure, setDeparture] = useState({
    structure: "",
    structureName: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    instructions: "",
    address: "",
    date: "",
  });

  const [arrival, setArrival] = useState({
    structureName: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    instructions: "",
    address: "",
    date: "",
  });

  const [services, setServices] = useState({
    refuel: false,
    documentManagement: "",
    handover: false,
    retributionDetails: "",
  });

  const [emergency, setEmergency] = useState({
    contactName: "",
    phone: "",
    contactEmail: "",
  });

  const [observations, setObservations] = useState("");

  // ── Helpers véhicules ──
  const addVehicle = () => setVehicles([...vehicles, emptyVehicle()]);
  const removeVehicle = (idx) => {
    if (vehicles.length === 1) return;
    setVehicles(vehicles.filter((_, i) => i !== idx));
  };
  const updateVehicle = (idx, field, value) => {
    const updated = [...vehicles];
    updated[idx] = { ...updated[idx], [field]: value };
    setVehicles(updated);
  };

  // ── Validation par étape ──
  // Volontairement permissif : une adresse mal formée est refusée par
  // le champ email du navigateur, on ne vérifie ici que la présence.
  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recapEmail.trim());

  const canNext = () => {
    switch (step) {
      case 0:
        // L'admin ne reçoit pas de devis : ce qui l'engage, c'est la
        // rémunération annoncée aux convoyeurs.
        if (estAdmin) return Number(priceConvoyeur) > 0;
        return emailValide;
      case 1:
        return vehicles.every((v) => v.plate || v.vin || v.model);
      case 2:
        return departure.address.trim() !== "";
      case 3:
        return arrival.address.trim() !== "";
      default:
        return true;
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        recapEmail: recapEmail.trim() || null,
        vehicles: vehicles.map((v) => ({
          plate: v.plate,
          vin: v.vin,
          brand: v.brand,
          model: v.model,
          vehicleType: v.vehicleType,
          energy: v.energy,
        })),
        departureAddress: departure.address,
        departureDate: departure.date || null,
        departureStructure: departure.structure || null,
        departureStructureName: departure.structureName || null,
        departureContactName: departure.contactName || null,
        departureContactPhone: departure.contactPhone || null,
        departureContactEmail: departure.contactEmail || null,
        departureInstructions: departure.instructions || null,
        arrivalAddress: arrival.address,
        arrivalDate: arrival.date || null,
        arrivalStructureName: arrival.structureName || null,
        arrivalContactName: arrival.contactName || null,
        arrivalContactPhone: arrival.contactPhone || null,
        arrivalContactEmail: arrival.contactEmail || null,
        arrivalInstructions: arrival.instructions || null,
        serviceRefuel: services.refuel,
        serviceDocumentManagement: services.documentManagement || null,
        serviceHandover: services.handover,
        retributionDetails: services.retributionDetails || null,
        emergencyContactName: emergency.contactName || null,
        emergencyPhone: emergency.phone || null,
        emergencyContactEmail: emergency.contactEmail || null,
        comments: observations || null,
        // Souhait du client : conservé côté DLC, non transmis à Kaze.
        desiredDeliveryDate: arrival.date || null,
        isUrgent: arrival.isUrgent || false,
        // Ignorés par l'API si l'auteur n'est pas administrateur.
        ...(estAdmin && {
          clientId: clientId || null,
          priceConvoyeur: priceConvoyeur || null,
          priceClient: priceClient || null,
        }),
      };

      const { data } = await api.post("/missions", payload);
      const count = data.count || 1;

      if (estAdmin) {
        toast.success(
          count > 1
            ? `${count} missions publiées auprès des convoyeurs.`
            : "Mission publiée auprès des convoyeurs.",
        );
        navigate("/admin/missions");
        return;
      }

      toast.success(
        count > 1
          ? `${count} missions créées ! Vous recevrez un devis comprenants toutes les missions.`
          : "Mission créée ! Vous recevrez un devis sous 24h.",
      );
      navigate("/client");
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Nouvelle mission</h1>
        <p className="text-dark-400 text-sm mt-1">
          {estAdmin
            ? "Mission déjà négociée : elle sera publiée immédiatement auprès des convoyeurs."
            : "Remplissez les informations pour recevoir un devis personnalisé."}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={i} className="flex items-center flex-1">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full ${
                  active
                    ? "bg-primary-600 text-white"
                    : done
                      ? "bg-primary-600/20 text-primary-400 cursor-pointer hover:bg-primary-600/30"
                      : "bg-dark-800 text-dark-500"
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight
                  size={16}
                  className="text-dark-600 mx-1 flex-shrink-0"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════ ÉTAPE 1 : RÉCAPITULATIF ═══════════ */}
      {step === 0 && (
        <div className="card space-y-4">
          {/* Saisie administrative : commanditaire et prix, deux
              informations que le client n'a pas à choisir. */}
          {estAdmin && (
            <div className="space-y-4 pb-5 mb-1 border-b border-dark-700">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Building2 size={20} className="text-primary-400" />
                Commanditaire
              </h3>

              <div>
                <label className="label">Client</label>
                <select
                  className="input"
                  value={clientId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setClientId(id);
                    // Le récapitulatif de fin de mission part chez le
                    // commanditaire : le pré-remplir évite de l'envoyer
                    // par défaut sur le compte administrateur.
                    const choisi = clients.find((c) => c.id === id);
                    setRecapEmail(choisi?.email || "");
                  }}
                >
                  <option value="">
                    Mission interne — sans client enregistré
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company || c.full_name}
                      {c.company && c.full_name
                        ? ` (${c.full_name})`
                        : ""} — {c.email}
                      {c.is_validated ? "" : " — compte non validé"}
                    </option>
                  ))}
                </select>
                {clients.length === 0 ? (
                  <p className="text-xs text-dark-500 mt-1">
                    Aucun compte client enregistré pour le moment.
                  </p>
                ) : (
                  <p className="text-xs text-dark-500 mt-1">
                    {clients.length} client
                    {clients.length > 1 ? "s" : ""} enregistré
                    {clients.length > 1 ? "s" : ""}. Laissez vide pour une
                    course prise en direct : la mission n&apos;apparaîtra dans
                    aucun espace client.
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">
                    Rémunération convoyeur{" "}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={priceConvoyeur}
                    onChange={(e) => setPriceConvoyeur(e.target.value)}
                    placeholder="180.00"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Seul montant visible par les convoyeurs.
                  </p>
                </div>
                <div>
                  <label className="label">Prix client</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={priceClient}
                    onChange={(e) => setPriceClient(e.target.value)}
                    placeholder="Facultatif"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Pour votre suivi, jamais affiché au convoyeur.
                  </p>
                </div>
              </div>

              <p className="text-xs text-primary-300 bg-primary-600/10 border border-primary-600/20 rounded-lg px-3 py-2">
                Cette mission ne passe pas par la cotation : elle sera publiée
                immédiatement auprès des convoyeurs.
              </p>
            </div>
          )}

          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail size={20} className="text-primary-400" />
            Réception du récapitulatif
          </h3>

          <p className="text-sm text-dark-400">
            À la livraison, un récapitulatif complet vous sera adressé :
            procès-verbal, photos du véhicule et réserves éventuelles. Indiquez
            l&apos;adresse qui doit le recevoir.
          </p>

          <div>
            <label className="label">
              Adresse de réception <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              className="input"
              value={recapEmail}
              onChange={(e) => setRecapEmail(e.target.value)}
              placeholder="vous@entreprise.fr"
            />
            {recapEmail.trim() !== "" && !emailValide && (
              <p className="text-xs text-red-400 mt-1">
                Adresse email invalide.
              </p>
            )}
            {user?.email && recapEmail.trim() === user.email && (
              <p className="text-xs text-dark-500 mt-1">
                Adresse de votre compte.
              </p>
            )}
          </div>

          <p className="text-xs text-dark-500">
            Vous pourrez renseigner plus loin les contacts sur place, au départ
            et à l&apos;arrivée. Ils servent au convoyeur pour les joindre et ne
            reçoivent pas ce récapitulatif.
          </p>
        </div>
      )}

      {/* ═══════════ ÉTAPE 2 : VÉHICULE ═══════════ */}
      {step === 1 && (
        <div className="space-y-4">
          {vehicles.map((v, idx) => (
            <div key={idx} className="card relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Car size={20} className="text-primary-400" />
                  Véhicule {vehicles.length > 1 ? `#${idx + 1}` : ""}
                </h3>
                {vehicles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVehicle(idx)}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Supprimer ce véhicule"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Immatriculation
                  </label>
                  <input
                    value={v.plate}
                    onChange={(e) =>
                      updateVehicle(idx, "plate", e.target.value.toUpperCase())
                    }
                    className="input-field"
                    placeholder="HK-988-CG"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    N° de châssis (VIN)
                    <span className="text-dark-500 text-xs ml-1">17 car.</span>
                  </label>
                  <input
                    value={v.vin}
                    onChange={(e) =>
                      updateVehicle(
                        idx,
                        "vin",
                        e.target.value.toUpperCase().slice(0, 17),
                      )
                    }
                    className="input-field font-mono"
                    placeholder="VF1RDA00876470090"
                    maxLength={17}
                  />
                  {v.vin && v.vin.length !== 17 && v.vin.length > 0 && (
                    <p className="text-xs text-yellow-400 mt-1">
                      {v.vin.length}/17 caractères
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Marque
                  </label>
                  <select
                    value={v.brand}
                    onChange={(e) =>
                      updateVehicle(idx, "brand", e.target.value)
                    }
                    className="input-field"
                  >
                    <option value="">Sélectionnez</option>
                    {BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Modèle de véhicule
                  </label>
                  <input
                    value={v.model}
                    onChange={(e) =>
                      updateVehicle(idx, "model", e.target.value)
                    }
                    className="input-field"
                    placeholder="RENAULT MASTER"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    Type / gabarit du véhicule
                  </label>
                  <select
                    value={v.vehicleType}
                    onChange={(e) =>
                      updateVehicle(idx, "vehicleType", e.target.value)
                    }
                    className="input-field"
                  >
                    <option value="">Sélectionnez</option>
                    {parCategorie().map((groupe) => (
                      <optgroup key={groupe.categorie} label={groupe.categorie}>
                        {groupe.types.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {v.vehicleType && (
                    <p className="mt-1.5 text-xs text-dark-400">
                      Péage classe {classeDePeage(v.vehicleType)}
                      {estUtilitaire12m3(v.vehicleType) === "OUI" &&
                        " — utilitaire ≥ 12 m³"}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    <Fuel size={14} className="inline mr-1" />
                    Type d'énergie
                  </label>
                  <select
                    value={v.energy}
                    onChange={(e) =>
                      updateVehicle(idx, "energy", e.target.value)
                    }
                    className="input-field"
                  >
                    <option value="">Sélectionnez</option>
                    {ENERGIES.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}

          {/* Bouton ajouter véhicule */}
          <button
            type="button"
            onClick={addVehicle}
            className="w-full py-3 border-2 border-dashed border-dark-600 hover:border-primary-500 rounded-xl text-dark-400 hover:text-primary-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Ajouter un véhicule
          </button>

          {vehicles.length > 1 && (
            <p className="text-sm text-primary-400 text-center">
              {vehicles.length} véhicules → {vehicles.length} missions seront
              créées avec la même logistique.
            </p>
          )}
        </div>
      )}

      {/* ═══════════ ÉTAPE 2 : DÉPART ═══════════ */}
      {step === 2 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <MapPin size={20} className="text-green-400" />
            <h2 className="text-lg font-semibold">
              Informations contact de départ
            </h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Building2 size={14} className="inline mr-1" />
                  Structure
                </label>
                <input
                  value={departure.structure}
                  onChange={(e) =>
                    setDeparture({ ...departure, structure: e.target.value })
                  }
                  className="input-field"
                  placeholder="Concession / Garage / Particulier"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Building2 size={14} className="inline mr-1" />
                  Nom de la structure
                </label>
                <input
                  value={departure.structureName}
                  onChange={(e) =>
                    setDeparture({
                      ...departure,
                      structureName: e.target.value,
                    })
                  }
                  className="input-field"
                  placeholder="NET AUTO"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <User size={14} className="inline mr-1" />
                  Contact à l'enlèvement
                </label>
                <input
                  value={departure.contactName}
                  onChange={(e) =>
                    setDeparture({ ...departure, contactName: e.target.value })
                  }
                  className="input-field"
                  placeholder="ALYS TESSEYRE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Phone size={14} className="inline mr-1" />
                  Téléphone contact à l'enlèvement
                </label>
                <input
                  type="tel"
                  value={departure.contactPhone}
                  onChange={(e) =>
                    setDeparture({ ...departure, contactPhone: e.target.value })
                  }
                  className="input-field"
                  placeholder="02 51 78 88 71"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                <Mail size={14} className="inline mr-1" />
                Email
              </label>
              <input
                type="email"
                value={departure.contactEmail}
                onChange={(e) =>
                  setDeparture({ ...departure, contactEmail: e.target.value })
                }
                className="input-field"
                placeholder="contact@structure.fr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Remarques
              </label>
              <textarea
                value={departure.instructions}
                onChange={(e) =>
                  setDeparture({ ...departure, instructions: e.target.value })
                }
                rows={3}
                className="input-field resize-none"
                placeholder="Accès parking, code portail, horaires d'ouverture…"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Adresse d'enlèvement *
              </label>
              <input
                value={departure.address}
                onChange={(e) =>
                  setDeparture({ ...departure, address: e.target.value })
                }
                className="input-field"
                placeholder="28 RUE DES PILIERS DE LA CHAUVINIERE 44800 SAINT HERBLAIN"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Enlèvement possible à partir du
              </label>
              <input
                type="date"
                value={departure.date}
                onChange={(e) =>
                  setDeparture({ ...departure, date: e.target.value })
                }
                className="input-field"
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ÉTAPE 3 : LIVRAISON ═══════════ */}
      {step === 3 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Truck size={20} className="text-blue-400" />
            <h2 className="text-lg font-semibold">
              Informations contact livraison
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                <Building2 size={14} className="inline mr-1" />
                Nom de la structure
              </label>
              <input
                value={arrival.structureName}
                onChange={(e) =>
                  setArrival({ ...arrival, structureName: e.target.value })
                }
                className="input-field"
                placeholder="GRDF"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <User size={14} className="inline mr-1" />
                  Contact à la livraison
                </label>
                <input
                  value={arrival.contactName}
                  onChange={(e) =>
                    setArrival({ ...arrival, contactName: e.target.value })
                  }
                  className="input-field"
                  placeholder="Ludovic LECONTE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Phone size={14} className="inline mr-1" />
                  Téléphone contact à la livraison
                </label>
                <input
                  type="tel"
                  value={arrival.contactPhone}
                  onChange={(e) =>
                    setArrival({ ...arrival, contactPhone: e.target.value })
                  }
                  className="input-field"
                  placeholder="06 31 79 35 44"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                <Mail size={14} className="inline mr-1" />
                Email
              </label>
              <input
                type="email"
                value={arrival.contactEmail}
                onChange={(e) =>
                  setArrival({ ...arrival, contactEmail: e.target.value })
                }
                className="input-field"
                placeholder="contact@destinataire.fr"
              />
              <p className="text-xs text-dark-500 mt-1">
                Le récapitulatif de fin de mission sera envoyé à cette adresse.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Remarques
              </label>
              <textarea
                value={arrival.instructions}
                onChange={(e) =>
                  setArrival({ ...arrival, instructions: e.target.value })
                }
                rows={3}
                className="input-field resize-none"
                placeholder="Consignes de livraison, restrictions d'accès…"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Adresse de livraison *
              </label>
              <input
                value={arrival.address}
                onChange={(e) =>
                  setArrival({ ...arrival, address: e.target.value })
                }
                className="input-field"
                placeholder="84 RUE CLEMENT ADER 45770 SARAN"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Date de livraison souhaitée
              </label>
              <input
                type="date"
                value={arrival.date}
                onChange={(e) =>
                  setArrival({ ...arrival, date: e.target.value })
                }
                className="input-field"
                placeholder="LE PLUS TÔT POSSIBLE"
              />
              <p className="text-xs text-dark-500 mt-1">
                Laissez vide si vous souhaitez une livraison le plus tôt
                possible.
              </p>
            </div>

            {/* Urgence — déclarée par le client, sans seuil automatique */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setArrival({ ...arrival, isUrgent: !arrival.isUrgent })
                }
                aria-pressed={Boolean(arrival.isUrgent)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  arrival.isUrgent
                    ? "bg-red-500/15 border-red-500/50 text-red-300"
                    : "bg-transparent border-white/10 text-dark-300 hover:border-white/20"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                    arrival.isUrgent
                      ? "bg-red-500 border-red-500"
                      : "border-white/25"
                  }`}
                >
                  {arrival.isUrgent && (
                    <Check size={14} className="text-white" />
                  )}
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold">
                    Livraison urgente
                  </span>
                  <span className="block text-xs opacity-80 mt-0.5">
                    Signalez une livraison prioritaire : la mission sera traitée
                    en priorité et signalée aux convoyeurs.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ÉTAPE 4 : SERVICES / RÉTRIBUTION / URGENCE ═══════════ */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Rétribution */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <FileText size={20} className="text-primary-400" />
              <h2 className="text-lg font-semibold">Rétribution</h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Détails
              </label>
              <input
                value={services.retributionDetails}
                onChange={(e) =>
                  setServices({
                    ...services,
                    retributionDetails: e.target.value,
                  })
                }
                className="input-field"
                placeholder="Frais de péage, carburant à avancer…"
              />
            </div>
          </div>

          {/* Services */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={20} className="text-emerald-400" />
              <h2 className="text-lg font-semibold">Services</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Fuel size={14} className="inline mr-1" />
                  Carburant
                </label>
                <select
                  value={services.refuel ? "OUI" : "NON"}
                  onChange={(e) =>
                    setServices({
                      ...services,
                      refuel: e.target.value === "OUI",
                    })
                  }
                  className="input-field"
                >
                  {OUI_NON.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  Gestion documentaire
                </label>
                <input
                  value={services.documentManagement}
                  onChange={(e) =>
                    setServices({
                      ...services,
                      documentManagement: e.target.value,
                    })
                  }
                  className="input-field"
                  placeholder="Carte grise, certificat de cession…"
                />
              </div>

              <div>
                <label className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={services.handover}
                    onChange={(e) =>
                      setServices({
                        ...services,
                        handover: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Mise en main du véhicule</span>
                </label>
              </div>
            </div>
          </div>

          {/* Contact d'urgence */}
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <ShieldAlert size={20} className="text-red-400" />
              <h2 className="text-lg font-semibold">Contact d'urgence</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    <User size={14} className="inline mr-1" />
                    Nom du contact
                  </label>
                  <input
                    value={emergency.contactName}
                    onChange={(e) =>
                      setEmergency({
                        ...emergency,
                        contactName: e.target.value,
                      })
                    }
                    className="input-field"
                    placeholder="Drive Line Connect"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-1.5">
                    <Phone size={14} className="inline mr-1" />
                    Numéro de téléphone
                  </label>
                  <input
                    type="tel"
                    value={emergency.phone}
                    onChange={(e) =>
                      setEmergency({ ...emergency, phone: e.target.value })
                    }
                    className="input-field"
                    placeholder="06 69 58 34 30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">
                  <Mail size={14} className="inline mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={emergency.contactEmail}
                  onChange={(e) =>
                    setEmergency({
                      ...emergency,
                      contactEmail: e.target.value,
                    })
                  }
                  className="input-field"
                  placeholder="drivelineconnect@gmail.com"
                />
              </div>
              <p className="text-xs text-dark-500">
                Laissez vide pour utiliser les coordonnées DLC par défaut.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ÉTAPE 5 : OBSERVATIONS ═══════════ */}
      {step === 5 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <FileText size={20} className="text-yellow-400" />
            <h2 className="text-lg font-semibold">Observations</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Observations / instructions particulières
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={5}
                className="input-field resize-none"
                placeholder="Merci de mettre toutes les informations nécessaires au bon déroulement de la mission"
              />
            </div>
          </div>

          {/* Récap */}
          <div className="mt-6 p-4 bg-dark-700/50 rounded-xl">
            <h3 className="text-sm font-semibold text-dark-300 mb-3">
              Récapitulatif
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-dark-400">Véhicule(s) :</span>
              <span className="font-medium">
                {vehicles.length}{" "}
                {vehicles.length > 1 ? "véhicules" : "véhicule"}
                {vehicles.length > 1 && (
                  <span className="text-primary-400 text-xs ml-1">
                    → {vehicles.length} missions
                  </span>
                )}
              </span>
              {vehicles.map((v, i) => (
                <div key={i} className="col-span-2 pl-4 text-dark-400">
                  • {v.brand} {v.model} {v.plate && `(${v.plate})`}
                </div>
              ))}
              <span className="text-dark-400">Départ :</span>
              <span className="font-medium truncate">
                {departure.address || "—"}
              </span>
              <span className="text-dark-400">Livraison :</span>
              <span className="font-medium truncate">
                {arrival.address || "—"}
              </span>
              <span className="text-dark-400">Email récap :</span>
              <span className="font-medium truncate">
                {arrival.contactEmail || "Compte client"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ NAVIGATION ═══════════ */}
      <div className="flex justify-between mt-8">
        <div>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="btn-secondary flex items-center gap-2"
            >
              <ChevronLeft size={18} />
              Précédent
            </button>
          )}
          {step === 0 && (
            <button
              type="button"
              onClick={() => navigate(estAdmin ? "/admin/missions" : "/client")}
              className="btn-secondary"
            >
              Annuler
            </button>
          )}
        </div>

        <div>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="btn-primary flex items-center gap-2"
            >
              Suivant
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !canNext()}
              className="btn-primary flex items-center gap-2"
            >
              <Send size={18} />
              {loading
                ? "Envoi…"
                : vehicles.length > 1
                  ? estAdmin
                    ? `Publier ${vehicles.length} missions`
                    : `Créer ${vehicles.length} missions`
                  : estAdmin
                    ? "Publier la mission"
                    : "Envoyer la demande"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
