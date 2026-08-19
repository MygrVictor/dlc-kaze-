import PageDemande, {
  EMAIL_VALIDE,
  labelStyle,
  aideStyle,
  Requis,
} from "./PageDemande";

/**
 * Demande d'ouverture de compte client.
 *
 * Un donneur d'ordre est identifié par sa structure, pas par la personne
 * qui remplit le formulaire : le nom du contact reste donc facultatif.
 * En revanche il faut pouvoir le rappeler — email ou téléphone, l'un des
 * deux suffit, beaucoup de professionnels préférant être joints par
 * téléphone.
 */
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
      titre="Faites convoyer vos véhicules"
      sousTitre="Concessions, garages, loueurs : décrivez votre activité, nous revenons vers vous avec une offre adaptée à vos volumes."
      confirmation="Merci ! Notre équipe étudie votre demande et vous recontacte rapidement. Si elle aboutit, nous créons votre compte et vous recevez vos identifiants par email."
      valider={valider}
      preparer={preparer}
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
              Email
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
              placeholder="Volume de véhicules, trajets habituels, délais attendus…"
              style={{ resize: "vertical" }}
            />
          </div>
        </>
      )}
    </PageDemande>
  );
}
