# US-02 — Une réservation appartient à une bibliothèque

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Règles de prêt par bibliothèque |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | — |
| **Bloque** | US-03 |
| **Portée** | back + front |
| **Casse l'existant ?** | Oui — une copie rendue n'est plus mise de côté pour une réservation d'une autre bibliothèque ; « Hold a book » apparaît sur un livre dont une copie est disponible dans une autre bibliothèque ; `POST /api/v1/holds` nomme la copie au lieu du livre |

---

## Story

**En tant que** bibliothécaire
**je veux** qu'une réservation posée depuis une copie de ma bibliothèque n'attende
que les copies de ma bibliothèque
**afin qu'**un livre de Primary ne soit pas mis de côté pour un élève de
Preschool, et que la fenêtre de retrait appliquée soit celle de la bibliothèque où
l'élève vient chercher la copie.

---

## Contexte

### La réservation porte sur le livre, pour toute l'école

```java
// server/src/main/java/net/booksnap/domain/hold/service/HoldServiceImpl.java:73-77, createHold
if (copyRepository.countByBookIdAndStatusAndDeletedAtIsNull(
        book.getId(), net.booksnap.domain.copy.Status.available) > 0) {
    throw new BookHasAvailableCopyException(book.getId());
}
```

Une seule copie disponible **n'importe où** dans l'école interdit de réserver.

```java
// …:85-90 — la bibliothèque de la réservation est celle d'une copie quelconque
// A hold needs a library; take it from any copy of the book. …
Library library = copyRepository.findAllByBookId(book.getId()).stream()
        .findFirst()
        .map(Copy::getLibrary)
        .orElseThrow(() -> new BadRequestException(
                "Cannot place a hold on a book that has no copies"));
```

`hold.library_id` (`NOT NULL`, `V1__baseline_schema.sql:523`) n'exprime donc
aucun choix. La requête est `CreateHoldRequest(Long userId, Long bookId)`.

```java
// …:100 — la position renvoyée compte toute l'école
long queuePosition = holdRepository.countByBookIdAndStatus(book.getId(), Status.pending);
```

```java
// …:147-150, promoteNextPendingHold — la file est celle du livre, toutes bibliothèques
return holdRepository
        .findFirstByBookIdAndStatusOrderByCreatedDateAsc(
                copy.getBook().getId(), Status.pending)
```

Une copie de Primary rendue sert donc la réservation `pending` la plus ancienne du
livre, même posée depuis Preschool.

### Le front

« Hold a book » est une entrée du menu d'une ligne de copie, dans le catalogue :

```js
// web/src/features/copy/copy-table-bks/copy-table-bks.js:204-206, 242
const bookHasAvailableCopy = this.copies?.some(
  c => c.status?.toLowerCase() === 'available',
);
…
...(!bookHasAvailableCopy ? [{ action: 'hold-book', … label: 'Hold a book' }] : []),
```

Chaque copie reçue porte sa bibliothèque (`CopyResponse.library`). La vue
(`catalog-view.js:686-691`) ouvre `hold-modal-bks` avec `bookId` et
`bookTitle` seulement ; la modale appelle `createHold(bookId, userId)`
(`web/src/api/hold.js:26`) et affiche, au succès, la position :

```js
// web/src/features/hold/hold-modal-bks/hold-modal-bks.js:176-181
if (this._queuePosition === 1) {
  return 'They are next in line for a returned copy.';
}
return `They are number ${this._queuePosition} in the queue.`;
```

En cas de `409`, elle affiche toujours « This student already has an active hold
on this book. » (`:237-240`) — alors que `BookHasAvailableCopyException` répond
aussi `409` (`GlobalExceptionHandler.java:279-283`).

### Les règles écrites

`.claude/CLAUDE.md`, *Hold lifecycle* : « A hold is placed on a *book*; a *copy*
is only attached when one becomes free. … the oldest pending hold for a book wins
when a copy comes back. »
[Règles emprunts §4](../../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md) :
« La `library` de la réservation est dérivée d'une copie existante du livre. »
Index `uq_hold_one_active_per_user_book` sur `(user_id, book_id)` pour les
statuts `pending` et `active` (`V1__baseline_schema.sql:856`).

---

## Décisions et non-objectifs

- **La bibliothèque d'une réservation est celle de la copie depuis laquelle elle
  est posée** ; ni le bibliothécaire ni l'élève ne la choisissent. Rejeté : un
  choix de bibliothèque dans la modale.
- **La réservation attend le livre dans sa bibliothèque, pas une copie précise** :
  n'importe quelle copie de ce livre dans cette bibliothèque la sert. Rejeté :
  la réservation d'une copie précise (un élève attendrait pendant qu'une copie
  identique dort au rayon).
- **On ne peut réserver que si aucune copie du livre n'est disponible dans cette
  bibliothèque.** Une copie disponible dans une autre bibliothèque n'y fait plus
  obstacle.
- **La file d'attente est par livre et par bibliothèque** : à son retour, une copie
  sert la réservation `pending` la plus ancienne pour ce livre **dans sa
  bibliothèque**, sinon elle reste disponible. La position annoncée à la création
  compte la même file.
- **Une seule réservation `pending` ou `active` par élève et par livre, pour toute
  l'école** — inchangé (index unique). Un élève ne fait pas la queue dans les deux
  bibliothèques à la fois. _Pris sans question explicite, déduit de la discussion ;
  à corriger si faux._
- **Les réservations existantes gardent leur `library_id`** : il désigne toujours
  une bibliothèque qui possède une copie du livre. Aucune reprise de données.
  _Pris sans question explicite ; à corriger si faux._
- **Les deux refus `409` de la modale sont distingués** : celui de la copie
  disponible affiche son propre message au lieu de « already has an active hold ».
  Le cas devient atteignable dès qu'un autre poste prête la dernière copie
  disponible pendant que la modale est ouverte. Confirmé par l'utilisateur.
- **La réservation par l'élève lui-même est hors périmètre** (pas de compte élève
  avant la phase 5) ; la règle décrite ici vaudra pour lui sans changement.

**Hors périmètre de cette story** : la fenêtre de retrait réglable (US-01) ;
l'expiration (US-03) ; le prêt et la réservation entre bibliothèques, la
bibliothèque de l'élève (`users.library_id`) — voir la
[feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Scénarios

Dans tous les scénarios : le livre « Matilda » a deux copies à Preschool (P1,
P2) et une copie à Primary (R1).

### Scenario: une réservation prend la bibliothèque de la copie

```gherkin
Given P1 et P2 empruntées, R1 empruntée
When une réservation est posée pour l'élève Alice depuis la copie P2
Then la réservation est "pending", sans copie, et appartient à Preschool
```

### Scenario: une copie disponible ailleurs n'empêche pas de réserver

```gherkin
Given P1 et P2 empruntées, R1 disponible
When une réservation est posée pour Alice depuis la copie P1
Then la réponse est 201 et la réservation appartient à Preschool
```

### Scenario: une copie disponible dans la même bibliothèque empêche de réserver

```gherkin
Given P1 empruntée, P2 disponible
When une réservation est posée pour Alice depuis la copie P1
Then la réponse est 409 avec le message "A copy of this book is available at Preschool: borrow it instead."
And aucune réservation n'est créée
```

### Scenario: le menu propose de réserver selon la bibliothèque de la ligne

```gherkin
Given P1 et P2 empruntées, R1 disponible
And un bibliothécaire sur le catalogue, copies de "Matilda" affichées
Then le menu de la ligne P1 propose "Hold a book"
And le menu de la ligne R1 ne propose pas "Hold a book"
```

### Scenario: le menu ne propose pas de réserver quand une copie de la bibliothèque est disponible

```gherkin
Given P1 empruntée, P2 disponible, R1 empruntée
And un bibliothécaire sur le catalogue, copies de "Matilda" affichées
Then le menu de la ligne P1 ne propose pas "Hold a book"
And le menu de la ligne R1 propose "Hold a book"
```

### Scenario: la modale réserve dans la bibliothèque de la ligne

```gherkin
Given P1 et P2 empruntées, R1 disponible
And un bibliothécaire sur le catalogue
When il choisit "Hold a book" sur la ligne P1, sélectionne Alice et confirme
Then la modale affiche "They are next in line for a returned copy."
And la réservation d'Alice appartient à Preschool
```

### Scenario: la modale signale une copie devenue disponible

```gherkin
Given P1 et P2 empruntées, et la modale "Hold a book" ouverte depuis la ligne P1
And P2 rendue entre-temps, sans réservation en attente
When le bibliothécaire sélectionne Alice et confirme
Then la modale affiche "A copy of this book is available at Preschool: borrow it instead."
```

### Scenario: la position compte la file de la bibliothèque seulement

```gherkin
Given toutes les copies empruntées
And une réservation "pending" de Bob posée depuis R1 (Primary)
When une réservation est posée pour Alice depuis P1
Then la position renvoyée est 1
And la modale affiche "They are next in line for a returned copy."
```

### Scenario: une copie rendue sert la file de sa bibliothèque

```gherkin
Given toutes les copies empruntées
And une réservation "pending" de Bob posée depuis R1 (Primary), la plus ancienne
And une réservation "pending" d'Alice posée depuis P1 (Preschool), plus récente
When P2 est rendue
Then la réservation d'Alice passe "active" sur P2
And P2 est "on_hold"
And la réservation de Bob reste "pending"
```

### Scenario: une copie rendue ne sert pas une autre bibliothèque

```gherkin
Given toutes les copies empruntées
And une seule réservation "pending", celle d'Alice, posée depuis P1 (Preschool)
When R1 est rendue
Then R1 est "available"
And la réservation d'Alice reste "pending"
```

### Scenario: dans une bibliothèque, la plus ancienne réservation est servie

```gherkin
Given toutes les copies empruntées
And deux réservations "pending" posées depuis Preschool, Alice puis Chloé
When P1 est rendue
Then la réservation d'Alice passe "active" sur P1
And celle de Chloé reste "pending"
```

### Scenario: un élève ne réserve pas deux fois le même livre, même ailleurs

```gherkin
Given toutes les copies empruntées
And une réservation "pending" d'Alice posée depuis R1 (Primary)
When une réservation est posée pour Alice depuis P1
Then la réponse est 409
And la modale affiche "This student already has an active hold on this book."
```

### Scenario: réserver depuis une copie inexistante ou supprimée

```gherkin
Given une copie supprimée, ou un identifiant de copie qui n'existe pas
When une réservation est posée depuis cette copie
Then la réponse est 404
And aucune réservation n'est créée
```

### Scenario: une copie supprimée ne compte pas comme disponible

```gherkin
Given P1 empruntée, P2 supprimée alors qu'elle était "available"
When une réservation est posée pour Alice depuis P1
Then la réponse est 201
```

---

## Critères d'acceptation

- [x] `POST /api/v1/holds` prend `{ userId, copyId }` ; le livre et la
      bibliothèque de la réservation sont ceux de la copie. Réponse `201`
      inchangée (`queuePosition` compris). `404` (`ApiError`) si la copie
      n'existe pas ou est supprimée, ou si l'utilisateur n'existe pas ; `409`
      (`ApiError`) pour une copie disponible dans la bibliothèque, avec le
      message du scénario, et pour un doublon (message inchangé).
- [x] Le front distingue les deux `409` sans analyser le texte du message
      (par exemple, un code d'erreur dans `ApiError`, ou un statut distinct) —
      le choix revient au plan.
- [x] `createHold` côté front envoie la copie depuis laquelle la réservation est
      posée ; la vue passe la copie (et sa bibliothèque) à la modale.
- [x] `createHold.bru` (`server/API/HoldController/`) mis à jour avec `copyId`.
- [x] Aucune réservation existante n'est modifiée par cette story (pas de
      migration de données).
- [x] `.claude/CLAUDE.md` (*Hold lifecycle*) et
      [règles emprunts §4 et §6.C](../../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md)
      décrivent la réservation par livre **et par bibliothèque**, la file par
      bibliothèque, et la règle « aucune copie disponible dans cette
      bibliothèque ».
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-02: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : voir la [feature](../README.md#préparation-commune-aux-vérifications).
Base `booksnap_e2e` après un `npm run test:e2e`. Choisir un livre des fixtures
avec une copie à Preschool, lui ajouter une seconde copie à Preschool et une
copie à Primary (`psql`), toutes `available`. Backend, `npm run dev`, un compte
bibliothécaire, trois élèves (Alice, Bob, Chloé).

1. Catalogue, copies du livre : emprunter P1 pour un élève et R1 pour un autre ;
   P2 reste disponible → le menu de P1 ne propose pas « Hold a book », celui de
   R1 le propose.
2. Emprunter P2 → le menu de P1 propose « Hold a book ».
3. « Hold a book » sur R1 pour Bob → « They are next in line for a returned
   copy. ». Puis « Hold a book » sur P1 pour Alice → « They are next in line for
   a returned copy. » aussi. `psql` : `SELECT user_id, library_id, status FROM hold ORDER BY id DESC LIMIT 2`
   → Bob à Primary (2), Alice à Preschool (1).
4. « Hold a book » sur P1 pour Bob → « This student already has an active hold
   on this book. »
5. « Hold a book » sur P1 pour Chloé → « They are number 2 in the queue. »
6. Rendre P2 → `psql` : la réservation d'Alice est `active` sur P2, P2 `on_hold` ;
   Bob `pending`.
7. Rendre R1 → la réservation de Bob passe `active` sur R1.
8. Ouvrir « Hold a book » sur P1, puis, dans un autre onglet, rendre P1 ; dans la
   première modale, choisir un quatrième élève et confirmer → « A copy of this
   book is available at Preschool: borrow it instead. » (Si Chloé est toujours
   en file, P1 lui est attribuée au lieu de redevenir disponible : annuler sa
   réservation avant cette étape, ou choisir un livre sans file.)
9. Bruno : `createHold` avec un `copyId` inexistant → `404`.

**Nettoyage** : base `booksnap_e2e`, reconstruite au prochain
`npm run test:e2e`.

---

## Points de vigilance

- **Ne pas déduire la bibliothèque d'une « copie quelconque » du livre** :
  c'est le défaut actuel (`findAllByBookId(...).findFirst()`), qui ne regarde
  même pas `deleted_at`.
- **Le compte des copies disponibles doit rester filtré sur `deleted_at`** : une
  copie supprimée garde le statut `available` (`.claude/CLAUDE.md`, commentaire
  de `createBorrowing`).
- **`idx_hold_pending_queue` est sur `(book_id, created_date)`** : la file par
  bibliothèque reste correcte sans index nouveau, mais le plan peut juger utile
  d'y ajouter `library_id`.
- **L'ordre des flushs au retour** est inchangé et reste critique
  (`returnBorrowing` : le retour doit atteindre la base avant la promotion).
- **Ne pas réécrire `hold.library_id` des réservations existantes** : une
  réservation déjà `active` est sur une copie qui peut être d'une autre
  bibliothèque que sa `library_id` — c'est l'héritage de l'ancien comportement,
  et la laisser aller à son terme (retrait ou expiration) est sans risque.
- **Le front décide de l'affichage, le back de la règle** : masquer « Hold a
  book » ne dispense pas le back de refuser.
