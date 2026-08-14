/**
 * Tests — Page d'inscription (RegisterPage.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le titre Créer un compte", () => {
    renderRegisterPage();
    expect(screen.getByText("Créer un compte")).toBeInTheDocument();
  });

  it("affiche les deux boutons de choix de rôle", () => {
    renderRegisterPage();
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("Convoyeur")).toBeInTheDocument();
  });

  it("sélectionne Client par défaut", () => {
    renderRegisterPage();
    // Le champ Société est visible seulement pour les clients
    expect(screen.getByPlaceholderText(/société/i)).toBeInTheDocument();
  });

  it("cache le champ Société quand Convoyeur est sélectionné", async () => {
    renderRegisterPage();
    fireEvent.click(screen.getByText("Convoyeur"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/société/i)).not.toBeInTheDocument();
    });
  });

  it("affiche le lien Se connecter", () => {
    renderRegisterPage();
    expect(screen.getByText("Se connecter")).toBeInTheDocument();
  });

  it("refuse si les mots de passe ne correspondent pas", async () => {
    const toast = await import("react-hot-toast");
    renderRegisterPage();

    await userEvent.type(screen.getByPlaceholderText("Jean Dupont"), "Test");
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "test@test.com",
    );

    await userEvent.type(
      screen.getByPlaceholderText("8 caractères minimum"),
      "GoodPass#1",
    );
    await userEvent.type(
      screen.getByPlaceholderText("••••••••"),
      "DifferentPass#1",
    );

    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith(
        "Les mots de passe ne correspondent pas.",
      );
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("refuse si mot de passe trop court", async () => {
    const toast = await import("react-hot-toast");
    renderRegisterPage();

    await userEvent.type(screen.getByPlaceholderText("Jean Dupont"), "Test");
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "test@test.com",
    );

    await userEvent.type(
      screen.getByPlaceholderText("8 caractères minimum"),
      "short",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "short");

    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );
    });
  });

  it("soumet le formulaire et redirige vers /login", async () => {
    const toast = await import("react-hot-toast");
    api.post.mockResolvedValueOnce({ data: {} });
    renderRegisterPage();

    await userEvent.type(
      screen.getByPlaceholderText("Jean Dupont"),
      "Jean Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "jean@test.com",
    );

    await userEvent.type(
      screen.getByPlaceholderText("8 caractères minimum"),
      "GoodPass#1",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "GoodPass#1");

    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/register-public",
        expect.objectContaining({
          email: "jean@test.com",
          fullName: "Jean Test",
          role: "client",
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("affiche une erreur API si la création échoue", async () => {
    const toast = await import("react-hot-toast");
    api.post.mockRejectedValueOnce({
      response: { data: { error: "Un compte existe déjà avec cet email." } },
    });
    renderRegisterPage();

    await userEvent.type(
      screen.getByPlaceholderText("Jean Dupont"),
      "Jean Test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "exist@test.com",
    );

    await userEvent.type(
      screen.getByPlaceholderText("8 caractères minimum"),
      "GoodPass#1",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "GoodPass#1");

    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith(
        "Un compte existe déjà avec cet email.",
      );
    });
  });
});
