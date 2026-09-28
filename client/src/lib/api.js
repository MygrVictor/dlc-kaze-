import axios from "axios";

const PROTECTED_PATH_PREFIXES = [
  "/client",
  "/admin",
  "/convoyeur",
  "/dashboard",
];

function isProtectedPath(pathname) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 30000, // 30s timeout pour éviter les requêtes zombies
});

function estFormData(valeur) {
  if (!valeur) return false;
  if (typeof FormData !== "undefined" && valeur instanceof FormData) {
    return true;
  }
  // Défensif (iframes/polyfills) : détection structurelle.
  return (
    Object.prototype.toString.call(valeur) === "[object FormData]" ||
    (typeof valeur.append === "function" &&
      typeof valeur.get === "function" &&
      typeof valeur.entries === "function")
  );
}

// FormData: ne jamais forcer Content-Type côté client.
// Le navigateur doit injecter lui-même le boundary multipart, sinon
// multer côté serveur reçoit un body non parseable et `req.file` est vide.
api.interceptors.request.use((config) => {
  if (estFormData(config.data)) {
    if (config.headers) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }
  }
  return config;
});

// Gestion globale des erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 = session expirée → déconnexion
    if (error.response?.status === 401) {
      const pathname = window.location.pathname;
      if (pathname !== "/login" && isProtectedPath(pathname)) {
        window.location.href = "/login";
      }
    }
    // Ne pas rejeter les annulations (AbortController)
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);

export default api;
