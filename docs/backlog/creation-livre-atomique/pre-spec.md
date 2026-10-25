# Pré-spec — Créer un livre et sa première copie d'un seul tenant

| | |
|---|---|
| **Nature** | fix |
| **Portée** | back |
| **Casse l'existant ?** | Oui, à la marge — un code Dewey inconnu répond `404` au lieu de `400`. Le front ne distingue pas les deux. |
| **Origine** | Relevé pendant la vérification de bout en bout de [US-04](../../implementation/cycle-de-vie-livre-copie/US-04-journal-cycle-de-vie.md) (étape 3), 2026-10-24 |

---

## Le problème

`BookServiceImpl.addBook` n'est pas `@Transactional`. Le livre et sa première
copie sont enregistrés dans **deux transactions distinctes** — une par
`repository.save`, chacune validée aussitôt. Le plan de US-04 le notait déjà
(« sans conséquence pour le journal, mais à savoir ») ; le journal le rend
visible : `book_created` et `copy_created` d'un même ajout ont des horodatages
distincts (≈ 47 ms d'écart sur le livre « Blanc »).

### Ce qui casse

Si l'enregistrement de la copie échoue, **le livre reste**, sans copie :

- l'appel répond `400`, le bibliothécaire croit que rien n'a été créé ;
- il réessaie → `409 BookAlreadyExistsException` sur le titre, parce que le
  livre orphelin existe ;
- le journal porte un `book_created` sans `copy_created`, et cette ligne ne
  s'efface pas (le journal est en ajout seul).

Cas concret qui déclenche l'échec : un `libraryId` qui n'existe pas
(`copy_library_id_fkey`). Le front envoie aujourd'hui `libraryId = 1` en dur
(`bookService.createBook`), donc le cas se produit par l'API (Bruno) plutôt que
par l'interface — mais il suffit qu'une bibliothèque soit choisie un jour dans
le formulaire. `identification_code` n'est **pas** unique en base : ce n'est
pas une source d'échec.

La génération du QR code, après les deux `save`, a le même défaut : si elle
lève, livre et copie sont validés mais l'appel répond `400`.

### Un défaut voisin, dans le même `catch`

Le `catch (Exception ex)` de `addBook` traduit les erreurs en lisant leur
message :

- `non_fiction_requires_dewey` → `FictionBookHasDeweyCodeException` ;
- `"…unsaved transient instance of 'net.booksnap.entity.dewey.Dewey'"` →
  `DeweyCodeNotFoundException` ;
- tout le reste → `BadRequestException`.

La deuxième branche est **morte** : l'entité s'appelle désormais
`net.booksnap.domain.dewey.DeweyCategory`, et de toute façon
`BookApiMapper.mapDeweyCategory` cherche déjà le code et lève
`DeweyCodeNotFoundException` **avant** tout enregistrement. Mais cette
exception tombe dans le `catch (Exception)` générique et ressort en
`BadRequestException` — `400` au lieu du `404` que
`GlobalExceptionHandler.handleDeweyCodeNotFound` prévoit.

## La direction

1. `addBook` devient `@Transactional`, comme `deleteBookById` et `updateBook`
   le sont déjà : un échec n'importe où annule le livre, la copie et leurs
   lignes de journal.
2. Les exceptions métier levées en amont (`BookAlreadyExistsException`,
   `DeweyCodeNotFoundException`) traversent le `catch` sans être réemballées.
3. La branche « transient instance » disparaît.

### Le piège à ne pas manquer

Aujourd'hui, chaque `save` valide sa propre transaction : toute erreur de base
remonte **dans** le `try`, où le `catch` la traduit. Une fois la méthode
transactionnelle, ce qu'Hibernate repousse au *flush* ne surgit qu'à la
validation — **après** le retour de la méthode, hors du `catch` — et finit en
`500`.

Avec des identifiants `IDENTITY`, l'`INSERT` part dès le `save`, donc
`non_fiction_requires_dewey` reste attrapée. Mais rien ne garantit que toutes
les erreurs suivent ce chemin (cascade des auteurs et genres, contraintes
ajoutées plus tard). `saveAndFlush` sur le livre et sur la copie garde
l'erreur dans le `try`, quel que soit le mécanisme.

## Questions ouvertes

- **Traduire par message ou par contrainte ?** Lire `ex.getMessage()` est
  fragile : la branche morte en est la preuve. Alternative : attraper
  `DataIntegrityViolationException` et lire le nom de la contrainte
  (`ConstraintViolationException.getConstraintName()`). À trancher dans la
  spec.
- **Faut-il valider `libraryId` avant d'écrire**, et répondre `404` sur une
  bibliothèque inconnue plutôt que `400` sur une violation de clé étrangère ?
- **La couverture** est envoyée par un second appel après la création
  (`bookService.createBook` côté front). Un échec de l'envoi laisse un livre
  sans couverture — c'est un état valide, pas un orphelin. Hors périmètre, sauf
  avis contraire.

## Hors périmètre

- La course entre deux créations simultanées du même titre :
  `checkIfBookAlreadyExists` lit puis écrit sans verrou, et `book.title` n'a
  pas d'index unique. Une transaction ne la ferme pas.
- `updateBook`, déjà transactionnel.

## Vérification envisagée

- Bruno : `POST /api/v1/books` avec un `libraryId` inexistant → erreur, **et**
  `SELECT count(*) FROM book` inchangé, aucun `book_created` de plus dans
  `lifecycle_event`. Réessayer avec un `libraryId` valide → `201`, pas `409`.
- Bruno : code Dewey inconnu → `404`.
- Livre fiction avec code Dewey → `400` `FictionBookHasDeweyCodeException`,
  toujours.
- Ajout normal par l'interface → `book_created` et `copy_created`, désormais
  dans la même transaction (même `now()`, donc même `occurred_at`).
