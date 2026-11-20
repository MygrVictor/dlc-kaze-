/**
 * Notifications de l'application (Web Push) côté navigateur.
 *
 * Le parcours : l'appareil sait-il recevoir des notifications ? Si oui,
 * on demande l'autorisation, on crée l'abonnement avec la clé publique du
 * serveur et on l'envoie à l'API. Le service worker (public/sw.js) affiche
 * ensuite les notifications reçues.
 */
import api from "./api";

/** iPhone / iPad, y compris l'iPad qui se présente comme un Mac. */
export function estIos(nav = typeof navigator !== "undefined" ? navigator : {}) {
  const ua = nav.userAgent || "";
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1)
  );
}

/** L'application est-elle ouverte depuis l'écran d'accueil ? */
export function estInstallee(win = typeof window !== "undefined" ? window : {}) {
  return Boolean(
    win.matchMedia?.("(display-mode: standalone)").matches ||
      win.navigator?.standalone,
  );
}

/**
 * Où en est cet appareil :
 *  - "indisponible"   navigateur sans notifications (ou serveur non configuré)
 *  - "a-installer"    iPhone dans Safari : il faut d'abord l'écran d'accueil
 *  - "refusee"        l'utilisateur a bloqué les notifications
 *  - "inactive"       possible, pas encore activée
 *  - "active"         abonné sur cet appareil
 */
export async function etatNotifications() {
  const supporte =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (!supporte) {
    // Sur iPhone, Safari n'expose les notifications qu'à l'application
    // installée : hors écran d'accueil, c'est l'étape qui manque.
    return estIos() && !estInstallee() ? "a-installer" : "indisponible";
  }
  if (Notification.permission === "denied") return "refusee";

  const enregistrement = await navigator.serviceWorker.getRegistration();
  const abonnement = await enregistrement?.pushManager.getSubscription();
  return abonnement && Notification.permission === "granted"
    ? "active"
    : "inactive";
}

/** Clé VAPID base64url → tableau d'octets attendu par le navigateur. */
export function cleEnOctets(base64url) {
  const rembourrage = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + rembourrage).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

/**
 * Active les notifications sur cet appareil. Doit être appelé depuis un
 * clic : iOS refuse la demande d'autorisation sinon.
 */
export async function activerNotifications() {
  const { data } = await api.get("/convoyeur/notifications/cle");
  if (!data?.clePublique) {
    throw new Error("Les notifications ne sont pas encore disponibles.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "Notifications refusées. Autorisez-les dans les réglages du téléphone.",
    );
  }

  const enregistrement =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;

  let abonnement = await enregistrement.pushManager.getSubscription();
  if (!abonnement) {
    abonnement = await enregistrement.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cleEnOctets(data.clePublique),
    });
  }

  await api.post("/convoyeur/notifications/abonnement", abonnement.toJSON());
}

/** Coupe les notifications sur cet appareil uniquement. */
export async function desactiverNotifications() {
  const enregistrement = await navigator.serviceWorker.getRegistration();
  const abonnement = await enregistrement?.pushManager.getSubscription();
  if (!abonnement) return;
  await api
    .delete("/convoyeur/notifications/abonnement", {
      data: { endpoint: abonnement.endpoint },
    })
    .catch(() => {});
  await abonnement.unsubscribe();
}
