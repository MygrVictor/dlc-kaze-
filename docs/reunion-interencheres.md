# Réunion Interenchères — points à arbitrer

**Date :** 25 août 2026
**Présents :** PDG, commercial, webmaster
**Objet :** décisions nécessaires avant rédaction du cahier des charges

---

## Avant-propos — ce qui existe déjà

L'API partenaire est **développée mais jamais éprouvée en conditions réelles**. Deux appels :

| Appel                     | Fonction                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `POST /partner/devis`     | Deux adresses en entrée, un prix et un numéro de devis en sortie |
| `POST /partner/commandes` | Transforme un devis en mission, crée le compte client au passage |

Chaque partenaire dispose de sa propre clé d'accès. La mission créée rejoint le circuit habituel : Kaze, convoyeur, suivi, récapitulatif.

Le code est couvert par des tests automatiques, mais ceux-ci simulent la base de données et le calcul tarifaire. **Aucune commande réelle n'est jamais allée jusqu'au bout de la chaîne** — voir §12 pour le détail de ce qui reste à vérifier.

**Le travail restant n'est pas du développement, ce sont des décisions puis une recette.** Les valeurs actuellement dans le code sont des valeurs de démarrage posées faute d'arbitrage. Ce document liste ce qu'il faut trancher.

---

## 1. La grille tarifaire

### La grille DLC — **validée le 25/08**

**Forfait court trajet : 0 – 143 km → 200 €**

Au-delà de 143 km, le prix kilométrique s'applique **à la totalité de la distance** (pas de cumul par paliers).

**Véhicules légers (VL)**

| Distance      | Prix au km      |
| ------------- | --------------- |
| 0 – 143 km    | _forfait 200 €_ |
| 143 – 200 km  | 1,40 €          |
| 200 – 300 km  | 1,22 €          |
| 300 – 400 km  | 1,14 €          |
| 400 – 500 km  | 1,10 €          |
| 500 – 600 km  | 1,08 €          |
| 600 – 700 km  | 1,02 €          |
| 700 – 800 km  | 0,98 €          |
| 800 – 1000 km | 0,92 €          |
| 1000 km et +  | 0,90 €          |

**Le forfait s'arrête exactement au point de croisement** : à 143 km, `143 × 1,40` = 200,20 €. Le raccordement est continu — aucune perte à la jonction.

### Décisions actées

| Point             | Décision                                                         |
| ----------------- | ---------------------------------------------------------------- |
| Mode de calcul    | **Tarif unique sur toute la distance**, pas de cumul par paliers |
| Forfait           | 200 € jusqu'à 143 km, puis tarif kilométrique                    |
| Écarts aux seuils | **Assumés** — rarement pénalisants en pratique                   |

> **Pourquoi les écarts sont assumés.** Avec un tarif unique appliqué à toute la distance, dégressivité forte et continuité parfaite sont arithmétiquement incompatibles : chaque seuil n'autorise qu'une baisse de 0,5 %, alors que la grille descend de 1,40 € à 0,90 €. Lisser les seuils imposerait de renoncer à la dégressivité et de facturer 70 € de plus sur un Paris-Marseille. Le choix est de rester compétitif sur les longues distances.

**Véhicules utilitaires légers (VUL)** — _à réviser dans le même esprit_

| Distance     | Prix au km |
| ------------ | ---------- |
| 0 – 200 km   | 1,70 €     |
| 200 – 300 km | 1,40 €     |
| 300 – 400 km | 1,32 €     |
| 400 – 600 km | 1,25 €     |
| 600 – 800 km | 1,13 €     |
| 800 km et +  | 1,05 €     |

> ⚠️ **La grille VUL n'a pas été révisée.** Elle conserve 6 tranches quand les VL en ont 10, et aucun forfait court trajet n'y est défini. Faut-il le même découpage, et quel montant de forfait ? À 1,70 €/km, un forfait de 200 € serait rejoint dès 118 km.

### Écart avec ce qui est codé

La grille actuellement dans le système est une **valeur de démarrage inventée**, sans rapport avec celle-ci.

|                        | Grille réelle              | Grille codée            |
| ---------------------- | -------------------------- | ----------------------- |
| Court trajet           | **forfait 200 €** ≤ 140 km | prix fixe + km dès 0 km |
| Tranches kilométriques | 10 (VL)                    | 4                       |
| Gabarits               | VL / VUL, deux grilles     | coefficients ×1 à ×1,35 |

Sur 50 km : **200 €** avec la vraie grille, contre 165 € avec celle codée.

**Le paramétrage est à refaire entièrement** — une demi-journée, sans difficulté technique.

### Exemple — Angers → Bordeaux, VL

| Étape              | Calcul                      | Valeur       |
| ------------------ | --------------------------- | ------------ |
| Distance retenue   | 274 km × 1,22 (voir §3)     | 334 km       |
| Tranche            | 300 – 400 km                | 1,14 €/km    |
| **Prix client HT** | 334 × 1,14                  | **380,76 €** |
| Part convoyeur     | × 0,70 _(taux à confirmer)_ | 266,53 €     |
| **Marge DLC**      |                             | **114,23 €** |

> Attention à ne pas confondre : **1,22** est à la fois le prix au km de la tranche 200-300 et le coefficient de majoration routière du §3. Aucun rapport entre les deux.

### ▶ Questions

**1.1** Le prix au km est-il **tout compris** ?

> **Réponse connue : oui.** Aucun forfait de prise en charge ne s'ajoute au prix kilométrique.

**1.2** Existe-t-il un minimum de facturation ?

> **Réponse connue : oui, un forfait de 200 € jusqu'à 140 km.** Un trajet de 30 km est bien facturé 200 €, pas 42 €.

**1.2 bis** Comment se raccorde le forfait au tarif kilométrique ?

> **Résolu par la grille du 25/08.** Le forfait s'arrête à 140 km, presque exactement là où `distance × 1,40` atteint 200 € (soit 143 km).
>
> | Distance | Prix            |
> | -------- | --------------- |
> | 140 km   | 200 € (forfait) |
> | 141 km   | 197,40 €        |
>
> Reste **2,60 €** de discontinuité, contre 59 € dans la version précédente. Négligeable, mais techniquement toujours décroissant. Deux options :
>
> - **laisser tel quel** — personne ne le remarquera
> - **étendre le forfait à 143 km** — raccordement parfaitement continu
>
> ▶ **Un devis de 197 € après un forfait annoncé à 200 € peut-il gêner ?**

**1.3** Le tarif de la tranche s'applique-t-il à **toute la distance**, ou par paliers cumulés ?

> Exemple sur 350 km. Toute la distance : `350 × 1,14` = **399 €**. Par paliers : `200×1,40 + 100×1,22 + 50×1,14` = **459 €**. Écart de 60 € sur une seule mission.

**1.4** « Tout compris » inclut-il les **péages, le carburant et le retour du convoyeur** ?

> **Réponse connue : oui.** Les convoyeurs sont auto-entrepreneurs. DLC verse un forfait unique, péages inclus, et ne prend pas en charge leur retour — c'est leur affaire.
>
> **Conséquence favorable pour le calcul :** le prix ne dépend d'aucun frais variable. Pas de justificatifs à collecter, pas de régularisation après mission, pas d'écart entre le devis et la facture. C'est ce qui rend la cotation automatique possible.
>
> **Point de vigilance opérationnel** — sans incidence sur les comptes, mais réel : sur une destination mal desservie, le retour peut coûter au convoyeur davantage que sa rémunération. Il refusera la mission. Financièrement neutre pour DLC, mais la mission reste sans preneur, et c'est Interenchères qui constate le délai. À surveiller sur les longues distances vers des zones isolées (§9).
> mettre une possibilité de changer la cotation convoyeur si personne n'accepte ?

**1.5** Le prix affiché est-il le **prix client** ou la **rémunération convoyeur** ?

**1.6** Quelle part revient au convoyeur ? on part sur un pourcentage fixe ? ou on acccept ela mission mais on la met en attente de cotation pour le convoyeur ? (logique metier differente de l'application).

**1.7** Faut-il un tarif préférentiel pour Interenchères, ou la même grille que les clients directs ?

---

## 2. Effet de seuil dans la grille — **arbitré**

Le tarif s'appliquant à toute la distance, un kilomètre de plus fait _baisser_ le prix à chaque changement de tranche.

| Seuil   | Juste avant         | Juste après            | Écart        |
| ------- | ------------------- | ---------------------- | ------------ |
| 143 km  | forfait = 200 €     | 144 × 1,40 = 201,60 €  | **+1,60 €**  |
| 200 km  | 200 × 1,40 = 280 €  | 201 × 1,22 = 245,22 €  | **−34,78 €** |
| 300 km  | 300 × 1,22 = 366 €  | 301 × 1,14 = 343,14 €  | −22,86 €     |
| 400 km  | 400 × 1,14 = 456 €  | 401 × 1,10 = 441,10 €  | −14,90 €     |
| 500 km  | 500 × 1,10 = 550 €  | 501 × 1,08 = 541,08 €  | −8,92 €      |
| 600 km  | 600 × 1,08 = 648 €  | 601 × 1,02 = 613,02 €  | **−34,98 €** |
| 700 km  | 700 × 1,02 = 714 €  | 701 × 0,98 = 686,98 €  | −27,02 €     |
| 800 km  | 800 × 0,98 = 784 €  | 801 × 0,92 = 736,92 €  | **−47,08 €** |
| 1000 km | 1000 × 0,92 = 920 € | 1001 × 0,90 = 900,90 € | −19,10 €     |

**Le seuil du forfait est désormais croissant** : porté de 140 à 143 km, la jonction gagne 1,60 € au lieu d'en perdre 2,60.

**Les huit autres seuils restent décroissants**, de 9 à 47 €.

### Décision : écarts assumés

> **Pourquoi on ne cherche pas à les corriger.**
>
> Avec un tarif unique appliqué à toute la distance, la continuité impose que chaque tarif ne baisse que de `S/(S+1)` au seuil — soit environ **0,5 %**. Sur huit seuils, on ne pourrait descendre que de 1,40 € à 1,35 €. Or la grille va jusqu'à 0,90 €, une baisse de 36 %, **douze fois supérieure** à ce que la continuité autorise.
>
> Déplacer les bornes n'y change rien : l'écart croît avec la distance. Pour annuler la rupture entre 1,40 € et 1,22 €, il faudrait placer le seuil à 7 km.
>
> Lisser la grille supposerait de renoncer à la dégressivité : +70 € sur un Paris-Marseille, +130 € à 1000 km. **Le choix est de rester compétitif sur les longues distances.**
>
> Ces écarts sont sans conséquence pratique : personne ne commande deux convoyages distants d'un kilomètre pour comparer.

### ▶ Point restant

**2.1** Si Interenchères relève l'anomalie, quelle réponse apporte-t-on ? Une note dans le contrat d'interface précisant que la grille est dégressive par tranches suffit généralement.

**2.3** Le forfait s'arrête à 140 km alors que le point de croisement exact est à 143 km. **Faut-il l'aligner sur 143** pour une continuité parfaite, ou 140 est-il un chiffre rond volontairement choisi ?



## 3. Mesure de la distance

Le système ne calcule pas d'itinéraire routier. Il prend la distance à vol d'oiseau et la multiplie par **1,22**.

**Ce que ça implique :** sur un trajet contraint — contournement d'un massif, d'un estuaire — l'estimation sera trop basse. Sur autoroute rectiligne, trop haute. L'écart se compense sur le volume, jamais sur une mission isolée.

Un vrai calcul d'itinéraire est possible mais suppose un service payant.

### ▶ Questions

**3.1** Cette approximation est-elle acceptable commercialement ?

**3.2** Sinon, quel budget mensuel pour un service de calcul d'itinéraire ?
OpenRouteService 2000 requete/jour avant d'etre payant

**3.3** Y a-t-il des trajets récurrents où l'écart serait manifestement gênant ?

---

## 4. Périmètre géographique

### ▶ Questions

**4.1** Accepte-t-on toutes les destinations en France métropolitaine, ou définit-on une zone ?

**4.2** Corse, DOM-TOM : dans le périmètre ou refusés d'office ?

**4.3** Étranger — Belgique, Suisse, Espagne : accepté ? Tarif spécifique ?

**4.4** Que répond le système à une demande hors zone : un refus, ou un renvoi vers un devis manuel ?

---

## 5. Validité d'un devis ?

Un devis est actuellement valable **30 jours**.

**Le risque :** un devis émis en janvier, commandé en février, sur une grille modifiée entre-temps. Le prix garanti est celui du devis, pas celui du jour.

### ▶ Questions

**5.1** 30 jours, est-ce le bon délai au regard du rythme des ventes aux enchères ?

**5.2** Combien de temps entre l'adjudication et la demande de convoyage, en pratique ?

---

## 6. Annulations et incidents

**Le sujet le plus coûteux, et le plus souvent oublié.**

### ▶ Questions

**6.1** L'acheteur annule **avant** qu'un convoyeur soit assigné. Facturé ou non ?

**6.2** L'acheteur annule **après** assignation, convoyeur déjà en route. Qui indemnise ? Combien ?

**6.3** Le véhicule n'est **pas disponible** au rendez-vous — pas prêt, clés introuvables, vendeur absent. Le déplacement est-il facturé ? À qui : Interenchères, le vendeur, l'acheteur ? PAV ??

**6.4** Le véhicule est **non roulant** alors qu'il était annoncé roulant. Refus sur place, facturation du déplacement ?

**6.5** **Dommage pendant le convoyage** : quelle assurance, quelle franchise, quel interlocuteur ?

**6.6** L'acheteur **conteste l'état** à la livraison. Le procès-verbal Kaze fait-il foi ? Qui arbitre ?

**6.7** Qui **répond au téléphone** quand l'acheteur appelle : Interenchères ou DLC ? Cela change tout le dimensionnement du support.

---

## 7. Facturation

### ▶ Questions

**7.1** Qui est facturé : Interenchères, ou l'acheteur final ?

**7.2** À l'unité, ou un relevé mensuel ?

**7.3** Quel délai de règlement ?

**7.4** Y a-t-il une commission d'apport pour Interenchères ? Si oui, quel taux, et est-elle déduite ou facturée à part ?

**7.5** Prépaiement exigé, ou paiement après livraison ?

---

## 8. Engagements de service

Un partenaire de cette taille demandera des engagements écrits.

### ▶ Questions

**8.1** Sous quel délai s'engage-t-on à prendre en charge une mission après commande ?

**8.2** Quel délai de livraison annonce-t-on selon la distance ?

**8.3** Que se passe-t-il si le délai n'est pas tenu — pénalité, geste commercial, rien ?

**8.4** Quels horaires de support : jours ouvrés, samedi, urgences ?

**8.5** Un volume maximum quotidien est-il annoncé ? Que fait-on au-delà ?

---

## 9. Capacité opérationnelle

**Question de fond, indépendante de la technique.**

Le convoyage n'étant proposé qu'aux acheteurs adjudicataires, le volume se calcule :

```
missions attendues = ventes remportées par jour × taux de prise du convoyage
```

Il suffit donc de deux chiffres pour dimensionner. Interenchères connaît le premier ; le second, ils l'estiment probablement d'après leurs autres prestataires.

### ▶ Questions

**9.1** Combien de convoyeurs actifs aujourd'hui ?

**9.2** Combien de missions par jour peut-on absorber sans dégrader le service ?

**9.3** Combien de ventes Interenchères conclut-il par jour, et quelle part des acheteurs prend un convoyage ?

**9.4** Le volume est-il régulier, ou concentré après les ventes ? Une vente qui se clôture le vendredi peut produire trente demandes le même jour.

**9.5** Y a-t-il une saisonnalité connue ?

**9.6** Si le volume dépasse la capacité : on refuse, on allonge les délais, on recrute ?

**9.7** Sous quel délai peut-on doubler le nombre de convoyeurs ?

**9.8** Combien de candidats en moyenne par lot ? — l'estimation étant ouverte à tous les inscrits (§10.3), ce chiffre détermine la charge technique, sans rapport avec le nombre de missions.

> **Deux volumes à ne pas confondre.**
>
> |                       | Détermine                                              |
> | --------------------- | ------------------------------------------------------ |
> | Estimations demandées | la charge du serveur et le coût du calcul d'itinéraire |
> | Missions commandées   | le besoin en convoyeurs                                |
>
> Le premier reste supérieur au second, mais dans un rapport maîtrisé : l'estimation se déclenche sur clic explicite (§10.3), pas à l'affichage d'une annonce. Seuls les candidats réellement intéressés par un convoyage appellent l'API.

> **Point de vigilance sur la géographie.** Les ventes aux enchères sont concentrées sur quelques sites (à identifier). Si les véhicules partent tous du même dépôt vers toute la France, le retour du convoyeur n'est pas un coût pour DLC (§1.4) — mais il reste un frein à l'acceptation. Sur une destination mal desservie, le convoyeur qui doit financer son retour refusera. La mission n'est pas perdue financièrement, elle reste simplement sans preneur, et c'est le délai qu'Interenchères constatera.

---

## 10. Sens de l'intégration

**À vérifier auprès d'Interenchères avant toute rédaction. Détermine la nature même du document.**

### ▶ Questions

**10.1** Est-ce Interenchères qui appelle notre API, ou nous qui appelons la leur ?
ils appelelent la notre normalement

**10.2** Ont-ils un format d'échange imposé auquel les prestataires doivent se conformer ?

**10.3** À quel moment le convoyage intervient : après adjudication ?

> **Réponse connue : deux moments distincts, à ne pas confondre.**
>
> **1. Estimation avant la vente — sur clic, pour tout inscrit.**
>
> Notre formulaire est intégré dans la page Interenchères. Le parcours :
>
> 1. Le candidat consulte un lot et cherche comment le faire transporter
> 2. L'adresse de **départ est déjà connue** — Interenchères la fournit, c'est le lieu du véhicule
> 3. Le candidat saisit uniquement son **adresse d'arrivée**
> 4. Il clique sur « Calculer mon prix »
> 5. Le prix s'affiche
>
> **2. Commande après adjudication et paiement.**
> Seul l'acheteur ayant remporté le lot transforme l'estimation en mission réelle.
>
> ### Ce que ce parcours implique
>
> **Volume maîtrisé.** L'appel se déclenche sur clic explicite, pas à l'affichage de la page. Seuls les candidats réellement intéressés par un convoyage sollicitent l'API — le volume suit l'intention d'achat, pas le trafic du site.
>
> **Un seul champ à saisir.** L'adresse de départ vient d'Interenchères. À vérifier : sous quelle forme ? Une adresse complète bien formée, ou un libellé approximatif du type « Dépôt Rennes » ? La précision du prix en dépend directement.
>
> **Le point de départ se répète.** Tous les candidats d'un même lot — et de tous les lots d'une même vente — partent du même dépôt. Il n'existe que quelques dizaines de dépôts en France. **Le cache d'itinéraires sera très efficace**, probablement 80 à 90 % de réutilisation.
>
> **Temps de réponse.** L'utilisateur attend devant son écran après avoir cliqué. Viser **moins d'une seconde**, cache compris. Atteignable, mais suppose que le calcul d'itinéraire soit mis en cache dès le premier appel.
>
> **Le candidat n'est pas identifié.** Un inscrit qui compare n'est pas encore acheteur. L'estimation ne doit créer ni compte, ni mission, ni trace commerciale — juste un prix.
>
> ### ▶ Questions ouvertes
>
> **10.3a** L'estimation est-elle **ferme** (opposable si le candidat remporte le lot) ou **indicative** ?
>
> > Si elle est ferme, il faut la conserver et la retrouver à l'adjudication — potentiellement des semaines plus tard, sur une grille qui a pu changer (§5).
>
> **10.3b** Combien de temps entre l'estimation et l'adjudication, en pratique ?
>
> **10.3c** Faut-il **deux appels distincts** — une estimation légère non conservée, et un devis ferme après adjudication ? C'est ce que je recommande : cela évite de stocker des milliers de devis qui ne deviendront jamais des missions.
>
> **10.3d** Sous quelle forme Interenchères transmet-il l'adresse de départ ? Adresse postale complète, ou libellé de dépôt ?
>
> **10.3e** Le formulaire est-il **hébergé chez nous** (iframe, script intégré) ou **développé par eux** en appelant notre API ? Cela détermine qui maîtrise l'apparence et qui corrige en cas de problème d'affichage.

normalement tout se passe chez eux

**10.4** Ont-ils déjà d'autres prestataires de convoyage ? Sommes-nous en concurrence sur chaque mission ? normalement non
**10.5** Qui est notre interlocuteur technique chez eux ?

**10.6** Exigent-ils un environnement de test séparé (sous-domaine dédié), ou acceptent-ils une **clé bac à sable** sur l'API de production ? Voir §13.

**10.7** Leur intégration a-t-elle besoin de suivre l'avancement de la mission ?

> **Réponse connue : non.** Ils ont seulement besoin de savoir que la mission a été créée. Aucun retour de statut à construire, aucun webhook sortant. Simplification notable.

---

## 11. Environnement de test

### Le problème

Une variable `INTERENCHERES_API_KEY_SANDBOX` existe déjà dans le code, mais **elle est traitée exactement comme la clé de production**. Rien ne distingue les deux ensuite.

Donner cette clé telle quelle à Interenchères reviendrait à ce que leurs essais :

- créent de **vraies missions** chez Kaze
- annoncent de **vraies missions** aux convoyeurs sur Telegram
- déclenchent de **vrais emails**

Un développeur qui itère sur sa boucle enverrait vingt convoyeurs sur des véhicules imaginaires.

### Solution retenue : mode simulation

La clé bac à sable emprunte le même code, mais tout effet sur le monde extérieur est neutralisé.

| Ce qu'ils testent                    | Réel en bac à sable                    |
| ------------------------------------ | -------------------------------------- |
| Authentification, mauvaise clé → 401 | oui                                    |
| Validation des champs → 400          | oui                                    |
| Géocodage des adresses               | **oui** — vraie Base Adresse Nationale |
| Calcul du prix                       | **oui** — vraie grille, vrai montant   |
| Numéro de devis, expiration          | oui                                    |
| Devis expiré ou consommé → 404       | oui                                    |
| Enchaînement devis → commande        | oui                                    |
| Identifiant de mission retourné      | oui                                    |

Neutralisé : création chez Kaze, annonce Telegram, emails, visibilité dans l'exploitation.

Un appel `Angers → Bordeaux, berline` leur renvoie **378,92 € HT** — le vrai prix, calculé par le vrai code. La réponse est indistinguable d'un fonctionnement normal.

### Pourquoi pas un environnement séparé

Un sous-domaine dédié supposerait une seconde base, un second déploiement, un second jeu de variables — trois à quatre jours au lieu d'un. Surtout, **un environnement séparé dérive** : une variable oubliée, une migration non passée, et les essais valident un comportement qui n'existe pas en production.

### Point de vigilance

Le cloisonnement doit être étanche : les missions fictives doivent être exclues des listes, des statistiques, des exports, de la carte et de la facturation. Un oubli et des missions imaginaires entrent dans le chiffre d'affaires.

### ▶ Questions

**11.1** Un mode simulation sur l'API de production convient-il, ou faut-il un sous-domaine séparé ? (à confirmer avec Interenchères)

**11.2** Combien de temps la clé bac à sable reste-t-elle active après la mise en service ?

**11.3** Qui, chez nous, valide la recette avant ouverture ?

---

## 12. Paiement et encaissement

**Le convoyage étant proposé après paiement du véhicule, la question du flux financier devient centrale.**

### ▶ Questions

**12.1** L'acheteur règle-t-il le convoyage à Interenchères, qui nous reverse ? Ou nous paie-t-il directement ?

**12.2** Si Interenchères encaisse : sous quel délai reversent-ils ? Retiennent-ils une commission ?

**12.3** Le prix affiché à l'acheteur est-il notre prix, ou Interenchères applique-t-il sa propre marge par-dessus ?

> Ce point détermine si notre grille est un **prix de vente** ou un **prix de gros**. L'écart est considérable.

**12.4** Que se passe-t-il si l'acheteur paie le convoyage mais que la mission échoue ? Qui rembourse ?

**12.5** Le devis doit-il être garanti entre son affichage et le paiement ? Combien de temps ?

---

## 13. Décisions à prendre demain

Par ordre de blocage :

| Priorité | Sujet                                 | Sans cette réponse                        |
| -------- | ------------------------------------- | ----------------------------------------- |
| 1        | Prix de vente ou prix de gros (§12.3) | La grille n'a pas de sens                 |
| 2        | Grille tarifaire (§1)                 | Le calcul reste théorique                 |
| 3        | Annulations et incidents (§6)         | Risque financier non couvert              |
| 4        | Flux d'encaissement (§12)             | Pas de contrat possible                   |
| 5        | Capacité opérationnelle (§9)          | Engagement intenable                      |
| 6        | Format d'échange imposé (§10.2)       | Le cahier des charges peut être à refaire |

Le point 1 commande tous les autres : si Interenchères applique sa propre marge par-dessus notre prix, la grille actuelle est un tarif de gros et non un prix de vente. L'écart change tout l'équilibre économique.

Les points 1 à 5 sont **commerciaux**, non techniques. Une fois tranchés, le paramétrage est rapide : le code existe, il attend des valeurs.

**Mais il faudra ensuite compter deux à trois jours de recette** avant toute ouverture à Interenchères — l'API n'a jamais traité de commande réelle (§14) — **plus une journée** pour le mode bac à sable (§11).

---

## 14. État réel de l'existant

À signaler pour éviter d'y passer du temps — et pour ne rien promettre qui ne soit vérifié.

### Éprouvé en production

Ces éléments tournent tous les jours sur des missions réelles :

- **Le suivi est automatique** — Kaze pilote le convoyeur, les statuts remontent seuls
- **Le récapitulatif part seul** à la livraison : procès-verbal, photos, réserves
- **Les convoyeurs sont prévenus** automatiquement des missions disponibles
- **Les erreurs sont surveillées** — alerte immédiate en cas d'incident technique

### Écrit mais jamais exécuté en conditions réelles

**L'API partenaire n'a jamais reçu une seule requête réelle.**

Le code des deux appels est écrit et couvert par des tests automatiques. Mais ces tests simulent la base de données et le calcul tarifaire : ils vérifient que les routes réagissent correctement, pas qu'une commande aboutit à une mission chez Kaze.

Ce qui n'a **jamais** été fait :

| Non vérifié                                       | Risque                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| Un devis calculé sur de vraies adresses           | Le géocodage peut échouer sur des libellés inhabituels |
| Une commande allant jusqu'à la création chez Kaze | C'est l'enchaînement complet qui n'a jamais tourné     |
| Un compte client créé depuis l'API                | Doublons possibles si l'acheteur existe déjà           |
| Le comportement sous charge                       | Inconnu                                                |
| Une clé partenaire distribuée                     | Aucune n'a encore été émise                            |

**Estimation avant mise en service : deux à trois jours de recette**, une fois les décisions prises. Ce n'est pas du développement, c'est de la vérification — mais elle est indispensable.

### Formulation à retenir

Pour éviter tout malentendu avec Interenchères :

> « L'API est développée. Elle n'a pas encore été éprouvée en conditions réelles : il nous faut une phase de recette conjointe avant ouverture. »

Et non « l'API fonctionne ».

### Le geste manuel restant

Pour les clients directs, la cotation : deux à trois minutes par mission. Pour Interenchères, il disparaît puisque le prix est calculé automatiquement — **sous réserve que la grille soit validée** (§1).
