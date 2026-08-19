/**
 * Le service d'email assemble du HTML à partir de données parfois
 * externes (API Kaze, formulaires publics). On vérifie ici le filet de
 * sécurité qui neutralise toute tentative d'injection avant l'envoi.
 */
const {
  echapperHtml,
  purgerHtml,
  purgerEntete,
} = require("../services/email.service");

describe("echapperHtml", () => {
  it("neutralise les caractères structurants du HTML", () => {
    expect(echapperHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("rend une chaîne vide pour les valeurs absentes", () => {
    expect(echapperHtml(null)).toBe("");
    expect(echapperHtml(undefined)).toBe("");
  });

  it("laisse intact un texte ordinaire", () => {
    expect(echapperHtml("Renault Clio — AB-123-CD")).toBe(
      "Renault Clio — AB-123-CD",
    );
  });
});

describe("purgerHtml", () => {
  it("supprime les balises exécutables et leur contenu", () => {
    const sale = "<p>Bonjour</p><script>vol()</script>";
    expect(purgerHtml(sale)).toBe("<p>Bonjour</p>");
  });

  it("supprime les iframes", () => {
    expect(purgerHtml('<iframe src="http://mal.fr"></iframe>ok')).toBe("ok");
  });

  it("retire les gestionnaires d'événements inline", () => {
    const purge = purgerHtml('<img src="a.png" onerror="vol()">');
    expect(purge).not.toMatch(/onerror/i);
    expect(purge).toContain('src="a.png"');
  });

  it("désamorce les URL javascript:", () => {
    expect(purgerHtml('<a href="javascript:vol()">clic</a>')).toContain(
      'href="#"',
    );
  });

  it("préserve le gabarit légitime", () => {
    const propre =
      '<div class="info-box"><a href="https://drivelineconnect.com" class="btn">Voir</a></div>';
    expect(purgerHtml(propre)).toBe(propre);
  });
});

describe("purgerEntete", () => {
  it("empêche l'injection d'en-têtes par retour à la ligne", () => {
    expect(purgerEntete("Devis\r\nBcc: pirate@mal.fr")).toBe(
      "Devis Bcc: pirate@mal.fr",
    );
  });

  it("laisse passer un sujet normal", () => {
    expect(purgerEntete("Devis DLC Kaze — 120 € HT")).toBe(
      "Devis DLC Kaze — 120 € HT",
    );
  });
});
