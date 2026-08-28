import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck, AlertCircle } from "lucide-react";
import api from "../lib/api";
import toast from "react-hot-toast";

/**
 * Socle commun aux pages « Devenir client » et « Devenir convoyeur ».
 *
 * Les deux parcours partagent la même mécanique — saisie, validation,
 * envoi vers `/auth/demande`, confirmation — mais rien d'autre : ni les
 * champs, ni les règles, ni le discours. Mutualiser le comportement tout
 * en laissant chaque page définir son contenu évite à la fois la
 * duplication et le formulaire à bascule, qui obligeait le visiteur à
 * choisir son camp avant de comprendre ce qu'on attendait de lui.
 */

export const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reproduit `isValidMobile` du serveur pour éviter un aller-retour réseau
 * sur une faute de saisie évidente. Le serveur reste seul juge.
 */
export function mobileValide(saisie) {
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

export const labelStyle = {
  display: "block",
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--graphite)",
  marginBottom: 6,
};

export const aideStyle = {
  fontSize: 12.5,
  color: "var(--graphite-soft)",
  marginTop: 6,
};

export const FORMULAIRE_VIDE = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  message: "",
};

/** Astérisque des champs requis. */
export function Requis({ couleur }) {
  return <span style={{ color: couleur }}>*</span>;
}

/**
 * @param {object} props
 * @param {"client"|"convoyeur"} props.type      envoyé au serveur
 * @param {string}   props.accent                couleur d'accentuation
 * @param {string}   props.titre
 * @param {string}   props.sousTitre
 * @param {string}   props.confirmation          message après envoi
 * @param {Function} props.valider               (form) => string|null
 * @param {Function} props.children              (outils) => JSX des champs
 * @param {Function} [props.preparer]            (form) => corps de requête
 * @param {object}   [props.champsInitiaux]       champs propres à la page
 * @param {JSX}      [props.argumentaire]        colonne de gauche facultative
 */
export default function PageDemande({
  type,
  accent,
  fond,
  titre,
  sousTitre,
  confirmation,
  valider,
  preparer,
  champsInitiaux,
  argumentaire,
  children,
}) {
  // Le socle ne connaît que les champs communs ; chaque page complète l'état
  // initial avec les siens, sinon leur première saisie ferait passer
  // l'`input` de non contrôlé à contrôlé.
  const [form, setForm] = useState({ ...FORMULAIRE_VIDE, ...champsInitiaux });
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    // Une erreur maintenue après correction du champ fautif induit en
    // erreur : elle disparaît dès la première frappe.
    if (erreur) setErreur(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const probleme = valider(form);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setLoading(true);
    try {
      const corps = preparer
        ? preparer(form)
        : {
            firstName: form.firstName.trim() || undefined,
            lastName: form.lastName.trim() || undefined,
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            message: form.message.trim() || undefined,
          };

      await api.post("/auth/demande", { type, ...corps });
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
          style={{ maxWidth: 480, padding: "40px 36px", textAlign: "center" }}
        >
          <MailCheck size={44} style={{ color: accent }} />
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
            {confirmation}
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
        ...cadre,
        // Un argumentaire déplie la page : on cadre par le haut, sinon le
        // contenu long serait centré verticalement et coupé.
        alignItems: argumentaire ? "flex-start" : "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: argumentaire ? 1100 : 480,
          display: "grid",
          // Le formulaire garde une largeur fixe et lisible ; c'est
          // l'argumentaire qui absorbe l'espace disponible.
          gridTemplateColumns: argumentaire
            ? "minmax(0, 1fr) minmax(360px, 460px)"
            : "1fr",
          gap: 40,
          alignItems: "start",
        }}
        className={argumentaire ? "demande-grille" : undefined}
      >
        {argumentaire}
        <div className="card" style={{ padding: "40px 36px" }}>
          <div style={{ marginBottom: 24 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "var(--navy)",
                lineHeight: 1.25,
              }}
            >
              {titre}
            </h1>
            <p
              style={{
                color: "var(--graphite-soft)",
                fontSize: 14,
                marginTop: 10,
                lineHeight: 1.55,
              }}
            >
              {sousTitre}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {children({ form, handleChange, setForm, accent })}

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

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              fontSize: 13.5,
              color: "var(--graphite-soft)",
              marginTop: 24,
            }}
          >
            <span>
              {type === "client" ? (
                <>
                  Vous conduisez ?{" "}
                  <Link
                    to="/devenir-convoyeur"
                    style={{ color: "var(--teal)", fontWeight: 600 }}
                  >
                    Devenir convoyeur
                  </Link>
                </>
              ) : (
                <>
                  Vous expédiez ?{" "}
                  <Link
                    to="/etre-rappele"
                    style={{ color: "var(--amber-deep)", fontWeight: 600 }}
                  >
                    Faites-vous rappeler
                  </Link>
                </>
              )}
            </span>
            <Link to="/login" style={{ color: "var(--teal)", fontWeight: 600 }}>
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
