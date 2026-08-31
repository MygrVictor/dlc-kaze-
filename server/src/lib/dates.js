/**
 * Utilitaires de dates — Drive Line Connect
 */

/**
 * Retourne le lundi de la semaine contenant la date fournie, à minuit.
 *
 * Règle métier : toute mission est datée du lundi de la semaine **en cours**,
 * jamais du lundi suivant. Une mission créée le jeudi 13 août est donc datée
 * du lundi 10 août, quitte à ce que cette date soit déjà passée.
 *
 * Le dimanche appartient à la semaine qui vient de s'écouler (norme ISO 8601) :
 * un dimanche 16 renvoie le lundi 10, pas le lendemain.
 *
 * @param {Date|string|number} [reference=new Date()] Date de référence.
 * @returns {Date} Le lundi correspondant, à 00:00:00.000 heure locale.
 */
function lundiDeLaSemaine(reference = new Date()) {
  const date =
    reference instanceof Date ? new Date(reference) : new Date(reference);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Date de référence invalide.");
  }

  // getDay() : 0 = dimanche, 1 = lundi… On ramène le dimanche à 7 pour que
  // le recul soit toujours positif.
  const jour = date.getDay() === 0 ? 7 : date.getDay();
  date.setDate(date.getDate() - (jour - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

module.exports = { lundiDeLaSemaine };
