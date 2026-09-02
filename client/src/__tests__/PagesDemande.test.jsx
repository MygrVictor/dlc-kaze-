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
  // SIRET réel (INSEE) : la clé de Luhn est vérifiée côté client, une suite
  // arbitraire de 14 chiffres serait rejetée avant l'envoi.
  const SIRET_VALIDE = "732 829 320 00074";

  const remplir = async ({ phone, qualifier = true }) => {
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
    if (qualifier) {
      await userEvent.type(
        screen.getByPlaceholderText("123 456 789 00012"),
        SIRET_VALIDE,
      );
      await userEvent.selectOptions(
        screen.getByLabelText(/RC Circulation/i),
        "oui",
      );
      await userEvent.selectOptions(
        screen.getByLabelText(/RC Professionnelle/i),
        "oui",
      );
    }
  };

  it("ne demande jamais de structure : ce champ ne concerne que les clients", () => {
    afficher(DevenirConvoyeurPage);
    expect(
      screen.queryByPlaceholderText(/concession, garage, loueur/i),
    ).not.toBeInTheDocument();
  });

  it("refuse un numéro fixe", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0145678901", qualifier: false });
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

  it("envoie une demande complète sans champ company parasite", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678" });
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/demande", {
        type: "convoyeur",
        firstName: "Marc",
        lastName: "Driver",
        email: "marc@test.com",
        phone: "0612345678",
        message: undefined,
        // Le SIRET part normalisé : la mise en forme n'est qu'une aide à la
        // relecture, elle ne doit pas atteindre la base.
        siret: "73282932000074",
        rcCirculation: "oui",
        rcPro: "oui",
        // Non renseigné : la certification n'est pas exigée, et on ne prête
        // pas au candidat une réponse qu'il n'a pas donnée.
        wGarage: undefined,
      });
    });
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
  });

  it("refuse un SIRET dont la clé de contrôle est fausse", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678", qualifier: false });
    await userEvent.type(
      screen.getByPlaceholderText("123 456 789 00012"),
      "12345678901234",
    );
    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/SIRET invalide/i);
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("écarte un candidat sans RC Circulation ni démarche engagée", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678", qualifier: false });
    await userEvent.type(
      screen.getByPlaceholderText("123 456 789 00012"),
      SIRET_VALIDE,
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/RC Circulation/i),
      "non",
    );

    // L'obstacle est signalé sur-le-champ, sans attendre l'envoi, et
    // l'envoi lui-même devient impossible.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /RC Circulation est obligatoire/i,
    );
    expect(bouton()).toBeDisabled();

    fireEvent.click(bouton());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("bloque aussi une RC Professionnelle déclarée absente", async () => {
    // Un « non » vaut inéligibilité : le convoyeur ne peut pas facturer une
    // prestation qu'il n'assure pas.
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678" });
    await userEvent.selectOptions(
      screen.getByLabelText(/RC Professionnelle/i),
      "non",
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /RC Professionnelle est obligatoire/i,
    );
    expect(bouton()).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("laisse passer une assurance en cours d'obtention", async () => {
    // Un candidat dont les démarches sont engagées reste un bon profil :
    // le refuser reviendrait à écarter des convoyeurs sérieux.
    api.post.mockResolvedValueOnce({ data: {} });
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678", qualifier: false });
    await userEvent.type(
      screen.getByPlaceholderText("123 456 789 00012"),
      SIRET_VALIDE,
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/RC Circulation/i),
      "en_cours",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/RC Professionnelle/i),
      "en_cours",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(bouton());
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/demande",
        expect.objectContaining({ rcCirculation: "en_cours" }),
      );
    });
  });

  it("exige une réponse sur les deux assurances", async () => {
    // Laisser une question vide ne vaut pas acceptation tacite : les deux
    // couvertures conditionnent l'attribution des missions. Le W garage,
    // lui, reste facultatif.
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0612345678", qualifier: false });
    await userEvent.type(
      screen.getByPlaceholderText("123 456 789 00012"),
      SIRET_VALIDE,
    );

    fireEvent.click(bouton());
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/RC Circulation/i);
    });

    await userEvent.selectOptions(
      screen.getByLabelText(/RC Circulation/i),
      "oui",
    );
    fireEvent.click(bouton());
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /RC Professionnelle/i,
      );
    });
    expect(api.post).not.toHaveBeenCalled();
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
