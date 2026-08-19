import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  UserCircle2,
  CheckCircle2,
  MailCheck,
  AlertCircle,
} from "lucide-react";
import api from "../lib/api";
import toast from "react-hot-toast";

/**
 * Demande de mise en relation.
 *
 * Les comptes ne sont pas créés librement : le visiteur laisse ses
 * coordonnées, l'administrateur le rappelle puis crée l'accès.
 *
 * Client et convoyeur poursuivent deux buts distincts, avec des
 * informations obligatoires différentes. Plutôt que de parsemer le rendu
 * de conditions `role === "convoyeur" ? … : …`, chaque profil est décrit
 * une fois pour toutes dans `PROFILS` : champs affichés, règles de
 * validation et textes d'accompagnement. Déplacer une obligation ne
 * demande alors de toucher qu'à un seul endroit, et les deux parcours ne
 * peuvent plus diverger par accident.
 */

// ── Validation ──────────────────────────────────────────────

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reproduit `isValidMobile` du serveur pour éviter un aller-retour réseau
 * sur une faute de saisie évidente. Le serveur reste seul juge : cette
 * vérification n'est qu'un confort.
 */
function mobileValide(saisie) {
  const brut = saisie.trim();
  if (!brut) return false;

  const international = brut.startsWith("+");
  let chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);

  if (!international && chiffres.length === 10 && chiffres.startsWith("0")) {
    // Numéro national : seuls 06 et 07 désignent des mobiles.
    return /^0[67]\d{8}$/.test(chiffres);
  }
  if (chiffres.startsWith("33")) {
    return /^[67]\d{8}$/.test(chiffres.slice(2).replace(/^0/, ""));
  }
  // Autres pays : on ne présume pas des plans de numérotation.
  return chiffres.length >= 8 && chiffres.length <= 15;
}

// ── Description des deux parcours ───────────────────────────

const PROFILS = {
  client: {
    libelle: "Client",
    accroche: "Je veux faire convoyer mes véhicules",
    icone: UserCircle2,
    accent: "var(--amber)",
    accentTexte: "var(--amber-deep)",
    fond: "rgba(255,209,26,0.10)",
    intro:
      "Décrivez votre activité : nous revenons vers vous avec une offre adaptée à vos volumes.",
    // Le nom du contact est utile mais ne conditionne pas le rappel :
    // c'est la structure qui identifie le prospect.
    champs: ["identite", "company", "email", "phone", "message"],
    obligatoires: ["company"],
    labelTelephone: "Numéro à rappeler",
    aideTelephone:
      "Email ou téléphone : au moins un moyen de vous joindre est nécessaire.",
    placeholderMessage: "Volume de véhicules, trajets habituels…",
    confirmation:
      "Merci ! Notre équipe étudie votre demande et vous recontacte rapidement. Si elle aboutit, nous créons votre compte et vous recevez vos identifiants par email.",
    /** @returns {string|null} message d'erreur, ou null si tout va bien */
    valider(form) {
      if (!form.company.trim()) {
        return "Indiquez le nom de votre structure.";
      }
      if (!form.email.trim() && !form.phone.trim()) {
        return "Indiquez au moins un email ou un numéro à rappeler.";
      }
      if (form.email.trim() && !EMAIL_VALIDE.test(form.email.trim())) {
        return "Adresse email invalide.";
      }
      return null;
    },
  },

  convoyeur: {
    libelle: "Convoyeur",
    accroche: "Je veux conduire des missions",
    icone: Truck,
    accent: "var(--teal)",
    accentTexte: "var(--teal)",
    fond: "rgba(14,116,144,0.08)",
    intro:
      "Présentez-vous : nous vérifions votre profil avant d'ouvrir votre accès aux missions.",
    // Tout est obligatoire : un convoyeur doit être identifiable et
    // joignable avant qu'une mission puisse lui être confiée.
    champs: ["identite", "email", "phone", "message"],
    obligatoires: ["firstName", "lastName", "email", "phone"],
    labelTelephone: "Mobile",
    aideTelephone:
      "Indispensable : les missions disponibles vous sont annoncées par WhatsApp.",
    placeholderMessage: "Votre expérience, votre zone géographique…",
    confirmation:
      "Merci ! Nous vérifions votre profil et vous recontactons. Une fois votre accès ouvert, les missions disponibles vous seront annoncées par WhatsApp.",
    valider(form) {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        return "Nom et prénom sont obligatoires.";
      }
      if (!EMAIL_VALIDE.test(form.email.trim())) {
        return "Adresse email invalide.";
      }
      if (!form.phone.trim()) {
        return "Le numéro de mobile est obligatoire : les missions vous sont annoncées par WhatsApp.";
      }
      if (!mobileValide(form.phone)) {
        return "Numéro de mobile invalide. Format attendu : 06 12 34 56 78.";
      }
      return null;
    },
  },
};

const FORMULAIRE_VIDE = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  message: "",
};

// ── Styles partagés ─────────────────────────────────────────

const labelStyle = {
  display: "block",
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--graphite)",
  marginBottom: 6,
};

const aideStyle = {
  fontSize: 12.5,
  color: "var(--graphite-soft)",
  marginTop: 6,
};

/** Astérisque des champs requis, teinté selon le profil actif. */
function Requis({ actif, couleur }) {
  if (!actif) return null;
  return <span style={{ color: couleur }}>*</span>;
}

// ── Sélecteur de profil ─────────────────────────────────────

function ChoixProfil({ role, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Type de demande"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {Object.entries(PROFILS).map(([cle, profil]) => {
        const actif = role === cle;
        const Icone = profil.icone;
        return (
          <button
            key={cle}
            type="button"
            role="radio"
            aria-checked={actif}
            onClick={() => onChange(cle)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: 16,
              borderRadius: 12,
              border: actif
                ? `2px solid ${profil.accent}`
                : "2px solid rgba(11,29,58,0.12)",
              background: actif ? profil.fond : "rgba(11,29,58,0.03)",
              color: actif ? profil.accentTexte : "var(--graphite-soft)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Icone size={28} />
            <span
              style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}
            >
              {profil.libelle}
            </span>
            <span
              style={{
                fontSize: 12,
                textAlign: "center",
                lineHeight: 1.4,
                opacity: 0.7,
              }}
            >
              {profil.accroche}
            </span>
            {actif && <CheckCircle2 size={16} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────

export default function RegisterPage() {
  const [role, setRole] = useState("client");
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState(null);

  const profil = PROFILS[role];
  const requis = (champ) => profil.obligatoires.includes(champ);
  const affiche = (champ) => profil.champs.includes(champ);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    // Une erreur maintenue après correction du champ fautif induit en
    // erreur : elle disparaît dès la première frappe.
    if (erreur) setErreur(null);
  };

  // Les champs communs sont conservés d'un profil à l'autre : rebasculer
  // ne doit pas punir celui qui a déjà saisi ses coordonnées.
  const changerRole = (nouveau) => {
    setRole(nouveau);
    setErreur(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const probleme = profil.valider(form);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/demande", {
        type: role,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        // La structure n'a de sens que pour un client : l'envoyer pour un
        // convoyeur laisserait une donnée orpheline en base.
        company: affiche("company")
          ? form.company.trim() || undefined
          : undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      setEnvoye(true);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        "Envoi impossible. Vérifiez votre connexion et réessayez.";
      setErreur(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const cadre = {
    minHeight: "calc(100vh - var(--nav-h))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 16px",
    background: "var(--cream-2)",
  };

  if (envoye) {
    return (
      <div style={cadre}>
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
            {profil.confirmation}
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
    <div style={cadre}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="card" style={{ padding: "40px 36px" }}>
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

          <ChoixProfil role={role} onChange={changerRole} />

          {/* Le formulaire qui suit change de nature selon le profil :
              mieux vaut l'annoncer que laisser deviner. */}
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--graphite-soft)",
              background: profil.fond,
              borderLeft: `3px solid ${profil.accent}`,
              padding: "10px 12px",
              borderRadius: 6,
              marginBottom: 20,
            }}
          >
            {profil.intro}
          </p>

          <form
            onSubmit={handleSubmit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {affiche("identite") && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelStyle} htmlFor="firstName">
                    Prénom{" "}
                    <Requis
                      actif={requis("firstName")}
                      couleur={profil.accentTexte}
                    />
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Jean"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="lastName">
                    Nom{" "}
                    <Requis
                      actif={requis("lastName")}
                      couleur={profil.accentTexte}
                    />
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="Dupont"
                    autoComplete="family-name"
                  />
                </div>
              </div>
            )}

            {affiche("company") && (
              <div>
                <label style={labelStyle} htmlFor="company">
                  Nom de la structure{" "}
                  <Requis
                    actif={requis("company")}
                    couleur={profil.accentTexte}
                  />
                </label>
                <input
                  id="company"
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Concession, garage, loueur…"
                  autoComplete="organization"
                />
              </div>
            )}

            <div>
              <label style={labelStyle} htmlFor="email">
                Email{" "}
                <Requis actif={requis("email")} couleur={profil.accentTexte} />
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="input-field"
                placeholder="votre@email.fr"
                autoComplete="email"
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="phone">
                {profil.labelTelephone}{" "}
                <Requis actif={requis("phone")} couleur={profil.accentTexte} />
              </label>
              <input
                id="phone"
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="input-field"
                placeholder="+33 6 12 34 56 78"
                autoComplete="tel"
              />
              <p style={aideStyle}>{profil.aideTelephone}</p>
            </div>

            <div>
              <label style={labelStyle} htmlFor="message">
                Message (facultatif)
              </label>
              <textarea
                id="message"
                name="message"
                rows={3}
                value={form.message}
                onChange={handleChange}
                className="input-field"
                placeholder={profil.placeholderMessage}
                style={{ resize: "vertical" }}
              />
            </div>

            {/* L'erreur est ancrée au-dessus du bouton plutôt que confiée à
                un toast fugace : elle reste lisible pendant la correction. */}
            {erreur && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  color: "#b91c1c",
                  background: "rgba(185,28,28,0.07)",
                  border: "1px solid rgba(185,28,28,0.2)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <span>{erreur}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 8,
                opacity: loading ? 0.7 : 1,
              }}
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
