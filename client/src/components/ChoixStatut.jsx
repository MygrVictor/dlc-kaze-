/**
 * Question à réponses fermées, présentée en menu déroulant.
 *
 * Les options s'affichaient auparavant en cartes radio côte à côte. Sur le
 * questionnaire convoyeur — SIRET, RC Circulation, RC Pro, W garage — cela
 * empilait quatre rangées de boutons et le formulaire dépassait largement
 * la hauteur de l'écran : le candidat ne voyait jamais le bouton d'envoi.
 * Un `select` ramène chaque question à une seule ligne, ce qui permet en
 * outre d'aligner deux questions par rangée.
 *
 * L'option vide sert de consigne : sans elle, le navigateur présélectionne
 * la première réponse et une question laissée de côté passerait pour
 * répondue.
 */
export default function ChoixStatut({
  legende,
  aide,
  name,
  options,
  valeur,
  onChange,
  accent,
  placeholder = "Sélectionnez…",
}) {
  return (
    <div className="choix-statut">
      <label className="choix-legende" htmlFor={name}>
        {legende}
      </label>
      <select
        id={name}
        name={name}
        value={valeur || ""}
        onChange={onChange}
        className="input-field choix-select"
        style={valeur ? { borderColor: accent } : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.label}
          </option>
        ))}
      </select>
      {aide && <p className="choix-aide">{aide}</p>}
    </div>
  );
}
