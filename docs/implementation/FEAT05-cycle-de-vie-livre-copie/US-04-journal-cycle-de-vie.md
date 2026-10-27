# US-04 — Journaliser le cycle de vie d'un livre et d'une copie

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Nature** | feature |
| **Dépend de** | [US-01](US-01-suppression-logique.md), [US-03](US-03-copie-perdue.md) |
| **Bloque** | US-05, la future vue d'analyse |
| **Portée** | db · back |
| **Casse l'existant ?** | Non — rien de ce qui est exposé ne change. Une écriture est ajoutée à chaque mutation. |

---

## Récit

**En tant qu'** administrateur
**je veux** qu'il reste une trace de tout ce qui est arrivé à un livre et à ses
exemplaires, y compris après leur suppression
**afin de** pouvoir répondre à « où est passé cet exemplaire ? » et « qui l'a
retiré du catalogue, et quand ? » autrement que de mémoire — et, plus tard,
de mesurer l'activité de la bibliothèque : livres les plus empruntés, élèves
qui lisent le plus, volume d'emprunts par mois.

## Contexte

Le projet a de l'**audit**, pas d'**historique**. Chaque table porte les quatre
colonnes de `Auditable` :

```java
// server/src/main/java/net/booksnap/domain/Auditable.java
@CreatedBy    protected String createdBy;
@CreatedDate  protected LocalDateTime createdDate;
@LastModifiedBy   protected String lastModifiedBy;
@LastModifiedDate protected LocalDateTime lastModifiedDate;
```

`last_modified_by` dit **qui en dernier**, et il est écrasé à chaque écriture.
Un exemplaire créé en 2024, déplacé deux fois de section, emprunté onze fois,
déclaré perdu puis retrouvé n'en garde qu'une ligne : le nom de la dernière
personne qui y a touché. Tout le reste est perdu au moment où il se produit.

L'audit nomme la personne par son **adresse e-mail**, délibérément :

```java
// server/src/main/java/net/booksnap/config/AuditorAwareImpl.java
// … these columns are plain traceability text, read straight out of psql …
// Never turn these columns into a foreign key to users (structural rules §8).
```

**Une partie des changements n'est jamais vue par le code Java.**
`copy.status` est écrit par cinq fonctions définies dans
`V1__baseline_schema.sql` :

```sql
CREATE FUNCTION public.fn_sync_copy_on_borrowing_insert() RETURNS trigger ...
BEGIN
    UPDATE copy SET status = 'borrowed' WHERE id = NEW.copy_id;
```

déclenchées par `trg_borrowing_insert`, `trg_borrowing_update`,
`trg_hold_insert` et `trg_hold_update`. Quand un emprunt passe une copie en
`borrowed`, **aucun service ne le sait** : il a inséré une ligne `borrowing`,
et la base a fait le reste. Le passage d'un emprunt en `overdue`, lui, est fait
par `OverdueBorrowingScheduler` au moyen d'un `UPDATE` en masse
(`BorrowingRepository.markOverdue`) qui contourne JPA.

**Les tables `borrowing` et `hold` gardent une partie de l'histoire, pas toute.**
Un emprunt y conserve sa copie, son élève, `start_date` et `end_date` (la date
d'échéance), mais pas sa date de retour : elle n'est approchable que par
`last_modified_date`, écrasée à la moindre écriture suivante.

**Ce journal sera la source de la future vue d'analyse.** Le bibliothécaire y
verra des graphiques — les livres les plus empruntés, les élèves qui empruntent
le plus, le nombre total d'emprunts, leur évolution dans le temps. Cette vue
n'est pas construite ici, mais le journal doit pouvoir la servir sans être
refait : il sera lu événement par événement (US-05, US-06) **et** en agrégat.

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Base | Aucune table d'événements. Les transitions de `copy.status` ne laissent aucune trace |
| Base | Les dates de retour d'emprunt ne sont stockées nulle part |
| Back | `last_modified_by` / `last_modified_date` écrasés à chaque écriture |
| Back | Les emprunts et réservations closes restent lisibles dans leurs propres tables, mais sans lien avec le reste de la vie de la copie |

Contraintes du projet :
[règles structurelles §5 et §8](../../business-rules/REGLES-METIER-STRUCTURE.md).

---

## Décisions et non-objectifs

- **Le journal est la seule source de l'historique ; l'analyse le lit, elle
  n'a pas de stockage à elle**
  ([D11](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Un
  graphique est une requête d'agrégation sur le journal. Rejeté : un stockage
  d'analyse séparé, qui dupliquerait les faits et finirait par diverger.
  Rejeté aussi : une analyse qui lirait `borrowing` et `hold` pour les emprunts
  et le journal pour le reste — deux sources, et chaque requête devrait savoir
  laquelle interroger.

- **Un journal en ajout seul, sans clé étrangère**
  ([D4](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Jamais
  modifié, jamais supprimé. L'absence de clé étrangère n'est pas une négligence :
  c'est ce qui fait survivre le journal à l'entité qu'il décrit, aujourd'hui à
  une suppression logique, demain à ce qu'on voudra.

- **Ce sur quoi l'on regroupe est une colonne ; ce que l'on affiche est dans le
  détail.** Le livre, la copie, la bibliothèque, l'élève, l'emprunt ou la
  réservation concernés, le type d'événement, la date et l'acteur sont des
  colonnes typées et indexables — ce sont les axes de « par livre », « par
  élève », « par mois ». Les libellés (titre, code d'identification, section,
  ancienne et nouvelle valeur) vivent dans le détail. Rejeté : tout mettre dans
  le détail, ce qui oblige l'analyse à regrouper sur un champ extrait d'un
  document — lent, fragile, et sans index.

- **L'élève est désigné par son identifiant, pas par son nom.** « L'élève qui
  emprunte le plus » se regroupe sur un identifiant stable : deux élèves peuvent
  porter le même nom, et un nom peut être corrigé. Comme `book_id` et `copy_id`,
  c'est une référence **sans** clé étrangère vers `users`. Cela ne contredit pas
  les [règles structurelles §8](../../business-rules/REGLES-METIER-STRUCTURE.md),
  qui portent sur l'**acteur** : lui reste une adresse e-mail.

- **Chaque événement embarque de quoi se lire seul.** Le titre du livre, le code
  d'identification de la copie, le prénom et le nom de l'élève sont recopiés
  dans l'événement tels qu'ils étaient à ce moment-là. Rejeté : une jointure à
  la lecture — le titre change, le code d'identification change quand la section
  change, et une ligne de journal qui dit autre chose qu'à l'époque ne vaut
  rien.

- **Assumé, non confirmé** : le niveau (`key_stage`) et la maison (`house`) de
  l'élève sont recopiés dans l'événement, et l'analyse regroupe sur la valeur
  **de l'époque**. Ils changent chaque année par construction ; sans copie,
  « emprunts par niveau » réattribuerait tout l'historique d'un élève à sa
  classe actuelle, et la valeur passée serait irrécupérable.
  À l'inverse, les dimensions du **livre** (genre, auteur, Dewey) ne sont pas
  recopiées : l'analyse les lit par jointure sur `book`, qui n'est jamais
  détruit (D1), et une correction de genre s'applique ainsi à tout
  l'historique — ce qu'on attend d'une correction.

- **Assumé, non confirmé** : l'identité de l'élève (identifiant, prénom, nom)
  occupe des colonnes à elle, séparées du reste du détail. Le journal nommera
  des mineurs pour une durée indéfinie ; le jour où une anonymisation sera
  demandée, elle touchera ces colonnes et rien d'autre, sans réécrire le détail
  d'un journal par ailleurs immuable. L'anonymisation elle-même est hors
  périmètre.

- **Un seul journal pour les deux entités.** Chaque événement nomme un livre et,
  quand il porte sur un exemplaire, une copie. Rejeté : deux tables, qui
  obligeraient à fusionner deux flux à la lecture pour reconstituer la
  chronologie d'un livre.

- **Un emprunt se compte par son événement d'emprunt, jamais par le changement
  de statut qui l'accompagne.** Un emprunt produit deux événements : la
  transition `available → borrowed` de la copie et l'événement d'emprunt. Les
  événements métier (emprunt, retour, retard, réservation posée, promue,
  expirée, honorée) sont ceux que l'analyse compte ; les changements de statut
  servent la chronologie de la copie. Les compter ensemble double les chiffres.

- **Le retour porte de quoi mesurer une durée et un retard** : la date de
  début, la date d'échéance et la date de retour effective, et l'identifiant de
  l'emprunt qu'il clôt. L'analyse n'a pas à apparier un retour à son emprunt
  pour savoir combien de temps un livre est resté dehors.

- **Le passage en retard est un événement.** `OverdueBorrowingScheduler` en
  écrit un par emprunt qu'il fait passer en `overdue`, avec `system` pour
  acteur. Sans lui, un emprunt jamais rendu — copie perdue entre les mains d'un
  élève — n'apparaîtrait jamais dans un décompte des retards.

- **Les transitions de `copy.status` sont journalisées à la source, en base.**
  C'est la seule façon de ne pas en perdre : celles écrites par les triggers ne
  passent par aucun code Java. La conséquence est qu'un `UPDATE copy SET status
  = …` lancé à la main en psql est journalisé lui aussi. C'est voulu.

- **L'acteur est l'adresse e-mail de la personne connectée**, et `system` quand
  le changement ne vient pas d'une requête authentifiée — ordonnanceur, démarrage,
  SQL direct. Même valeur et même convention que `Auditable.SYSTEM_AUDITOR` et
  `AuditorAwareImpl` ; **jamais** une clé étrangère vers `users`
  ([règles structurelles §8](../../business-rules/REGLES-METIER-STRUCTURE.md)).

- **La reprise de l'existant couvre tout ce qui a une date en base, et dit
  quand cette date est approchée.** Sans elle, chaque graphique commencerait le
  jour de la migration. La migration fabrique :

  | Événement repris | Date d'occurrence | Exacte ? |
  |---|---|---|
  | Création d'un livre, d'une copie | `created_date` | oui |
  | Emprunt | `borrowing.created_date` | oui |
  | Retour (emprunts `returned`) | `borrowing.last_modified_date` | **approchée** |
  | Réservation posée | `hold.created_date` | oui |
  | Promotion, expiration, fulfilment | `hold.last_modified_date` | **approchée** |
  | Suppression d'un livre, d'une copie | `deleted_at` | oui |

  Chaque événement repris est marqué comme tel, et dit si sa date est exacte ou
  approchée : l'analyse décide d'exclure les durées approchées, le journal ne
  décide pas à sa place. Les acteurs repris viennent de `created_by` (création,
  emprunt, réservation posée) ou de `last_modified_by` (le reste, donc
  approché lui aussi), et retombent sur `system` quand ils sont nuls.
  Rejeté : ne reprendre que les créations, ce qui rend faux tout total
  d'emprunts. Rejeté aussi : reprendre sans marquer, ce qui fait qu'un journal
  dont certaines dates sont inventées ne se distingue plus d'un journal fiable.
  **Non repris** : les changements de statut de copie, les modifications de
  livre et de copie et les passages en retard antérieurs à la migration — aucune
  date ne les conserve.

- **Les libellés repris sont ceux d'aujourd'hui.** Le titre, le code
  d'identification, le niveau et la maison d'un événement repris sont lus dans
  l'état actuel des tables : leur valeur d'époque est perdue. C'est la limite
  connue de la reprise, et la raison pour laquelle elle est marquée.

- **Assumé, non confirmé** : une opération refusée n'écrit rien. Un 409 sur une
  suppression, une transition de statut rejetée, une création en doublon ne
  laissent aucune trace dans le journal, qui consigne ce qui est arrivé et non
  ce qui a été tenté.

- **Assumé, non confirmé** : les événements sont ordonnés par leur identifiant
  en cas d'horodatage identique — plusieurs événements d'une même transaction
  partagent la même date à la milliseconde près.

**Hors périmètre de cette story** : lire le journal par l'API (US-05) et
l'afficher (US-06) ; la vue d'analyse elle-même, ses requêtes et ses
graphiques ; la purge, la rétention et l'anonymisation ; les événements qui ne
portent ni sur un livre ni sur une copie (utilisateurs, bibliothèques).

---

## Scénarios

### Scenario: créer un livre laisse deux traces

```gherkin
Given un bibliothécaire connecté
When il crée un livre, ce qui crée aussi sa première copie
Then le journal contient un événement de création du livre, portant son titre
And un événement de création de la copie, portant son code d'identification
And les deux nomment comme acteur l'adresse e-mail du bibliothécaire
```

### Scenario: renommer un livre conserve l'ancien titre

```gherkin
Given un livre intitulé "Le Petit Prince", déjà présent dans le journal
When un bibliothécaire le renomme en "Le petit prince"
Then le journal contient un événement de modification portant les deux titres
And l'événement de création antérieur porte toujours "Le Petit Prince"
```

### Scenario: changer la section d'une copie est journalisé

```gherkin
Given une copie en section "Fiction A"
When un bibliothécaire la déplace en section "Fiction B"
Then le journal contient un événement de modification de la copie
And cet événement porte l'ancienne et la nouvelle section, et les deux codes d'identification
```

### Scenario: déclarer une copie perdue est journalisé avec son auteur

```gherkin
Given une copie en statut "available"
When un bibliothécaire la déclare perdue
Then le journal contient un changement de statut de "available" vers "lost"
And son acteur est l'adresse e-mail du bibliothécaire
```

### Scenario: un emprunt laisse à la fois le statut et l'élève

```gherkin
Given une copie "available" et l'élève Clara Dupont, en "ks_3"
When un bibliothécaire enregistre l'emprunt de cette copie par Clara Dupont
Then le journal contient un changement de statut de "available" vers "borrowed"
And un événement d'emprunt désignant Clara Dupont par son identifiant
And cet événement porte son nom, son niveau "ks_3", sa maison et la date d'échéance
```

### Scenario: un retour porte de quoi mesurer la durée de l'emprunt

```gherkin
Given la copie empruntée par Clara Dupont
When un bibliothécaire enregistre le retour
Then le journal contient un changement de statut de "borrowed" vers "available"
And un événement de retour désignant Clara Dupont et l'emprunt qu'il clôt
And cet événement porte la date de début, la date d'échéance et la date de retour
```

### Scenario: le passage en retard est journalisé par l'ordonnanceur

```gherkin
Given un emprunt "borrowed" dont la date d'échéance est passée
When l'ordonnanceur des retards s'exécute
Then le journal contient un événement de retard pour cet emprunt
And son acteur est "system"
```

### Scenario: le niveau de l'élève est celui de l'époque

```gherkin
Given un emprunt de Clara Dupont journalisé quand elle était en "ks_3"
When son niveau passe à "ks_4"
Then l'événement d'emprunt porte toujours "ks_3"
```

### Scenario: compter les emprunts ne compte pas les changements de statut

```gherkin
Given une copie empruntée puis rendue deux fois
When on compte les événements d'emprunt de son livre
Then on obtient 2
And les changements de statut de la copie, au nombre de 4, n'entrent pas dans ce compte
```

### Scenario: un changement de statut fait à la main est journalisé

```gherkin
Given une copie en statut "available"
When son statut est passé à "damaged" par un UPDATE lancé directement en psql
Then le journal contient un changement de statut de "available" vers "damaged"
And son acteur est "system"
```

### Scenario: une réservation en file d'attente est journalisée sur le livre

```gherkin
Given un livre dont toutes les copies sont sorties
When l'élève Daniel Smith pose une réservation
Then le journal contient un événement de réservation sur ce livre, désignant Daniel Smith
And cet événement ne désigne aucune copie
```

### Scenario: la promotion d'une réservation désigne enfin une copie

```gherkin
Given la réservation "pending" de Daniel Smith sur ce livre
When une copie est rendue et la réservation passe en "active"
Then le journal contient un événement de promotion désignant Daniel Smith et cette copie
And un changement de statut de cette copie vers "on_hold"
```

### Scenario: supprimer un livre journalise le livre et chacune de ses copies

```gherkin
Given un livre à trois copies, supprimable
When un administrateur le supprime
Then le journal contient un événement de suppression du livre
And un événement de suppression pour chacune des trois copies
And tous nomment comme acteur l'adresse e-mail de l'administrateur
```

### Scenario: le journal survit à la suppression

```gherkin
Given un livre supprimé, qui avait été emprunté puis rendu avant sa suppression
When on relit le journal de ce livre et de ses copies
Then tous les événements antérieurs à la suppression sont toujours présents
And ils portent toujours le titre et les codes d'identification qu'ils avaient
```

### Scenario: une suppression refusée n'écrit rien

```gherkin
Given un livre dont une copie est empruntée
And le nombre d'événements actuellement enregistrés pour ce livre
When un administrateur tente de le supprimer et reçoit un 409
Then le nombre d'événements enregistrés pour ce livre est inchangé
```

### Scenario: la reprise couvre les livres, les copies et les emprunts existants

```gherkin
Given une base de développement chargée avec les fixtures avant cette story
When la migration est appliquée au démarrage du backend
Then chaque livre et chaque copie existants ont exactement un événement de création, daté de leur "created_date"
And chaque ligne "borrowing" existante a exactement un événement d'emprunt, à date exacte
And chaque ligne "borrowing" en "returned" a exactement un événement de retour, à date approchée
And chaque événement repris est marqué comme repris
```

### Scenario: la reprise couvre les réservations existantes

```gherkin
Given une base de développement contenant des réservations avant cette story
When la migration est appliquée
Then chaque ligne "hold" a exactement un événement de réservation posée, à date exacte
And chaque réservation qui n'est plus "pending" a en plus l'événement de son dernier état, à date approchée
```

### Scenario: l'ordre de deux événements simultanés est stable

```gherkin
Given un livre à trois copies, supprimé en une seule opération
When on relit les quatre événements de suppression triés par identifiant
Then l'ordre obtenu est le même à chaque lecture
```

---

## Critères d'acceptation

- [x] Une migration `V10__…sql` crée la table du journal. Elle ne modifie
  aucune migration déjà appliquée.
- [x] La table porte, **en colonnes** : un identifiant généré, la date
  d'occurrence (`timestamp with time zone`), le type d'événement, l'acteur
  (texte, adresse e-mail ou `system`), l'identifiant du livre, et — nullables —
  l'identifiant de la copie, de la bibliothèque, de l'élève, de l'emprunt et de
  la réservation concernés.
- [x] L'identité de l'élève (identifiant, prénom, nom) et son niveau et sa
  maison au moment de l'événement sont des colonnes, pas des champs du détail.
- [x] La table dit, pour chaque événement, s'il vient de la reprise et, si oui,
  si sa date est exacte ou approchée.
- [x] **Aucune clé étrangère** vers `book`, `copy`, `library`, `borrowing`,
  `hold` ni `users`.
- [x] Le détail embarque les libellés au moment de l'événement : titre du livre,
  code d'identification et section de la copie, ancienne et nouvelle valeur
  d'une modification — jamais reconstitués par jointure à la lecture.
- [x] Le type d'événement est un ensemble fermé de valeurs, rejeté par la base
  hors de cet ensemble, et couvre : création, modification et suppression d'un
  livre ; création, modification, changement de statut et suppression d'une
  copie ; emprunt, retard et retour ; réservation posée, promue, expirée et
  honorée.
- [x] L'événement de retour porte la date de début, la date d'échéance et la
  date de retour effective de l'emprunt.
- [ ] `OverdueBorrowingScheduler` écrit un événement de retard par emprunt qu'il
  fait passer en `overdue`, dans la même transaction que son `UPDATE` en masse.
- [x] Le mécanisme qui journalise les transitions de `copy.status` est posé
  **en base**, et non dans la couche service : aucune écriture de cette colonne
  ne peut y échapper, y compris celles des triggers de `V1` et un `UPDATE`
  lancé à la main. L'événement porte l'ancienne et la nouvelle valeur.
- [x] La valeur littérale enregistrée comme acteur quand aucune personne n'est
  authentifiée est la même que `Auditable.SYSTEM_AUDITOR`.
- [x] Aucun code de production ne met à jour ni ne supprime une ligne du
  journal ; l'entité JPA correspondante, s'il y en a une, est en lecture seule
  après insertion.
- [x] Des index permettent, sans parcours complet de la table : la chronologie
  d'un livre, celle d'une copie, les événements d'un type sur une période, et
  ceux d'un élève sur une période.
- [x] La reprise de l'existant vit dans la migration `V10` elle-même, et nulle
  part ailleurs : aucun code applicatif n'écrit d'événement rétroactif au
  démarrage. Elle couvre exactement les événements du tableau de la section
  Décisions, marque chacun comme repris avec sa précision de date, et retombe
  sur `Auditable.SYSTEM_AUDITOR` quand l'acteur source est nul.
- [x] Après la reprise, le nombre d'événements d'emprunt est égal à
  `SELECT count(*) FROM borrowing`, et le nombre d'événements de réservation
  posée à `SELECT count(*) FROM hold`.
- [x] L'écriture d'un événement partage la transaction de l'opération qu'il
  décrit : une opération annulée n'en laisse aucun.
- [x] `docs/business-rules/REGLES-METIER-STRUCTURE.md` gagne une section
  décrivant le journal : son caractère non supprimable, l'absence délibérée de
  clés étrangères, son rôle de source unique pour l'analyse, et la règle qui
  distingue les événements métier, que l'on compte, des changements de statut.
- [x] Aucun endpoint n'est ajouté par cette story, donc aucun fichier Bruno.

---

## Vérification de bout en bout

**Préparation** : US-01 et US-03 livrées. Base démarrée, fixtures chargées
**avant** d'appliquer cette migration — c'est ce qui rend la reprise
observable. Avant de démarrer le backend, noter en psql
`SELECT status, count(*) FROM borrowing GROUP BY status;` et
`SELECT status, count(*) FROM hold GROUP BY status;`. Backend lancé **depuis
l'IDE** (c'est lui qui applique `V10`), `npm run dev` dans `web/`, comptes du
[socle commun](README.md#socle-commun-de-vérification). Un psql ouvert en
permanence :

```bash
docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

1. Juste après le démarrage, psql : les événements de création doivent
   concorder avec `SELECT count(*) FROM book;` et `SELECT count(*) FROM copy;`,
   les événements d'emprunt avec le total de `borrowing`, les retours avec le
   nombre de `returned`, les réservations posées avec le total de `hold`. Tous
   sont marqués repris ; les retours, promotions, expirations et fulfilments
   ont une date approchée, les autres une date exacte. Vérifier sur un livre
   précis que la date de son événement de création est bien son `created_date`.
2. Requête d'analyse témoin : les cinq livres les plus empruntés, calculés une
   fois sur les événements d'emprunt du journal et une fois sur `borrowing`
   joint à `copy` — les deux classements sont identiques.
3. Connecté en bibliothécaire, **Add book** → créer un livre → psql : deux
   événements de plus, l'un pour le livre avec son titre, l'autre pour sa
   première copie avec son code d'identification, tous deux à l'adresse e-mail
   du bibliothécaire, aucun des deux marqué repris.
4. **Catalogue** → renommer ce livre → un événement de modification portant
   l'ancien et le nouveau titre ; relire l'événement de l'étape 3 : il porte
   toujours l'ancien titre.
5. Changer la section de la copie → un événement de modification portant les
   deux sections et les deux codes d'identification.
6. Emprunter la copie à Clara Dupont → deux événements : le changement de
   statut `available → borrowed`, et l'emprunt portant l'identifiant de Clara
   Dupont, son nom, son niveau, sa maison et la date d'échéance.
7. psql : `UPDATE users SET key_stage = 'ks_4' WHERE email = 'clara.dupont@example.com';`
   → l'événement de l'étape 6 porte toujours l'ancien niveau. Remettre la
   valeur d'origine.
8. Rendre la copie → le changement `borrowed → available`, et le retour
   désignant l'emprunt, avec ses dates de début, d'échéance et de retour.
9. Déclarer la copie perdue, puis la repasser en `available` en administrateur →
   deux changements de statut, avec deux acteurs différents.
10. psql, changement fait à la main :
    `UPDATE copy SET status = 'damaged' WHERE id = <copie>;` → un événement
    `available → damaged` dont l'acteur est `system`.
    Remettre : `UPDATE copy SET status = 'available' WHERE id = <copie>;`
11. Emprunter une copie, puis en psql
    `UPDATE borrowing SET start_date = current_date - 30, end_date = current_date - 1 WHERE id = <emprunt>;`
    et faire tourner l'ordonnanceur des retards (il est planifié à 00 h 05 ; le
    plan dit comment le déclencher à la demande) → un événement de retard pour
    cet emprunt, acteur `system`. Rendre la copie.
12. Sur un autre livre, sortir toutes les copies, poser une réservation au nom de
    Daniel Smith → un événement de réservation sur le livre, sans copie. Rendre
    une copie → un événement de promotion désignant la copie, et un changement
    de statut vers `on_hold`.
13. Tenter de supprimer ce livre (la réservation est `active`) → 409. psql :
    le compte d'événements de ce livre est inchangé.
14. Honorer la réservation ou la faire expirer, puis supprimer le livre → un
    événement de suppression pour le livre et un par copie, à l'adresse de
    l'administrateur.
15. psql, lecture finale :
    `SELECT * FROM <journal> WHERE book_id = <id> ORDER BY occurred_at, id;` →
    la chronologie complète est là, suppression comprise, avec les libellés
    d'époque.

**Nettoyage** : `UPDATE book SET deleted_at = NULL WHERE id = <id>;` et
`UPDATE copy SET deleted_at = NULL WHERE book_id = <id>;`. Ne **pas** supprimer
les lignes de journal produites par l'essai — elles ne gênent rien, et les
supprimer serait précisément ce que cette story interdit. Pour repartir propre :
`server/scripts/reset-dev-db.sh`.

---

## Points de vigilance

- **Journaliser `copy.status` depuis le service ne marchera pas, et l'échec est
  silencieux.** Les triggers de `V1` écrivent ce statut sans que le code Java
  le voie : un `@EntityListener`, un `@PreUpdate` ou un appel explicite dans
  `BorrowingServiceImpl` manquera tous les changements d'origine trigger — soit
  l'essentiel. Les tests manuels passeront pourtant, parce que le service écrit
  bien l'événement d'emprunt, celui que l'on pense à vérifier. C'est le point
  le plus coûteux de cette story, et la raison pour laquelle le critère parle de
  journalisation **à la source**.

- **Le passage en retard contourne JPA lui aussi.** `markOverdue` est un
  `UPDATE` en masse : aucun listener d'entité ne le voit, et il ne renvoie qu'un
  nombre de lignes. Les événements de retard doivent être écrits par une
  insertion en masse qui sélectionne les mêmes emprunts, dans la même
  transaction — ou par un trigger sur `borrowing.status`. À trancher à l'étape
  plan.

- **L'entité `Copy` en mémoire est périmée après un trigger.** Lire
  `copy.getStatus()` pour construire un événement juste après un emprunt rend
  l'ancienne valeur. `saveAndFlush(...)` puis `entityManager.refresh(copy)`
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)).

- **Faire remonter l'acteur jusqu'à la base est un vrai problème.** Un trigger
  PostgreSQL ne connaît pas la session applicative. Sans transmission
  explicite, tous les changements d'origine trigger seront attribués à
  `system`, y compris un emprunt enregistré par un bibliothécaire identifié —
  ce qui rend la colonne acteur presque inutile sur les événements les plus
  fréquents. À trancher à l'étape plan, mais à ne pas découvrir à l'étape
  implémentation.

- **Ne pas ranger un axe d'analyse dans le détail « pour plus tard ».** Tout ce
  qui servira à regrouper ou à filtrer — élève, bibliothèque, niveau, maison —
  doit être une colonne dès `V10`. L'en sortir après coup demanderait une
  migration qui réécrit des lignes du journal, ce que la story interdit.

- **Un compte d'emprunts se fait sur le type d'événement d'emprunt, et sur lui
  seul.** Un `count(*) WHERE book_id = …` mêle emprunts, retours, retards et
  changements de statut, et rend un chiffre plausible et faux. La règle doit
  être écrite dans les règles structurelles, pas seulement connue.

- **L'ordre des flush décide de ce qui est journalisé.** Quand un retour
  d'emprunt et la promotion d'une réservation partagent une transaction, le
  statut final dépend de l'ordre dans lequel les écritures atteignent la base
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)).
  Le journal enregistrera cet ordre tel qu'il est, pas tel qu'on l'imagine — ce
  qui est une bonne nouvelle pour le diagnostic et une mauvaise pour qui écrit
  le scénario de vérification sans le savoir.

- **Ne jamais ajouter de clé étrangère « pour l'intégrité ».** Elle a l'air
  d'une bonne pratique et elle détruit la propriété centrale du journal : une
  `FOREIGN KEY` vers `book` en `CASCADE` effacerait l'historique à la première
  suppression physique, et en `NO ACTION` elle la rendrait impossible. Les
  identifiants du journal sont des références mortes, assumées comme telles —
  `student_id` compris.

- **Ne pas réutiliser les colonnes de `Auditable`.** Le journal est une table
  d'événements, pas une entité métier : y accrocher `created_by` /
  `last_modified_by` suggérerait qu'une ligne peut être modifiée.

- **La reprise s'exécute une fois et ne se rejoue jamais.** Flyway ne rejoue pas
  une migration appliquée ; si la reprise est fausse, la correction est une
  nouvelle migration, pas une retouche de `V10`, dont le checksum empêcherait le
  démarrage. C'est la raison de l'étape 1 de la vérification : compter avant et
  après.

- **`created_date` peut être nul sur les lignes les plus anciennes**, sur
  `book`, `copy`, `borrowing` et `hold` : la colonne a un
  `DEFAULT CURRENT_TIMESTAMP` mais pas de `NOT NULL` dans
  `V1__baseline_schema.sql`. Pour un emprunt, `start_date` est un repli exact
  au jour près ; pour le reste, vérifier en base avant de supposer que la
  reprise ne rencontrera pas de nulls.

- **`last_modified_date` d'un emprunt `returned` n'est pas forcément sa date de
  retour.** Toute écriture postérieure au retour — une correction en psql, par
  exemple — l'a déplacée.
  D'où la marque « date approchée » : elle ne dit pas que la date est fausse,
  elle dit qu'on ne peut pas le garantir.
