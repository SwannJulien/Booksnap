# US-02 — Dire qui empêche la suppression

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Nature** | feature |
| **Dépend de** | [US-01](US-01-suppression-logique.md) |
| **Bloque** | — |
| **Portée** | back · front |
| **Casse l'existant ?** | Non — le corps du 409 gagne deux champs, le code et le message restent |

---

## Récit

**En tant qu'** administrateur
**je veux** savoir *qui* détient le livre que je n'arrive pas à supprimer, et
jusqu'à quand
**afin de** pouvoir agir — relancer l'élève, annuler la réservation — au lieu de
rouvrir la modale tous les quinze jours pour voir si ça passe.

## Contexte

Depuis US-01, un refus de suppression renvoie un 409 au format `ApiError`, dont
le message est une chaîne fixe, et la confirmation refusée ouvre une **modale
d'information** — un motif, un bouton pour fermer, aucune action. Cette modale
affiche le message tel quel :

```java
// server/src/main/java/net/booksnap/exception/ApiError.java
public record ApiError (
    LocalDateTime timestamp,
    int status,
    String message,
    String path)
{}
```

La modale d'information de US-01 ne reçoit qu'une chaîne, portée par une
propriété : elle n'a rien de structuré à rendre.

L'administrateur apprend donc qu'un emprunt ou une réservation est en cours, et
rien d'autre : ni combien, ni sur quelle copie, ni au nom de qui. L'information
existe pourtant à portée de requête — `borrowing.user_id` et `hold.user_id`
pointent vers `users`, et `GET /borrowings` affiche déjà ces mêmes noms au
personnel.

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Back | Le 409 porte un message fixe ; les lignes bloquantes sont comptées par un `existsBy…`, jamais lues |
| Front | La modale d'information rend une chaîne, sans structure |
| Autorisation | Depuis US-01, `DELETE /books/*` **et** `DELETE /copies/*` sont `hasRole(ADMIN)` (`config/SecurityConfig.java`) : seul un administrateur voit jamais ce 409 |

Contraintes du projet :
[règles accès §4.1 et §4.4](../../business-rules/REGLES-METIER-ACCES.md).

---

## Décisions et non-objectifs

- **Le détail voyage dans le corps du 409**, pas dans un endpoint de lecture
  séparé. Rejeté : un `GET /books/{id}/deletion-blockers` que la modale
  appellerait après l'échec — il ajoute un aller-retour, un endpoint de plus à
  protéger, et surtout il peut répondre autre chose que ce qui a réellement
  bloqué, l'état ayant changé entre les deux appels. Ce qui est affiché doit
  être ce qui a bloqué.

- **La liste n'est pas tronquée.** Un livre à vingt exemplaires tous sortis
  affiche vingt lignes. Rejeté : un plafond à dix avec « et N autres », qui
  oblige à aller chercher ailleurs précisément quand la situation est la plus
  compliquée.

- **Les noms des élèves sont montrés en clair.** Le personnel les voit déjà
  dans la liste des emprunts et dans la recherche d'usagers, et ces endpoints
  sont fermés au rôle `user`
  ([règles accès §4.4](../../business-rules/REGLES-METIER-ACCES.md)) : cette
  story n'expose rien de nouveau à personne.

- **Deux listes séparées plutôt qu'une liste mélangée** — un emprunt et une
  réservation n'ont pas les mêmes dates ni le même sens pour qui lit, et les
  fusionner obligerait à inventer un vocabulaire commun à l'affichage.

- **Assumé, non confirmé** : les emprunts sont triés par date d'échéance
  croissante (le plus en retard d'abord), les réservations par date de création
  croissante — c'est l'ordre de la file d'attente, celui de
  `idx_hold_pending_queue`.

- **Assumé, non confirmé** : le refus d'une **copie** ne liste que ce qui
  bloque cette copie ; le refus d'un **livre** liste ce qui bloque n'importe
  laquelle de ses copies, plus les réservations `pending` sur le livre.

**Hors périmètre de cette story** : prévenir avant la confirmation — la modale
découvre le blocage en tentant la suppression, elle ne l'anticipe pas ; agir
depuis la modale (relancer, annuler une réservation, forcer un retour) ; les
404, qui gardent le corps `ApiError` ordinaire.

---

## Scénarios

### Scenario: le refus d'une copie nomme l'emprunteur

```gherkin
Given une copie empruntée par Clara Dupont, à rendre le 22 avril 2026
When un administrateur tente de supprimer cette copie
Then la réponse est 409
And elle contient un emprunt bloquant, et un seul
And cet emprunt porte le nom et le prénom de Clara Dupont, le statut "borrowed" et la date du 22 avril 2026
And la liste des réservations bloquantes est vide
```

### Scenario: un emprunt en retard est signalé comme tel

```gherkin
Given une copie dont l'emprunt est en statut "overdue"
When un administrateur tente de supprimer cette copie
Then l'emprunt bloquant renvoyé porte le statut "overdue"
```

### Scenario: le refus d'un livre liste toutes ses copies bloquées

```gherkin
Given un livre à quatre copies, dont trois sont empruntées par trois élèves différents
When un administrateur tente de supprimer ce livre
Then la réponse est 409
And elle contient trois emprunts bloquants
And chacun nomme son élève et la copie concernée par son code d'identification
```

### Scenario: une réservation en file d'attente apparaît sans copie

```gherkin
Given un livre portant une réservation "pending" posée par Daniel Smith, et aucune copie attachée à cette réservation
When un administrateur tente de supprimer ce livre
Then la réponse contient une réservation bloquante nommant Daniel Smith
And cette réservation n'indique aucune copie
```

### Scenario: ce qui est clos n'apparaît pas

```gherkin
Given une copie portant un emprunt "returned", une réservation "expired" et un emprunt "borrowed"
When un administrateur tente de supprimer cette copie
Then la réponse ne contient que l'emprunt "borrowed"
```

### Scenario: les emprunts sont listés du plus en retard au moins urgent

```gherkin
Given un livre à trois copies empruntées, à rendre respectivement les 1er, 10 et 20 avril 2026
When un administrateur tente de supprimer ce livre
Then les trois emprunts bloquants apparaissent dans l'ordre 1er, 10, 20 avril
```

### Scenario: vingt exemplaires sortis donnent vingt lignes

```gherkin
Given un livre à vingt copies, toutes empruntées
When un administrateur tente de supprimer ce livre
Then la réponse contient vingt emprunts bloquants
```

### Scenario: la modale de refus affiche la liste au lieu d'une phrase

```gherkin
Given un livre à deux copies empruntées et une réservation en attente, affiché dans le catalogue
When un administrateur confirme sa suppression dans la modale de confirmation
Then la modale d'information qui s'ouvre affiche les deux emprunts avec le nom de chaque élève et sa date d'échéance
And elle affiche la réservation avec le nom de l'élève
And elle n'offre toujours qu'un bouton de fermeture
And le livre reste affiché dans la liste
```

### Scenario: la modale de refus ne montre pas une section vide

```gherkin
Given une copie bloquée par un emprunt, sans aucune réservation
When un administrateur confirme sa suppression dans la modale de confirmation
Then la modale d'information n'affiche aucune section consacrée aux réservations
```

### Scenario: un livre déjà supprimé ne produit pas de liste

```gherkin
Given un livre déjà supprimé
When un administrateur tente de le supprimer
Then la réponse est 404
And son corps est un "ApiError" ordinaire, sans liste d'emprunts ni de réservations
```

---

## Critères d'acceptation

- [x] Le corps du 409 de `DELETE /copies/{copyId}` et de `DELETE /books/{bookId}`
  étend `ApiError` de deux tableaux, `activeBorrowings` et `activeHolds`, tous
  deux toujours présents (vides plutôt qu'absents).
- [x] Chaque entrée d'`activeBorrowings` porte : identifiant de l'emprunt,
  identifiant et code d'identification de la copie, prénom et nom de l'élève,
  statut (`borrowed` ou `overdue`), date de début et date d'échéance.
- [x] Chaque entrée d'`activeHolds` porte : identifiant de la réservation,
  identifiant et code d'identification de la copie **ou `null`** pour une
  réservation `pending`, prénom et nom de l'élève, statut (`pending` ou
  `active`), date de création, et date de fin de retrait (`null` tant que la
  réservation est `pending`).
- [x] Les DTO vivent dans `domain/borrowing/api/dto/` et `domain/hold/api/dto/`,
  ou dans `exception/` s'ils sont propres à la réponse d'erreur — dans tous les
  cas en records, comme le reste de la couche API.
- [x] Les exceptions de refus introduites par US-01 transportent ces deux
  listes ; les handlers de `GlobalExceptionHandler` les recopient dans le corps
  sans requête supplémentaire.
- [x] Les lectures qui alimentent ces listes chargent l'élève en une seule
  requête par liste (pas de N+1 sur `users`).
- [x] Les 404 et les autres erreurs gardent le corps `ApiError` inchangé.
- [x] La modale d'information de US-01 rend les deux listes en balisage, et non
  en chaîne concaténée : sa propriété de message accepte désormais une structure
  en plus d'une chaîne, ou bien le parcours lui passe un contenu rendu par
  ailleurs — dans les deux cas elle reste sans action, avec son unique bouton de
  fermeture, et le bloc porte `role="alert"`.
- [x] Les deux modales de confirmation sont inchangées par cette story : elles
  transmettent le refus, elles ne l'affichent pas.
- [x] `api/copy.js` et `api/book.js` exposent les deux tableaux à l'appelant en
  plus de `error.status` et `error.message`.
- [x] `server/API/CopyController/deleteCopy.bru` et
  `server/API/BookController/deleteBook.bru` sont à jour si leur jeu de
  paramètres change ; aucun nouveau fichier n'est nécessaire, aucun endpoint
  n'est ajouté.
- [x] `npm run lint` passe dans `web/` sur les fichiers touchés.

---

## Vérification de bout en bout

**Préparation** : US-01 livrée, backend lancé depuis l'IDE, `npm run dev` dans
`web/`, comptes du [socle commun](README.md#socle-commun-de-vérification).
Choisir un livre à au moins trois copies.

1. Connecté en administrateur — depuis US-01, c'est le seul rôle qui peut
   supprimer, donc le seul qui voit ce 409 — **Catalogue** → emprunter la copie 1
   à Clara Dupont et la copie 2 à Daniel Smith, avec deux dates d'échéance
   différentes.
2. En psql, forcer l'emprunt de la copie 1 en retard pour obtenir les deux
   statuts :
   `UPDATE borrowing SET status = 'overdue', end_date = CURRENT_DATE - 10 WHERE copy_id = <copie 1>;`
3. Poser une réservation sur ce livre au nom d'Emma Wilson — toutes les copies
   n'étant pas sorties, en sortir une de plus si nécessaire pour qu'elle reste
   `pending`.
4. Tenter de supprimer la copie 1, confirmer → la modale d'information liste
   **un** emprunt, celui de Clara Dupont, marqué en retard, et **aucune** section
   réservation.
5. Tenter de supprimer le livre, confirmer → la modale d'information liste les
   emprunts de Clara puis de Daniel (le retard en premier), chacun avec le code
   d'identification de sa copie, et la réservation d'Emma sans copie.
6. Rendre les deux emprunts, laisser la réservation → retenter la suppression du
   livre : seule la réservation d'Emma reste listée.
7. **Bruno**, session administrateur : rejouer
   `BookController/deleteBook.bru` sur ce livre et lire le corps de la réponse →
   `status` vaut 409, `activeBorrowings` est un tableau vide, `activeHolds`
   contient une entrée dont `copyId` est `null`.
8. Annuler la réservation (`UPDATE hold SET status = 'expired' WHERE id = …;`),
   supprimer le livre → 204.
9. Bruno : rejouer `deleteBook.bru` sur le même identifiant → 404, et le corps
   ne contient ni `activeBorrowings` ni `activeHolds`.

**Nettoyage** : `UPDATE book SET deleted_at = NULL WHERE id = <id>;` puis
`UPDATE copy SET deleted_at = NULL WHERE book_id = <id>;`, ou
`server/scripts/reset-dev-db.sh`.

---

## Points de vigilance

- **Ne pas relire l'état après coup.** Construire les listes dans un second
  temps — après l'échec, depuis la modale ou depuis un handler qui requête à
  nouveau — fait afficher un état qui n'est pas celui qui a bloqué. Les listes
  doivent être construites dans la même transaction que la vérification de
  US-01, et portées par l'exception.

- **Une réservation `pending` n'a pas de copie.** `hold.copy_id` est nullable
  (`Hold.copy` est un `@ManyToOne` sans `nullable = false`) et vaut `null` tant
  que la réservation est en file d'attente. Un mapper qui lit
  `hold.getCopy().getIdentificationCode()` sans garde lèvera une
  `NullPointerException` exactement dans le cas le plus courant.

- **`overdue` n'est pas calculé à la lecture.** C'est un statut en base,
  basculé par lot par `BorrowingRepository.markOverdue`. Un emprunt dont la date
  est passée mais que l'ordonnanceur n'a pas encore vu est encore `borrowed` :
  afficher le statut tel qu'il est stocké, ne pas le recalculer à l'affichage,
  sinon les deux sources diront des choses différentes.

- **Le N+1 est facile ici.** Lire les emprunts bloquants puis lire chaque
  `user` dans la boucle de mapping produit une requête par élève. Les requêtes
  existantes du projet montrent le motif inverse —
  `CopyRepository.findAllByBookId` fait `LEFT JOIN FETCH` sur `book` et
  `library`.

- **La modale `delete-book-modal-bks` annonce une perte définitive.** Son texte
  d'avertissement date d'avant US-01 et n'est plus exact : rien n'est détruit.
  S'il n'a pas déjà été corrigé en US-01, c'est le moment — il est lu
  directement au-dessus de la liste que cette story ajoute.

- **Le piège de spécificité CSS de Lit.** Les deux modales ont un
  `-styles.js` sibling ; si l'une d'elles liste `sharedStyles` en dernier, une
  règle simple ne pourra pas redéfinir ce que `sharedStyles` impose aux éléments
  de formulaire. Voir `.claude/CLAUDE.md`.
