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

// ── Notifications « nouvelle mission » ─────────────────────────
// Le serveur envoie { title, body, url, tag }. Toucher la notification
// ouvre l'application (ou la ramène au premier plan) sur cette page :
// le convoyeur y est déjà connecté, contrairement au navigateur intégré
// de Telegram.
self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch (e) {
    donnees = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(
      donnees.title || "Nouvelle mission disponible",
      {
        body: donnees.body || "",
        icon: "/icon-192.png",
        badge: "/favicon-48.png",
        tag: donnees.tag,
        renotify: Boolean(donnees.tag),
        data: { url: donnees.url || "/convoyeur/disponibles" },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // On n'ouvre que des pages du site, même si l'URL reçue pointait ailleurs.
  let cible = "/convoyeur/disponibles";
  try {
    const url = new URL(event.notification.data?.url || cible, self.location.origin);
    if (url.origin === self.location.origin) cible = url.pathname + url.search;
  } catch (e) {
    // URL illisible : page par défaut
  }
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((fenetres) => {
        for (const f of fenetres) {
          if (new URL(f.url).origin === self.location.origin && "focus" in f) {
            return f.navigate(cible).then((x) => (x || f).focus());
          }
        }
        return self.clients.openWindow(cible);
      }),
  );
});
