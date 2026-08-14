/**
 * Tests — Nouvelle mission Client (NewMission.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "c1",
      full_name: "Jean Client",
      role: "client",
      is_validated: true,
    },
    token: "fake-token",
  }),
}));

import NewMission from "../pages/client/NewMission";
import api from "../lib/api";

function renderNewMission() {
  return render(
    <MemoryRouter>
      <NewMission />
    </MemoryRouter>,
  );
}

describe("NewMission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: { count: 1 } });
  });

  it("affiche le titre Nouvelle mission", () => {
    renderNewMission();
    expect(screen.getByText("Nouvelle mission")).toBeInTheDocument();
  });

  it("affiche le champ plaque d'immatriculation", () => {
    renderNewMission();
    expect(screen.getByPlaceholderText("HK-988-CG")).toBeInTheDocument();
  });

  it("affiche les champs d'adresse en cliquant sur l'\u00e9tape D\u00e9part", async () => {
    renderNewMission();
    await userEvent.type(screen.getByPlaceholderText("HK-988-CG"), "AA-001-BB");
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/28 RUE DES PILIERS/i),
      ).toBeInTheDocument(),
    );
  });

  it("affiche les champs de livraison en cliquant sur l'\u00e9tape Livraison", async () => {
    renderNewMission();
    await userEvent.type(screen.getByPlaceholderText("HK-988-CG"), "AA-001-BB");
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() => screen.getByPlaceholderText(/28 RUE DES PILIERS/i));
    await userEvent.type(
      screen.getByPlaceholderText(/28 RUE DES PILIERS/i),
      "Paris",
    );
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/84 RUE CLEMENT ADER/i),
      ).toBeInTheDocument(),
    );
  });

  it("affiche le bouton Ajouter un véhicule", () => {
    renderNewMission();
    expect(
      screen.getByRole("button", { name: /ajouter un véhicule/i }),
    ).toBeInTheDocument();
  });

  it("ajoute un second véhicule en cliquant sur le bouton", async () => {
    renderNewMission();
    const addBtn = screen.getByRole("button", { name: /ajouter un véhicule/i });
    fireEvent.click(addBtn);
    await waitFor(() => {
      const plates = screen.getAllByPlaceholderText("HK-988-CG");
      expect(plates.length).toBe(2);
    });
  });

  it("soumet le formulaire apr\u00e8s avoir rempli les \u00e9tapes", async () => {
    renderNewMission();
    await userEvent.type(screen.getByPlaceholderText("HK-988-CG"), "AA-001-BB");
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() => screen.getByPlaceholderText(/28 RUE DES PILIERS/i));
    await userEvent.type(
      screen.getByPlaceholderText(/28 RUE DES PILIERS/i),
      "Paris",
    );
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() => screen.getByPlaceholderText(/84 RUE CLEMENT ADER/i));
    await userEvent.type(
      screen.getByPlaceholderText(/84 RUE CLEMENT ADER/i),
      "Lyon",
    );
    // Étape Services / Rétribution / Urgence
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() => screen.getByText(/gestion documentaire/i));
    // Étape Observations
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));
    await waitFor(() =>
      screen.getByRole("button", { name: /envoyer la demande/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /envoyer la demande/i }),
    );
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/missions", expect.any(Object));
    });
  });
});
