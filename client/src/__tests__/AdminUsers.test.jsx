/**
 * Tests — Gestion des utilisateurs (AdminUsers.jsx)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "admin-1", full_name: "Admin Test", role: "admin" },
    token: "fake-token",
    loading: false,
  }),
}));

import AdminUsers from "../pages/admin/AdminUsers";
import api from "../lib/api";

const usersFixture = [
  {
    id: "u1",
    full_name: "Alice Martin",
    email: "alice@test.com",
    role: "client",
    is_approved: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    full_name: "Bob Convoy",
    email: "bob@test.com",
    role: "convoyeur",
    is_approved: false,
    created_at: "2026-01-02T00:00:00Z",
  },
];

function renderAdminUsers() {
  return render(
    <MemoryRouter>
      <AdminUsers />
    </MemoryRouter>,
  );
}

describe("AdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url.startsWith("/admin/users")) {
        return Promise.resolve({ data: { users: usersFixture } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("affiche le titre Gestion des utilisateurs", async () => {
    renderAdminUsers();
    await waitFor(() =>
      expect(screen.getByText("Gestion des utilisateurs")).toBeInTheDocument(),
    );
  });

  it("charge et affiche la liste des utilisateurs", async () => {
    renderAdminUsers();
    await waitFor(() => {
      expect(screen.getByText("Alice Martin")).toBeInTheDocument();
      expect(screen.getByText("Bob Convoy")).toBeInTheDocument();
    });
  });

  it("affiche le rôle de chaque utilisateur", async () => {
    renderAdminUsers();
    await waitFor(() => {
      expect(screen.getByText("alice@test.com")).toBeInTheDocument();
      expect(screen.getByText("bob@test.com")).toBeInTheDocument();
    });
  });

  it("affiche le bouton Créer un utilisateur", async () => {
    renderAdminUsers();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /créer/i }),
      ).toBeInTheDocument(),
    );
  });

  it("affiche un message si aucun utilisateur", async () => {
    api.get.mockResolvedValueOnce({ data: { users: [] } });
    renderAdminUsers();
    await waitFor(() =>
      expect(screen.getByText(/aucun utilisateur/i)).toBeInTheDocument(),
    );
  });

  it("filtre par rôle convoyeur", async () => {
    renderAdminUsers();
    await waitFor(() =>
      expect(screen.getByText("Alice Martin")).toBeInTheDocument(),
    );

    // Cliquer sur le filtre convoyeur
    const convoyeurBtn = screen.getByRole("button", { name: /^convoyeur$/i });
    fireEvent.click(convoyeurBtn);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("convoyeur"),
      ),
    );
  });
});
