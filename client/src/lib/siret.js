/**
 * Validation du SIRET, miroir de `server/src/lib/siret.js`.
 *
 * Le serveur reste seul juge, mais rejeter une saisie manifestement fausse
 * sans aller-retour réseau évite au candidat d'attendre pour apprendre
 * qu'il a recopié son SIREN à 9 chiffres.
 */

export function normaliserSiret(saisie) {
  return String(saisie || "").replace(/\s/g, "");
}

export function siretValide(saisie) {
  const siret = normaliserSiret(saisie);
  if (!/^\d{14}$/.test(siret)) return false;

  // La Poste (SIREN 356000000) déroge à la clé de Luhn.
  if (siret.startsWith("356000000")) {
    const somme = siret.split("").reduce((acc, c) => acc + Number(c), 0);
    return somme % 5 === 0;
  }

  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let chiffre = Number(siret[i]);
    if (i % 2 === 0) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

/** Met en forme la saisie : 123 456 789 00012. */
export function formaterSiret(saisie) {
  const brut = normaliserSiret(saisie).slice(0, 14);
  return brut
    .replace(/^(\d{3})(\d)/, "$1 $2")
    .replace(/^(\d{3}) (\d{3})(\d)/, "$1 $2 $3")
    .replace(/^(\d{3}) (\d{3}) (\d{3})(\d)/, "$1 $2 $3 $4");
}
