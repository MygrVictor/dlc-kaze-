/**
 * Tests — Missions disponibles (MissionsDisponibles.jsx)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

import MissionsDisponibles from "../pages/convoyeur/MissionsDisponibles";
import api from "../lib/api";

const missionsFixture = [
  {
    id: "m1",
    status: "ACCEPTEE",
    departure_address: "Nantes, France",
    arrival_address: "Rennes, France",
    vehicle_brand: "Citroën",
    vehicle_model: "C3",
    vehicle_plate: "ZZ-999-AA",
    price_convoyeur: 180,
    departure_date: "2026-07-01T08:00:00Z",
    created_at: "2026-06-01T10:00:00Z",
    client_name: "Entreprise Test",
    distance_km: 110,
  },
  {
    id: "m2",
    status: "ACCEPTEE",
    departure_address: "Bordeaux, France",
    arrival_address: "Toulouse, France",
    vehicle_brand: "Volkswagen",
    vehicle_model: "Golf",
    vehicle_plate: "BB-111-CC",
    price_convoyeur: 250,
    departure_date: "2026-07-02T08:00:00Z",
    created_at: "2026-06-02T10:00:00Z",
    client_name: "Autre Société",
    distance_km: 245,
  },
];

function renderMissionsDisponibles() {
  return render(
    <MemoryRouter>
      <MissionsDisponibles />
    </MemoryRouter>,
  );
}

describe("MissionsDisponibles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { missions: missionsFixture } });
  });

  it("affiche le titre Missions disponibles", async () => {
    renderMissionsDisponibles();
    await waitFor(() =>
      expect(screen.getByText("Missions disponibles")).toBeInTheDocument(),
    );
  });

  it("appelle /convoyeur/missions-disponibles au chargement", async () => {
    renderMissionsDisponibles();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/convoyeur/missions-disponibles"),
    );
  });

  it("affiche les missions disponibles", async () => {
    renderMissionsDisponibles();
    await waitFor(() => {
      expect(screen.getByText(/Nantes, France/)).toBeInTheDocument();
      expect(screen.getByText(/Bordeaux, France/)).toBeInTheDocument();
    });
  });

  it("affiche les boutons Prendre cette mission", async () => {
    renderMissionsDisponibles();
    await waitFor(() => {
      const btnList = screen.getAllByText(/prendre cette mission/i);
      expect(btnList.length).toBe(2);
    });
  });

  it("affiche un message si aucune mission disponible", async () => {
    api.get.mockResolvedValueOnce({ data: { missions: [] } });
    renderMissionsDisponibles();
    await waitFor(() =>
      expect(
        screen.getByText(/aucune mission disponible/i),
      ).toBeInTheDocument(),
    );
  });

  it("prend une mission en cliquant sur le bouton", async () => {
    // window.confirm doit retourner true
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.post.mockResolvedValueOnce({ data: {} });

    renderMissionsDisponibles();
    await waitFor(() => screen.getAllByText(/prendre cette mission/i));

    fireEvent.click(screen.getAllByText(/prendre cette mission/i)[0]);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/convoyeur/missions/m1/prendre"),
    );
  });
});
