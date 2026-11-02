/* Exemple de code côté partenaire : ouverture du widget et écoute de ses
   messages (hauteur, commande passée, fermeture). */
(function () {
  "use strict";

  var frame = document.getElementById("livrauto-widget");
  var open = document.getElementById("open");
  var log = document.getElementById("log");

  // ?widget=https://livrauto.fr/widget/ pour tester un widget distant.
  var override = new URLSearchParams(location.search).get("widget");
  var src = frame.getAttribute("data-src");
  if (override) src = src.replace(/^\/widget\//, override);
  var widgetOrigin = new URL(src, location.href).origin;

  var modal = document.getElementById("livrauto-modal");

  function ouvrir() {
    // Le widget n'est chargé qu'au premier clic : aucun impact sur la page.
    if (frame.getAttribute("src") === "about:blank") frame.src = src;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function fermer() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  open.addEventListener("click", ouvrir);
  document.getElementById("close").addEventListener("click", fermer);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) fermer(); // clic sur le fond grisé
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) fermer();
  });

  window.addEventListener("message", function (e) {
    if (e.origin !== widgetOrigin || !e.data || typeof e.data.type !== "string")
      return;
    if (e.data.type.indexOf("livrauto:") !== 0) return;

    if (e.data.type === "livrauto:resize") {
      // La modale s'ajuste au contenu, sans dépasser l'écran (voir CSS).
      frame.style.height = e.data.height + "px";
    } else {
      log.textContent =
        (log.textContent === "(aucun)" ? "" : log.textContent + "\n") +
        new Date().toLocaleTimeString("fr-FR") +
        "  " +
        JSON.stringify(e.data);
    }
    if (e.data.type === "livrauto:close") fermer();
  });
})();
