import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { Zap, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Kaze : seule la santé de l'API est suivie ici. Les missions,
 * convoyeurs et factures se consultent dans les pages DLC ou sur Kaze.
 */
export default function AdminKaze() {
  const [kazeHealth, setKazeHealth] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get("/admin/kaze-health");
      setKazeHealth(res.data);
    } catch {
      setKazeHealth(null);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap size={28} className="text-orange-400" />
            Santé API Kaze
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            État de la connexion entre DLC et Kaze.
          </p>
        </div>
        <a
          href="https://app.kaze.so"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2 mt-3 sm:mt-0 text-sm"
        >
          <ExternalLink size={14} />
          Ouvrir Kaze
        </a>
      </div>

      <KazeHealthSection health={kazeHealth} onRefresh={fetchHealth} />
    </div>
  );
}

function KazeHealthSection({ health, onRefresh }) {
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.get("/admin/kaze/test");
      setTestResult(res.data);
      toast.success("Test de connexion réussi !");
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message,
      });
      toast.error("Échec du test de connexion.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap size={20} className="text-orange-400" />
          État de la connexion Kaze
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Authentifié</span>
            <span
              className={`text-sm font-medium ${health?.authenticated ? "text-green-400" : "text-red-400"}`}
            >
              {health?.authenticated ? "✅ Oui" : "❌ Non"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Dernière auth</span>
            <span className="text-dark-200 text-sm">
              {health?.lastAuth
                ? new Date(health.lastAuth).toLocaleString("fr-FR")
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
            <span className="text-dark-400 text-sm">Circuit breaker</span>
            <span
              className={`text-sm font-medium ${
                health?.circuitBreaker === "closed"
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {health?.circuitBreaker === "closed"
                ? "🟢 Fermé (OK)"
                : "🔴 Ouvert"}
            </span>
          </div>
          {health?.baseURL && (
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <span className="text-dark-400 text-sm">URL API</span>
              <span className="text-dark-200 text-sm font-mono">
                {health.baseURL}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-primary flex items-center gap-2"
          >
            <Zap size={16} className={testing ? "animate-pulse" : ""} />
            {testing ? "Test en cours…" : "Tester la connexion"}
          </button>
          <button onClick={onRefresh} className="btn-secondary">
            Rafraîchir
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`card ${testResult.success !== false ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
        >
          <h4 className="font-semibold mb-2">
            {testResult.success !== false
              ? "✅ Connexion OK"
              : "❌ Échec de connexion"}
          </h4>
          <pre className="text-xs text-dark-300 whitespace-pre-wrap overflow-auto max-h-60">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
