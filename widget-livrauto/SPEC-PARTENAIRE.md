# Spécification — Compte partenaire et widget Livr'Auto

Branche : `feature/partenaire-interencheres`
Statut : **prototype isolé** dans `widget-livrauto/`. Aucune modification de
`server/` ni de `client/` tant que la jonction n'est pas décidée.

---

## 1. Objectif

Permettre à un partenaire (premier cas : **Interenchères**) d'afficher sur ses
fiches de lots un widget **Livr'Auto** (marque blanche de Drive Line Connect)
grâce auquel l'acheteur :

1. estime le prix du convoyage ;
2. renseigne ses coordonnées de livraison ;
3. signe les conditions générales ;
4. paie par Stripe ;

et dont la mission est ensuite **créée automatiquement, sans cotation**, puis
envoyée à Kaze comme une mission ordinaire.

---

## 2. Acteurs

| Acteur                         | Rôle                                                         | A un compte ?            |
| ------------------------------ | ------------------------------------------------------------ | ------------------------ |
| **Partenaire** (Interenchères) | Apporteur d'affaires, rattachement des missions, rétribution | Oui — rôle `partenaire`  |
| **Acheteur**                   | Contact de livraison et payeur                               | **Non**                  |
| **Maison de ventes**           | Contact d'enlèvement                                         | Non (données dans l'URL) |
| **Drive Line Connect**         | Encaisse (Stripe), exécute, rembourse                        | Admin                    |
| **Convoyeur**                  | Inchangé (via Kaze)                                          | Inchangé                 |

---

## 3. Différences avec un compte client

|                        | Compte client (existant) | Compte partenaire                                   |
| ---------------------- | ------------------------ | --------------------------------------------------- |
| Création de mission    | Formulaire client        | Webhook Stripe après paiement                       |
| Prix                   | Fixé par l'admin         | Grille automatique                                  |
| Statut initial         | `EN_ATTENTE_DE_COTATION` | **`ACCEPTEE`**                                      |
| Devis / acceptation    | Oui                      | Aucun                                               |
| Paiement               | Process actuel           | Stripe Checkout, **avant** création                 |
| Contacts               | Ceux du compte           | Enlèvement = maison de ventes, livraison = acheteur |
| Emails de suivi        | Client                   | Acheteur                                            |
| Connexion              | Dashboard client         | **Espace partenaire en lecture seule**              |
| Routes `/api/missions` | Autorisées               | **Interdites**                                      |

Tout ce qui suit `ACCEPTEE` (Kaze, convoyeur, webhooks Kaze, `EN_COURS` →
`LIVREE`) est **inchangé**.

---

## 4. Intégration chez le partenaire

Même format que leur widget transport existant (Cocolis) : une **iframe dans
une modale**, paramètres du lot dans l'URL. Aucune clé secrète dans l'URL.

```
https://<domaine>/widget/?partnerName=Interencheres
  &externalId=89125902
  &fromName=HDVM+Hôtel+Des+Ventes+Mazzella
  &fromStreet=44+Boulevard+Fifi+Turin&fromPostcode=13010&fromCity=Marseille
  &fromCountryAlpha2=FR&fromLat=43.280944&fromLng=5.4126604
  &fromPhone=04+91+32+39+00&fromEmail=contact%40hdvm.fr
  &insuranceValue=25000
```

| Paramètre                                | Obligatoire | Usage                                       |
| ---------------------------------------- | ----------- | ------------------------------------------- |
| `partnerName`                            | oui         | Doit correspondre à un `partner_code` actif |
| `externalId`                             | oui         | N° de lot → `missions.partner_reference`    |
| `fromStreet`, `fromPostcode`, `fromCity` | oui         | Adresse d'enlèvement                        |
| `fromLat`, `fromLng`                     | recommandé  | Évite le géocodage du départ                |
| `fromName`, `fromPhone`, `fromEmail`     | recommandé  | Contact d'enlèvement                        |
| `insuranceValue`                         | non         | Valeur assurée                              |
| `context=adjudication`                   | non         | Affiche « Enchère remportée »               |

**Messages `postMessage` vers la page parente**

| Type              | Données                   | Usage                          |
| ----------------- | ------------------------- | ------------------------------ |
| `livrauto:resize` | `height`                  | Ajuster la hauteur de l'iframe |
| `livrauto:order`  | `missionId`, `externalId` | Commande payée                 |
| `livrauto:close`  | —                         | Fermer la modale               |

**Sécurité de l'iframe** : `frame-ancestors` limité aux domaines du partenaire,
uniquement sur `/widget`. Le reste du site garde `X-Frame-Options: DENY`.

---

## 5. Parcours acheteur

```
1. Estimation      adresse de livraison → distance + prix TTC indicatif
2. Coordonnées     prénom, nom, téléphone, email, adresse confirmée
                   → devis définitif (quote_id, valable 30 jours)
3. Récapitulatif   vérification + signature des CGV
                   → bouton « Payer » débloqué
4. Paiement        redirection Stripe Checkout (hors iframe)
5. Retour          écran « Paiement confirmé » → « Retour à Interenchères »
```

**Stripe Checkout refuse l'iframe** : la page de paiement s'ouvre dans un
nouvel onglet ou en pleine page (`window.top`). `success_url` et
`cancel_url` ramènent vers le widget avec le `session_id`.

---

## 6. Création de la mission

Déclenchée **uniquement** par le webhook Stripe `checkout.session.completed`
(signature vérifiée). Jamais par le retour navigateur, falsifiable.

```
Webhook Stripe
  → retrouver la commande en attente (metadata.order_id)
  → idempotence : si déjà traitée, ne rien faire
  → créer la mission :
       client_id          = compte partenaire
       source             = 'widget'
       status             = 'ACCEPTEE'
       price              = prix HT figé du devis
       partner_commission = calculée et figée
  → marquer le devis consommé
  → envoyer à Kaze (service existant)
  → email de confirmation à l'acheteur
```

---

## 7. Modèle de données (jonction — migrations additives uniquement)

Toutes les nouvelles colonnes sont **nullables** : les comptes et missions
existants ne sont pas modifiés.

**`user_role`** : ajout de la valeur `partenaire`.

**`users`**

| Colonne            | Type           | Description                                  |
| ------------------ | -------------- | -------------------------------------------- |
| `partner_code`     | VARCHAR UNIQUE | ex. `interencheres`                          |
| `partner_active`   | BOOLEAN        | Désactive le widget sans supprimer le compte |
| `commission_type`  | VARCHAR        | `pourcentage` ou `fixe`                      |
| `commission_value` | NUMERIC(10,2)  | ex. `10` (%) ou `20` (€)                     |
| `frame_ancestors`  | TEXT           | Domaines autorisés à afficher l'iframe       |

**`missions`**

| Colonne                             | Type                    | Description                 |
| ----------------------------------- | ----------------------- | --------------------------- |
| `source`                            | VARCHAR DEFAULT `'app'` | `app` ou `widget`           |
| `partner_reference`                 | VARCHAR                 | N° de lot                   |
| `pickup_contact_name/phone/email`   | VARCHAR                 | Maison de ventes            |
| `delivery_contact_name/phone/email` | VARCHAR                 | Acheteur                    |
| `insured_value`                     | NUMERIC(10,2)           | `insuranceValue`            |
| `signature_ref`                     | VARCHAR                 | Preuve de signature des CGV |
| `signed_at`                         | TIMESTAMPTZ             |                             |
| `stripe_session_id`                 | VARCHAR UNIQUE          | Idempotence du webhook      |
| `paid_at`                           | TIMESTAMPTZ             |                             |
| `price_ttc`                         | NUMERIC(10,2)           | Montant encaissé            |
| `partner_commission`                | NUMERIC(10,2)           | Figée au paiement           |
| `commission_status`                 | VARCHAR                 | `a_facturer` puis `versee`  |

**Nouvelle table `partner_orders`** (commande en attente de paiement)

`id`, `partner_id`, `quote_id`, `partner_reference`, contacts,
`signature_ref`, `signed_at`, `stripe_session_id`, `status`
(`en_attente_paiement` / `payee` / `expiree`), `mission_id`, `created_at`.

---

## 8. Rétribution du partenaire

```
pourcentage : commission = prix HT × commission_value / 100
fixe        : commission = commission_value
```

- Figée sur la mission au moment du paiement : un changement de taux ne
  modifie pas l'historique.
- Comptabilisée uniquement sur les missions **livrées** ; une mission annulée
  ou remboursée passe à 0.
- Période mensuelle, statut `a_facturer` puis `versee`.

---

## 9. Espace partenaire (lecture seule)

Connexion autorisée pour le rôle `partenaire`, uniquement vers ses routes.

| Route                                     | Contenu                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `GET /api/partenaire/stats`               | Livraisons (mois, cumul, par statut), CA, rétribution |
| `GET /api/partenaire/missions`            | Lot, date, trajet (villes), statut, TTC, rétribution  |
| `GET /api/partenaire/export?mois=2026-11` | CSV mensuel                                           |

**Le partenaire ne voit pas** : nom, téléphone, email et adresse complète de
l'acheteur, prix convoyeur, missions hors widget.

---

## 10. API publique du widget

| Route                          | Rate limit       | Rôle                                         |
| ------------------------------ | ---------------- | -------------------------------------------- |
| `POST /api/widget/estimation`  | 60 / 15 min / IP | Calcule et stocke un devis                   |
| `POST /api/widget/commande`    | 10 / h / IP      | Crée la commande en attente + session Stripe |
| `GET /api/widget/commande/:id` | 60 / 15 min / IP | Statut après retour Stripe                   |

Règles :

- aucune clé API côté navigateur ; partenaire vérifié par `partner_code` actif ;
- le prix n'est **jamais** envoyé par le navigateur : seul le `quote_id` l'est ;
- les réponses ne contiennent ni prix convoyeur ni détail de grille.

---

## 11. Plan de développement

| Étape | Contenu                                                                           | Où                 | Statut           |
| ----- | --------------------------------------------------------------------------------- | ------------------ | ---------------- |
| 1     | Widget : 4 écrans des maquettes, iframe en modale, fausse page Interenchères      | `widget-livrauto/` | ✅               |
| 2     | Commandes au format « mission partenaire » (contacts séparés, source, commission) | `widget-livrauto/` | ✅               |
| 3     | Signature CGV simulée → débloque le paiement                                      | `widget-livrauto/` | ✅               |
| 4     | Stripe Checkout **mode test** + webhook local + écran « Paiement confirmé »       | `widget-livrauto/` | à faire          |
| 5     | Démo espace partenaire (stats, rétribution, CSV)                                  | `widget-livrauto/` | à faire          |
| 6     | Jonction : migrations additives, rôle `partenaire`                                | `server/`          | après validation |
| 7     | Jonction : service de création automatique + envoi Kaze                           | `server/`          | après validation |
| 8     | Jonction : espace partenaire dans le client                                       | `client/`          | après validation |

---

## 12. Questions ouvertes (RDV Interenchères)

1. Rétribution : pourcentage ou fixe ? Sur le HT ou le TTC ?
2. Ouverture Stripe : nouvel onglet ou pleine page ? URL de retour souhaitée ?
3. Widget affiché sur tous les lots ou seulement la catégorie véhicules ?
4. Combien d'utilisateurs pour l'espace partenaire ?
5. Export mensuel suffisant, ou webhook vers leurs outils ?
6. Qui émet la facture de commission ?
7. RGPD : répartition des responsabilités sur les données de l'acheteur.
8. Domaines exacts à autoriser (`frame-ancestors`) et environnement de recette.
