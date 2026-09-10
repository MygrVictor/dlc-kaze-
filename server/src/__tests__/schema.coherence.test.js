/**
 * Cohérence entre les INSERT du code et le schéma des migrations.
 *
 * Les tests de routes simulent la base : ils vérifient qu'une requête est
 * émise, jamais qu'elle est exécutable. Une colonne ajoutée à un INSERT
 * mais oubliée dans la migration passe donc toutes les suites au vert et
 * ne tombe qu'en production, à la première écriture réelle.
 *
 * C'est arrivé : `arrival_structure_name` figurait dans l'INSERT de
 * création de mission, la migration ne créait que `arrival_structure`, et
 * toute création échouait sur « la colonne n'existe pas ». Ce test relit
 * les sources pour que l'oubli se voie ici plutôt que chez le client.
 */
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const DOSSIER_DB = path.join(RACINE, "db");

/** Toutes les colonnes que les migrations donnent à une table. */
function colonnesConnues(table) {
  const colonnes = new Set();

  for (const fichier of fs.readdirSync(DOSSIER_DB)) {
    if (!fichier.endsWith(".js")) continue;
    const source = fs.readFileSync(path.join(DOSSIER_DB, fichier), "utf8");

    // CREATE TABLE … ( … ) : on prend le premier mot de chaque ligne du
    // corps, en écartant les contraintes nommées.
    const creation = new RegExp(
      `CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
      "gi",
    );
    let bloc;
    while ((bloc = creation.exec(source)) !== null) {
      for (const ligne of bloc[1].split("\n")) {
        const nom = ligne.trim().match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (
          nom &&
          !/^(primary|foreign|unique|constraint|check)$/i.test(nom[1])
        ) {
          colonnes.add(nom[1].toLowerCase());
        }
      }
    }

    // ALTER TABLE … ADD COLUMN [IF NOT EXISTS] nom …, y compris les
    // formes à plusieurs ajouts séparés par des virgules.
    const alter = new RegExp(`ALTER TABLE ${table}\\b([\\s\\S]*?);`, "gi");
    let modif;
    while ((modif = alter.exec(source)) !== null) {
      const ajouts = modif[1].matchAll(
        /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi,
      );
      for (const ajout of ajouts) colonnes.add(ajout[1].toLowerCase());
    }
  }
  return colonnes;
}

/** Les colonnes citées par chaque INSERT INTO <table> du fichier. */
function colonnesInserees(cheminSource, table) {
  const source = fs.readFileSync(cheminSource, "utf8");
  const inserts = source.matchAll(
    new RegExp(`INSERT INTO ${table}\\s*\\(([\\s\\S]*?)\\)\\s*VALUES`, "gi"),
  );

  const citees = new Set();
  for (const insert of inserts) {
    for (const brut of insert[1].split(",")) {
      const nom = brut.trim().replace(/--.*$/, "").trim();
      if (/^[a-z_][a-z0-9_]*$/i.test(nom)) citees.add(nom.toLowerCase());
    }
  }
  return citees;
}

describe("cohérence des INSERT avec le schéma", () => {
  const FICHIERS = [
    ["routes/mission.routes.js", "missions"],
    ["routes/admin.routes.js", "missions"],
    ["routes/auth.routes.js", "contact_requests"],
  ];

  it.each(FICHIERS)(
    "%s n'écrit que dans des colonnes existantes de %s",
    (fichier, table) => {
      const connues = colonnesConnues(table);
      // Garde-fou du garde-fou : si l'extraction ne trouve rien, le test
      // passerait à vide et ne protégerait plus personne.
      expect(connues.size).toBeGreaterThan(10);

      const inconnues = [...colonnesInserees(path.join(RACINE, fichier), table)]
        .filter((c) => !connues.has(c))
        .sort();

      expect(inconnues).toEqual([]);
    },
  );

  it("réclame les deux colonnes de structure, au départ comme à l'arrivée", () => {
    // Régression : seule la moitié de la paire avait été migrée.
    const connues = colonnesConnues("missions");
    for (const cote of ["departure", "arrival"]) {
      expect(connues).toContain(`${cote}_structure`);
      expect(connues).toContain(`${cote}_structure_name`);
    }
  });
});
