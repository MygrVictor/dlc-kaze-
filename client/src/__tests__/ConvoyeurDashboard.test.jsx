/**
 * Tests — Planning du convoyeur (ConvoyeurDashboard.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "conv-1",
      full_name: "Bob Convoy",
      role: "convoyeur",
      is_validated: true,
    },
    token: "fake-token",
  }),
}));

import ConvoyeurDashboard from "../pages/convoyeur/ConvoyeurDashboard";
import api from "../lib/api";

const missionsFixture = [
  {
    id: "m1",
    status: "ASSIGNEE",
    departure_address: "Paris, France",
    arrival_address: "Lyon, France",
    vehicle_brand: "BMW",
    vehicle_model: "Série 3",
    vehicle_plate: "AA-001-BB",
    price_convoyeur: 200,
    departure_date: "2026-06-01T08:00:00Z",
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "m2",
    status: "EN_COURS",
    departure_address: "Lyon, France",
    arrival_address: "Marseille, France",
    vehicle_brand: "Audi",
    vehicle_model: "A4",
    vehicle_plate: "CC-002-DD",
    price_convoyeur: 300,
    departure_date: "2026-06-02T08:00:00Z",
    created_at: "2026-05-02T10:00:00Z",
  },
];

function renderConvoyeurDashboard() {
  return render(
    <MemoryRouter>
      <ConvoyeurDashboard />
    </MemoryRouter>,
  );
}

describe("ConvoyeurDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { missions: missionsFixture } });
  });

  it("affiche le titre Mon planning", async () => {
    renderConvoyeurDashboard();
    await waitFor(() =>
      expect(screen.getByText("Mon planning")).toBeInTheDocument(),
    );
  });

  it("appelle /convoyeur/missions au chargement", async () => {
    renderConvoyeurDashboard();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/convoyeur/missions"),
    );
  });

  it("affiche les missions assignées", async () => {
    renderConvoyeurDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/Paris, France/).length).toBeGreaterThan(0);
    });
  });

  it("affiche les compteurs de missions", async () => {
    renderConvoyeurDashboard();
    await waitFor(() => {
      // 1 ASSIGNEE + 1 EN_COURS
      expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    });
  });

  it("affiche un message si aucune mission assignée", async () => {
    // Le tableau de bord enchaîne plusieurs appels — missions, compteur,
    // état du dossier. `mockResolvedValueOnce` ne couvrirait que le
    // premier, et la liste retomberait sur la valeur par défaut.
    api.get.mockResolvedValue({ data: { missions: [] } });
    renderConvoyeurDashboard();
    await waitFor(() =>
      expect(screen.getByText("Aucune mission attribuée")).toBeInTheDocument(),
    );
  });
});
