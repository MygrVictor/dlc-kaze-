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
  const remplir = async ({ phone }) => {
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
  };

  it("ne demande jamais de structure : ce champ ne concerne que les clients", () => {
    afficher(DevenirConvoyeurPage);
    expect(
      screen.queryByPlaceholderText(/concession, garage, loueur/i),
    ).not.toBeInTheDocument();
  });

  it("refuse un numéro fixe", async () => {
    afficher(DevenirConvoyeurPage);
    await remplir({ phone: "0145678901" });
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
      });
    });
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
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
