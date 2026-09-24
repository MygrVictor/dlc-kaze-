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
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30000, // 30s timeout pour éviter les requêtes zombies
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
