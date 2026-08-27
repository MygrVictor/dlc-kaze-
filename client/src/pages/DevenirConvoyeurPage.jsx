import PageDemande, {
  EMAIL_VALIDE,
  mobileValide,
  labelStyle,
  aideStyle,
  Requis,
} from "./PageDemande";
import { siretValide, normaliserSiret, formaterSiret } from "../lib/siret";
import ChoixStatut from "../components/ChoixStatut";
import AvantagesConvoyeur from "../components/AvantagesConvoyeur";

/**
 * Demande d'inscription convoyeur.
 *
 * Le formulaire précédent — nom, email, mobile — laissait passer toutes les
 * candidatures, y compris celles qui ne pouvaient aboutir : pas de structure
 * déclarée, pas d'assurance en circulation. L'équipe rappelait alors pour
 * rien. On demande donc en amont ce qui conditionne réellement l'accès aux
 * missions, de sorte qu'une candidature reçue soit une candidature
 * exploitable.
 *
 * La RC Circulation admet trois réponses et non deux : un convoyeur ayant
 * engagé ses démarches reste un bon profil, il sera simplement rappelé plus
 * tard. Le refuser reviendrait à écarter des candidats sérieux.
 */

const CHAMPS_CONVOYEUR = {
  siret: "",
  rcCirculation: "",
  rcPro: "",
  wGarage: "",
};

const OPTIONS_ASSURANCE = [
  { valeur: "oui", label: "Oui, je la détiens" },
  { valeur: "en_cours", label: "En cours d'obtention" },
  { valeur: "non", label: "Non, pas encore" },
];

const OPTIONS_OUI_NON = [
  { valeur: "oui", label: "Oui" },
  { valeur: "non", label: "Non" },
];

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
    if (!form.siret.trim()) {
      return "Le SIRET de votre structure est obligatoire.";
    }
    if (!siretValide(form.siret)) {
      return "SIRET invalide : vérifiez les 14 chiffres figurant sur votre extrait Kbis.";
    }
    if (!form.rcCirculation) {
      return "Indiquez votre situation vis-à-vis de la RC Circulation.";
    }
    if (form.rcCirculation === "non") {
      return "La RC Circulation est indispensable pour convoyer un véhicule. Recontactez-nous dès vos démarches engagées.";
    }
    return null;
  };

  const preparer = (form) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    message: form.message.trim() || undefined,
    siret: normaliserSiret(form.siret),
    rcCirculation: form.rcCirculation,
    rcPro: form.rcPro || undefined,
    // Le serveur attend un booléen ; l'absence de réponse reste possible,
    // la certification ne concernant que certains donneurs d'ordre.
    wGarage: form.wGarage ? form.wGarage === "oui" : undefined,
  });

  return (
    <PageDemande
      type="convoyeur"
      accent="var(--teal)"
      titre="Devenez convoyeur partenaire"
      sousTitre="Accédez chaque semaine à des missions à travers l'Europe et choisissez celles qui vous conviennent. Quelques informations nous permettent de vérifier votre éligibilité avant de vous rappeler."
      confirmation="Merci ! Nous vérifions votre dossier et vous recontactons pour un pré-rendez-vous de validation des documents. Une fois votre accès ouvert, les missions disponibles vous seront annoncées par WhatsApp."
      valider={valider}
      preparer={preparer}
      champsInitiaux={CHAMPS_CONVOYEUR}
      argumentaire={<AvantagesConvoyeur />}
    >
      {({ form, handleChange, setForm, accent }) => (
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

          <hr className="demande-separateur" />
          <p className="demande-sous-titre">Votre activité professionnelle</p>

          <div>
            <label style={labelStyle} htmlFor="siret">
              SIRET de votre structure <Requis couleur={accent} />
            </label>
            <input
              id="siret"
              type="text"
              name="siret"
              inputMode="numeric"
              value={form.siret}
              // Le SIRET figure espacé sur le Kbis : on met en forme pendant
              // la frappe pour que le candidat puisse relire sa saisie.
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  siret: formaterSiret(e.target.value),
                }))
              }
              className="input-field"
              placeholder="123 456 789 00012"
            />
            <p style={aideStyle}>
              14 chiffres, tels qu'ils figurent sur votre extrait Kbis ou votre
              avis de situation INSEE.
            </p>
          </div>

          <ChoixStatut
            legende={
              <>
                Assurance RC Circulation <Requis couleur={accent} />
              </>
            }
            aide="Elle couvre le véhicule que vous convoyez. Sans elle, aucune mission ne peut vous être confiée."
            name="rcCirculation"
            options={OPTIONS_ASSURANCE}
            valeur={form.rcCirculation}
            onChange={handleChange}
            accent={accent}
          />

          <ChoixStatut
            legende="Assurance RC Professionnelle"
            aide="Elle couvre votre responsabilité en tant que prestataire."
            name="rcPro"
            options={OPTIONS_ASSURANCE}
            valeur={form.rcPro}
            onChange={handleChange}
            accent={accent}
          />

          <ChoixStatut
            legende="Certification W garage"
            aide="Certains donneurs d'ordre l'exigent. Ne pas l'avoir n'est pas éliminatoire."
            name="wGarage"
            options={OPTIONS_OUI_NON}
            valeur={form.wGarage}
            onChange={handleChange}
            accent={accent}
          />

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

          <p style={aideStyle}>
            Après votre demande, nous organisons un pré-rendez-vous pour valider
            vos documents (assurances, pièce d'identité, permis, justificatif de
            domicile).
          </p>
        </>
      )}
    </PageDemande>
  );
}
