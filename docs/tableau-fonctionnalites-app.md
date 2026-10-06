# Tableau des fonctionnalités — Drive Line Connect

Date : 02/10/2026

## Vue complète par rôle

| Domaine                | Admin                                                                    | Client                                                       | Convoyeur                                                    |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Authentification       | Connexion, déconnexion, reset mot de passe utilisateurs                  | Connexion, déconnexion, mot de passe oublié/réinitialisation | Connexion, déconnexion, mot de passe oublié/réinitialisation |
| Dashboard              | KPIs, suivi activité, accès modules                                      | Vue synthèse de ses missions                                 | Planning et missions disponibles                             |
| Création de mission    | Oui (formulaire admin/client)                                            | Oui                                                          | Non                                                          |
| Lecture des missions   | Toutes les missions (filtres, exports, carte)                            | Ses missions (périmètre autorisé)                            | Missions assignées + détails opérationnels                   |
| Cotation / devis       | Propose prix client + prix convoyeur                                     | Reçoit, accepte/refuse devis                                 | Non                                                          |
| Assignation convoyeur  | Assigner, réassigner, retirer                                            | Non                                                          | Prendre mission disponible (auto-attribution)                |
| Exécution mission      | Pilotage global                                                          | Suivi statut                                                 | Prendre mission, suivi exécution via Kaze                    |
| Statuts mission        | Modifier / annuler / synchroniser Kaze                                   | Consulter + annuler selon règles                             | Démarrage/livraison opérés dans Kaze, remontés par sync      |
| Devis PDF              | Supervision                                                              | Téléchargement (nom serveur, numérotation incrémentale)      | Non                                                          |
| Facturation            | Déposer facture, changer statut (émise/payée/annulée)                    | Voir/télécharger                                             | Voir/télécharger                                             |
| Utilisateurs           | Créer, valider, supprimer, lier Kaze, reset mdp, rattacher parent/enfant | Gestion de son compte                                        | Gestion profil, téléphone, liaison Kaze                      |
| Documents convoyeur    | Valider/refuser dossiers                                                 | Non                                                          | Déposer/remplacer/supprimer docs                             |
| Recaps de fin mission  | Consultation                                                             | Consultation                                                 | Non                                                          |
| Intégration Kaze       | Santé, test, jobs, users, invoices, sync                                 | Indirect (devis acceptés envoyés Kaze)                       | Liaison compte + visibilité planning                         |
| Notifications Email    | Notifications métier (comptes, demandes, devis)                          | Reçoit emails métier (hors assignation convoyeur)            | Reçoit notifications selon parcours dossier                  |
| Notifications Telegram | Pilotage annonces missions                                               | Non                                                          | Reçoit annonces missions disponibles                         |
| Analyse / exports      | Analyse + export CSV                                                     | Non                                                          | Non                                                          |
| API partenaire         | Supervision flux partenaires                                             | Non                                                          | Non                                                          |

## Parcours fonctionnel résumé

| Étape | Action                   | Acteur principal   | Résultat                                                      |
| ----- | ------------------------ | ------------------ | ------------------------------------------------------------- |
| 1     | Création demande mission | Client / Admin     | Mission créée (en attente de cotation ou acceptée selon rôle) |
| 2     | Cotation                 | Admin              | Devis proposé au client                                       |
| 3     | Décision devis           | Client             | Accepté (passe en exécution) ou refusé                        |
| 4     | Publication convoyeurs   | Système            | Annonce mission disponible (Telegram)                         |
| 5     | Prise de mission         | Convoyeur          | Mission assignée                                              |
| 6     | Exécution                | Convoyeur via Kaze | Statuts synchronisés localement                               |
| 7     | Livraison                | Kaze → webhook     | Mission livrée + import récap                                 |
| 8     | Facturation              | Admin              | Facture déposée et suivie                                     |

## Règles de confidentialité déjà appliquées

| Sujet                                           | Règle appliquée                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| Commentaires client `comments`                  | Non exposés aux convoyeurs                           |
| Commentaires opérationnels `convoyeur_comments` | Visibles convoyeur assigné + admin                   |
| Assignation convoyeur                           | Plus d'email envoyé au client                        |
| Données visibles en mission dispo               | Plaque masquée dans annonce Telegram                 |
| Accès documents uploadés                        | Contrôle authentification + droits propriétaire/rôle |
| Cloisonnement des données                       | RBAC + périmètre par rôle/mission                    |
