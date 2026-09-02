import PageDemande, {
  EMAIL_VALIDE,
  mobileValide,
  labelStyle,
  Requis,
} from "./PageDemande";
import toast from "react-hot-toast";
import AvantagesConvoyeur from "../components/AvantagesConvoyeur";
import ChampDocument from "../components/ChampDocument";

/**
 * Demande d'inscription convoyeur.
 *
 * Le formulaire initial — nom, email, mobile — laissait passer toutes les
 * candidatures, y compris celles qui ne pouvaient aboutir : pas de
 * structure déclarée, pas d'assurance en circulation. L'équipe rappelait
 * alors pour rien.
 *
 * Ces conditions ont d'abord été posées sous forme déclarative : un SIRET
 * à saisir, trois listes déroulantes. Elles ont disparu au profit des
 * pièces elles-mêmes. L'extrait Kbis porte le SIRET, les attestations
 * établissent les couvertures : demander les deux revenait à faire saisir
 * ce que le document prouve, et à se fier à une case cochée là où seule la
 * pièce fait foi.
 *
 * Le filtrage n'a pas disparu pour autant, il s'est durci : sans
 * attestation, la candidature ne part pas.
 */

const CHAMPS_CONVOYEUR = {
  // Le type de pièce ne se déduit pas d'un fichier : il faut le demander,
  // sans quoi on ne saurait pas si un verso manque ou s'il n'existe pas.
  typeIdentite: "cni",
  // Les pièces sont retenues dans l'état du formulaire et partent avec
  // lui : le serveur n'enregistre pas une candidature incomplète, les
  // deux ne peuvent donc pas être dissociés.
  carte_identite: null,
  carte_identite_verso: null,
  permis: null,
  permis_verso: null,
  kbis: null,
  rc_circulation: null,
  rc_pro: null,
  domicile: null,
  w_garage: null,
};

/**
 * Les justificatifs exigés.
 *
 * L'ordre suit la logique du candidat : d'abord ce qu'il a sur lui
 * (identité, permis), ensuite ce qu'il doit aller chercher (Kbis,
 * attestations, facture). Commencer par le plus difficile ferait
 * abandonner.
 *
 * Le permis compte pour deux dépôts : validité et catégories figurent au
 * recto, restrictions et date de délivrance au verso. Demander « les deux
 * faces dans un même fichier » revenait à exiger un montage que peu de
 * candidats savent faire depuis un téléphone — et à recevoir, en
 * pratique, le seul recto.
 */
const DOCUMENTS = [
  {
    nom: "carte_identite",
    libelle: "Pièce d'identité",
    aide: "Le recto de votre carte nationale, ou la page d'identification de votre passeport.",
  },
  {
    nom: "permis",
    libelle: "Permis de conduire — recto",
    aide: "La face portant votre photographie et vos catégories.",
  },
  {
    nom: "permis_verso",
    libelle: "Permis de conduire — verso",
    aide: "La face portant les dates de validité et les éventuelles restrictions.",
  },
  {
    nom: "kbis",
    libelle: "Extrait Kbis",
    aide: "De moins de trois mois. Auto-entrepreneur : votre avis de situation INSEE convient.",
  },
  {
    nom: "rc_circulation",
    libelle: "Attestation RC Circulation",
    aide: "Délivrée par votre assureur. Elle couvre le véhicule que vous convoyez.",
  },
  {
    nom: "rc_pro",
    libelle: "Attestation RC Professionnelle",
    aide: "Elle couvre votre responsabilité de prestataire.",
  },
  {
    nom: "domicile",
    libelle: "Justificatif de domicile",
    aide: "Moins de trois mois : facture d'énergie, quittance de loyer ou avis d'imposition.",
  },
];

/**
 * Pièces qui élargissent le champ des missions sans conditionner l'accès.
 *
 * Le W garage n'est détenu que par une minorité de convoyeurs. L'exiger
 * écarterait des candidats parfaitement en règle ; l'ignorer priverait
 * l'équipe d'une information utile au moment d'attribuer les missions qui
 * le réclament.
 */
const DOCUMENTS_FACULTATIFS = [
  {
    nom: "w_garage",
    libelle: "Certification W garage",
    aide: "Certains donneurs d'ordre l'exigent. Ne pas l'avoir n'est pas éliminatoire.",
  },
];

/**
 * Le verso de la pièce d'identité, exigé des seules cartes nationales.
 *
 * Un passeport s'identifie sur une page unique : en réclamer le verso
 * bloquerait un dossier parfaitement valable. La question est posée
 * plutôt que devinée, faute de pouvoir lire le type dans le fichier.
 */
const VERSO_IDENTITE = {
  nom: "carte_identite_verso",
  libelle: "Carte d'identité — verso",
  aide: "La face portant votre adresse et la date d'expiration.",
};

/** Les pièces attendues, selon le type de pièce d'identité déclaré. */
const documentsAttendus = (form) =>
  form.typeIdentite === "passeport"
    ? DOCUMENTS
    : [DOCUMENTS[0], VERSO_IDENTITE, ...DOCUMENTS.slice(1)];

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
    // Le dossier complet conditionne l'envoi : une candidature sans
    // justificatifs n'est pas instruisible, et les réclamer ensuite par
    // courriel n'aboutit presque jamais.
    //
    // C'est aussi ce contrôle qui filtre l'éligibilité : sans attestation
    // d'assurance, pas de candidature. Inutile de demander au candidat
    // s'il est couvert — on lui demande de le prouver.
    const attendus = documentsAttendus(form);
    const manquants = attendus.filter((d) => !form[d.nom]);
    if (manquants.length > 0) {
      return manquants.length === attendus.length
        ? `Vos ${attendus.length} justificatifs sont nécessaires pour étudier votre candidature.`
        : `Justificatif${manquants.length > 1 ? "s" : ""} manquant${
            manquants.length > 1 ? "s" : ""
          } : ${manquants.map((d) => d.libelle.toLowerCase()).join(", ")}.`;
    }
    return null;
  };

  const preparer = (form) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    typeIdentite: form.typeIdentite,
    message: form.message.trim() || undefined,
  });

  // Les pièces sont extraites de l'état du formulaire pour rejoindre le
  // corps multipart, sous le nom de champ que le serveur attend. Un verso
  // saisi puis abandonné au profit d'un passeport ne part pas : il ne
  // correspondrait à rien dans le dossier.
  const fichiers = (form) => {
    const attendus = documentsAttendus(form).map((d) => d.nom);
    return Object.fromEntries(
      [...attendus, ...DOCUMENTS_FACULTATIFS.map((d) => d.nom)]
        .filter((nom) => form[nom])
        .map((nom) => [nom, form[nom]]),
    );
  };

  /** Retient la pièce choisie, ou signale ce qui cloche avec elle. */
  const deposer = (setForm, doc) => (fichier, probleme) => {
    if (probleme) {
      toast.error(`${doc.libelle} — ${probleme}`);
      return;
    }
    setForm((prev) => ({ ...prev, [doc.nom]: fichier }));
  };

  return (
    <PageDemande
      type="convoyeur"
      accent="var(--teal)"
      titre="Devenez convoyeur partenaire"
      sousTitre="Accédez chaque semaine à des missions à travers l'Europe et choisissez celles qui vous conviennent. Vos justificatifs nous permettent d'ouvrir votre accès sans attendre."
      confirmation="Merci ! Nous avons bien reçu votre candidature et vos justificatifs. Notre équipe examine votre dossier et vous recontacte pour un pré-rendez-vous de validation. Une fois votre accès ouvert, les missions disponibles vous seront annoncées par WhatsApp."
      valider={valider}
      preparer={preparer}
      fichiers={fichiers}
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
          <p className="demande-sous-titre">Vos justificatifs</p>

          {/* Le dossier part avec la candidature : ces pièces ne sont pas
              un complément mais la condition de l'envoi. D'où leur place
              avant le champ libre. */}
          <div className="depot-section">
            <div className="depot-entete">
              <span className="depot-titre">
                Pièces obligatoires <Requis couleur={accent} />
              </span>
              <span className="depot-compteur" style={{ color: accent }}>
                {documentsAttendus(form).filter((d) => form[d.nom]).length}/
                {documentsAttendus(form).length}
              </span>
            </div>
            <p className="depot-consigne">
              Ces pièces établissent votre identité, votre droit de conduire,
              votre activité et vos couvertures. JPG, PNG, WEBP ou PDF, 8 Mo
              maximum par fichier.
            </p>

            {/* Le nombre de faces à fournir dépend du titre présenté : deux
                pour une carte nationale, une seule pour un passeport. La
                question précède donc les dépôts. */}
            <div className="depot-choix">
              <label style={labelStyle} htmlFor="typeIdentite">
                Votre pièce d'identité <Requis couleur={accent} />
              </label>
              <select
                id="typeIdentite"
                name="typeIdentite"
                value={form.typeIdentite}
                onChange={handleChange}
                className="input-field"
              >
                <option value="cni">Carte nationale d'identité</option>
                <option value="passeport">Passeport</option>
              </select>
            </div>

            <div className="depot-liste">
              {documentsAttendus(form).map((doc) => (
                <ChampDocument
                  key={doc.nom}
                  nom={doc.nom}
                  libelle={doc.libelle}
                  aide={doc.aide}
                  fichier={form[doc.nom]}
                  accent={accent}
                  onChange={deposer(setForm, doc)}
                />
              ))}
            </div>
          </div>

          <div className="depot-section">
            <div className="depot-entete">
              <span className="depot-titre">Pièce facultative</span>
            </div>
            <p className="depot-consigne">
              Elle ne conditionne pas votre candidature, mais nous permet de
              vous proposer davantage de missions.
            </p>

            <div className="depot-liste">
              {DOCUMENTS_FACULTATIFS.map((doc) => (
                <ChampDocument
                  key={doc.nom}
                  nom={doc.nom}
                  libelle={doc.libelle}
                  aide={doc.aide}
                  fichier={form[doc.nom]}
                  accent={accent}
                  requis={false}
                  onChange={deposer(setForm, doc)}
                />
              ))}
            </div>
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
