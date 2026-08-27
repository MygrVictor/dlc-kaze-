import { useState } from "react";
import toast from "react-hot-toast";
import { PhoneCall, CheckCircle2, AlertCircle } from "lucide-react";
import api from "../lib/api";
import { EMAIL_VALIDE } from "../pages/PageDemande";

/**
 * Bloc « Faites-vous rappeler » du site vitrine.
 *
 * Ouvrir un compte entreprise est un engagement trop lourd pour un premier
 * contact : un visiteur qui découvre l'offre veut parler à quelqu'un, pas
 * remplir un dossier. Ce formulaire ne demande donc que ce qui permet de
 * rappeler utilement — qui appelle, depuis quelle structure, à quel poste,
 * sur quel numéro — et rien de plus.
 *
 * Il alimente la même table `contact_requests` que les pages de demande :
 * l'équipe commerciale n'a qu'un seul endroit à surveiller.
 */

const VIDE = {
  firstName: "",
  lastName: "",
  jobTitle: "",
  company: "",
  phone: "",
  email: "",
  message: "",
};

const champStyle = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 10,
  border: "1px solid rgba(11,29,58,0.16)",
  fontSize: 15.5,
  background: "white",
  color: "var(--graphite)",
  outline: "none",
};

const labelStyle = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--graphite)",
  marginBottom: 6,
};

function Requis() {
  return <span style={{ color: "#dc2626" }}> *</span>;
}

export default function RappelForm() {
  const [form, setForm] = useState(VIDE);
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (erreur) setErreur(null);
  };

  const valider = () => {
    if (!form.firstName.trim() || !form.lastName.trim())
      return "Indiquez votre nom et votre prénom.";
    if (!form.company.trim()) return "Indiquez le nom de votre entreprise.";
    if (!form.phone.trim())
      return "Indiquez un numéro sur lequel vous rappeler.";
    // Le rappel se fait par téléphone : le numéro doit être exploitable,
    // mais on n'impose pas un plan de numérotation précis (fixe, mobile,
    // standard, ligne étrangère…).
    if (form.phone.replace(/\D/g, "").length < 9)
      return "Le numéro de téléphone semble incomplet.";
    if (form.email.trim() && !EMAIL_VALIDE.test(form.email.trim()))
      return "L'adresse email saisie est invalide.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const probleme = valider();
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/demande", {
        type: "client",
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        company: form.company.trim(),
        jobTitle: form.jobTitle.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        message: form.message.trim() || "Demande de rappel depuis le site.",
      });
      setEnvoye(true);
      toast.success("Demande enregistrée, nous vous rappelons sous 48 h.");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        "Envoi impossible pour le moment. Réessayez dans quelques instants.";
      setErreur(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (envoye) {
    return (
      <div className="rappel-card" style={{ textAlign: "center" }}>
        <CheckCircle2
          size={54}
          color="var(--teal)"
          style={{ margin: "0 auto 18px" }}
        />
        <h3
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--navy)",
            marginBottom: 10,
          }}
        >
          Votre demande est enregistrée
        </h3>
        <p style={{ fontSize: 16, color: "var(--graphite-soft)" }}>
          Un expert Drive Line Connect vous rappelle au{" "}
          <strong style={{ color: "var(--navy)" }}>{form.phone}</strong> sous 48
          heures ouvrées.
        </p>
      </div>
    );
  }

  return (
    <form className="rappel-card" onSubmit={handleSubmit} noValidate>
      <div className="rappel-head">
        <div className="rappel-icon">
          <PhoneCall size={22} />
        </div>
        <div>
          <h3>Faites-vous rappeler par un expert</h3>
          <p>
            Laissez vos coordonnées : nous vous rappelons{" "}
            <strong>sous 48 heures ouvrées</strong> pour étudier vos besoins de
            convoyage.
          </p>
        </div>
      </div>

      {erreur && (
        <div className="rappel-erreur">
          <AlertCircle size={17} />
          <span>{erreur}</span>
        </div>
      )}

      <div className="rappel-grid">
        <div>
          <label style={labelStyle} htmlFor="rappel-prenom">
            Prénom
            <Requis />
          </label>
          <input
            id="rappel-prenom"
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            style={champStyle}
            autoComplete="given-name"
            placeholder="Camille"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rappel-nom">
            Nom
            <Requis />
          </label>
          <input
            id="rappel-nom"
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            style={champStyle}
            autoComplete="family-name"
            placeholder="Dupont"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rappel-entreprise">
            Entreprise
            <Requis />
          </label>
          <input
            id="rappel-entreprise"
            name="company"
            value={form.company}
            onChange={handleChange}
            style={champStyle}
            autoComplete="organization"
            placeholder="Groupe Automobile Dupont"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rappel-poste">
            Poste occupé
          </label>
          <input
            id="rappel-poste"
            name="jobTitle"
            value={form.jobTitle}
            onChange={handleChange}
            style={champStyle}
            autoComplete="organization-title"
            placeholder="Responsable logistique"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rappel-tel">
            Téléphone
            <Requis />
          </label>
          <input
            id="rappel-tel"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            style={champStyle}
            autoComplete="tel"
            placeholder="06 12 34 56 78"
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rappel-email">
            Email professionnel
          </label>
          <input
            id="rappel-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            style={champStyle}
            autoComplete="email"
            placeholder="camille.dupont@entreprise.fr"
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle} htmlFor="rappel-message">
          Votre besoin en quelques mots
        </label>
        <textarea
          id="rappel-message"
          name="message"
          rows={3}
          value={form.message}
          onChange={handleChange}
          style={{ ...champStyle, resize: "vertical" }}
          placeholder="Ex. : 15 véhicules par mois entre nos sites de Lyon et Marseille."
        />
      </div>

      <button
        type="submit"
        className="btn-primary rappel-submit"
        disabled={loading}
      >
        {loading ? "Envoi en cours…" : "Être rappelé sous 48 h"}
      </button>

      <p className="rappel-mention">
        Les champs marqués d'un <span style={{ color: "#dc2626" }}>*</span> sont
        obligatoires. Vos données servent uniquement à traiter votre demande.
      </p>
    </form>
  );
}
