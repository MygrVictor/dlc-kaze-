# Logos des partenaires

Les fichiers de ce dossier alimentent le bandeau « Ils nous font confiance »
affiché sous le hero de la page d'accueil.

## Fichiers attendus

| Enseigne               | Nom du fichier      |
| ---------------------- | ------------------- |
| GRDF                   | `grdf.png`          |
| EQUANS                 | `equans.png`        |
| Groupe GCA             | `gca.png`           |
| Groupe 2L Logistics    | `2l-logistics.png`  |
| La Coopérative Welcoop | `welcoop.png`       |
| Land Rover             | `land-rover.png`    |
| Altacama               | `altacama.png`      |
| Saga Mercedes          | `saga-mercedes.png` |
| By My Car              | `by-my-car.png`     |
| Cristalens             | `cristalens.png`    |

Tant qu'un fichier est absent, le composant `LogoClient` affiche le nom de
l'enseigne en toutes lettres : le bandeau reste donc présentable même
partiellement fourni, et l'on peut ajouter les logos au fil de l'eau.

## Format

- **PNG à fond transparent** (ou SVG, en adaptant l'extension dans
  `BandeauClients.jsx`).
- Hauteur utile de **80 à 120 px**, largeur libre. Les cartes du bandeau
  mesurent 200 px de large : un logo trop étroit paraîtra perdu, un logo
  trop large sera réduit.
- Éviter les marges blanches intégrées à l'image : la carte fournit déjà
  son propre espacement.
- Poids conseillé sous 40 Ko par fichier.

## Ajouter un partenaire

1. Déposer le logo ici, en minuscules et avec des tirets.
2. Ajouter une entrée dans le tableau `CLIENTS` de
   `client/src/components/BandeauClients.jsx`.

## Droit à l'image

Un logo de client ne s'affiche qu'avec son accord. Avant publication,
s'assurer que chaque enseigne listée a bien autorisé la mention de son nom
et l'usage de sa marque à des fins de référence commerciale.
