import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { KeyRound, ArrowLeft, MailCheck } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Demande d'un lien de réinitialisation.
 *
 * L'écran de confirmation ne dit jamais si l'adresse est connue : le
 * serveur répond la même chose dans tous les cas, l'interface doit
 * suivre, sinon elle rétablit l'énumération de comptes qu'il évite.
 */
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setEnvoye(true);
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de l'envoi de la demande.",
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
              {envoye ? <MailCheck size={28} /> : <KeyRound size={28} />}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>
              {envoye ? "Vérifiez votre boîte mail" : "Mot de passe oublié"}
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 8,
              }}
            >
              {envoye
                ? "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable 30 minutes."
                : "Indiquez votre adresse email : nous vous enverrons un lien pour choisir un nouveau mot de passe."}
            </p>
          </div>

          {!envoye && (
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              <div>
                <label
                  htmlFor="email"
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
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="votre@email.fr"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {loading ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>
          )}

          <p
            style={{
              textAlign: "center",
              fontSize: 14,
              marginTop: 24,
            }}
          >
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
