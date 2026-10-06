# Tableau — Transit des informations mission (Client ↔ Convoyeur)

Date de génération : 02/10/2026

## 1) Données mission : qui voit quoi, et à quel moment

| Donnée                                              | Avant prise de mission (annonce dispo)     | Après assignation / prise                       | À la livraison               | Risque confidentialité    |
| --------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ---------------------------- | ------------------------- |
| Marque / modèle véhicule                            | Convoyeurs du salon Telegram               | Convoyeur assigné + client + admin              | idem                         | Faible                    |
| Plaque d’immatriculation                            | Non diffusée dans annonce Telegram         | Convoyeur assigné + client + admin              | idem                         | Moyen (PII véhicule)      |
| VIN                                                 | Non                                        | Convoyeur assigné + client + admin (si présent) | idem                         | Élevé                     |
| Adresse départ                                      | Convoyeurs du salon Telegram               | Convoyeur assigné + client + admin              | idem                         | Élevé                     |
| Adresse arrivée                                     | Convoyeurs du salon Telegram               | Convoyeur assigné + client + admin              | idem                         | Élevé                     |
| Date de mission                                     | Convoyeurs du salon Telegram (si dispo)    | Convoyeur assigné + client + admin              | idem                         | Moyen                     |
| Contact départ (nom/tel/email)                      | Non en annonce publique                    | Convoyeur assigné + client + admin              | idem                         | Élevé                     |
| Contact arrivée (nom/tel/email)                     | Non en annonce publique                    | Convoyeur assigné + client + admin              | idem                         | Élevé                     |
| Consignes mission (`comments`)                      | Non en annonce Telegram                    | Client + admin (non exposé convoyeur)           | idem                         | Moyen/Élevé selon contenu |
| Consignes internes convoyeur (`convoyeur_comments`) | Non en annonce publique                    | Convoyeur assigné + admin                       | idem                         | Moyen                     |
| Prix facturé client                                 | Non dans annonce Telegram                  | Client + admin                                  | idem                         | Moyen                     |
| Rémunération convoyeur (`price_convoyeur`)          | Affichée en annonce Telegram               | Convoyeur + admin                               | idem                         | Moyen                     |
| Statut mission                                      | Convoyeurs (annonce dispo) + client espace | Convoyeur + client + admin                      | synchro Kaze/webhook         | Faible                    |
| Récap fin mission / pièces livraisons               | Non                                        | Non                                             | Client + admin (import Kaze) | Élevé                     |

## 2) Flux de transit Client ↔ Convoyeur (canaux)

| Flux                           | Source                               | Destinataire               | Canal                        | Contrôle existant                         |
| ------------------------------ | ------------------------------------ | -------------------------- | ---------------------------- | ----------------------------------------- |
| Mission disponible (bourse)    | Système (après acceptation/création) | Convoyeurs du groupe       | Telegram bot                 | Plaque masquée                            |
| Détail mission attribuée       | Backend                              | Convoyeur assigné          | API interne authentifiée     | RBAC + contrôle d’affectation             |
| Suivi statut (en cours/livrée) | Kaze / backend                       | Client + convoyeur + admin | API interne + webhook Kaze   | Signature webhook en prod                 |
| Coordonnées opérationnelles    | Client (saisie mission)              | Convoyeur assigné          | API interne (détail mission) | Non exposé en annonce publique            |
| Documents de fin de mission    | Kaze                                 | Client/admin               | Import backend               | Pas de diffusion convoyeurs non concernés |

## 3) Règles de confidentialité déjà appliquées

- Pas d’email d’assignation convoyeur envoyé au client.
- Les annonces Telegram n’exposent pas la plaque.
- Les convoyeurs reçoivent les consignes `convoyeur_comments`, pas les `comments` client.
- Les uploads sont protégés par authentification + contrôle d’accès propriétaire/rôle.
- Cloisonnement strict par rôle (`client`, `convoyeur`, `admin`) et attribution mission.

## 4) Point d’attention

Le salon Telegram des missions disponibles diffuse à tous les convoyeurs du salon :

- adresse de départ,
- adresse d’arrivée,
- type de véhicule,
- rémunération,
- date (si présente).

Ce flux n’est pas public internet, mais il est collectif (pas limité au seul convoyeur final).
