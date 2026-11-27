// Détermine si le serveur tourne sur l'environnement de recette.
// Seule source de vérité : le nom de la base PostgreSQL (même règle que
// scripts/seed-staging.js). La prod ne contient jamais « staging » dans
// le nom de sa base : les outils de test y restent donc inertes, même si
// leur code est déployé par erreur.
function nomBase() {
  try {
    return new URL(process.env.DATABASE_URL || "").pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

function estStaging() {
  return /staging/i.test(nomBase());
}

module.exports = { estStaging };
