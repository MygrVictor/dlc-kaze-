import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useSondage from "../lib/useSondage";

/**
 * Le sondage périodique représentait l'essentiel du trafic de l'API. Ces
 * tests verrouillent les deux garanties qui le rendent supportable : il
 * s'arrête quand personne ne regarde, et il rattrape son retard au retour.
 */

// `visibilityState` est en lecture seule : on le pilote par un accesseur.
let visibilite = "visible";

const changerVisibilite = (valeur) => {
  visibilite = valeur;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useSondage", () => {
  beforeEach(() => {
    visibilite = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilite,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("appelle le rappel à chaque période tant que l'onglet est visible", () => {
    const rappel = vi.fn();
    renderHook(() => useSondage(rappel, 60000));

    expect(rappel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180000);
    expect(rappel).toHaveBeenCalledTimes(3);
  });

  it("cesse d'interroger le serveur quand l'onglet passe en arrière-plan", () => {
    const rappel = vi.fn();
    renderHook(() => useSondage(rappel, 60000));

    vi.advanceTimersByTime(60000);
    expect(rappel).toHaveBeenCalledTimes(1);

    changerVisibilite("hidden");
    vi.advanceTimersByTime(600000);
    expect(rappel).toHaveBeenCalledTimes(1);
  });

  it("rafraîchit immédiatement au retour sur l'onglet", () => {
    const rappel = vi.fn();
    renderHook(() => useSondage(rappel, 60000));

    changerVisibilite("hidden");
    vi.advanceTimersByTime(600000);
    rappel.mockClear();

    changerVisibilite("visible");
    // Pas d'attente : l'utilisateur voit des données fraîches tout de suite.
    expect(rappel).toHaveBeenCalledTimes(1);
  });

  it("ne démarre rien lorsqu'il est désactivé", () => {
    const rappel = vi.fn();
    renderHook(() => useSondage(rappel, 60000, false));

    vi.advanceTimersByTime(600000);
    expect(rappel).not.toHaveBeenCalled();
  });

  it("libère le minuteur au démontage", () => {
    const rappel = vi.fn();
    const { unmount } = renderHook(() => useSondage(rappel, 60000));

    unmount();
    vi.advanceTimersByTime(600000);
    expect(rappel).not.toHaveBeenCalled();
  });
});
