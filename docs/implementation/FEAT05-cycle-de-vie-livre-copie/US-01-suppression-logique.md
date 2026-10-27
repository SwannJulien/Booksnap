# US-01 — Supprimer un livre ou une copie sans détruire son historique

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Nature** | feature |
| **Dépend de** | — (remplace [US-016](../authentication-system/phase-2-bibliotheques/correction-suppression-copie/US-016-suppression-copie-409.md)) |
| **Bloque** | US-02, US-04 |
| **Portée** | db · back · front |
| **Casse l'existant ?** | **Oui**, trois fois. Une suppression ne détruit plus la ligne : `DELETE /books/{id}` et `DELETE /copies/{id}` répondent toujours 204 mais la ligne reste en base avec `deleted_at` renseigné. Un livre déjà emprunté, aujourd'hui indestructible, devient supprimable. Et `DELETE /copies/{id}`, aujourd'hui ouvert au `LIBRARIAN`, devient réservé à l'`ADMIN` : un bibliothécaire perd une action qu'il a. |

---

## Récit

**En tant qu'** administrateur
**je veux** retirer du catalogue un livre ou une copie même s'il a déjà été
emprunté, et en être empêché seulement quand quelqu'un l'a entre les mains
**afin de** nettoyer le fonds sans avoir à choisir entre garder éternellement
des notices mortes et effacer l'historique de prêt des élèves.

## Contexte

La suppression est aujourd'hui gouvernée par la base, et la base dit non.

```
copy.book_id       → book(id)     ON DELETE CASCADE
borrowing.copy_id  → copy(id)     (aucune action → NO ACTION)
hold.copy_id       → copy(id)     (aucune action → NO ACTION)
hold.book_id       → book(id)     (aucune action → NO ACTION)
```

`NO ACTION` interdit de supprimer une copie tant qu'une ligne `borrowing` ou
`hold` la désigne — **y compris un emprunt `returned` vieux de trois ans**. Et
comme `copy.book_id` est en `CASCADE`, supprimer un livre tente de supprimer ses
copies, se heurte au même mur, et échoue en entier.

US-016 avait traduit ce mur en réponse propre plutôt que de le contourner. **Son
code n'est plus dans le dépôt** — ni dans l'arbre de travail, ni dans aucune
branche, ni dans le stash ; `CopyHasHistoryException` n'apparaît dans aucun
commit. Ce qui suit décrit donc ce qu'elle avait écrit, et non ce qui existe :

```java
// server/src/main/java/net/booksnap/domain/copy/service/CopyServiceImpl.java
// Any borrowing or hold blocks the delete, whatever its status: the foreign keys
// are NO ACTION, so a returned borrowing or an expired hold refuses just as well
if (borrowingRepository.existsByCopyId(copyId) || holdRepository.existsByCopyId(copyId)) {
    throw new CopyHasHistoryException();
}
```

```java
// server/src/main/java/net/booksnap/domain/book/service/BookServiceImpl.java
if (borrowingRepository.existsByCopyBookId(bookId)
        || holdRepository.existsByCopyBookId(bookId)
        || holdRepository.existsByBookId(bookId)) {
    throw new BookHasHistoryException();
}
```

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Base | Aucune notion de suppression logique : ni `book` ni `copy` n'a de colonne de suppression |
| Back | Un emprunt ou une réservation, quel que soit son statut, fait échouer la suppression — et le mur étant celui de la base, l'échec remonte en `DataIntegrityViolationException`, donc en **500** (c'était le bug de US-016) |
| Back | `BookServiceImpl.deleteBookById` supprime aussi l'image de couverture (`coverService.deleteCoverImage(isbn)`) quand aucune autre notice ne partage l'ISBN |
| Back | `checkIfBookAlreadyExists` refuse un ISBN ou un titre déjà présent, sans regarder autre chose |
| Back | `SecurityConfig:168` — `DELETE /api/v1/copies/*` est en `hasAnyRole(LIBRARIAN, ADMIN)`. Seul `DELETE /api/v1/books/*` est déjà `hasRole(ADMIN)` (`:156`) |
| Front | `deleteBook()` et `deleteCopy()` (`api/book.js`, `api/copy.js`) renvoient `response.status` **sans regarder `response.ok`** : un 409 est résolu comme un succès. Les modales émettent alors `book-deleted` / `copy-deleted`, la ligne disparaît de l'écran, et rien n'a été supprimé |
| Front | Les deux modales ne font rien d'un échec qu'un `console.error` ; aucun message n'atteint l'écran |
| Front | L'option « Delete copy » / « Delete book » est dans le menu de ligne pour **tout le monde** (`copy-table-bks:274`, `book-table-bks:408`) : aucun composant n'interroge le rôle, seul `booksnap-app` lit `getAuthenticatedUser()` |

Le 500 n'est pas une hypothèse : `GlobalExceptionHandler` n'a pas de handler
pour `DataIntegrityViolationException`, et son `@ExceptionHandler(Exception.class)`
récupère tout le reste.

Contraintes du projet : [règles structurelles §2 et §9](../../business-rules/REGLES-METIER-STRUCTURE.md),
[règles accès §4.1](../../business-rules/REGLES-METIER-ACCES.md) (`DELETE /books/{id}`
est réservé à l'`ADMIN`, règle déjà en place dans `config/SecurityConfig.java` —
cette story étend la même règle à `DELETE /copies/{id}` et réécrit la section en
conséquence).

---

## Décisions et non-objectifs

- **Suppression logique** ([D1](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) —
  une colonne `deleted_at` sur `book` et sur `copy`, et plus aucun appel à
  `deleteById` sur ces deux tables. Rejeté : passer les clés étrangères en
  `CASCADE`, qui détruirait l'historique de prêt ; rejeté aussi : `ON DELETE SET
  NULL` sur `borrowing.copy_id`, qui garde les emprunts en leur retirant ce
  qu'ils désignaient.

- **« Actif » = quatre statuts** ([D2](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) —
  `borrowing` en `borrowed` ou `overdue`, `hold` en `pending` ou `active`. Une
  réservation `pending` n'a pas de copie : elle bloque le livre, pas une copie
  en particulier.

- **Supprimer un livre supprime logiquement toutes ses copies**, dans la même
  transaction. L'alternative — laisser des copies vivantes rattachées à un livre
  supprimé — produirait des copies inatteignables par le catalogue mais toujours
  empruntables.

- **La couverture n'est plus supprimée.** `deleteCoverImage` sort du chemin de
  suppression : la notice n'est pas détruite, elle peut être consultée depuis
  l'archive (US-06) et restaurée en psql. Une image orpheline coûte moins qu'une
  vignette manquante dans l'archive.

- **Le contrôle d'unicité à la création ignore ce qui est supprimé.** Sans cela,
  un titre supprimé interdirait pour toujours de recréer le même livre, et la
  suppression n'aurait servi à rien. Conséquence directe : toutes les recherches
  par ISBN ou par titre doivent filtrer `deleted_at IS NULL`, sinon elles
  trouveront deux lignes et casseront.

- **Supprimer est réservé à l'administrateur, livre comme copie**
  ([D8](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) —
  `DELETE /copies/{id}` rejoint `DELETE /books/{id}` en `hasRole(ADMIN)`. La
  raison de [§4.1](../../business-rules/REGLES-METIER-ACCES.md) vaut maintenant
  pour la copie : avec `deleted_at`, une suppression ne rencontre plus de mur de
  clé étrangère, donc plus rien ne protège par accident un emprunt vieux de
  trois ans — retirer une copie du fonds devient une décision sur l'archive, pas
  un geste de comptoir. Le bibliothécaire garde le geste de comptoir qui lui
  revient, `available`/`damaged` → `lost` (US-03), qui sort la copie des rayons
  sans rien effacer. Rejeté : laisser `DELETE /copies/{id}` au bibliothécaire en
  comptant sur US-04 pour tracer qui a supprimé quoi — un journal explique après
  coup, il n'empêche rien.

- **Le refus a sa propre modale, et elle n'offre aucune action**
  ([D9](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) — le parcours est
  à deux temps : la modale de confirmation (« Delete Copy? », « Delete Book? »,
  bouton rouge et *Cancel*) telle qu'elle existe, puis, si le serveur répond
  409, une seconde modale **d'information** qui dit pourquoi, avec un seul
  bouton pour la fermer. Pas de *Réessayer*, pas de *Supprimer quand même* :
  rien de ce que l'administrateur peut faire depuis cet écran ne changerait la
  réponse, le blocage se lève en rendant l'emprunt ou en annulant la
  réservation. Rejeté : afficher le message dans la modale de confirmation,
  sous le bouton rouge — ce bouton reste alors cliquable sur une action qu'on
  vient de dire impossible, et c'est ce que US-016 avait fait.

- **Assumé, non confirmé** : la modale de confirmation **se ferme** quand celle
  du refus s'ouvre ; il n'y a jamais deux modales empilées à l'écran. Deux
  `modal-bks` superposés voudraient dire deux pièges de focus imbriqués et un
  `Échap` dont on ne sait plus ce qu'il ferme.

- **Pas de contrôle en amont du clic.** L'option « Delete » reste proposée sur
  toutes les lignes qu'un administrateur voit, y compris celles qu'il ne pourra
  pas supprimer. Savoir d'avance demanderait de connaître les emprunts et
  réservations en cours de chaque ligne de la liste — soit une requête par
  ligne, soit un champ de plus dans la réponse du catalogue. La modale de refus
  est précisément ce qui rend ce calcul inutile.

- **Les exceptions ne reprennent pas les noms de US-016**
  ([D6](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) :
  `CopyHasHistoryException` et `BookHasHistoryException` décriraient une règle
  qui n'existe plus. Le nom doit dire « un emprunt ou une réservation est en
  cours ». Rien à renommer en pratique, le code de US-016 ayant disparu — mais
  il reste tentant de recopier ces deux noms depuis son document.

- **Assumé, non confirmé** : un livre ou une copie supprimé est invisible pour
  **tous** les rôles, administrateur compris, partout sauf sur les endpoints
  d'archive de US-05. L'administrateur ne garde aucune vue privilégiée sur le
  catalogue.

- **Assumé, non confirmé** : la restauration se fait en psql, pas par l'API
  ([D5](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)).

**Hors périmètre de cette story** : le détail des emprunts et réservations qui
bloquent — la modale de refus est construite ici, et elle affiche le message du
serveur, une phrase qui nomme le titre (ou la copie et son titre) et le ou les
élèves concernés, rien de plus ; US-02 remplit son contenu (quelle copie, quelle
échéance, quel retard) en balisage, sans toucher à son parcours. Hors périmètre aussi : le journal
d'événements (US-04) ; l'écran d'archive (US-06) ; le statut `lost` (US-03), qui
est la contrepartie offerte au bibliothécaire mais se livre séparément — entre
US-01 et US-03, un bibliothécaire n'a plus aucune action de retrait sur une
copie.

---

## Scénarios

### Scenario: une copie rendue depuis longtemps est supprimée

```gherkin
Given une copie dont le seul emprunt est en statut "returned"
When un administrateur la supprime
Then la réponse est 204
And la ligne "copy" existe toujours en base, avec "deleted_at" renseigné
And la ligne "borrowing" correspondante est inchangée
```

### Scenario: une copie actuellement empruntée n'est pas supprimée

```gherkin
Given une copie portant un emprunt en statut "borrowed"
When un administrateur tente de la supprimer
Then la réponse est 409
And "deleted_at" de la copie vaut toujours NULL
```

### Scenario: une copie mise de côté pour un élève n'est pas supprimée

```gherkin
Given une copie attachée à une réservation en statut "active"
When un administrateur tente de la supprimer
Then la réponse est 409
And "deleted_at" de la copie vaut toujours NULL
```

### Scenario: une réservation expirée n'empêche pas la suppression

```gherkin
Given une copie dont la seule réservation est en statut "expired"
When un administrateur la supprime
Then la réponse est 204
And "deleted_at" de la copie est renseigné
```

### Scenario: un bibliothécaire ne supprime pas une copie

```gherkin
Given une copie qu'aucun emprunt ni aucune réservation ne bloque
When un bibliothécaire tente de la supprimer
Then la réponse est 403
And "deleted_at" de la copie vaut toujours NULL
```

### Scenario: un bibliothécaire ne supprime pas un livre

```gherkin
Given un livre qu'aucun emprunt ni aucune réservation ne bloque
When un bibliothécaire tente de le supprimer
Then la réponse est 403
And "deleted_at" du livre vaut toujours NULL
And "deleted_at" vaut NULL sur toutes ses copies
```

### Scenario: un livre réservé par un élève en file d'attente n'est pas supprimé

```gherkin
Given un livre portant une réservation en statut "pending", qui n'a aucune copie attachée
When un administrateur tente de supprimer le livre
Then la réponse est 409
And "deleted_at" du livre vaut toujours NULL
```

### Scenario: supprimer un livre supprime ses copies

```gherkin
Given un livre à trois copies, dont aucune n'est empruntée ni réservée en cours
When un administrateur supprime le livre
Then la réponse est 204
And "deleted_at" est renseigné sur le livre et sur ses trois copies
```

### Scenario: une seule copie empruntée protège tout le livre

```gherkin
Given un livre à trois copies, dont une est en statut "borrowed"
When un administrateur tente de supprimer le livre
Then la réponse est 409
And "deleted_at" vaut NULL sur le livre et sur les trois copies
```

### Scenario: un livre supprimé disparaît du catalogue

```gherkin
Given un livre supprimé
When un administrateur liste le catalogue et le cherche par son titre
Then le livre n'apparaît ni dans la liste ni dans les résultats de recherche
```

### Scenario: un livre supprimé n'est plus lisible à l'unité

```gherkin
Given un livre supprimé
When on demande ce livre par son identifiant
Then la réponse est 404
```

### Scenario: une copie supprimée disparaît de la fiche du livre

```gherkin
Given un livre vivant à deux copies, dont une supprimée
When on demande les copies de ce livre
Then une seule copie est renvoyée
And le nombre total de copies du livre annoncé par la recherche vaut 1
```

### Scenario: supprimer deux fois n'est pas possible

```gherkin
Given un livre déjà supprimé
When un administrateur tente de le supprimer
Then la réponse est 404
```

### Scenario: une copie supprimée ne peut plus être empruntée

```gherkin
Given une copie supprimée
When un bibliothécaire tente d'enregistrer un emprunt sur cette copie
Then l'emprunt est refusé
And aucune ligne "borrowing" n'est créée
```

### Scenario: un livre supprimé ne peut plus être réservé

```gherkin
Given un livre supprimé
When un élève tente de poser une réservation sur ce livre
Then la réservation est refusée
And aucune ligne "hold" n'est créée
```

### Scenario: un titre supprimé peut être recréé

```gherkin
Given un livre supprimé portant le titre "Le Petit Prince" et un ISBN-13
When un bibliothécaire crée un livre avec ce même titre et ce même ISBN-13
Then la création réussit
And le catalogue montre exactement un livre portant ce titre
```

### Scenario: le refus ouvre une modale d'information

```gherkin
Given un administrateur sur la fiche d'un livre, devant une copie portant un emprunt en cours
When il choisit "Delete copy" puis confirme dans la modale de confirmation
Then la modale de confirmation se ferme
And une modale d'information s'ouvre, portant le message de refus du serveur
And cette modale n'offre qu'un bouton de fermeture : aucune action n'y est proposée
And la copie reste affichée dans la liste
And aucun événement "copy-deleted" n'est émis
```

### Scenario: fermer la modale de refus ne change rien

```gherkin
Given la modale de refus ouverte sur une copie empruntée
When l'administrateur la ferme
Then plus aucune modale n'est affichée
And la liste des copies est inchangée, sans rechargement de la page
And la copie peut être sélectionnée de nouveau, ce qui rouvre la modale de confirmation
```

### Scenario: le refus de supprimer un livre suit le même parcours

```gherkin
Given un administrateur dans le catalogue, devant un livre dont une copie est empruntée
When il choisit "Delete book" puis confirme dans la modale de confirmation
Then la modale de confirmation se ferme
And une modale d'information s'ouvre, portant le message de refus du serveur
And le livre reste affiché dans le catalogue
```

### Scenario: la suppression réussie retire la ligne de l'écran

```gherkin
Given une copie sans emprunt ni réservation en cours, affichée dans la fiche de son livre
When un administrateur confirme sa suppression dans la modale de confirmation
Then la modale se ferme
And aucune modale d'information ne s'ouvre
And la copie disparaît de la liste sans rechargement de la page
```

### Scenario: un bibliothécaire ne voit pas l'action de suppression

```gherkin
Given un bibliothécaire connecté
When il ouvre le menu d'actions d'une ligne du catalogue, puis celui d'une copie
Then "Delete book" n'est pas proposé
And "Delete copy" n'est pas proposé
And les autres actions de ces deux menus sont inchangées
```

---

## Critères d'acceptation

- [x] Une migration `V9__…sql` ajoute `deleted_at timestamp with time zone NULL`
  à `book` et à `copy`, avec un index partiel sur `deleted_at IS NULL` pour les
  lectures de catalogue. Elle ne modifie aucune migration déjà appliquée.
- [x] Les entités `Book` et `Copy` déclarent le champ correspondant ; le
  démarrage passe la validation `ddl-auto=validate`.
- [x] `DELETE /copies/{copyId}` : 204 en cas de succès, 404 si la copie est
  absente **ou déjà supprimée**, 409 si un emprunt ou une réservation est en
  cours. Mêmes codes pour `DELETE /books/{bookId}`.
- [x] `SecurityConfig` : `DELETE /api/v1/copies/*` passe de
  `hasAnyRole(LIBRARIAN, ADMIN)` à `hasRole(ADMIN)`. Une session bibliothécaire
  reçoit 403 sur les deux suppressions, et le 403 est opposé **avant** toute
  écriture — `deleted_at` reste `NULL`.
- [x] Les autres verbes de `/api/v1/copies/*` ne changent pas de rôle :
  `POST` et `PUT` restent ouverts au `LIBRARIAN`.
- [x] Le 409 est porté par deux exceptions nommées d'après la règle réelle
  (emprunt ou réservation **en cours**), dans `exception/copy/` et
  `exception/book/`, rendues au format `ApiError` par deux handlers de
  `GlobalExceptionHandler`. Les noms `CopyHasHistoryException` et
  `BookHasHistoryException` de US-016 ne sont pas repris.
- [x] Le message de ces deux exceptions — celui que la modale d'information
  affiche — nomme ce qui est refusé (le titre du livre, ou « This copy of … »
  suivi de son titre : la modale s'ouvre depuis la ligne de la copie, son code
  d'identification est déjà à l'écran), le ou les élèves qui bloquent, et le
  geste à faire. Au-delà de trois noms, les suivants sont
  comptés et non listés ; le détail par emprunt reste pour US-02. Les lectures
  qui l'alimentent chargent l'élève avec l'emprunt ou la réservation
  (`@EntityGraph`), sans N+1.
- [x] La vérification des emprunts et réservations en cours et l'écriture de
  `deleted_at` ont lieu dans **la même transaction** (`@Transactional`).
- [x] Plus aucun appel à `deleteById` ni à `delete` sur `BookRepository` ou
  `CopyRepository` dans le code de production.
- [x] `coverService.deleteCoverImage` n'est plus appelé depuis
  `BookServiceImpl.deleteBookById`.
- [x] Toute lecture exposée par l'API exclut ce qui est supprimé : liste et
  recherche de livres, `GET /books/{id}`, `GET /books/{id}/copies`,
  `GET /copies/{id}`, comptes de copies (`countCopiesByBookIds`,
  `countByBookId`, `countByBookIdAndStatus`) et la sous-requête de
  `BookSpecifications.hasCopyWithStatus`.
- [x] Les recherches d'unicité de `checkIfBookAlreadyExists` (`findByIsbn10`,
  `findByIsbn13`, `findByTitleIgnoreCase`) ignorent les livres supprimés.
- [x] Le refus opposé à un emprunt ou à une réservation visant une entité
  supprimée est porté par une exception du package `exception/`, rendue au
  format `ApiError` avec un code 4xx — jamais une
  `DataIntegrityViolationException` remontée en 500 par le gestionnaire
  générique.
- [x] `deleteBook()` et `deleteCopy()` (`web/src/api/book.js`,
  `web/src/api/copy.js`) **lèvent** sur une réponse non `ok`, avec `error.status`
  renseigné et le `message` de l'`ApiError` du serveur. Aujourd'hui elles
  renvoient `response.status` sans le regarder, ce qui fait passer un 409 pour
  un succès : c'est ce défaut, corrigé par US-016 et disparu avec elle, que
  cette story reprend.
- [x] Les deux modales de suppression n'émettent `book-deleted` / `copy-deleted`
  qu'en cas de succès, et émettent sinon un événement de refus
  (`CustomEvent` bouillonnant et composé, portant `{ message }`) que
  `catalog-view` traduit en ouverture de la modale d'information. Aucun
  `console.error` seul ne tient lieu de retour à l'utilisateur.
- [x] Le texte des deux modales de confirmation ne promet plus une destruction :
  « All N associated copies will be permanently removed from the library
  system. » devient faux avec `deleted_at` et est réécrit — les copies quittent
  le catalogue, elles ne sont pas détruites. « This action cannot be undone. »
  peut rester : D5 ne prévoit aucune restauration depuis l'interface.
- [x] Une modale d'information à bouton unique existe comme composant **partagé**
  (`web/src/components/`, conventions de nommage `-bks` et `-styles.js`), et
  sert aux deux parcours : son texte est une propriété, elle n'appelle aucune
  API et n'émet que sa fermeture.
- [x] Une seule modale est montée à la fois : ouvrir celle du refus ferme celle
  de la confirmation (l'état des deux est tenu par `catalog-view`, pas par les
  modales). La fermer ne supprime rien, ne recharge rien et laisse la ligne en
  place.
- [x] L'option « Delete book » de `book-table-bks._getDropdownOptions` et
  l'option « Delete copy » de `copy-table-bks._getDropdownOptions` ne sont
  présentes que pour un administrateur ; le rôle vient de
  `getAuthenticatedUser()` (`web/src/auth-state.js`), seule source du front, et
  l'absence de session ne les affiche pas non plus. Ce filtrage est cosmétique
  et le document le dit : c'est `SecurityConfig` qui décide.
- [x] `server/API/` : les fichiers `deleteCopy.bru` et `deleteBook.bru` restent
  valides ; aucun nouvel endpoint n'est introduit par cette story.
- [x] `docs/business-rules/REGLES-METIER-STRUCTURE.md` §2 est réécrit : la règle
  « tout historique bloque » y est remplacée par la règle « un emprunt ou une
  réservation en cours bloque, et la suppression est logique ».
- [x] `docs/business-rules/REGLES-METIER-ACCES.md` est corrigé : dans le tableau
  §3, la ligne « Créer / modifier / supprimer une copie » est scindée — le
  `DELETE` passe à `❌` pour le bibliothécaire — et §4.1, aujourd'hui titrée
  `DELETE /books/{id}` est réservé à l'`ADMIN`, couvre les deux suppressions avec
  la raison donnée plus haut. Sa note de bas de section (« cette
  suppression est de toute façon bloquée dès qu'une copie a été empruntée »)
  devient fausse et disparaît.
- [x] Le document US-016 porte un en-tête indiquant qu'il est remplacé par cette
  story, avec un lien.
- [x] `npm run lint` passe dans `web/` sur les fichiers touchés (plusieurs
  fichiers du dépôt échouent déjà avant toute modification).

---

## Vérification de bout en bout

**Préparation** : base démarrée (`docker compose up -d db`), fixtures chargées,
backend lancé **depuis l'IDE** (c'est lui qui applique `V9`), `npm run dev` dans
`web/`, et les comptes du
[socle commun](README.md#socle-commun-de-vérification). Se connecter en
administrateur. Ouvrir en parallèle un psql :

```bash
docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

1. **Catalogue** → choisir un livre à plusieurs copies. Emprunter la copie 1 à
   Clara Dupont, puis la rendre. Emprunter la copie 2 et **ne pas** la rendre.
2. Supprimer la copie 1 → la modale de confirmation se ferme, **aucune autre
   modale ne s'ouvre**, la ligne disparaît de la liste.
3. psql :
   `SELECT id, status, deleted_at FROM copy WHERE book_id = <id>;` → la copie 1
   a un `deleted_at`, les autres non.
   `SELECT count(*) FROM borrowing WHERE copy_id = <copie 1>;` → toujours 1.
4. Supprimer la copie 2 (empruntée) → confirmer → la modale de confirmation se
   ferme et une modale d'information s'ouvre avec le motif du refus : elle nomme
   le titre et Clara Dupont (« This copy of "…" cannot be deleted: it is
   currently borrowed by Clara Dupont. Take the return before deleting it. »).
   Vérifier qu'elle ne porte **qu'un** bouton de fermeture, que `Échap` et ce
   bouton ferment bien tout, et qu'après fermeture la copie 2 est toujours dans
   la liste. Rouvrir son menu d'actions → « Delete copy » est toujours proposé et
   rouvre la confirmation. psql : son `deleted_at` est toujours `NULL`.
5. Supprimer le livre entier → même parcours à deux modales ; le message nomme
   cette fois le titre et Clara Dupont (« … one of its copies is currently
   borrowed by Clara Dupont. »). psql :
   `SELECT deleted_at FROM book WHERE id = <id>;` → `NULL`.
6. Rendre la copie 2 depuis la vue Scan, puis supprimer le livre → il disparaît
   du catalogue. psql : la ligne `book` et **toutes** ses lignes `copy` portent
   un `deleted_at` ; `SELECT count(*) FROM borrowing;` est inchangé depuis
   l'étape 3.
7. Rechercher le titre du livre supprimé dans la barre de recherche → aucun
   résultat.
8. **Bruno**, session administrateur : `BookController/getBook.bru` sur cet
   identifiant → 404. `BookController/deleteBook.bru` sur le même → 404.
9. Bruno : `CopyController/getCopy.bru` sur la copie 1 → 404.
10. **Front** → *Add book* : recréer un livre avec le titre et l'ISBN du livre
    supprimé → la création réussit, et le catalogue n'en montre qu'un.
11. Poser une réservation sur un autre livre, la laisser en `pending`
    (toutes ses copies sorties), puis tenter de supprimer ce livre → refus.
12. Bruno : `BorrowingController/createBorrowing.bru` avec l'identifiant de la
    copie 1 (supprimée) → refus explicite, pas un 500.
13. **Rôles.** Se reconnecter **en bibliothécaire** dans le front → Catalogue :
    le menu d'actions d'un livre ne propose plus « Delete book », celui d'une
    copie ne propose plus « Delete copy », et les autres entrées des deux menus
    sont intactes.
14. Bruno, session bibliothécaire (`AuthController/login.bru` avec le compte
    `librarian`) : `CopyController/deleteCopy.bru` sur une copie libre → 403 ;
    `BookController/deleteBook.bru` sur le livre C → 403. psql : les deux
    `deleted_at` sont toujours `NULL`. Puis `CopyController/updateCopy.bru` sur
    la même copie → toujours accepté, la restriction ne touche que `DELETE`.

**Nettoyage** : `UPDATE book SET deleted_at = NULL WHERE id = <id>;` et
`UPDATE copy SET deleted_at = NULL WHERE book_id = <id>;` pour rendre le livre
d'essai au catalogue, ou `server/scripts/reset-dev-db.sh` pour repartir propre.

---

## Points de vigilance

- **Un filtre oublié est une fuite silencieuse.** Il n'y a pas de test
  automatisé sur ce périmètre : une requête qui oublie `deleted_at IS NULL`
  ressortira un livre supprimé sans que rien n'échoue. Les endroits recensés au
  moment d'écrire cette story sont `BookRepository.findAll(spec, pageable)`,
  `findAllBooks`, `findBookById`, `findByIsbn10`, `findByIsbn13`,
  `findByTitleIgnoreCase`, `countOtherBooksSharingIsbn`,
  `CopyRepository.findAllByBookId`, `countByBookId`, `countByBookIdAndStatus`,
  `countCopiesByBookIds` et la sous-requête de
  `BookSpecifications.hasCopyWithStatus`. Vérifier qu'il n'en est pas apparu
  d'autre entre-temps plutôt que de recopier cette liste.

- **`findByIsbn13` renvoie un `Optional` et cassera le jour où deux lignes
  partagent l'ISBN.** Il n'y a aucun index unique sur `book.isbn10`, `isbn13`
  ni `title` — l'unicité est purement applicative. Dès qu'un livre supprimé
  peut être recréé, deux lignes peuvent partager le même ISBN, et une lecture
  qui ne filtre pas lèvera une `NonUniqueResultException`. Ces trois méthodes
  doivent filtrer, pas seulement `checkIfBookAlreadyExists`.

- **Ne pas passer les clés étrangères en `CASCADE` pour « simplifier ».** Ce
  serait détruire l'historique de prêt sans prévenir, l'exact inverse de ce que
  protègent les [règles structurelles §2](../../business-rules/REGLES-METIER-STRUCTURE.md).
  Avec `deleted_at`, les `NO ACTION` ne gênent plus personne : plus rien n'est
  supprimé physiquement.

- **`copy.book_id` est en `ON DELETE CASCADE`.** Un `bookRepository.deleteById`
  oublié quelque part emporte les copies en silence, sans erreur. C'est la
  raison du critère « plus aucun `deleteById` ».

- **La fenêtre entre le contrôle et l'écriture.** `deleted_at` ne déclenche
  aucune violation de clé étrangère : si un emprunt est créé entre la
  vérification et l'écriture, on obtient une copie supprimée **et** empruntée,
  sans la moindre erreur. C'est pour cela que les deux opérations partagent une
  transaction, et que la création d'emprunt doit refuser une copie supprimée —
  les deux gardes se referment l'une sur l'autre.

- **Le statut `removed` de `copy_status` n'est pas la réponse**
  ([D7](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Il est
  tentant de l'utiliser au lieu d'ajouter une colonne, mais `copy.status`
  appartient aux triggers
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)) :
  un retour d'emprunt écrirait par-dessus et ressusciterait la copie.

- **Ne pas toucher à `pre_borrow_copy_status`.** `fn_capture_copy_status_on_borrowing_insert`
  lit le statut de la copie avant l'emprunt ; `deleted_at` n'est pas un statut
  et ne doit rien changer à ce trigger.

- **Un 403 déclenche aussi la bannière du shell.** `booksnap-app` affiche sur
  tout 403 un message générique — *« You do not have permission to do that. Ask
  a librarian or an administrator. »* — et `http.js` ne déconnecte pas pour
  autant, à raison. Si une suppression refusée pour cause de rôle passait quand
  même par la modale d'information, l'utilisateur lirait deux messages
  concurrents pour un seul refus. C'est l'autre raison de retirer l'option du
  menu : la modale de refus est faite pour le **409**, le 403 reste au shell.

- **Le filtrage du menu par rôle n'est pas une protection.** `auth-state.js` le
  dit de lui-même : il décrit ce que le front croit de la session, et rien
  d'autre. Un menu nettoyé n'empêche pas un `fetch` à la main ; le critère
  `hasRole(ADMIN)` dans `SecurityConfig` est la seule chose qui refuse, et c'est
  lui qu'il faut vérifier depuis Bruno, pas depuis l'interface.

- **`dropdown-bks` reçoit une liste, pas des options désactivées.** Les deux
  `_getDropdownOptions` construisent un tableau ; `copy-table-bks` y compose
  déjà des entrées conditionnelles avec des `...(condition ? [...] : [])`. Suivre
  cette forme plutôt qu'ajouter un attribut « disabled » que le composant ne
  connaît pas — et vérifier que le menu ne se retrouve pas vide pour un rôle,
  auquel cas c'est le bouton d'actions lui-même qui ne doit pas être rendu.

- **Deux modales, un seul propriétaire d'état.** `catalog-view` tient déjà
  `bookToDelete` et `copyToDelete`, et l'ouverture des modales en dérive
  (`?open=${!!this.bookToDelete}`). Le refus ajoute un troisième état ; le mettre
  à `null` en même temps qu'on renseigne le motif est ce qui garantit qu'une
  seule modale est à l'écran. Faire ouvrir la modale de refus **par** la modale
  de confirmation reviendrait à imbriquer deux `modal-bks`, chacun avec son
  propre overlay et son propre piège de focus.

- **Le message vient du serveur, et il faut qu'il y en ait un.** La modale
  n'invente rien : elle affiche le `message` de l'`ApiError`. Un handler qui
  oublie de le renseigner produit une modale vide — un refus sans motif est pire
  qu'un `console.error`. Prévoir une phrase de repli côté front pour le cas où
  le corps de la réponse n'est pas exploitable (réseau coupé, 500 inattendu).

- **`_handleBookDeleted` de `catalog-view.js` invalide le cache de couverture.**
  Puisque la couverture n'est plus supprimée côté serveur, cette invalidation
  devient inutile. Inoffensive, mais son commentaire — *« The server drops the
  cover with the book »* — devient faux et doit être corrigé ou retiré.
