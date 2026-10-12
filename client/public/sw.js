/*
 * Service worker volontairement minimal : il rend l'application
 * installable (écran d'accueil, fenêtre autonome) sans rien mettre en
 * cache de métier. Missions, documents et API passent toujours par le
 * réseau : un convoyeur ne doit jamais voir une mission périmée.
 *
 * Seule exception : la page d'accueil de l'application est gardée pour
 * afficher un écran plutôt qu'une erreur du navigateur hors connexion.
 */
const CACHE = "dlc-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/")));
});
