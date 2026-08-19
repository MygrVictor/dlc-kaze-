/**
 * Tests — Page de demande de mise en relation (RegisterPage.jsx)
 *
 * Depuis la refonte, cette page ne crée plus de compte : elle enregistre
 * une demande que l'administrateur traitera manuellement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

import RegisterPage from "../pages/RegisterPage";
import api from "../lib/api";

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

const bouton = () =>
  screen.getByRole("button", { name: /envoyer ma demande/i });

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le titre Nous rejoindre", () => {
    renderRegisterPage();
    expect(screen.getByText("Nous rejoindre")).toBeInTheDocument();
  });

  it("affiche les deux boutons de choix de rôle", () => {
    renderRegisterPage();
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("Convoyeur")).toBeInTheDocument();
  });

  it("ne propose aucun champ mot de passe", () => {
    const { container } = renderRegisterPage();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("sélectionne Client par défaut et demande la structure", () => {
    renderRegisterPage();
    expect(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
    ).toBeInTheDocument();
  });

  it("cache le champ Structure quand Convoyeur est sélectionné", async () => {
    renderRegisterPage();
    fireEvent.click(screen.getByText("Convoyeur"));
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/concession, garage, loueur/i),
      ).not.toBeInTheDocument();
    });
  });

  it("affiche le lien Se connecter", () => {
    renderRegisterPage();
    expect(screen.getByText("Se connecter")).toBeInTheDocument();
  });

  it("refuse un client sans email ni téléphone", async () => {
    renderRegisterPage();

    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    fireEvent.click(bouton());

    // Le message est ancré dans le formulaire, là où la correction se
    // fait, plutôt que confié à un toast qui disparaît.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Indiquez au moins un email ou un numéro à rappeler.",
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("refuse un convoyeur avec un numéro fixe", async () => {
    renderRegisterPage();
    fireEvent.click(screen.getByText("Convoyeur"));

    await userEvent.type(screen.getByPlaceholderText("Jean"), "Marc");
    await userEvent.type(screen.getByPlaceholderText("Dupont"), "Driver");
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "marc@test.com",
    );
    await userEvent.type(
      screen.getByPlaceholderText("+33 6 12 34 56 78"),
      "0145678901",
    );

    fireEvent.click(bouton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Numéro de mobile invalide. Format attendu : 06 12 34 56 78.",
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envoie une demande client et affiche la confirmation", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    renderRegisterPage();

    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "contact@garage.fr",
    );

    fireEvent.click(bouton());

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/demande",
        expect.objectContaining({
          type: "client",
          company: "Garage Test",
          email: "contact@garage.fr",
        }),
      );
    });
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
  });

  it("envoie une demande convoyeur complète", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    renderRegisterPage();
    fireEvent.click(screen.getByText("Convoyeur"));

    await userEvent.type(screen.getByPlaceholderText("Jean"), "Marc");
    await userEvent.type(screen.getByPlaceholderText("Dupont"), "Driver");
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "marc@test.com",
    );
    await userEvent.type(
      screen.getByPlaceholderText("+33 6 12 34 56 78"),
      "0612345678",
    );

    fireEvent.click(bouton());

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/demande",
        expect.objectContaining({
          type: "convoyeur",
          firstName: "Marc",
          lastName: "Driver",
          phone: "0612345678",
        }),
      );
    });
  });

  it("affiche une erreur API si l'envoi échoue", async () => {
    const toast = await import("react-hot-toast");
    api.post.mockRejectedValueOnce({
      response: { data: { error: "Adresse email invalide." } },
    });
    renderRegisterPage();

    await userEvent.type(
      screen.getByPlaceholderText(/concession, garage, loueur/i),
      "Garage Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "contact@garage.fr",
    );

    fireEvent.click(bouton());

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith(
        "Adresse email invalide.",
      );
    });
  });
});
