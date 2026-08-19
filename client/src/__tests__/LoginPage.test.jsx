/**
 * Tests — Page de connexion (LoginPage.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Mocks
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

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

import LoginPage from "../pages/LoginPage";

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le titre Connexion", () => {
    renderLoginPage();
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("affiche les champs email et mot de passe", () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText("votre@email.fr")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("oriente vers les deux parcours d'inscription", () => {
    // Un seul lien « Faire une demande » obligeait le visiteur à choisir
    // son profil une fois la page ouverte ; les deux parcours sont
    // désormais annoncés dès la connexion.
    renderLoginPage();
    expect(screen.getByText("Devenir client")).toBeInTheDocument();
    expect(screen.getByText("devenir convoyeur")).toBeInTheDocument();
  });

  it("appelle login avec email et mot de passe", async () => {
    mockLogin.mockResolvedValueOnce({ role: "client", full_name: "Jean" });
    renderLoginPage();

    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "jean@test.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "Pass#1234");
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("jean@test.com", "Pass#1234");
    });
  });

  it("redirige vers /client pour un rôle client", async () => {
    mockLogin.mockResolvedValueOnce({ role: "client", full_name: "Jean" });
    renderLoginPage();

    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "jean@test.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "Pass#1234");
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/client");
    });
  });

  it("redirige vers /admin pour un rôle admin", async () => {
    mockLogin.mockResolvedValueOnce({ role: "admin", full_name: "Admin" });
    renderLoginPage();

    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "admin@test.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "Pass#1234");
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });
  });

  it("redirige vers /convoyeur pour un rôle convoyeur", async () => {
    mockLogin.mockResolvedValueOnce({
      role: "convoyeur",
      full_name: "Driver",
    });
    renderLoginPage();

    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "driver@test.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "Pass#1234");
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/convoyeur");
    });
  });

  it("affiche une erreur si login échoue", async () => {
    const toast = await import("react-hot-toast");
    mockLogin.mockRejectedValueOnce({
      response: { data: { error: "Identifiants incorrects." } },
    });
    renderLoginPage();

    await userEvent.type(
      screen.getByPlaceholderText("votre@email.fr"),
      "bad@test.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "Wrong#123");
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(toast.default.error).toHaveBeenCalledWith(
        "Identifiants incorrects.",
      );
    });
  });

  it("bascule la visibilité du mot de passe", async () => {
    renderLoginPage();
    const input = screen.getByPlaceholderText("••••••••");
    expect(input).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByRole("button", { name: "" }); // bouton œil
    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute("type", "password");
  });
});
