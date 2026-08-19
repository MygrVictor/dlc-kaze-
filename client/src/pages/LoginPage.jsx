import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogIn, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Bienvenue, ${user.full_name} !`);
      switch (user.role) {
        case "admin":
          navigate("/admin");
          break;
        case "convoyeur":
          navigate("/convoyeur");
          break;
        default:
          navigate("/client");
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - var(--nav-h))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        background: "var(--cream-2)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div className="card" style={{ padding: "44px 40px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 16px",
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,209,26,0.14)",
                color: "var(--amber)",
              }}
            >
              <LogIn size={28} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>
              Connexion
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              Connectez-vous à votre espace personnel.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 20 }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--graphite)",
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="votre@email.fr"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--graphite)",
                  marginBottom: 6,
                }}
              >
                Mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingRight: 44 }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--graphite-soft)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              fontSize: 14,
              color: "var(--graphite-soft)",
              marginTop: 24,
            }}
          >
            Pas encore de compte ?{" "}
            <Link
              to="/devenir-client"
              style={{ color: "var(--amber-deep)", fontWeight: 600 }}
            >
              Devenir client
            </Link>{" "}
            ou{" "}
            <Link
              to="/devenir-convoyeur"
              style={{ color: "var(--teal)", fontWeight: 600 }}
            >
              devenir convoyeur
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
