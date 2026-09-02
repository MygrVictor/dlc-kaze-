import PageDemande, {
  EMAIL_VALIDE,
  mobileValide,
  labelStyle,
  aideStyle,
  Requis,
} from "./PageDemande";
import { siretValide, normaliserSiret, formaterSiret } from "../lib/siret";
import { ShieldAlert } from "lucide-react";
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

/**
 * Avertit dès la sélection, sans attendre l'envoi.
 *
 * Laisser le candidat remplir le reste du formulaire pour ne lui opposer un
 * refus qu'au moment de valider serait une perte de temps doublée d'une
 * mauvaise impression. Le message dit aussi comment redevenir éligible :
 * l'objectif reste de le récupérer, pas de l'écarter.
 */
function AlerteAssurance({ manquantes }) {
  if (!manquantes.length) return null;
  return (
    <div className="demande-blocage" role="status">
      <ShieldAlert size={17} />
      <p>
        <strong>
          {manquantes.length > 1
            ? `Ces assurances sont obligatoires : ${manquantes.join(" et ")}.`
            : `La ${manquantes[0]} est obligatoire.`}
        </strong>{" "}
        Souscrivez-la auprès de votre assureur, puis revenez déposer votre
        candidature. Dès vos démarches engagées, sélectionnez « En cours
        d'obtention » : nous étudierons votre dossier sans attendre
        l'attestation définitive.
      </p>
    </div>
  );
}

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
    if (!form.rcPro) {
      return "Indiquez votre situation vis-à-vis de la RC Professionnelle.";
    }
    // Une assurance déclarée absente arrête la candidature : la RC
    // Circulation couvre le véhicule confié, la RC Professionnelle couvre
    // la prestation. Sans l'une des deux, aucune mission ne peut être
    // attribuée et le rappel serait sans objet. « En cours d'obtention »
    // reste accepté : le dossier sera repris à la souscription.
    if (form.rcCirculation === "non") {
      return "La RC Circulation est indispensable pour convoyer un véhicule. Souscrivez-la, puis revenez déposer votre candidature : indiquez « En cours d'obtention » dès vos démarches engagées.";
    }
    if (form.rcPro === "non") {
      return "La RC Professionnelle est indispensable pour exercer comme prestataire. Souscrivez-la, puis revenez déposer votre candidature : indiquez « En cours d'obtention » dès vos démarches engagées.";
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
    rcPro: form.rcPro,
    // Le serveur attend un booléen ; sans réponse on n'envoie rien plutôt
    // que « non », qui prêterait au candidat une déclaration qu'il n'a pas
    // faite.
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
      bloque={(form) => form.rcCirculation === "non" || form.rcPro === "non"}
      champsInitiaux={CHAMPS_CONVOYEUR}
      argumentaire={<AvantagesConvoyeur />}
    >
      {({ form, handleChange, setForm, accent }) => (
        <>
          <div className="demande-duo">
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

          <div className="demande-duo">
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
            </div>
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

          {/* Les trois questions d'éligibilité tiennent en deux rangées de
              menus déroulants : leur affichage précédent en cartes radio
              occupait à lui seul plus d'un écran. */}
          <div className="demande-duo">
            <ChoixStatut
              legende={
                <>
                  RC Circulation <Requis couleur={accent} />
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
              legende={
                <>
                  RC Professionnelle <Requis couleur={accent} />
                </>
              }
              aide="Elle couvre votre responsabilité de prestataire."
              name="rcPro"
              options={OPTIONS_ASSURANCE}
              valeur={form.rcPro}
              onChange={handleChange}
              accent={accent}
            />
          </div>

          <AlerteAssurance
            manquantes={[
              form.rcCirculation === "non" && "RC Circulation",
              form.rcPro === "non" && "RC Professionnelle",
            ].filter(Boolean)}
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
        </>
      )}
    </PageDemande>
  );
}
