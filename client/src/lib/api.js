import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30s timeout pour éviter les requêtes zombies
});

// Injecte le token JWT automatiquement
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dlc_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Gestion globale des erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 = session expirée → déconnexion
    if (error.response?.status === 401) {
      localStorage.removeItem("dlc_token");
      localStorage.removeItem("dlc_user");
      window.location.href = "/login";
    }
    // Ne pas rejeter les annulations (AbortController)
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);

export default api;
