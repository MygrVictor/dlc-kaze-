import { useState, useEffect, useRef, useId } from "react";
import { MapPin, Check, Loader2, AlertTriangle } from "lucide-react";

/**
 * Champ d'adresse avec autocomplétion et validation.
 *
 * ── Le problème qu'il résout ────────────────────────────────────
 * L'adresse était saisie en texte libre. Une coquille dans le code
 * postal ou un nom de voie approximatif ne se voyait qu'au géocodage,
 * bien plus tard : la mission partait avec une position fausse, et le
 * convoyeur s'en apercevait sur place. Faire valider l'adresse au
 * moment de la frappe déplace la correction là où elle coûte le moins.
 *
 * ── Pourquoi la Base Adresse Nationale ──────────────────────────
 * C'est le service officiel français : gratuit, sans clé, autorisé
 * pour un usage commercial, et le plus précis sur les adresses
 * françaises — qui représentent la quasi-totalité des convoyages.
 * C'est aussi celui qu'utilise déjà le géocodage côté serveur : faire
 * valider et géocoder par la même source garantit qu'une adresse
 * acceptée ici sera bien positionnée ensuite.
 *
 * ── Appel direct depuis le navigateur ───────────────────────────
 * La BAN autorise les requêtes navigateur (CORS ouvert) et ne demande
 * aucune clé à protéger. Passer par notre serveur n'ajouterait qu'un
 * aller-retour et de la charge, sans rien sécuriser.
 *
 * ── Ce que le composant ne fait pas ─────────────────────────────
 * Il n'interdit jamais la saisie libre. Les dépôts, zones
 * industrielles et sites d'enchères sont souvent absents de la BAN ;
 * bloquer l'envoi rendrait le formulaire inutilisable pour les
 * enlèvements les plus fréquents. L'adresse non reconnue est
 * signalée, pas refusée — l'utilisateur reste seul juge.
 */

const URL_BAN = "https://api-adresse.data.gouv.fr/search/";

// Délai d'inactivité avant d'interroger la BAN. En deçà de 200 ms on
// envoie une requête par frappe ; au-delà de 400 ms la liste paraît
// traîner derrière la saisie.
const DELAI_FRAPPE = 250;

// Sous trois caractères, la BAN renvoie surtout du bruit.
const LONGUEUR_MINIMALE = 3;

/**
 * Met une adresse BAN au format attendu par le reste de l'application.
 *
 * `label` contient déjà « 12 rue de Paris 69002 Lyon », mais en
 * minuscules accentuées ; le reste des formulaires est en majuscules,
 * on s'aligne pour que les adresses restent homogènes en base.
 */
function formater(propriete) {
  return propriete.label.toUpperCase();
}

export default function ChampAdresse({
  value,
  onChange,
  placeholder,
  required = false,
  id,
}) {
  const idAuto = useId();
  const idChamp = id || idAuto;

  const [suggestions, setSuggestions] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  // « validée » : l'utilisateur a retenu une proposition de la BAN.
  // « inconnue » : la BAN n'a rien trouvé de comparable à sa saisie.
  const [etat, setEtat] = useState(null);

  const conteneur = useRef(null);
  // Empêche de rouvrir la liste juste après un choix : la valeur change,
  // ce qui relancerait sinon une recherche sur le texte qu'on vient
  // d'accepter.
  const choixEnCours = useRef(false);

  // ── Interrogation de la BAN ────────────────────────────────
  useEffect(() => {
    if (choixEnCours.current) {
      choixEnCours.current = false;
      return undefined;
    }

    const saisie = (value || "").trim();

    if (saisie.length < LONGUEUR_MINIMALE) {
      setSuggestions([]);
      setEtat(null);
      return undefined;
    }

    // Une requête part par pause dans la frappe, pas par caractère.
    const minuteur = setTimeout(async () => {
      // Annule la requête si l'utilisateur reprend sa saisie : sans
      // cela, une réponse lente pourrait écraser une plus récente.
      const controleur = new AbortController();
      setRecherche(true);

      try {
        const reponse = await fetch(
          `${URL_BAN}?q=${encodeURIComponent(saisie)}&limit=5&autocomplete=1`,
          { signal: controleur.signal },
        );
        if (!reponse.ok) throw new Error("BAN indisponible");

        const donnees = await reponse.json();
        const trouvees = donnees.features || [];

        setSuggestions(trouvees);
        setOuvert(trouvees.length > 0);
        setSurligne(-1);

        // Aucune correspondance : on le signale sans rien bloquer.
        setEtat(trouvees.length === 0 ? "inconnue" : null);
      } catch (err) {
        // Panne de la BAN ou coupure réseau : le champ redevient un
        // simple champ texte. Mieux vaut une saisie non assistée qu'un
        // formulaire bloqué.
        if (err.name !== "AbortError") {
          setSuggestions([]);
          setOuvert(false);
        }
      } finally {
        setRecherche(false);
      }
    }, DELAI_FRAPPE);

    return () => clearTimeout(minuteur);
  }, [value]);

  // ── Fermeture au clic extérieur ────────────────────────────
  useEffect(() => {
    const surClic = (e) => {
      if (conteneur.current && !conteneur.current.contains(e.target)) {
        setOuvert(false);
      }
    };
    document.addEventListener("mousedown", surClic);
    return () => document.removeEventListener("mousedown", surClic);
  }, []);

  const choisir = (suggestion) => {
    choixEnCours.current = true;
    onChange(formater(suggestion.properties));
    setOuvert(false);
    setSuggestions([]);
    setEtat("validee");
  };

  // Le clavier doit suffire : la souris ralentit une saisie d'adresse,
  // et certains postes d'exploitation s'utilisent au clavier seul.
  const surTouche = (e) => {
    if (!ouvert || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSurligne((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSurligne((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && surligne >= 0) {
      // Sans ce garde-fou, la touche Entrée validerait le formulaire
      // au lieu de retenir l'adresse surlignée.
      e.preventDefault();
      choisir(suggestions[surligne]);
    } else if (e.key === "Escape") {
      setOuvert(false);
    }
  };

  return (
    <div ref={conteneur} className="relative">
      <div className="relative">
        <input
          id={idChamp}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setEtat(null);
          }}
          onKeyDown={surTouche}
          onFocus={() => suggestions.length > 0 && setOuvert(true)}
          className="input-field pr-10"
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={ouvert}
          aria-autocomplete="list"
          aria-controls={`${idChamp}-suggestions`}
        />

        {/* Indicateur d'état, à droite du champ */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {recherche ? (
            <Loader2 size={16} className="text-dark-400 animate-spin" />
          ) : etat === "validee" ? (
            <Check size={16} className="text-green-400" />
          ) : etat === "inconnue" ? (
            <AlertTriangle size={16} className="text-yellow-400" />
          ) : null}
        </div>
      </div>

      {/* Liste des propositions */}
      {ouvert && suggestions.length > 0 && (
        <ul
          id={`${idChamp}-suggestions`}
          role="listbox"
          className="absolute z-20 w-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <li key={s.properties.id || i} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === surligne}
                onClick={() => choisir(s)}
                onMouseEnter={() => setSurligne(i)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                  i === surligne ? "bg-dark-700" : "hover:bg-dark-700/50"
                }`}
              >
                <MapPin size={15} className="text-accent-400 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm text-dark-100 truncate">
                    {s.properties.name}
                  </span>
                  <span className="block text-xs text-dark-400 truncate">
                    {s.properties.postcode} {s.properties.city}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adresse non reconnue : on informe, on ne bloque pas. */}
      {etat === "inconnue" && !ouvert && (
        <p className="mt-1.5 text-xs text-yellow-400/90 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          Adresse non reconnue. Vérifiez le code postal, ou conservez-la telle
          quelle s&apos;il s&apos;agit d&apos;un site sans adresse normalisée.
        </p>
      )}

      {etat === "validee" && (
        <p className="mt-1.5 text-xs text-green-400/90 flex items-center gap-1.5">
          <Check size={12} />
          Adresse vérifiée
        </p>
      )}
    </div>
  );
}
