/**
 * Validation du SIRET.
 *
 * Un SIRET est un identifiant à 14 chiffres dont la clé de contrôle suit
 * l'algorithme de Luhn. Le vérifier ici évite de rappeler un candidat pour
 * découvrir qu'il a saisi son SIREN, un numéro de TVA ou une suite de
 * chiffres inventée — le cas que le formulaire cherche précisément à
 * filtrer.
 *
 * Une exception notable : La Poste (SIREN 356000000) ne respecte pas la
 * clé de Luhn, ses SIRET sont valides si la somme des chiffres est un
 * multiple de 5. Le cas est rare mais un rejet y serait injustifiable.
 */

function normaliserSiret(saisie) {
  if (typeof saisie !== "string") return "";
  // Les candidats recopient souvent leur SIRET avec des espaces, tel qu'il
  // figure sur leur extrait Kbis.
  return saisie.replace(/\s/g, "");
}

function isValidSiret(saisie) {
  const siret = normaliserSiret(saisie);
  if (!/^\d{14}$/.test(siret)) return false;

  if (siret.startsWith("356000000")) {
    const somme = siret.split("").reduce((acc, c) => acc + Number(c), 0);
    return somme % 5 === 0;
  }

  let somme = 0;
  for (let i = 0; i < 14; i++) {
    // Les positions paires (en partant de la gauche, index 0) sont doublées.
    let chiffre = Number(siret[i]);
    if (i % 2 === 0) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

module.exports = { isValidSiret, normaliserSiret };
