import PageDemande, {
  EMAIL_VALIDE,
  mobileValide,
  labelStyle,
  aideStyle,
  Requis,
} from "./PageDemande";

/**
 * Demande d'inscription convoyeur.
 *
 * Tout est obligatoire, et pour une raison concrète : un convoyeur doit
 * être identifiable avant qu'un véhicule lui soit confié, et joignable
 * sur mobile puisque les missions sont annoncées par WhatsApp. Un numéro
 * fixe rendrait la mise en relation impossible, d'où la vérification du
 * format avant même l'envoi.
 */
export default function DevenirConvoyeurPage() {
  const valider = (form) => {
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
  };

  return (
    <PageDemande
      type="convoyeur"
      accent="var(--teal)"
      titre="Devenez convoyeur partenaire"
      sousTitre="Accédez chaque semaine à des missions à travers l'Europe et choisissez celles qui vous conviennent. Présentez-vous : nous vérifions votre profil avant d'ouvrir votre accès."
      confirmation="Merci ! Nous vérifions votre profil et vous recontactons. Une fois votre accès ouvert, les missions disponibles vous seront annoncées par WhatsApp."
      valider={valider}
    >
      {({ form, handleChange, accent }) => (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle} htmlFor="firstName">
                Prénom <Requis couleur={accent} />
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
                Nom <Requis couleur={accent} />
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
              Email <Requis couleur={accent} />
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
              Mobile <Requis couleur={accent} />
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
              Indispensable : les missions disponibles vous sont annoncées par
              WhatsApp.
            </p>
          </div>

          <div>
            <label style={labelStyle} htmlFor="message">
              Votre profil (facultatif)
            </label>
            <textarea
              id="message"
              name="message"
              rows={3}
              value={form.message}
              onChange={handleChange}
              className="input-field"
              placeholder="Votre expérience, votre zone géographique, vos disponibilités…"
              style={{ resize: "vertical" }}
            />
          </div>
        </>
      )}
    </PageDemande>
  );
}
