import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import CrispChat from "../components/CrispChat";

/**
 * Deux garanties comptent ici : ne rien charger sans configuration, et
 * n'injecter le script qu'une seule fois quelle que soit la navigation.
 * Le reste (l'apparence du widget) appartient à Crisp.
 */
const CLIENT = {
  email: "client@test.fr",
  full_name: "Marie Client",
  phone: "0600000000",
};

beforeEach(() => {
  document.getElementById("crisp-script")?.remove();
  delete window.$crisp;
  delete window.CRISP_WEBSITE_ID;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CrispChat", () => {
  it("ne charge rien sans identifiant configuré", () => {
    vi.stubEnv("VITE_CRISP_WEBSITE_ID", "");
    render(<CrispChat user={CLIENT} />);

    expect(document.getElementById("crisp-script")).toBeNull();
    expect(window.$crisp).toBeUndefined();
  });

  it("injecte le script et renseigne l'identité du client", () => {
    vi.stubEnv("VITE_CRISP_WEBSITE_ID", "abc-123");
    render(<CrispChat user={CLIENT} />);

    expect(document.getElementById("crisp-script")).not.toBeNull();
    expect(window.CRISP_WEBSITE_ID).toBe("abc-123");

    const actions = JSON.stringify(window.$crisp);
    expect(actions).toContain("client@test.fr");
    expect(actions).toContain("Marie Client");
  });

  it("n'injecte le script qu'une fois, même après plusieurs montages", () => {
    vi.stubEnv("VITE_CRISP_WEBSITE_ID", "abc-123");
    render(<CrispChat user={CLIENT} />);
    render(<CrispChat user={CLIENT} />);

    expect(document.querySelectorAll("#crisp-script")).toHaveLength(1);
  });

  it("masque le widget quand on quitte l'espace client", () => {
    vi.stubEnv("VITE_CRISP_WEBSITE_ID", "abc-123");
    const { unmount } = render(<CrispChat user={CLIENT} />);
    unmount();

    expect(JSON.stringify(window.$crisp)).toContain("chat:hide");
  });
});
