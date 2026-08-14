/**
 * Tests — Tableau de bord Client (ClientDashboard.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: { get: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import ClientDashboard from "../pages/client/ClientDashboard";
import api from "../lib/api";

const missionsFixture = [
  {
    id: "m1",
    status: "EN_ATTENTE_DE_COTATION",
    departure_address: "Paris, France",
    arrival_address: "Lyon, France",
    vehicle_brand: "Peugeot",
    vehicle_model: "308",
    vehicle_plate: "AB-123-CD",
    price: null,
    created_at: "2026-01-01T10:00:00Z",
    departure_date: "2026-02-01T10:00:00Z",
  },
  {
    id: "m2",
    status: "ASSIGNEE",
    departure_address: "Bordeaux, France",
    arrival_address: "Toulouse, France",
    vehicle_brand: "Renault",
    vehicle_model: "Clio",
    vehicle_plate: "CD-789-EF",
    price: 280,
    created_at: "2026-01-02T10:00:00Z",
    departure_date: "2026-02-02T10:00:00Z",
  },
];

function renderClientDashboard() {
  return render(
    <MemoryRouter>
      <ClientDashboard />
    </MemoryRouter>,
  );
}

describe("ClientDashboard — compte validé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "c1",
        full_name: "Jean Client",
        role: "client",
        is_validated: true,
      },
      token: "fake-token",
    });
    api.get.mockResolvedValue({ data: { missions: missionsFixture } });
  });

  it("affiche le titre Mes missions", async () => {
    renderClientDashboard();
    await waitFor(() =>
      expect(screen.getByText("Mes missions")).toBeInTheDocument(),
    );
  });

  it("affiche le lien Nouvelle mission", async () => {
    renderClientDashboard();
    await waitFor(() =>
      expect(screen.getByText("Nouvelle mission")).toBeInTheDocument(),
    );
  });

  it("charge et affiche les missions du client", async () => {
    renderClientDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Paris, France/)).toBeInTheDocument();
      expect(screen.getByText(/Bordeaux, France/)).toBeInTheDocument();
    });
  });

  it("appelle /missions/mes-missions au chargement", async () => {
    renderClientDashboard();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/missions/mes-missions"),
    );
  });

  it("affiche un état vide si aucune mission", async () => {
    api.get.mockResolvedValueOnce({ data: { missions: [] } });
    renderClientDashboard();
    await waitFor(() =>
      expect(screen.getByText(/aucune mission/i)).toBeInTheDocument(),
    );
  });
});

describe("ClientDashboard — compte non validé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "c2",
        full_name: "Paul Pending",
        role: "client",
        is_validated: false,
      },
      token: "fake-token",
    });
  });

  it("affiche le message compte en attente de validation", () => {
    renderClientDashboard();
    expect(
      screen.getByText("Compte en attente de validation"),
    ).toBeInTheDocument();
  });

  it("affiche le message compte non validé sans afficher les missions", () => {
    renderClientDashboard();
    // Le rendu conditionnel retourne le message d'attente
    expect(
      screen.getByText("Compte en attente de validation"),
    ).toBeInTheDocument();
    // La liste des missions n'est pas rendue
    expect(screen.queryByText("Mes missions")).not.toBeInTheDocument();
  });
});
