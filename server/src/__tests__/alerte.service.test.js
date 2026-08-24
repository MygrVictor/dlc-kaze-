/**
 * Tests du service d'alerte.
 *
 * L'enjeu n'est pas d'envoyer un message — c'est de ne PAS en envoyer
 * mille quand la base tombe. L'étouffoir est donc le cœur des tests.
 */
jest.mock("axios");

describe("alerte.service", () => {
  let alerteService;
  let axios;

  beforeEach(() => {
    // resetModules fabrique une instance neuve du mock axios : sans ce
    // re-require, le test observerait un autre objet que le service.
    jest.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = "jeton-test";
    process.env.TELEGRAM_ALERTES_CHAT_ID = "-100999";
    axios = require("axios");
    axios.post.mockReset();
    axios.post.mockResolvedValue({ data: { result: { message_id: 1 } } });
    alerteService = require("../services/alerte.service");
  });

  afterEach(() => {
    delete process.env.TELEGRAM_ALERTES_CHAT_ID;
  });

  describe("empreinter", () => {
    it("neutralise les identifiants pour regrouper le même incident", () => {
      const a = alerteService.empreinter("GET /x", "mission 4127 introuvable");
      const b = alerteService.empreinter("GET /x", "mission 9033 introuvable");
      expect(a).toBe(b);
    });

    it("neutralise les UUID", () => {
      const a = alerteService.empreinter(
        "sync",
        "job 550e8400-e29b-41d4-a716-446655440000 absent",
      );
      const b = alerteService.empreinter(
        "sync",
        "job 6ba7b810-9dad-11d1-80b4-00c04fd430c8 absent",
      );
      expect(a).toBe(b);
    });

    it("distingue deux routes différentes", () => {
      expect(alerteService.empreinter("GET /a", "boum")).not.toBe(
        alerteService.empreinter("GET /b", "boum"),
      );
    });
  });

  describe("étouffoir", () => {
    it("laisse passer la première occurrence", async () => {
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("retient les répétitions dans la fenêtre", async () => {
      for (let i = 0; i < 50; i++) {
        await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      }
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("signale la répétition comme étouffée", async () => {
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      const r = await alerteService.alerter({
        contexte: "GET /a",
        erreur: "boum",
      });
      expect(r).toEqual({ alerte: false, etouffee: true });
    });

    it("laisse repasser une fois la fenêtre écoulée", async () => {
      const debut = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(debut);
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });

      Date.now.mockReturnValue(debut + alerteService.FENETRE_ETOUFFOIR_MS + 1);
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });

      expect(axios.post).toHaveBeenCalledTimes(2);
      Date.now.mockRestore();
    });

    it("n'étouffe pas deux erreurs distinctes", async () => {
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      await alerteService.alerter({ contexte: "GET /b", erreur: "patatras" });
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it("rappelle le nombre de répétitions à l'alerte suivante", async () => {
      const debut = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(debut);
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      for (let i = 0; i < 12; i++) {
        await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });
      }

      Date.now.mockReturnValue(debut + alerteService.FENETRE_ETOUFFOIR_MS + 1);
      await alerteService.alerter({ contexte: "GET /a", erreur: "boum" });

      const texte = axios.post.mock.calls[1][1].text;
      expect(texte).toContain("13");
      Date.now.mockRestore();
    });
  });

  describe("composerAlerte", () => {
    it("échappe les caractères réservés MarkdownV2", () => {
      const texte = alerteService.composerAlerte({
        contexte: "GET /api/missions",
        message: "colonne price_ht inexistante",
        occurrences: 1,
      });
      expect(texte).toContain("price\\_ht");
      expect(texte).toContain("/api/missions");
    });

    it("omet les répétitions à la première occurrence", () => {
      const texte = alerteService.composerAlerte({
        contexte: "GET /a",
        message: "boum",
        occurrences: 1,
      });
      expect(texte).not.toContain("Répétitions");
    });

    it("renvoie vers les logs serveur", () => {
      const texte = alerteService.composerAlerte({
        contexte: "GET /a",
        message: "boum",
        occurrences: 1,
      });
      expect(texte).toContain("logs");
    });
  });

  describe("robustesse", () => {
    it("accepte une instance d'Error", async () => {
      await alerteService.alerter({
        contexte: "sync Kaze",
        erreur: new Error("timeout Kaze"),
      });
      expect(axios.post.mock.calls[0][1].text).toContain("timeout Kaze");
    });

    it("ne propage jamais un échec Telegram", async () => {
      axios.post.mockRejectedValue(new Error("429 Too Many Requests"));
      await expect(
        alerteService.alerter({ contexte: "GET /a", erreur: "boum" }),
      ).resolves.toEqual({ alerte: false });
    });

    it("reste en console sans salon configuré", async () => {
      jest.resetModules();
      delete process.env.TELEGRAM_ALERTES_CHAT_ID;
      const axiosSansSalon = require("axios");
      axiosSansSalon.post.mockReset();
      const sansSalon = require("../services/alerte.service");
      const r = await sansSalon.alerter({ contexte: "GET /a", erreur: "boum" });
      expect(r).toEqual({ alerte: false });
      expect(axiosSansSalon.post).not.toHaveBeenCalled();
    });
  });
});
