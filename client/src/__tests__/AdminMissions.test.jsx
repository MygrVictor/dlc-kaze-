/**
 * Tests — Gestion des missions Admin (AdminMissions.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    user: { id: "admin-1", full_name: "Admin Test", role: "admin" },
    token: "fake-token",
    loading: false,
  }),
}));

import AdminMissions from "../pages/admin/AdminMissions";
import api from "../lib/api";

const missionsFixture = [
  {
    id: "m1",
    source: "dlc",
    status: "EN_ATTENTE_DE_COTATION",
    departure_address: "Paris, France",
    arrival_address: "Lyon, France",
    client_name: "Jean Dupont",
    client_email: "jean@test.com",
    vehicle_brand: "Peugeot",
    vehicle_model: "308",
    vehicle_plate: "AB-123-CD",
    price: null,
    price_convoyeur: null,
    convoyeur_name: null,
    created_at: "2026-01-01T10:00:00Z",
    departure_date: "2026-02-01T10:00:00Z",
  },
  {
    id: "m2",
    source: "dlc",
    status: "ASSIGNEE",
    departure_address: "Marseille, France",
    arrival_address: "Nice, France",
    client_name: "Marie Curie",
    client_email: "marie@test.com",
    vehicle_brand: "Renault",
    vehicle_model: "Clio",
    vehicle_plate: "EF-456-GH",
    price: 350,
    price_convoyeur: 200,
    convoyeur_name: "Bob Convoy",
    created_at: "2026-01-02T10:00:00Z",
    departure_date: "2026-02-02T10:00:00Z",
  },
];

function renderAdminMissions() {
  return render(
    <MemoryRouter>
      <AdminMissions />
    </MemoryRouter>,
  );
}

describe("AdminMissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url.startsWith("/admin/missions")) {
        return Promise.resolve({ data: { missions: missionsFixture } });
      }
      if (url.startsWith("/admin/kaze/jobs")) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("affiche le titre Gestion des missions", async () => {
    renderAdminMissions();
    await waitFor(() =>
      expect(screen.getByText("Gestion des missions")).toBeInTheDocument(),
    );
  });

  it("charge et affiche les missions", async () => {
    renderAdminMissions();
    await waitFor(() => {
      expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
      expect(screen.getByText("Marie Curie")).toBeInTheDocument();
    });
  });

  it("affiche le trajet de chaque mission", async () => {
    renderAdminMissions();
    await waitFor(() => {
      expect(screen.getByText(/Paris, France/)).toBeInTheDocument();
      expect(screen.getByText(/Marseille, France/)).toBeInTheDocument();
    });
  });

  it("affiche le bouton Coter pour les missions EN_ATTENTE_DE_COTATION", async () => {
    renderAdminMissions();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /coter/i }),
      ).toBeInTheDocument(),
    );
  });

  it("affiche le convoyeur assigné", async () => {
    renderAdminMissions();
    await waitFor(() =>
      expect(screen.getByText("Bob Convoy")).toBeInTheDocument(),
    );
  });

  it("affiche le bouton Export CSV", async () => {
    renderAdminMissions();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /export csv/i }),
      ).toBeInTheDocument(),
    );
  });

  it("affiche les filtres de statut", async () => {
    renderAdminMissions();
    await waitFor(() => {
      const boutonsToutes = screen.getAllByRole("button", { name: /toutes/i });
      expect(boutonsToutes.length).toBeGreaterThan(0);
    });
  });

  it("ouvre la modale de cotation en cliquant sur Coter", async () => {
    renderAdminMissions();
    await waitFor(() => screen.getByRole("button", { name: /coter/i }));
    fireEvent.click(screen.getByRole("button", { name: /coter/i }));
    await waitFor(() =>
      expect(screen.getByText("Coter la mission")).toBeInTheDocument(),
    );
  });

  it("affiche un message si aucune mission", async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith("/admin/missions")) {
        return Promise.resolve({ data: { missions: [] } });
      }
      if (url.startsWith("/admin/kaze/jobs")) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    renderAdminMissions();
    await waitFor(() =>
      expect(screen.getByText(/aucune mission trouvée/i)).toBeInTheDocument(),
    );
  });
});
