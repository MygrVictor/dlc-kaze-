/**
 * Groupe de boutons radio stylés en cartes.
 *
 * Un `select` masque les options derrière un clic, et une case à cocher ne
 * sait exprimer que « oui / non ». Or la question de l'assurance appelle
 * une troisième réponse — « en cours d'obtention » — qui doit être visible
 * d'emblée : c'est elle qui retient les candidats sérieux dont le dossier
 * n'est pas encore complet.
 *
 * Les options restent affichées côte à côte, et l'ensemble est balisé en
 * `fieldset`/`legend` pour rester annonçable par un lecteur d'écran.
 */
export default function ChoixStatut({
  legende,
  aide,
  name,
  options,
  valeur,
  onChange,
  accent,
}) {
  return (
    <fieldset className="choix-statut">
      <legend>{legende}</legend>
      {aide && <p className="choix-aide">{aide}</p>}
      <div className="choix-options">
        {options.map((option) => {
          const actif = valeur === option.valeur;
          return (
            <label
              key={option.valeur}
              className={`choix-option${actif ? " actif" : ""}`}
              style={
                actif
                  ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` }
                  : undefined
              }
            >
              <input
                type="radio"
                name={name}
                value={option.valeur}
                checked={actif}
                onChange={onChange}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
