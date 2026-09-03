import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../lib/api";
import { ShieldCheck, Eye, EyeOff, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Choix du nouveau mot de passe, à partir du jeton reçu par email.
 *
 * La confirmation est vérifiée ici et non côté serveur : c'est une aide
 * à la saisie, pas une règle de sécurité — le serveur n'a qu'un mot de
 * passe à valider, la longueur minimale étant contrôlée des deux côtés.
 */
export default function ReinitialiserMotDePassePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmation) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        password,
      });
      toast.success(data.message);
      navigate("/login");
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la réinitialisation.",
      );
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
              <ShieldCheck size={28} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>
              Nouveau mot de passe
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              Choisissez un mot de passe d'au moins 8 caractères.
            </p>
          </div>

          {/* Un lien tronqué par le client mail arrive ici sans jeton :
              mieux vaut le dire tout de suite que laisser l'utilisateur
              remplir un formulaire voué à l'échec. */}
          {!token ? (
            <p
              style={{
                textAlign: "center",
                color: "var(--graphite-soft)",
                fontSize: 14,
              }}
            >
              Ce lien est incomplet. Refaites une demande depuis la page{" "}
              <Link
                to="/mot-de-passe-oublie"
                style={{ color: "var(--amber-deep)", fontWeight: 600 }}
              >
                mot de passe oublié
              </Link>
              .
            </p>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <div>
                <label
                  htmlFor="password"
                  style={{
                    display: "block",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--graphite)",
                    marginBottom: 6,
                  }}
                >
                  Nouveau mot de passe
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    type={visible ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    style={{ paddingRight: 44 }}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-label={
                      visible
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
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
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmation"
                  style={{
                    display: "block",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--graphite)",
                    marginBottom: 6,
                  }}
                >
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmation"
                  type={visible ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: 14, marginTop: 24 }}>
            <Link
              to="/login"
              style={{
                color: "var(--amber-deep)",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ArrowLeft size={15} />
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
