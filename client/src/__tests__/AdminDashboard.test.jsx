/**
 * Tests — Tableau de bord Admin (AdminDashboard.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
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

  it("affiche une mission Kaze dans « Dernières missions » sans erreur", async () => {
    // Régression : KAZE_STATUS_COLORS / KAZE_STATUS_LABELS étaient définis
    // dans un autre composant. Toute ligne Kaze de la liste « Dernières
    // missions » levait une ReferenceError au dépliage — invisible tant
    // qu'aucun job Kaze n'était affiché, fatale dès le premier.
    api.get.mockImplementation((url) => {
      if (url === "/admin/stats") return Promise.resolve(statsFixture);
      if (url === "/admin/missions")
        return Promise.resolve({ data: { missions: [] } });
      if (url === "/admin/kaze/jobs")
        return Promise.resolve({
          data: {
            data: [
              {
                kaze_job_id: "kaze-1",
                kaze_reference: "KZ-4242",
                kaze_status: "waiting",
                status: "waiting",
                departure_address: "1 rue de la Gare, 69001 Lyon",
                performer_name: "Paul Convoyeur",
                created_at: "2026-11-01T10:00:00Z",
              },
            ],
          },
        });
      return Promise.resolve({ data: { data: [] } });
    });

    renderAdmin();

    // L'accordéon est replié par défaut : la liste n'est construite qu'au
    // dépliage, c'est là que la ReferenceError se produisait.
    fireEvent.click(
      await screen.findByRole("button", { name: /dernières missions/i }),
    );

    const lignes = await screen.findAllByText(/KZ-4242/);
    expect(lignes.length).toBeGreaterThan(0);
  });

  it("un seul bouton active ou coupe Telegram et les notifications ensemble", async () => {
    const reglages = {
      "/admin/parametres/telegram": true,
      "/admin/parametres/notifications": true,
    };
    const getParDefaut = api.get.getMockImplementation();
    api.get.mockImplementation((url) =>
      url in reglages
        ? Promise.resolve({ data: { annoncesActives: reglages[url] } })
        : getParDefaut(url),
    );
    api.put.mockImplementation((url, corps) =>
      Promise.resolve({ data: { annoncesActives: corps.annoncesActives } }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderAdmin();
    const bouton = await screen.findByRole("button", { name: /annonces on/i });
    expect(screen.queryByRole("button", { name: /telegram on/i })).toBeNull();

    fireEvent.click(bouton);

    await screen.findByRole("button", { name: /annonces off/i });
    expect(api.put).toHaveBeenCalledWith("/admin/parametres/telegram", {
      annoncesActives: false,
    });
    expect(api.put).toHaveBeenCalledWith("/admin/parametres/notifications", {
      annoncesActives: false,
    });
  });

  it("signale des canaux désalignés et les réactive tous les deux", async () => {
    const getParDefaut = api.get.getMockImplementation();
    api.get.mockImplementation((url) => {
      if (url === "/admin/parametres/telegram")
        return Promise.resolve({ data: { annoncesActives: true } });
      if (url === "/admin/parametres/notifications")
        return Promise.resolve({ data: { annoncesActives: false } });
      return getParDefaut(url);
    });
    api.put.mockImplementation((url, corps) =>
      Promise.resolve({ data: { annoncesActives: corps.annoncesActives } }),
    );

    renderAdmin();
    fireEvent.click(
      await screen.findByRole("button", { name: /annonces partiel/i }),
    );

    await screen.findByRole("button", { name: /annonces on/i });
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put).toHaveBeenCalledWith("/admin/parametres/notifications", {
      annoncesActives: true,
    });
  });
});
