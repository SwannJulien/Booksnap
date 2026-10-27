# US-01 — Un ajout de livre échoué ne laisse aucune trace

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Création de livre atomique |
| **Nature** | feature |
| **Dépend de** | — |
| **Bloque** | — |
| **Portée** | back |
| **Casse l'existant ?** | Oui, à la marge : un code Dewey inconnu répond `404` au lieu de `400` ; un `libraryId` inconnu répond `404` au lieu de `400` ; un échec de génération du QR code répond `500` au lieu de `400`. Le front affiche ces trois cas dans la même modale d'erreur qu'aujourd'hui. |

---

## Story

**En tant que** bibliothécaire
**je veux** qu'un ajout de livre refusé ne crée rien du tout
**afin de** pouvoir corriger ma saisie et réessayer sans buter sur un `409` provoqué par mon propre essai raté, et sans laisser dans le journal un `book_created` qui ne correspond à aucun livre réel.

---

## Contexte

### `addBook` n'est pas transactionnel

`server/src/main/java/net/booksnap/domain/book/service/BookServiceImpl.java`,
lignes 81-107 — pas de `@Transactional`, alors que `deleteBookById` et
`updateBook` du même service l'ont :

```java
public CreateBookResponse addBook(CreateBookRequest createBookRequest) {
    try {
        checkIfBookAlreadyExists(createBookRequest);

        Book savedBook = createNewBook(createBookRequest);
        Copy savedCopy = createNewCopy(createBookRequest, savedBook);

        // Generate QR code image
        byte[] qrCode = qrCodeService.generateCopyQRCode(savedCopy);

        return new CreateBookResponse(...);

    } catch (BookAlreadyExistsException ex) {
        throw ex; // Re-throw to be handled by GlobalExceptionHandler
    } catch (Exception ex) {
        if (ex.getMessage().contains("non_fiction_requires_dewey")) {
            throw new FictionBookHasDeweyCodeException();
        } else if (ex.getMessage().contains("persistent instance references an unsaved transient instance of 'net.booksnap.entity.dewey.Dewey'")) {
            throw new DeweyCodeNotFoundException(createBookRequest.codeDewey());
        } else throw new BadRequestException(ex.getMessage());
    }
}
```

Chaque `repository.save` ouvre et valide sa propre transaction. Ce qui est écrit
avant un échec reste écrit.

### Ce qui est écrit, et dans quel ordre

| Ordre | Écriture | Où |
|---|---|---|
| 1 | nouveaux genres (`genreRepository.save`) | `BookApiMapper.assignGenres`, pendant le mapping |
| 2 | nouveaux auteurs (`authorRepository.save`) | `BookApiMapper.assignAuthors`, pendant le mapping |
| — | recherche du code Dewey, `DeweyCodeNotFoundException` si inconnu | `BookApiMapper.assignDeweyCategory` |
| 3 | `book` + `book_created` (trigger `trg_book_write_event`) | `createNewBook` |
| 4 | `copy` + `copy_created` (trigger `trg_copy_write_event`) | `createNewCopy` |
| — | QR code — peut lever `RuntimeException("Failed to generate QR code …")` | `QRCodeService.generateCopyQRCode` |

`server/src/main/java/net/booksnap/domain/book/mapper/BookApiMapper.java` :

```java
return genreRepository.findByName(trimmed)
        .orElseGet(() -> genreRepository.save(new Genre(null, trimmed, new HashSet<>())));
...
DeweyCategory category = deweyCategoryRepository.findByCode(codeDewey)
        .orElseThrow(() -> new DeweyCodeNotFoundException(codeDewey));
```

Conséquence que la pré-spec ne relevait pas : **un code Dewey inconnu laisse
déjà aujourd'hui derrière lui les auteurs et genres nouveaux** de la requête,
enregistrés aux étapes 1-2 avant que la recherche Dewey échoue.

### Ce qui casse aujourd'hui

| Échec | Réponse aujourd'hui | Ce qui reste en base |
|---|---|---|
| copie refusée par la base (`libraryId` inconnu → `copy_library_id_fkey` ; `sectionName` > 255 caractères → `copy.section_name varchar(255)`) | `400`, message brut de la base | livre, `book_created`, auteurs et genres nouveaux |
| QR code non généré | `400` | livre, copie, `book_created`, `copy_created`, auteurs et genres |
| code Dewey inconnu | `400` (la `DeweyCodeNotFoundException` du mapper est rattrapée par `catch (Exception)` et réemballée en `BadRequestException`) | auteurs et genres nouveaux |
| nouvel essai après un échec avec livre orphelin | `409 BookAlreadyExistsException` sur le titre | — |

Le handler du `404` existe mais n'est jamais atteint par cette route —
`server/src/main/java/net/booksnap/exception/GlobalExceptionHandler.java:138` :

```java
@ExceptionHandler(DeweyCodeNotFoundException.class)
public ResponseEntity<ApiError> handleDeweyCodeNotFound(...) { ... HttpStatus.NOT_FOUND ... }
```

La branche « transient instance » est morte : l'entité s'appelle
`net.booksnap.domain.dewey.DeweyCategory`, et le mapper lève déjà
`DeweyCodeNotFoundException` avant toute écriture du livre.

### La bibliothèque n'est pas vérifiée

`createNewCopy` fabrique une référence sans la charger :

```java
copy.setLibrary(new Library(createBookRequest.libraryId(), null));
```

Il n'existe pas de `LibraryRepository` aujourd'hui. Seule la clé étrangère
`copy_library_id_fkey` (`V1__baseline_schema.sql:963`) arrête un id inconnu, et
seulement au moment de l'insertion de la copie — après le livre. La table
`library` (`id`, `name`, audit) n'a pas d'état archivé.

### Le journal

`V10__lifecycle_event.sql` : chaque événement est écrit par trigger, dans la
transaction de l'opération ; « A statement rolled back leaves no event ».
`occurred_at` vaut `DEFAULT now()`, c'est-à-dire l'heure de **début de
transaction** : deux événements d'une même transaction ont le même
`occurred_at`. Aujourd'hui `book_created` et `copy_created` d'un même ajout
diffèrent de quelques dizaines de millisecondes (≈ 47 ms sur le livre « Blanc »).
La table refuse `UPDATE` et `DELETE`.

### Le front

`web/src/features/book/create-book-bks/create-book-bks.js`, `submitBook` :
`201` → modale succès, `409` → modale conflit, **tout autre statut** → modale
d'erreur avec `response.body.message`. `web/src/api/bookService.js` envoie
`libraryId = 1` en dur. Aucun changement front n'est nécessaire.

### Règles du projet qui s'appliquent

- `.claude/CLAUDE.md`, « Copy status is owned by database triggers » : les
  triggers écrivent dans la transaction de l'opération.
- `.claude/CLAUDE.md`, « Case-insensitive columns » : `author.name` et
  `genre.name` sont `citext` ; la recherche d'auteur/genre existant n'est pas
  concernée par cette story.

---

## Décisions et non-objectifs

- **Tout ou rien** — un échec à n'importe quelle étape de l'ajout (genres,
  auteurs, livre, copie, QR code) annule toutes les écritures de cet ajout, y
  compris les lignes de `lifecycle_event`.
- **La bibliothèque est vérifiée avant toute écriture, `404` si inconnue** —
  même traitement que le code Dewey. Rejeté : laisser échouer la clé étrangère
  et répondre `400`, qui renvoie au client une erreur de base traduite au lieu
  d'un refus métier.
- **Les exceptions métier traversent sans être réemballées** —
  `BookAlreadyExistsException` (`409`), `DeweyCodeNotFoundException` (`404`), la
  nouvelle exception « bibliothèque introuvable » (`404`) et
  `FictionBookHasDeweyCodeException` (`400`) arrivent telles quelles à
  `GlobalExceptionHandler`.
- **Un échec du QR code répond `500`** — c'est une défaillance du serveur, pas
  une requête invalide : le handler générique répond `500 Internal server error`
  et journalise la cause. Rejeté : garder `400`, qui dit au bibliothécaire que sa
  saisie est fautive.
- **La traduction des erreurs de base se fait sur le nom de la contrainte, pas
  sur le texte du message** — la branche morte « transient instance » montre
  qu'un texte de message change sans prévenir. `non_fiction_requires_dewey` est
  reconnue par son nom de contrainte.
- **La branche « transient instance » disparaît.**
- **Assumé, non confirmé** : toute autre violation d'intégrité (par exemple une
  section trop longue) reste un `400` portant le message actuel de la base. Le
  nettoyage de ce message (qui expose du SQL) est hors périmètre.
- **Assumé, non confirmé** : la vérification de la bibliothèque porte sur
  l'existence seulement — il n'y a pas d'état archivé à prendre en compte.
- **Assumé, non confirmé** : aucun changement front ; `400` et `404` restent
  affichés dans la même modale d'erreur.

**Hors périmètre de cette story** :

- les livres sans copie déjà présents en base — listés en vérification, non
  nettoyés ;
- l'envoi de la couverture (second appel du front ; un livre sans couverture est
  valide) ;
- la course entre deux créations simultanées du même titre
  (`checkIfBookAlreadyExists` lit puis écrit sans verrou, `book.title` n'a pas
  d'index unique — une transaction ne la ferme pas) ;
- `updateBook` ;
- le choix de la bibliothèque dans le formulaire.

---

## Scénarios

### Scénario : un ajout valide crée livre, copie et événements dans la même transaction

```gherkin
Given un bibliothécaire connecté
When il envoie POST /api/v1/books avec un titre inédit, libraryId = 1 et une section valide
Then la réponse est 201 avec bookId, copyId, identificationCode et qrCode
And lifecycle_event contient un book_created et un copy_created pour ce bookId
And ces deux lignes ont exactement le même occurred_at
And leur actor est l'email du bibliothécaire
```

### Scénario : une copie refusée par la base n'enregistre pas le livre

```gherkin
Given un bibliothécaire connecté
And le titre "ATOM-section" absent du catalogue
When il envoie POST /api/v1/books avec le titre "ATOM-section" et un sectionName de 300 caractères
Then la réponse est 400
And aucune ligne de book n'a le titre "ATOM-section"
And aucune ligne de lifecycle_event n'a detail->>'title' = 'ATOM-section'
```

### Scénario : un nouvel essai corrigé aboutit au lieu de buter sur un 409

```gherkin
Given l'essai du scénario précédent vient d'échouer
When le bibliothécaire renvoie la même requête avec un sectionName valide
Then la réponse est 201
```

### Scénario : un ajout refusé ne laisse pas d'auteur ni de genre nouveau

```gherkin
Given aucun auteur nommé "ATOM Auteur" et aucun genre nommé "ATOM Genre"
When le bibliothécaire envoie POST /api/v1/books avec cet auteur, ce genre et un sectionName de 300 caractères
Then la réponse est 400
And la table author ne contient pas "ATOM Auteur"
And la table genre ne contient pas "ATOM Genre"
```

### Scénario : un code Dewey inconnu répond 404 sans rien écrire

```gherkin
Given aucun code Dewey "999.999" dans dewey_category
And aucun auteur nommé "ATOM Dewey"
When le bibliothécaire envoie POST /api/v1/books avec isFiction = false, codeDewey = "999.999" et l'auteur "ATOM Dewey"
Then la réponse est 404 avec le message "Dewey code not found: 999.999"
And aucun livre n'est créé
And la table author ne contient pas "ATOM Dewey"
```

### Scénario : une bibliothèque inconnue répond 404 sans rien écrire

```gherkin
Given aucune bibliothèque d'id 999999
When le bibliothécaire envoie POST /api/v1/books avec libraryId = 999999 et un titre inédit
Then la réponse est 404 et son message nomme la bibliothèque introuvable (id 999999)
And aucun livre de ce titre n'existe
And aucune ligne de lifecycle_event ne porte ce titre
```

### Scénario : un livre de fiction avec code Dewey reste refusé en 400

```gherkin
Given un code Dewey existant
When le bibliothécaire envoie POST /api/v1/books avec isFiction = true et ce code Dewey
Then la réponse est 400 avec le message "Fiction book can't have a Dewey code."
And aucun livre de ce titre n'existe
```

### Scénario : un titre déjà présent reste refusé en 409

```gherkin
Given un livre non supprimé intitulé "Harry Potter and the Sorcerer's Stone"
When le bibliothécaire envoie POST /api/v1/books avec ce titre
Then la réponse est 409 et le corps porte le bookId du livre existant
```

### Scénario : un échec du QR code annule tout et répond 500

```gherkin
Given la génération du QR code échoue pour cette requête
When le bibliothécaire envoie POST /api/v1/books avec un titre inédit valide
Then la réponse est 500 "Internal server error"
And aucun livre, aucune copie ni aucune ligne de lifecycle_event de ce titre n'existe
And le journal applicatif contient la cause de l'échec
```

---

## Critères d'acceptation

- [x] `POST /api/v1/books` : contrat de requête et de réponse `201` inchangés.
- [x] Bibliothèque inconnue : `404`, corps `ApiError`, levée par une exception
      dédiée gérée dans `GlobalExceptionHandler`, sur le modèle de
      `DeweyCodeNotFoundException`.
- [x] La détection de `non_fiction_requires_dewey` repose sur le nom de la
      contrainte, plus sur `ex.getMessage()`.
- [x] La branche « transient instance » n'existe plus dans `BookServiceImpl`.
- [x] Aucune migration : le schéma ne change pas.
- [x] Le scénario QR code est couvert par un test JUnit dans `server/src/test`
      (il n'est pas déclenchable par l'API) ; les tests passent depuis l'IDE.
- [x] `server/API/BookController/` a une requête pour la bibliothèque inconnue et
      une pour le code Dewey inconnu, à côté de `createBook.bru`.
- [x] Le backend démarre depuis l'IDE avec `ddl-auto=validate`.
- [x] Commentaires en anglais, limités à ce que le code ne dit pas.

---

## Vérification de bout en bout

**Mise en place** : socle commun de la [feature](../README.md#socle-commun-de-vérification)
— fixtures chargées, bibliothécaire connecté dans Bruno, backend démarré depuis
l'IDE. Shell psql ouvert :
`docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.

0. État de départ, pour information — livres déjà orphelins :
   ```sql
   SELECT b.id, b.title FROM book b
   WHERE b.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM copy c WHERE c.book_id = b.id);
   ```
   → noter le résultat ; la story n'y touche pas.
1. Bruno, `createBook` avec `title = "ATOM-section"`, `authors = ["ATOM Auteur"]`,
   `genres = ["ATOM Genre"]`, `sectionName` de 300 caractères → `400`.
2. psql :
   ```sql
   SELECT count(*) FROM book WHERE title = 'ATOM-section';               -- 0
   SELECT count(*) FROM lifecycle_event WHERE detail->>'title' = 'ATOM-section'; -- 0
   SELECT count(*) FROM author WHERE name = 'ATOM Auteur';               -- 0
   SELECT count(*) FROM genre WHERE name = 'ATOM Genre';                 -- 0
   ```
3. Renvoyer la même requête avec `sectionName = "Fiction"` → `201`, pas `409`.
4. psql :
   ```sql
   SELECT type, occurred_at, actor FROM lifecycle_event
   WHERE detail->>'title' = 'ATOM-section' ORDER BY id;
   ```
   → `book_created` puis `copy_created`, même `occurred_at`, `actor` = email du
   bibliothécaire.
5. Bruno, `createBook` avec `title = "ATOM-dewey"`, `isFiction = false`,
   `codeDewey = "999.999"`, `authors = ["ATOM Dewey"]` → `404`
   « Dewey code not found: 999.999 » ; psql : ni livre `ATOM-dewey`, ni auteur
   `ATOM Dewey`.
6. Bruno, `createBook` avec `title = "ATOM-library"`, `libraryId = 999999` →
   `404` nommant la bibliothèque ; psql : ni livre ni événement `ATOM-library`.
7. Bruno, `createBook` avec `title = "ATOM-fiction"`, `isFiction = true` et un
   code Dewey existant (`SELECT code FROM dewey_category LIMIT 1`) → `400`
   « Fiction book can't have a Dewey code. » ; psql : pas de livre `ATOM-fiction`.
8. Bruno, `createBook` avec le titre d'un livre des fixtures → `409` avec son
   `bookId`.
9. Interface : ajouter un livre `ATOM-ui` par le formulaire du catalogue → modale
   de succès avec le QR code ; psql : `book_created` et `copy_created` de
   `ATOM-ui` ont le même `occurred_at`.
10. IDE : lancer le test JUnit du scénario QR code → vert.

**Nettoyage** : supprimer `ATOM-section` et `ATOM-ui` depuis le catalogue
(suppression logique). Les lignes de `lifecycle_event` restent — la table est
en ajout seul, c'est voulu. Pour tout effacer, `server/scripts/reset-dev-db.sh`.

---

## Points de vigilance

- **Ne pas se contenter d'ajouter `@Transactional`** — aujourd'hui chaque `save`
  valide aussitôt, donc toute erreur de base surgit **dans** le `try`. Une fois
  la méthode transactionnelle, ce qu'Hibernate repousse au flush n'apparaît
  qu'à la validation, après le retour de la méthode, hors du `catch` — et finit
  en `500` au lieu du `400` attendu. L'insertion en `IDENTITY` part dès le `save`,
  mais la cascade vers auteurs et genres, ou une contrainte ajoutée plus tard,
  ne suit pas forcément ce chemin. Les écritures du livre et de la copie doivent
  atteindre la base à l'intérieur du `try`.
- **Ne pas tester l'atomicité avec un `libraryId` inconnu** — une fois la
  bibliothèque vérifiée en amont, ce cas n'écrit plus rien, il ne prouve donc
  plus que l'annulation fonctionne. C'est la section trop longue qui échoue
  **après** l'insertion du livre.
- **Ne pas rattraper une erreur de base pour continuer dans la même
  transaction** — PostgreSQL abandonne la transaction à la première erreur, et
  Spring la marque « rollback-only » dès qu'une exception traverse un
  `save` de repository. Continuer donne `UnexpectedRollbackException` au commit.
  Traduire et relancer, oui ; reprendre, non.
- **Deux `ConstraintViolationException` existent** — celle d'Hibernate
  (`org.hibernate.exception`, porte `getConstraintName()`) et celle de Jakarta
  Validation. Seule la première sert ici.
- **Le mapper écrit** — `BookApiMapper.createRequestToBookEntity` n'est pas une
  simple conversion : il enregistre les auteurs et genres nouveaux. Il doit
  s'exécuter dans la transaction de l'ajout, sinon ces lignes survivent à un
  échec.
- **Ne pas modifier `V10__lifecycle_event.sql`** ni un autre fichier de
  migration appliqué (checksum Flyway) — cette story ne change pas le schéma.
