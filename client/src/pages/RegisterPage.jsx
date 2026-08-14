import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Truck, UserCircle2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("client");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    // Les convoyeurs reçoivent les missions par WhatsApp : le mobile
    // conditionne l'accès aux missions, on le vérifie avant l'envoi.
    if (role === "convoyeur") {
      const chiffres = form.phone.replace(/\D/g, "");
      const mobileValide =
        /^0[67]\d{8}$/.test(chiffres) ||
        /^(?:00)?330?[67]\d{8}$/.test(chiffres) ||
        (!chiffres.startsWith("33") &&
          chiffres.length >= 10 &&
          chiffres.length <= 15);

      if (!form.phone.trim()) {
        toast.error(
          "Le numéro de mobile est obligatoire : les missions vous sont annoncées par WhatsApp.",
        );
        return;
      }
      if (!mobileValide) {
        toast.error(
          "Numéro de mobile invalide. Format attendu : 06 12 34 56 78.",
        );
        return;
      }
    }
    setLoading(true);
    try {
      await api.post("/auth/register-public", {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone?.trim() || undefined,
        company: form.company || undefined,
        password: form.password,
        role,
      });
      toast.success(
        "Compte créé ! Votre demande est en cours de validation. Vous recevrez un email de confirmation.",
      );
      navigate("/login");
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la création du compte.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 76px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        background: "var(--cream-2)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="card" style={{ padding: "40px 36px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>
              Créer un compte
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              Rejoignez la plateforme Drive Line Connect
            </p>
          </div>

          {/* Choix du rôle */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              onClick={() => setRole("client")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 16,
                borderRadius: 12,
                border:
                  role === "client"
                    ? "2px solid var(--amber)"
                    : "2px solid rgba(11,29,58,0.12)",
                background:
                  role === "client"
                    ? "rgba(255,209,26,0.10)"
                    : "rgba(11,29,58,0.03)",
                color:
                  role === "client"
                    ? "var(--amber-deep)"
                    : "var(--graphite-soft)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <UserCircle2 size={28} />
              <span
                style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}
              >
                Client
              </span>
              <span
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  lineHeight: 1.4,
                  opacity: 0.7,
                }}
              >
                Je veux faire convoyer mes véhicules
              </span>
              {role === "client" && <CheckCircle2 size={16} />}
            </button>

            <button
              type="button"
              onClick={() => setRole("convoyeur")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 16,
                borderRadius: 12,
                border:
                  role === "convoyeur"
                    ? "2px solid var(--teal)"
                    : "2px solid rgba(11,29,58,0.12)",
                background:
                  role === "convoyeur"
                    ? "rgba(14,116,144,0.08)"
                    : "rgba(11,29,58,0.03)",
                color:
                  role === "convoyeur" ? "var(--teal)" : "var(--graphite-soft)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Truck size={28} />
              <span
                style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}
              >
                Convoyeur
              </span>
              <span
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  lineHeight: 1.4,
                  opacity: 0.7,
                }}
              >
                Je veux conduire des missions
              </span>
              {role === "convoyeur" && <CheckCircle2 size={16} />}
            </button>
          </div>

          {/* Formulaire */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
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
                Nom complet *
              </label>
              <input
                type="text"
                name="fullName"
                required
                value={form.fullName}
                onChange={handleChange}
                className="input-field"
                placeholder="Jean Dupont"
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
                Email *
              </label>
              <input
                type="email"
                name="email"
                required
                value={form.email}
                onChange={handleChange}
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
                Téléphone{" "}
                {role === "convoyeur" && (
                  <span style={{ color: "var(--teal)" }}>*</span>
                )}
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="input-field"
                placeholder="+33 6 12 34 56 78"
                required={role === "convoyeur"}
              />
              {role === "convoyeur" && (
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--graphite-soft)",
                    marginTop: 6,
                  }}
                >
                  Indispensable : les missions disponibles vous sont annoncées
                  par WhatsApp.
                </p>
              )}
            </div>

            {role === "client" && (
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
                  Société
                </label>
                <input
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Nom de votre société (optionnel)"
                />
              </div>
            )}

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
                Mot de passe *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  className="input-field pr-10"
                  placeholder="8 caractères minimum"
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
                Confirmer le mot de passe *
              </label>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                required
                value={form.confirmPassword}
                onChange={handleChange}
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {loading ? "Création en cours…" : "Créer mon compte"}
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
            Déjà un compte ?{" "}
            <Link to="/login" style={{ color: "var(--teal)", fontWeight: 600 }}>
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
