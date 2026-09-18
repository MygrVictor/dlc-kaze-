import axios from "axios";

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
      if (window.location.pathname !== "/login") {
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
