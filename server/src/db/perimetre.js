/**
 * Périmètre de visibilité d'un compte client.
 *
 * Un compte parent (le siège d'un groupe) voit l'activité de ses
 * entités rattachées ; une entité ne voit que la sienne. Ce module est
 * le seul endroit où cette règle est écrite : les routes ne composent
 * jamais leur propre filtre.
 *
 * Cette centralisation n'est pas une coquetterie. Le contrôle
 * d'appartenance était auparavant recopié à l'identique dans six
 * routes ; élargir six copies revient à parier qu'aucune ne sera
 * oubliée, et un oubli ici ne produit pas un bug visible mais une
 * fuite silencieuse de données entre clients.
 *
 * Règle absolue : le périmètre se déduit du compte authentifié, jamais
 * d'un paramètre reçu. Aucune fonction de ce module n'accepte
 * d'identifiant venant d'une requête.
 */
const db = require("./index");

/**
 * Comptes dont `user` peut consulter les données.
 *
 * Retourne toujours au moins son propre identifiant. Pour un parent,
 * y sont ajoutées ses entités directes — la descente est volontairement
 * limitée à un niveau (voir migrate-comptes-rattaches.js).
 *
 * Les comptes de rôle `admin` sont exclus du balayage : certaines
 * missions techniques, créées lors d'une assignation Kaze sans
 * équivalent local, sont rattachées au premier administrateur. Elles
 * ne doivent jamais apparaître dans le périmètre d'un groupe.
 */
async function perimetreClient(user) {
  if (!user || user.role !== "client") return [user?.id].filter(Boolean);

  const { rows } = await db.query(
    `SELECT id FROM users
      WHERE parent_id = $1 AND role = 'client'`,
    [user.id],
  );

  return [user.id, ...rows.map((r) => r.id)];
}

/**
 * Vrai si `user` peut consulter les données de `clientId`.
 *
 * Volontairement distincte de `perimetreClient` : vérifier une
 * appartenance ne doit pas obliger à charger toute la liste.
 */
async function peutConsulter(user, clientId) {
  if (!user || !clientId) return false;
  if (user.id === clientId) return true;
  if (user.role !== "client") return false;

  const { rows } = await db.query(
    `SELECT 1 FROM users
      WHERE id = $1 AND parent_id = $2 AND role = 'client'`,
    [clientId, user.id],
  );
  return rows.length > 0;
}

/**
 * Vrai si `user` est le titulaire direct — et lui seul.
 *
 * Sert aux actions qu'un parent ne doit pas exercer à la place d'une
 * entité : annuler une mission qu'il n'a pas commandée, par exemple.
 * La distinction entre « consulter » et « agir » est le cœur de la
 * fonctionnalité ; les confondre reviendrait à donner au siège un
 * droit de vie et de mort sur l'activité de ses filiales.
 */
function estTitulaire(user, clientId) {
  return Boolean(user && clientId && user.id === clientId);
}

module.exports = { perimetreClient, peutConsulter, estTitulaire };
