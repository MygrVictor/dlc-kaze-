import { useState } from "react";
import { Link } from "react-router-dom";
import { Truck, UserCircle2, CheckCircle2, MailCheck } from "lucide-react";
import api from "../lib/api";
import toast from "react-hot-toast";

const labelStyle = {
  display: "block",
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--graphite)",
  marginBottom: 6,
};

export default function RegisterPage() {
  const [role, setRole] = useState("client");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (role === "convoyeur") {
      // Un convoyeur est prévenu des missions par WhatsApp : sans mobile
      // exploitable, la mise en relation n'aboutira jamais. Cette règle
      // reproduit `isValidMobile` côté serveur pour éviter un aller-retour.
      if (!form.phone.trim()) {
        toast.error(
          "Le numéro de mobile est obligatoire : les missions vous sont annoncées par WhatsApp.",
        );
        return;
      }

      const international = form.phone.trim().startsWith("+");
      let chiffres = form.phone.replace(/\D/g, "");
      let mobileValide;

      if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);

      if (
        !international &&
        !chiffres.startsWith("00") &&
        chiffres.length === 10 &&
        chiffres.startsWith("0")
      ) {
        // Numéro national : seuls 06 et 07 sont des mobiles.
        mobileValide = /^0[67]\d{8}$/.test(chiffres);
      } else if (chiffres.startsWith("33")) {
        mobileValide = /^[67]\d{8}$/.test(chiffres.slice(2).replace(/^0/, ""));
      } else {
        // Autres pays : on ne présume pas des plans de numérotation.
        mobileValide = chiffres.length >= 8 && chiffres.length <= 15;
      }

      if (!mobileValide) {
        toast.error(
          "Numéro de mobile invalide. Format attendu : 06 12 34 56 78.",
        );
        return;
      }
    } else if (!form.email.trim() && !form.phone.trim()) {
      toast.error("Indiquez au moins un email ou un numéro à rappeler.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/demande", {
        type: role,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        company: form.company.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      setEnvoye(true);
    } catch (err) {
      toast.error(
        err.response?.data?.error || "Erreur lors de l'envoi de la demande.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (envoye) {
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
        <div
          className="card"
          style={{ maxWidth: 460, padding: "40px 36px", textAlign: "center" }}
        >
          <MailCheck size={44} style={{ color: "var(--teal)" }} />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "var(--navy)",
              marginTop: 16,
            }}
          >
            Demande envoyée
          </h1>
          <p
            style={{
              color: "var(--graphite-soft)",
              fontSize: 14.5,
              lineHeight: 1.6,
              marginTop: 12,
            }}
          >
            Merci ! Notre équipe étudie votre demande et vous recontacte
            rapidement. Si elle aboutit, nous créons votre compte et vous
            recevez vos identifiants par email.
          </p>
          <Link
            to="/"
            className="btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 24,
              display: "flex",
            }}
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

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
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="card" style={{ padding: "40px 36px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>
              Nous rejoindre
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 8,
                lineHeight: 1.55,
              }}
            >
              Laissez-nous vos coordonnées : notre équipe vous recontacte et
              crée votre accès à la plateforme.
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>
                  Prénom{" "}
                  {role === "convoyeur" && (
                    <span style={{ color: "var(--teal)" }}>*</span>
                  )}
                </label>
                <input
                  type="text"
                  name="firstName"
                  required={role === "convoyeur"}
                  value={form.firstName}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Jean"
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Nom{" "}
                  {role === "convoyeur" && (
                    <span style={{ color: "var(--teal)" }}>*</span>
                  )}
                </label>
                <input
                  type="text"
                  name="lastName"
                  required={role === "convoyeur"}
                  value={form.lastName}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Dupont"
                />
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
                Email{" "}
                {role === "convoyeur" && (
                  <span style={{ color: "var(--teal)" }}>*</span>
                )}
              </label>
              <input
                type="email"
                name="email"
                required={role === "convoyeur"}
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
                {role === "convoyeur" ? "Mobile" : "Numéro à rappeler"}{" "}
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
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--graphite-soft)",
                  marginTop: 6,
                }}
              >
                {role === "convoyeur"
                  ? "Indispensable : les missions disponibles vous sont annoncées par WhatsApp."
                  : "Email ou téléphone : au moins un moyen de vous joindre est nécessaire."}
              </p>
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
                  Nom de la structure{" "}
                  <span style={{ color: "var(--amber-deep)" }}>*</span>
                </label>
                <input
                  type="text"
                  name="company"
                  required
                  value={form.company}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Concession, garage, loueur…"
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>Message (facultatif)</label>
              <textarea
                name="message"
                rows={3}
                value={form.message}
                onChange={handleChange}
                className="input-field"
                placeholder={
                  role === "convoyeur"
                    ? "Votre expérience, votre zone géographique…"
                    : "Volume de véhicules, trajets habituels…"
                }
                style={{ resize: "vertical" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              {loading ? "Envoi en cours…" : "Envoyer ma demande"}
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
