/**
 * Tests — Champ d'adresse avec autocomplétion (ChampAdresse.jsx)
 *
 * L'enjeu de ces tests n'est pas l'affichage de la liste, mais les
 * garde-fous : une adresse non reconnue ne doit jamais bloquer la
 * saisie, et une panne de la Base Adresse Nationale doit laisser un
 * champ texte utilisable. Un formulaire de convoyage qui refuse une
 * adresse de dépôt serait pire que pas d'autocomplétion du tout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import ChampAdresse from "../components/ChampAdresse";

/** Réponse de la BAN au format GeoJSON, réduite aux champs utilisés. */
const reponseBan = (adresses) => ({
  ok: true,
  json: async () => ({
    features: adresses.map((a, i) => ({
      properties: {
        id: `ban-${i}`,
        label: a.label,
        name: a.name,
        postcode: a.postcode,
        city: a.city,
      },
    })),
  }),
});

/** Enveloppe contrôlée : le composant ne gère pas son propre état. */
function Hote({ initial = "" } = {}) {
  const [valeur, setValeur] = useState(initial);
  return (
    <ChampAdresse
      value={valeur}
      onChange={setValeur}
      placeholder="Adresse de test"
    />
  );
}

describe("ChampAdresse", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propose les adresses renvoyées par la Base Adresse Nationale", async () => {
    global.fetch.mockResolvedValue(
      reponseBan([
        {
          label: "12 Rue de Paris 69002 Lyon",
          name: "12 Rue de Paris",
          postcode: "69002",
          city: "Lyon",
        },
      ]),
    );

    const utilisateur = userEvent.setup();
    render(<Hote />);

    await utilisateur.type(screen.getByRole("combobox"), "12 rue de Paris");

    expect(await screen.findByText("12 Rue de Paris")).toBeInTheDocument();
    expect(screen.getByText("69002 Lyon")).toBeInTheDocument();
  });

  it("renseigne le champ en majuscules lorsqu'une proposition est retenue", async () => {
    global.fetch.mockResolvedValue(
      reponseBan([
        {
          label: "12 Rue de Paris 69002 Lyon",
          name: "12 Rue de Paris",
          postcode: "69002",
          city: "Lyon",
        },
      ]),
    );

    const utilisateur = userEvent.setup();
    render(<Hote />);

    const champ = screen.getByRole("combobox");
    await utilisateur.type(champ, "12 rue de Paris");
    await utilisateur.click(await screen.findByText("12 Rue de Paris"));

    // Les adresses sont stockées en majuscules dans le reste de
    // l'application : une casse hétérogène en base compliquerait les
    // rapprochements et le cache de géocodage.
    expect(champ).toHaveValue("12 RUE DE PARIS 69002 LYON");
    expect(await screen.findByText("Adresse vérifiée")).toBeInTheDocument();
  });

  it("signale une adresse inconnue sans empêcher de la conserver", async () => {
    global.fetch.mockResolvedValue(reponseBan([]));

    const utilisateur = userEvent.setup();
    render(<Hote />);

    const champ = screen.getByRole("combobox");
    await utilisateur.type(champ, "Dépôt interne zone nord");

    expect(await screen.findByText(/Adresse non reconnue/)).toBeInTheDocument();
    // Le point essentiel : la saisie reste intacte et exploitable.
    expect(champ).toHaveValue("Dépôt interne zone nord");
    expect(champ).not.toBeDisabled();
  });

  it("reste un champ texte utilisable si la BAN est injoignable", async () => {
    global.fetch.mockRejectedValue(new Error("réseau indisponible"));

    const utilisateur = userEvent.setup();
    render(<Hote />);

    const champ = screen.getByRole("combobox");
    await utilisateur.type(champ, "12 rue de Paris");

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(champ).toHaveValue("12 rue de Paris");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("n'interroge pas la BAN sous trois caractères", async () => {
    const utilisateur = userEvent.setup();
    render(<Hote />);

    await utilisateur.type(screen.getByRole("combobox"), "12");

    // Sous ce seuil, la BAN ne renvoie que du bruit : autant s'épargner
    // la requête.
    await new Promise((r) => setTimeout(r, 400));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("permet de retenir une adresse au clavier seul", async () => {
    global.fetch.mockResolvedValue(
      reponseBan([
        {
          label: "1 Rue A 75001 Paris",
          name: "1 Rue A",
          postcode: "75001",
          city: "Paris",
        },
        {
          label: "2 Rue B 75002 Paris",
          name: "2 Rue B",
          postcode: "75002",
          city: "Paris",
        },
      ]),
    );

    const utilisateur = userEvent.setup();
    render(<Hote />);

    const champ = screen.getByRole("combobox");
    await utilisateur.type(champ, "rue");
    await screen.findByText("1 Rue A");

    await utilisateur.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(champ).toHaveValue("2 RUE B 75002 PARIS");
  });

  it("groupe les frappes en une seule requête", async () => {
    global.fetch.mockResolvedValue(reponseBan([]));

    const utilisateur = userEvent.setup();
    render(<Hote />);

    await utilisateur.type(screen.getByRole("combobox"), "12 rue de Paris");

    // Une requête par caractère saturerait un service public gratuit.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls.length).toBeLessThan(3);
  });
});
