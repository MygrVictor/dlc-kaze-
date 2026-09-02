import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DevenirClientPage from "../pages/DevenirClientPage";
import DevenirConvoyeurPage from "../pages/DevenirConvoyeurPage";
import api from "../lib/api";

/**
 * Les deux parcours d'inscription.
 *
 * Ils partagent une mécanique commune mais des règles opposées : le
 * client est identifié par sa structure et joignable par email OU
 * téléphone, le convoyeur doit fournir une identité complète et un
 * mobile. Ces tests vérifient surtout que les deux ne se contaminent
 * pas — c'est précisément ce que l'ancien formulaire à bascule rendait
 * fragile.
 */

vi.mock("../lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const afficher = (Page) =>
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );

const bouton = () =>
  screen.getByRole("button", { name: /envoyer ma demande/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DevenirClientPage", () => {
  it("n'affiche aucun choix de profil : la page est déjà dédiée", () => {
    afficher(DevenirClientPage);
    expect(
      screen.queryByRole("button", { name: /^convoyeur$/i }),
    ).not.toBeInTheDocument();
  });

  it("expose l'argumentaire attendu par une entreprise", () => {
    // Un décideur ne remplit pas un formulaire nu : responsabilité,
    // suivi et engagement doivent être traités avant la demande.
    afficher(DevenirClientPage);
    expect(
      screen.getByText(/véhicules assurés pendant tout le trajet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/convoyeurs professionnels vérifiés/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/suivi en temps réel/i)).toBeInTheDocument();
    expect(screen.getByText(/sans engagement/i)).toBeInTheDocument();
  });

  it("exige le nom de la structure", async () => {
    afficher(DevenirClientPage);
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Indiquez le nom de votre structure.",
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("refuse une structure sans aucun moyen de contact", async () => {
    afficher(DevenirClientPage);
    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Indiquez au moins un email ou un numéro à rappeler.",
      );
    });
  });

  it("accepte un téléphone seul, sans email", async () => {
    // Beaucoup de professionnels préfèrent être rappelés : exiger un
    // email écarterait des prospects légitimes.
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirClientPage);

    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("+33 6 12 34 56 78"),
      "0145678901",
    );
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/demande",
        expect.objectContaining({ type: "client", company: "Garage Test" }),
      );
    });
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
  });

  it("affiche l'erreur renvoyée par le serveur", async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: "Adresse email invalide." } },
    });
    afficher(DevenirClientPage);

    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "a@b.fr",
    );
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Adresse email invalide.",
      );
    });
  });
});

describe("DevenirConvoyeurPage", () => {
  // Les pièces attendues, énumérées ici plutôt que relues depuis la page :
  // un champ retiré du formulaire doit faire échouer le test, pas
  // disparaître silencieusement des deux côtés à la fois.
  const REQUIS = [
    "carte_identite",
    "carte_identite_verso",
    "permis",
    "permis_verso",
    "kbis",
    "rc_circulation",
    "rc_pro",
    "domicile",
  ];

  const piece = (nom) =>
    new File(["contenu"], `${nom}.pdf`, { type: "application/pdf" });

  const champFichier = (nom) => document.querySelector(`input[name="${nom}"]`);

  const joindre = async (noms) => {
    for (const nom of noms) {
      await userEvent.upload(
        document.querySelector(`input[name="${nom}"]`),
        piece(nom),
      );
    }
  };

  const remplir = async ({ phone, pieces = REQUIS }) => {
    await userEvent.type(screen.getByPlaceholderText("Jean"), "Marc");
    await userEvent.type(screen.getByPlaceholderText("Dupont"), "Driver");
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "marc@test.com",
    );
    await userEvent.type(
      screen.getByPlaceholderText("+33 6 12 34 56 78"),
      phone,
    );
    await joindre(pieces);
  };

  /** Les entrées d'un FormData, sous une forme comparable. */
  const contenu = (fd) => {
    const vu = {};
    for (const [cle, valeur] of fd.entries()) {
      vu[cle] = valeur instanceof File ? valeur.name : valeur;
    }
    return vu;
  };

  it("ne demande jamais de structure : ce champ ne concerne que les clients", () => {
    afficher(DevenirConvoyeurPage);
    expect(
      screen.queryByPlaceholderText(/concession, garage, loueur/i),
    ).not.toBeInTheDocument();
  });

  it("refuse un numéro fixe", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0145678901", pieces: [] });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Numéro de mobile invalide. Format attendu : 06 12 34 56 78.",
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exige nom et prénom", async () => {
    afficher(DevenirConvoyeurPage);
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "marc@test.com",
    );
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Nom et prénom sont obligatoires.",
      );
    });
  });

  it("envoie la candidature et ses pièces en une seule requête", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678" });
    fireEvent.click(bouton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, corps, options] = api.post.mock.calls[0];
    expect(url).toBe("/auth/demande");
    expect(corps).toBeInstanceOf(FormData);
    expect(options.headers["Content-Type"]).toBe("multipart/form-data");
    expect(contenu(corps)).toEqual({
      type: "convoyeur",
      firstName: "Marc",
      lastName: "Driver",
      email: "marc@test.com",
      phone: "0612345678",
      // Le type de pièce ne se déduit pas d'un fichier : il est déclaré,
      // et c'est lui qui dit si un verso est attendu.
      typeIdentite: "cni",
      // Les justificatifs voyagent avec le formulaire : le serveur
      // n'enregistre pas une candidature qu'il faudrait compléter ensuite.
      ...Object.fromEntries(REQUIS.map((nom) => [nom, `${nom}.pdf`])),
    });
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
  });

  it("n'envoie rien tant qu'il manque un justificatif", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({
      phone: "0612345678",
      pieces: REQUIS.filter((nom) => nom !== "rc_pro"),
    });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /justificatif manquant : attestation rc professionnelle/i,
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("réclame le dossier entier quand rien n'est joint", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678", pieces: [] });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        `Vos ${REQUIS.length} justificatifs sont nécessaires pour étudier votre candidature.`,
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exige les deux faces du permis, pas seulement le recto", async () => {
    // Le verso porte la date de délivrance et les restrictions : le recto
    // seul ne permet pas de vérifier que le permis est encore valable.
    afficher(DevenirConvoyeurPage);
    await remplir({
      phone: "0612345678",
      pieces: REQUIS.filter((nom) => nom !== "permis_verso"),
    });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/verso/i);
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("n'attend pas de verso lorsqu'un passeport est déclaré", async () => {
    // Un passeport s'identifie sur une page unique : en réclamer le verso
    // bloquerait un dossier parfaitement valable.
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await userEvent.selectOptions(
      screen.getByLabelText(/votre pièce d'identité/i),
      "passeport",
    );
    await remplir({
      phone: "0612345678",
      pieces: REQUIS.filter((nom) => nom !== "carte_identite_verso"),
    });
    fireEvent.click(bouton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const envoye = contenu(api.post.mock.calls[0][1]);
    expect(envoye.typeIdentite).toBe("passeport");
    expect(envoye).not.toHaveProperty("carte_identite_verso");
  });

  it("exige le verso quand une carte nationale est déclarée", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({
      phone: "0612345678",
      pieces: REQUIS.filter((nom) => nom !== "carte_identite_verso"),
    });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /carte d'identité — verso/i,
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("laisse partir la candidature sans W garage", async () => {
    // La certification n'est détenue que par une minorité de convoyeurs :
    // l'exiger écarterait des candidats parfaitement en règle.
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678" });
    fireEvent.click(bouton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(contenu(api.post.mock.calls[0][1])).not.toHaveProperty("w_garage");
  });

  it("transmet le W garage lorsqu'il est joint", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678" });
    await joindre(["w_garage"]);
    fireEvent.click(bouton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(contenu(api.post.mock.calls[0][1])).toMatchObject({
      w_garage: "w_garage.pdf",
    });
  });

  it("ne demande plus ni SIRET ni assurance déclarative", async () => {
    // Ces champs ont cédé la place aux pièces qui les prouvent : les
    // conserver reviendrait à faire saisir ce que le document établit,
    // et à se fier à une case cochée là où seule l'attestation fait foi.
    afficher(DevenirConvoyeurPage);
    expect(
      screen.queryByPlaceholderText("123 456 789 00012"),
    ).not.toBeInTheDocument();
    // Les assurances subsistent, mais comme dépôts de fichiers : c'est
    // l'attestation qui répond, plus une liste déroulante.
    for (const nom of ["rc_circulation", "rc_pro"]) {
      expect(champFichier(nom)).toBeInTheDocument();
    }
  });

  it("efface l'erreur dès que la saisie reprend", async () => {
    afficher(DevenirConvoyeurPage);
    fireEvent.click(bouton());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText("Jean"), "M");

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
