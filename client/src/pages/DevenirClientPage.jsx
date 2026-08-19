import {
  ShieldCheck,
  Clock4,
  MapPin,
  FileText,
  Users,
  Building2,
} from "lucide-react";
import PageDemande, {
  EMAIL_VALIDE,
  labelStyle,
  aideStyle,
  Requis,
} from "./PageDemande";

/**
 * Demande d'ouverture de compte client.
 *
 * Un directeur de flotte ne remplit pas un formulaire par curiosité : il
 * cherche d'abord à savoir qui prend la responsabilité du véhicule, sous
 * quel délai, et comment il gardera la main sur ses opérations. La page
 * répond à ces trois questions avant de demander quoi que ce soit — le
 * formulaire seul ne convainc pas à ce niveau de décision.
 *
 * Côté saisie, le prospect est identifié par sa structure et non par la
 * personne qui remplit : le nom du contact reste facultatif. Un email OU
 * un téléphone suffit, beaucoup de professionnels préférant être
 * rappelés.
 */

const GARANTIES = [
  {
    icone: ShieldCheck,
    titre: "Véhicules assurés pendant tout le trajet",
    texte:
      "Chaque convoyage est couvert de la prise en charge à la livraison. Un état des lieux photographique est réalisé au départ comme à l'arrivée.",
  },
  {
    icone: Users,
    titre: "Convoyeurs professionnels vérifiés",
    texte:
      "Permis, expérience et documents contrôlés avant toute mission. Vous savez qui conduit vos véhicules.",
  },
  {
    icone: MapPin,
    titre: "Suivi en temps réel",
    texte:
      "Position du convoyeur, étapes franchies, heure d'arrivée estimée : vos équipes et vos clients restent informés sans avoir à téléphoner.",
  },
  {
    icone: Clock4,
    titre: "Réactivité sur les volumes",
    texte:
      "Convoyages à l'unité ou par lots, en France et en Europe. Les demandes urgentes sont traitées en priorité.",
  },
  {
    icone: FileText,
    titre: "Facturation centralisée",
    texte:
      "Un devis par mission, une facturation groupée, un historique consultable à tout moment depuis votre espace.",
  },
];

const ETAPES = [
  "Vous décrivez votre besoin, nous ouvrons votre accès.",
  "Vous déposez vos véhicules à convoyer et recevez un devis.",
  "Un convoyeur vérifié prend la route, vous suivez en direct.",
];

function Argumentaire() {
  return (
    <div style={{ paddingTop: 8 }}>
      <span
        style={{
          display: "inline-block",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1.4,
          color: "var(--amber-deep)",
          marginBottom: 14,
        }}
      >
        CONCESSIONS · LOUEURS · GARAGES · FLOTTES
      </span>

      <h2
        style={{
          fontSize: "clamp(30px, 4vw, 42px)",
          fontWeight: 800,
          color: "var(--navy)",
          lineHeight: 1.15,
          marginBottom: 18,
        }}
      >
        Confiez vos véhicules
        <br />à des convoyeurs professionnels
      </h2>

      <p
        style={{
          fontSize: 16,
          lineHeight: 1.65,
          color: "var(--graphite-soft)",
          maxWidth: 560,
          marginBottom: 32,
        }}
      >
        Drive Line Connect prend en charge vos convoyages en France et en Europe
        : livraisons clients, transferts inter-sites, retours de location,
        restitutions de leasing. Vos équipes se concentrent sur leur métier,
        nous gérons la route.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          marginBottom: 36,
        }}
      >
        {GARANTIES.map(({ icone: Icone, titre, texte }) => (
          <div key={titre} style={{ display: "flex", gap: 14 }}>
            <div
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,209,26,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--amber-deep)",
              }}
            >
              <Icone size={20} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 15.5,
                  fontWeight: 700,
                  color: "var(--navy)",
                  marginBottom: 4,
                }}
              >
                {titre}
              </p>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--graphite-soft)",
                  maxWidth: 520,
                }}
              >
                {texte}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Le déroulé rassure sur l'engagement : ouvrir un compte n'oblige
          à rien, le devis vient avant toute mise en route. */}
      <div
        style={{
          background: "rgba(11,29,58,0.04)",
          border: "1px solid rgba(11,29,58,0.08)",
          borderRadius: 14,
          padding: "22px 24px",
        }}
      >
        <p
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: "var(--navy)",
            marginBottom: 16,
          }}
        >
          <Building2 size={16} style={{ color: "var(--amber-deep)" }} />
          COMMENT ÇA SE PASSE
        </p>
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {ETAPES.map((etape, index) => (
            <li
              key={etape}
              style={{
                display: "flex",
                gap: 12,
                fontSize: 14.5,
                lineHeight: 1.5,
                color: "var(--graphite)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--amber)",
                  color: "var(--navy)",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {index + 1}
              </span>
              {etape}
            </li>
          ))}
        </ol>
        <p
          style={{
            fontSize: 13,
            color: "var(--graphite-soft)",
            marginTop: 16,
            lineHeight: 1.5,
          }}
        >
          Ouvrir un compte est gratuit et sans engagement : vous ne payez que
          les convoyages que vous validez.
        </p>
      </div>
    </div>
  );
}

export default function DevenirClientPage() {
  const valider = (form) => {
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
  };

  const preparer = (form) => ({
    firstName: form.firstName.trim() || undefined,
    lastName: form.lastName.trim() || undefined,
    company: form.company.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    message: form.message.trim() || undefined,
  });

  return (
    <PageDemande
      type="client"
      accent="var(--amber-deep)"
      titre="Ouvrir un compte entreprise"
      sousTitre="Décrivez votre activité : nous revenons vers vous sous 24 h ouvrées avec une offre adaptée à vos volumes."
      confirmation="Merci ! Notre équipe étudie votre demande et vous recontacte sous 24 h ouvrées. Nous créons ensuite votre compte et vous recevez vos identifiants par email."
      valider={valider}
      preparer={preparer}
      argumentaire={<Argumentaire />}
    >
      {({ form, handleChange, accent }) => (
        <>
          <div>
            <label style={labelStyle} htmlFor="company">
              Nom de la structure <Requis couleur={accent} />
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle} htmlFor="firstName">
                Prénom
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
                Nom
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

          <div>
            <label style={labelStyle} htmlFor="email">
              Email professionnel
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
              Numéro à rappeler
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
            <p style={aideStyle}>
              Email ou téléphone : au moins un moyen de vous joindre est
              nécessaire.
            </p>
          </div>

          <div>
            <label style={labelStyle} htmlFor="message">
              Votre besoin (facultatif)
            </label>
            <textarea
              id="message"
              name="message"
              rows={3}
              value={form.message}
              onChange={handleChange}
              className="input-field"
              placeholder="Volume mensuel, trajets habituels, délais attendus…"
              style={{ resize: "vertical" }}
            />
          </div>
        </>
      )}
    </PageDemande>
  );
}
