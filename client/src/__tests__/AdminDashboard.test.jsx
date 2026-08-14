/**
 * Tests — Tableau de bord Admin (AdminDashboard.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────────────
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

import AdminDashboard from "../pages/admin/AdminDashboard";
import api from "../lib/api";

const statsFixture = {
  data: {
    stats: {
      total: 10,
      en_attente_de_cotation: 3,
      devis_propose: 2,
      acceptee: 1,
      assignee: 1,
      en_cours: 1,
      livree: 1,
      annulee: 1,
    },
    recentMissions: [],
  },
};

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>,
  );
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === "/admin/stats") return Promise.resolve(statsFixture);
      if (url === "/admin/missions")
        return Promise.resolve({ data: { missions: [] } });
      if (url === "/admin/kaze/jobs")
        return Promise.resolve({ data: { data: [] } });
      if (url === "/admin/kaze/users")
        return Promise.resolve({ data: { data: [] } });
      if (url === "/admin/kaze/health") return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
  });

  it("affiche le titre Tableau de bord", async () => {
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByText("Tableau de bord")).toBeInTheDocument(),
    );
  });

  it("appelle l'API /admin/stats au chargement", async () => {
    renderAdmin();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/stats"));
  });

  it("affiche un état de chargement initial", () => {
    api.get.mockImplementation(() => new Promise(() => {})); // jamais résolu
    renderAdmin();
    // Un spinner ou texte de chargement doit être présent
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("affiche le tableau de bord après chargement des données", async () => {
    renderAdmin();
    // Le chargement se termine et le titre reste visible
    await waitFor(() =>
      expect(screen.getByText("Tableau de bord")).toBeInTheDocument(),
    );
    // Les appels API ont été effectués
    expect(api.get).toHaveBeenCalledWith("/admin/stats");
  });
});
