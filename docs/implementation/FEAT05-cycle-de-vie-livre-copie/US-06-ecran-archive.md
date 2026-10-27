# US-06 — L'écran d'archive et l'historique

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | [US-05](US-05-lecture-historique.md), [FEAT-tests-bout-en-bout / US-01](../FEAT-tests-bout-en-bout/US-01-harnais-playwright/US-01-harnais-playwright-spec.md) |
| **Bloque** | — |
| **Portée** | back (autorisations) · front |
| **Casse l'existant ?** | Oui, côté autorisations — un bibliothécaire, refusé en 403 depuis US-05 sur l'archive et l'historique, y reçoit désormais 200. Côté front, une route, une entrée de navigation et une entrée dans chacun des deux menus de ligne s'ajoutent. |

---

## Récit

**En tant que** bibliothécaire ou administrateur
**je veux** parcourir ce qui a été supprimé et lire l'historique d'un livre ou
d'une copie dans l'application
**afin de** répondre à « qu'est-il arrivé à cet exemplaire ? » sans ouvrir un
client SQL, y compris après sa suppression.

## Contexte

Termes : **archive** et **historique** au sens du
[glossaire](../../GLOSSARY.md) (_Archive_, _History_).

**Les quatre endpoints de US-05 existent et ne sont appelés par personne**, et
ils sont réservés à l'administrateur :

```java
// server/src/main/java/net/booksnap/config/SecurityConfig.java
.requestMatchers(HttpMethod.GET, "/api/v1/books/*/history").hasRole(ADMIN)
...
.requestMatchers(HttpMethod.GET, "/api/v1/copies/*/history").hasRole(ADMIN)
...
.requestMatchers(HttpMethod.GET, "/api/v1/archive/books", "/api/v1/archive/copies").hasRole(ADMIN)
```

Les réponses (toutes en `PagedResponse`, première page = 1 ; 50 événements par
page pour l'historique, 10 lignes pour l'archive) :

```java
// server/src/main/java/net/booksnap/domain/lifecycle/api/dto/LifecycleEventResponse.java
public record LifecycleEventResponse(
    Long id, LocalDateTime occurredAt, LifecycleEventType type, String actor,
    CopyRef copy, StudentRef student, Map<String, Object> detail,
    boolean backfilled, boolean approximateDate) { ...
    public record CopyRef(Long id, String identificationCode) {}
    public record StudentRef(Long id, String firstName, String lastName) {}
}

// .../DeletedBookResponse.java
public record DeletedBookResponse(Long id, String title, LocalDateTime deletedAt,
    String deletedBy, long copiesDeletedWithBook) {}

// .../DeletedCopyResponse.java
public record DeletedCopyResponse(Long id, String identificationCode, Long bookId,
    String bookTitle, LocalDateTime deletedAt, String deletedBy) {}
```

Ce que `detail` contient selon le type, d'après les triggers de
`V10__lifecycle_event.sql` : `copy_status_changed` porte `from` et `to` (valeurs
de `copy_status`) ; `book_updated` et `copy_updated` portent `changes`, un objet
dont les clés sont les **noms de colonne** modifiés (`title`, `section_name`, …)
et les valeurs `{ old, new }` ; tous portent `title`. Les types possibles :

```sql
CREATE TYPE lifecycle_event_type AS ENUM (
    'book_created', 'book_updated', 'book_deleted',
    'copy_created', 'copy_updated', 'copy_status_changed', 'copy_deleted',
    'borrowed', 'overdue', 'returned',
    'hold_placed', 'hold_promoted', 'hold_expired', 'hold_fulfilled'
```

**Un bibliothécaire lit déjà les emprunts et les réservations avec le nom des
élèves** — `GET /api/v1/borrowings` et `GET /api/v1/holds` sont en
`hasAnyRole(LIBRARIAN, ADMIN)`. La raison donnée par US-05 pour réserver le
journal à l'administrateur (« le journal nomme des élèves ») ne le distingue
donc pas de ce que le bibliothécaire voit déjà.

**Les routes sont gardées par la session, pas par le rôle.** `booksnap-app.js`
déclare chaque route par `_protectedRoute(path, component, loadView)`, dont la
garde ne vérifie que `isAuthenticated()`. **Le rôle décide déjà de ce qui
s'affiche** — contrairement à ce que disait la pré-spec de cette story :

```js
// web/src/auth-state.js
export function isAdmin() {
  return authenticatedUser?.role === 'admin';
}
```

```js
// web/src/features/book/book-table-bks/book-table-bks.js — _getDropdownOptions(book)
...(isAdmin()
  ? [{ action: 'delete-book', data: book, ..., label: 'Delete book', class: 'dropdown-item-danger' }]
  : []),
```

`copy-table-bks` fait de même pour `delete-copy`. Le module `auth-state.js` le
dit : « None of this is a security boundary. »

**Le catalogue n'a pas de fiche livre.** Un livre est une ligne de
`book-table-bks` ; ses copies apparaissent dans `copy-table-bks` quand on déplie
la ligne. Chaque ligne, livre ou copie, a un menu ⋮ (`dropdown-bks`) qui émet
`dropdown-selected-option` avec `{ action, data }` ; `catalog-view.js` aiguille :

```js
// web/src/views/catalog-view/catalog-view.js — _handleDropdownAction
switch (action) {
  case 'update-book': ...
  ...
  case 'hold-book':
    this._handleHoldBook(data);
    break;
  default:
    break;
}
```

Pour une copie, `data` porte la copie plus `bookId` et `bookTitle`.

**Un 403 est déjà traité pour toute l'application** : `apiFetch` (`api/http.js`)
émet `ACCESS_DENIED_EVENT`, et la coquille affiche pendant 8 s un bandeau
`role="alert"` : « You do not have permission to do that. Ask a librarian or an
administrator. »

**La pagination du catalogue** affiche
`Showing ${start} to ${end} of ${totalElements} results` avec deux boutons
« Previous » / « Next », désactivés aux extrémités (`book-table-bks`,
`_footerContentTpl`).

**Les dates** : `utils/dateFormatter.js` ne formate que le jour, sur deux
chiffres (`Oct 12, 2023`, mais `Jan 09, 2023`), et parse champ par champ, parce
que `new Date('2023-10-12')` est lu en UTC.

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Back | Les quatre endpoints répondent 403 à un bibliothécaire |
| Back | `LifecycleHistoryTest` : « US-05: a librarian can reach neither the history nor the archive » ; `ApiAuthorizationMatrixTest` déclare les quatre chemins `ADMIN_ONLY` |
| Front | Aucune route, aucune entrée de navigation ne mène à une archive |
| Front | Les menus de `book-table-bks` et `copy-table-bks` n'ont aucune entrée d'historique |

Contraintes : [règles accès §3](../../business-rules/REGLES-METIER-ACCES.md#3-matrice-des-permissions),
[D4, D5 et D11](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité),
conventions front de `.claude/CLAUDE.md`.

---

## Décisions et non-objectifs

- **Le bibliothécaire lit l'archive et les deux historiques**, comme
  l'administrateur ; l'élève reste refusé. Les quatre endpoints passent en
  `LIBRARIAN` + `ADMIN`. Cette décision **remplace** celle de US-05
  (« Réservé à l'`ADMIN` ») : le bibliothécaire voit déjà les emprunts et les
  réservations nominatifs, et c'est lui qu'on interroge au comptoir. Rejeté :
  lui ouvrir l'archive sans les historiques — il saurait qu'un livre a été
  supprimé sans pouvoir dire ce qui lui est arrivé. Rejeté aussi : la pré-spec,
  qui excluait tout accès du bibliothécaire.

- **Une route dédiée `/archive`**, et non un onglet de `settings-view` :
  l'archive n'est pas un réglage, c'est une consultation. L'entrée de
  navigation « Archive » se place après « Analytics » et n'apparaît que pour un
  bibliothécaire ou un administrateur — commodité d'affichage, pas protection :
  c'est le 403 du serveur qui protège.

- **Un élève qui atteint `/archive` voit un message dédié** en plus du bandeau
  de la coquille, et pas le message de panne : le bandeau disparaît après 8 s,
  et « impossible de charger » mentirait sur la cause.

- **Lecture seule** ([D5](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) :
  aucun bouton de restauration ni de suppression définitive.

- **L'historique s'affiche dans une modale**, la même depuis l'archive et
  depuis le catalogue, comme les autres détails du catalogue. Fermer la modale
  rend l'écran tel qu'il était (page d'archive, lignes dépliées). Rejeté : une
  route par historique, qui ferait quitter le catalogue et perdre la recherche
  en cours.

- **Depuis l'archive, un bouton « History » par ligne ouvre l'historique de
  l'entité de la ligne** : celui du livre pour un livre supprimé (copies
  comprises, comme US-05 le renvoie), celui de la copie seule pour une copie
  supprimée. Rejeté : la ligne entière cliquable, que le catalogue n'utilise
  nulle part ; ouvrir depuis une copie l'historique de son livre.

- **Depuis le catalogue, une entrée « View history »** dans le menu ⋮ du livre
  et dans celui de chaque copie, pour un bibliothécaire ou un administrateur.

- **Un événement est une ligne d'un tableau à quatre colonnes** — Date, Event,
  Copy, By — avec un libellé lisible par type (voir les scénarios), pas du JSON
  brut. La colonne Copy porte le code d'identification, vide pour un événement
  du livre seul. Un changement de statut passe par les libellés de
  `formatStatus`. Pour `book_updated` et `copy_updated`, les champs modifiés sont
  nommés tels qu'enregistrés (noms de colonne), séparés par des virgules. Un
  type inconnu du front affiche son identifiant brut plutôt que de casser la
  liste. Rejeté : une phrase par événement, plus dure à parcourir par copie ou
  par personne.

- **Une date approchée** (événement repris par `V10`) s'affiche au jour, suivie
  de « (approx.) », sans heure : l'heure enregistrée n'a pas de sens.

- **Pagination** : chaque liste d'archive a le pied de page du catalogue
  (« Showing … results », Previous / Next) et se pagine indépendamment de
  l'autre. L'historique affiche ses 50 premiers événements et un bouton « Load
  more » qui ajoute les 50 suivants sous les précédents et disparaît quand tout
  est affiché. Rejeté : Previous / Next dans l'historique, qui découperait une
  suite d'événements qui se lit d'un bout à l'autre.

- **Un historique vide est un cas défensif, pas un cas normal** : tout livre et
  toute copie ont au moins leur événement de création (US-05, Contexte). La
  pré-spec affirmait le contraire.

- **Les scénarios sont des tests Playwright** sur la base jetable de
  [FEAT-tests-bout-en-bout / US-01](../FEAT-tests-bout-en-bout/US-01-harnais-playwright/US-01-harnais-playwright-spec.md) ;
  l'interception réseau n'y sert qu'aux états que les données réelles ne peuvent
  pas produire ou ne garantissent pas : archive vide, panne du serveur, échec de
  « Load more », historique vide (tout livre a son événement de création), type
  d'événement inconnu (`type` est un enum PostgreSQL et un enum Java, aucune
  ligne réelle ne peut porter `some_new_type`).

- **Assumé, non confirmé** : pas de présentation en cartes sur écran étroit
  pour l'archive ni pour l'historique ; les tableaux restent des tableaux.

**Hors périmètre de cette story** : restaurer depuis l'interface (D5) ;
chercher ou filtrer dans l'archive ou dans l'historique ; exporter ; afficher la
couverture d'un livre supprimé ; afficher les valeurs avant / après d'une
modification ; l'interface élève.

---

## Scénarios

Comptes : ceux du harnais — Alice Martin `admin`, Bob Johnson `librarian`,
Clara Dupont `user`.

### Scenario: un bibliothécaire lit l'archive et les historiques

```gherkin
Given un bibliothécaire connecté
When il demande l'historique d'un livre, celui d'une copie, l'archive des livres et l'archive des copies
Then la réponse est 200 dans les quatre cas
```

### Scenario: un élève n'y accède toujours pas

```gherkin
Given un élève connecté
When il demande l'historique d'un livre, celui d'une copie, l'archive des livres et l'archive des copies
Then la réponse est 403 dans les quatre cas
```

### Scenario: le personnel a une entrée Archive

```gherkin
Given un administrateur connecté, puis un bibliothécaire connecté
When chacun regarde la navigation
Then une entrée "Archive" y figure, juste après "Analytics"
```

### Scenario: un élève ne la voit pas

```gherkin
Given un élève connecté
When il regarde la navigation
Then aucune entrée "Archive" n'y figure
```

### Scenario: un élève qui ouvre l'adresse est refusé

```gherkin
Given un élève connecté
When il ouvre directement l'adresse /archive
Then le bandeau "You do not have permission to do that. Ask a librarian or an administrator." s'affiche
And l'écran affiche "Only librarians and administrators can see the archive."
And ni "Deleted books" ni "Deleted copies" ne sont affichés
And le message reste affiché une fois le bandeau disparu
```

### Scenario: l'archive montre les deux listes

```gherkin
Given deux livres supprimés, le second après le premier, le second avec 2 copies parties avec lui
And une copie de code "LPP-01" du livre vivant "Le Petit Prince" supprimée seule
When un bibliothécaire ouvre l'archive
Then une liste "Deleted books" a les colonnes "Title", "Deleted on", "Deleted by", "Copies deleted with it"
And le second livre y figure avant le premier
And sa ligne porte sa date de suppression au format "Jun 1, 2024, 16:00", l'adresse de qui l'a supprimé et 2
And une liste "Deleted copies" a les colonnes "Code", "Book", "Deleted on", "Deleted by"
And la copie y figure avec "LPP-01" et "Le Petit Prince"
And chaque ligne des deux listes a un bouton "History"
```

### Scenario: une archive vide le dit

```gherkin
Given les deux listes d'archive répondent sans aucune ligne
When un administrateur ouvre l'archive
Then l'écran affiche "No deleted books." et "No deleted copies."
And aucun tableau n'est affiché
```

### Scenario: l'archive se parcourt page par page

```gherkin
Given 12 livres supprimés
When un administrateur ouvre l'archive
Then la liste "Deleted books" affiche 10 lignes et "Showing 1 to 10 of 12 results"
And "Previous" est désactivé
When il clique "Next" sous cette liste
Then elle affiche les 2 livres suivants et "Showing 11 to 12 of 12 results"
And "Previous" est utilisable et "Next" est désactivé
And la liste "Deleted copies" n'a pas changé
```

### Scenario: une panne du serveur ne laisse pas un écran blanc

```gherkin
Given les deux listes d'archive répondent par une erreur serveur
When un administrateur ouvre l'archive
Then l'écran affiche "Could not load deleted books." et "Could not load deleted copies."
And aucun indicateur de chargement ne reste affiché
```

### Scenario: l'historique d'un livre supprimé s'ouvre depuis l'archive

```gherkin
Given le livre supprimé "Le Petit Prince", dont la copie "LPP-01" a été empruntée par Clara Dupont puis rendue
When un bibliothécaire clique "History" sur sa ligne d'archive
Then une modale s'ouvre avec le titre 'History of "Le Petit Prince"'
And un tableau a les colonnes "Date", "Event", "Copy", "By"
And les événements vont du plus ancien au plus récent
And on y lit, dans cet ordre, 'Book created as "Le Petit Prince"', "Borrowed by Clara Dupont", "Returned by Clara Dupont", "Book deleted"
And chaque ligne porte une date au format "Apr 2, 2024, 11:30" et une adresse dans la colonne "By"
```

### Scenario: l'historique d'un livre nomme la copie de chaque événement

```gherkin
Given un livre supprimé qui avait trois copies
When un administrateur ouvre son historique depuis l'archive
Then chaque événement portant sur une copie a le code de cette copie dans la colonne "Copy"
And les lignes "Book created as …" et "Book deleted" ont la colonne "Copy" vide
```

### Scenario: l'historique d'une copie supprimée seule ne contient qu'elle

```gherkin
Given la copie "LPP-01" du livre vivant "Le Petit Prince", supprimée seule, et une seconde copie "LPP-02" empruntée
When un administrateur clique "History" sur la ligne de "LPP-01" dans "Deleted copies"
Then la modale a le titre 'History of copy LPP-01 — "Le Petit Prince"'
And chaque ligne a "LPP-01" dans la colonne "Copy"
And la dernière ligne est "Copy deleted"
```

### Scenario Outline: chaque type d'événement a son libellé

```gherkin
Given un historique contenant un événement <type> <données>
When un administrateur l'ouvre
Then la colonne "Event" de cet événement affiche <libellé>

Examples:
  | type                | données                                         | libellé                           |
  | book_created        | titre "Le Petit Prince"                         | Book created as "Le Petit Prince" |
  | book_updated        | champs modifiés title et publishing_year        | Book updated: title, publishing_year |
  | book_deleted        |                                                 | Book deleted                      |
  | copy_created        |                                                 | Copy created                      |
  | copy_updated        | champ modifié section_name                      | Copy updated: section_name        |
  | copy_status_changed | de available à lost                             | Status: Available → Lost          |
  | copy_deleted        |                                                 | Copy deleted                      |
  | borrowed            | élève Clara Dupont                              | Borrowed by Clara Dupont          |
  | overdue             | élève Clara Dupont                              | Overdue: Clara Dupont             |
  | returned            | élève Clara Dupont                              | Returned by Clara Dupont          |
  | hold_placed         | élève Clara Dupont                              | Hold placed by Clara Dupont       |
  | hold_promoted       | élève Clara Dupont                              | Set aside for Clara Dupont        |
  | hold_expired        | élève Clara Dupont                              | Hold expired: Clara Dupont        |
  | hold_fulfilled      | élève Clara Dupont                              | Hold collected by Clara Dupont    |
```

### Scenario: un type inconnu ne casse pas la liste

```gherkin
Given un historique dont un événement a le type "some_new_type", entre deux événements connus
When un administrateur l'ouvre
Then la colonne "Event" de cet événement affiche "some_new_type"
And les deux autres événements s'affichent avec leur libellé
```

### Scenario: une date approchée se signale

```gherkin
Given un événement repris par la migration, à date approchée, survenu le 9 janvier 2023
When un administrateur ouvre l'historique qui le contient
Then sa colonne "Date" affiche "Jan 9, 2023 (approx.)"
```

### Scenario: un historique long se charge par morceaux

```gherkin
Given un livre dont l'historique compte 60 événements
When un administrateur l'ouvre
Then 50 événements sont affichés, suivis d'un bouton "Load more"
When il clique "Load more"
Then 60 événements sont affichés, les 50 premiers toujours en tête
And le bouton "Load more" n'est plus affiché
```

### Scenario: un historique court n'a pas de bouton de suite

```gherkin
Given un livre dont l'historique compte 3 événements
When un administrateur l'ouvre
Then 3 événements sont affichés
And aucun bouton "Load more" n'est affiché
```

### Scenario: l'échec de la suite garde ce qui est affiché

```gherkin
Given un historique de 60 événements dont la seconde page répond par une erreur serveur
When un administrateur l'ouvre et clique "Load more"
Then les 50 premiers événements restent affichés
And "Could not load the history." s'affiche sous eux
```

### Scenario: l'échec du chargement de l'historique le dit

```gherkin
Given l'historique d'un livre répond par une erreur serveur
When un administrateur l'ouvre
Then la modale affiche "Could not load the history."
And aucun indicateur de chargement ne reste affiché
```

### Scenario: un historique vide le dit

```gherkin
Given l'historique d'un livre répond sans aucun événement
When un administrateur l'ouvre
Then la modale affiche "No events recorded."
And aucun tableau n'est affiché
```

### Scenario: fermer l'historique rend l'archive où elle était

```gherkin
Given un administrateur sur la page 2 de "Deleted books"
When il ouvre l'historique d'une ligne puis ferme la modale
Then la liste "Deleted books" affiche toujours "Showing 11 to 12 of 12 results"
```

### Scenario: l'historique d'un livre vivant s'ouvre depuis le catalogue

```gherkin
Given un bibliothécaire dans le catalogue, sur la ligne du livre vivant "Le Petit Prince"
When il ouvre le menu ⋮ du livre et choisit "View history"
Then la modale a le titre 'History of "Le Petit Prince"'
And sa première ligne est 'Book created as "Le Petit Prince"'
```

### Scenario: et celui d'une copie vivante

```gherkin
Given un administrateur dans le catalogue, la ligne du livre "Le Petit Prince" dépliée sur ses copies "LPP-01" et "LPP-02", toutes deux empruntées une fois
When il ouvre le menu ⋮ de "LPP-01" et choisit "View history"
Then la modale a le titre 'History of copy LPP-01 — "Le Petit Prince"'
And aucune ligne n'a "LPP-02" dans la colonne "Copy"
```

### Scenario: un élève n'a pas l'entrée d'historique

```gherkin
Given un élève dans le catalogue, une ligne de livre dépliée sur ses copies
When il ouvre le menu ⋮ du livre, puis celui d'une copie
Then aucun des deux menus ne contient "View history"
```

---

## Critères d'acceptation

- [x] Les quatre règles de `SecurityConfig.authorize(...)` — `books/*/history`,
  `copies/*/history`, `archive/books`, `archive/copies` — passent en
  `hasAnyRole(LIBRARIAN, ADMIN)`, à leur place actuelle (les deux `/history`
  restent au-dessus des règles `GET /books/*` et `GET /copies/*`).
- [x] `ApiAuthorizationMatrixTest` déclare ces quatre chemins comme ouverts au
  personnel, plus `ADMIN_ONLY`.
- [x] Le test `US-05: a librarian can reach neither the history nor the archive`
  est remplacé par celui du scénario US-06 correspondant ; aucun test ne reste
  rouge ni désactivé pour cette raison.
- [x] Les contrats des quatre endpoints ne changent pas ; les `.bru` existants
  restent valables.
- [x] Les scénarios d'autorisation sont des tests d'intégration back ; tous les
  autres sont des tests de bout en bout du harnais, nommés `US-06: <titre du
  scénario>`.
- [x] La route `/archive` est déclarée dans `booksnap-app.js` par
  `_protectedRoute`, la vue chargée à la demande ; la vue vit dans
  `web/src/views/`, les composants de l'historique et de l'archive dans
  `web/src/features/<domaine>/`, chacun avec son `-styles.js`.
- [x] Le rôle qui conditionne l'entrée de navigation et les entrées de menu est
  lu dans `auth-state.js`, et nulle part ailleurs.
- [x] Les appels vivent dans `web/src/api/`, passent par `apiFetch` et lèvent
  une `Error` portant `error.status` quand `!response.ok`.
- [x] Les composants remontent par `CustomEvent` *bubbling* et *composed* ; la
  vue tient l'état (pages, historique ouvert) et le repasse en propriétés.
- [x] La nouvelle action de menu est traitée dans le `switch` de
  `catalog-view.js` ; elle ne tombe pas dans `default: break;`.
- [x] Les états de chargement utilisent `spinner-bks`, la modale `modal-bks`,
  les boutons `button-bks`.
- [x] Les messages d'erreur et le message de refus portent `role="alert"`.
- [x] Docs : `REGLES-METIER-ACCES.md` §3 donne ces quatre lignes à
  `LIBRARIAN` et `ADMIN` ; US-05 porte, sous sa décision « Réservé à
  l'`ADMIN` », une mention qu'elle est remplacée par US-06 ; le README de la
  fonctionnalité ne dit plus que l'archive est « réservée à l'administrateur ».
- [x] La suite back passe (`./mvnw -q test` depuis `server/`) et la suite de
  bout en bout passe.
- [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur.
- [x] Aucun `prettier --write` ni `npm run format` n'a été lancé.
- [x] Les commentaires du code sont en anglais et limités à ce que le code ne
  peut pas dire.

---

## Vérification de bout en bout

**Préparation** : US-05 et FEAT-tests-bout-en-bout/US-01 livrées ; base de
développement avec fixtures ; backend sur `:8080` ; `npm run dev` dans `web/`.
Comptes du [socle commun](README.md#socle-commun-de-vérification), Clara
Dupont comprise, son mot de passe posé par le parcours de US-007 / US-008 comme
pour les deux autres. Avoir au moins : un
livre supprimé avec un emprunt rendu, une copie supprimée seule sur un livre
vivant, un livre vivant à deux copies.

1. Lancer la suite de bout en bout depuis `web/` → les tests `US-06: …`
   passent.
2. Se connecter en **bibliothécaire** → « Archive » est dans la navigation
   après « Analytics ». L'ouvrir → « Deleted books » et « Deleted copies »,
   le plus récent en tête, avec date, adresse, nombre de copies parties.
3. « History » sur le livre supprimé → la modale se lit de la création à la
   suppression ; les libellés sont lisibles, les copies nommées dans « Copy ».
   La fermer → l'archive est inchangée.
4. « History » sur la copie supprimée → seuls ses événements.
5. **Catalogue** → ⋮ d'un livre vivant → « View history » ; déplier, ⋮ d'une
   copie → « View history » → seuls les événements de cette copie.
6. Se reconnecter en **élève** → pas d'« Archive », pas de « View history ».
   Saisir `/archive` → bandeau, puis « Only librarians and administrators can
   see the archive. » qui reste.
7. Se reconnecter en administrateur, arrêter le backend, recharger `/archive`
   → les deux messages d'erreur, pas de spinner. Relancer le backend.
8. Bruno, session bibliothécaire : `ArchiveController/getDeletedBooks.bru` →
   200.
9. `npm run lint` dans `web/` → aucune nouvelle erreur.

**Nettoyage** : remettre à `NULL` le `deleted_at` des livres supprimés en
chemin, ou `server/scripts/reset-dev-db.sh`. Les lignes de journal produites
restent.

---

## Points de vigilance

- **Masquer une entrée n'est pas une autorisation.** C'est le 403 du serveur qui
  protège. Ne pas ajouter de garde de rôle sur la route `/archive` *à la
  place* : elle empêcherait d'observer le refus du serveur et donnerait
  l'illusion qu'on peut se passer de lui.

- **`isAdmin()` ne suffit plus.** Les entrées à ajouter visent deux rôles ;
  réutiliser `isAdmin()` par habitude laisserait le bibliothécaire sans
  « Archive » ni « View history », sans aucune erreur.

- **Le rôle n'est connu qu'après `loadSession()`.** `_currentUser` est nul tant
  que `/auth/me` n'a pas répondu ; décider de l'entrée de navigation avant la
  fera clignoter ou disparaître. Et les menus de ligne lisent le rôle à chaque
  rendu, pas une fois au chargement du module.

- **Le `default: break;` de `catalog-view.js` avale les actions inconnues sans
  bruit** — c'est ce qui a laissé `update-status` morte jusqu'à US-03. Le test du
  scénario catalogue est ce qui le prouve, pas la lecture du code.

- **Une copie supprimée seule et une copie emportée ne se distinguent que côté
  serveur** (US-05). Ne pas tenter de reconstituer l'archive des copies à partir
  de l'historique des livres.

- **Les dates : ne pas passer `occurredAt` ni `deletedAt` à `new Date(...)` sans
  y penser.** Ce sont des `LocalDateTime` sans fuseau ; `dateFormatter.js`
  rappelle déjà le décalage d'un jour que provoque une lecture en UTC. Le format
  attendu a une heure (`Apr 2, 2024, 11:30`), que `formatDate` ne donne pas, et
  un jour sans zéro (`Jan 9, 2023 (approx.)`), alors que `formatDate` écrit
  `Jan 09` : il faut un autre formateur, sans modifier `formatDate`, dont les
  autres appelants changeraient d'affichage.

- **L'ordre des champs dans `detail.changes` est celui de jsonb** (longueur de
  la clé, puis octets), ni l'ordre de modification ni l'ordre alphabétique.
  `Book updated: title, publishing_year` n'est juste que tant qu'on ne trie pas
  les clés.

- **Dans le catalogue, le code d'identification d'une copie est
  `copy.section.id`** : `CopyResponse` n'a pas de champ `identificationCode`.
  Dans le journal (`copy.identificationCode`) et l'archive, il est en clair.

- **Les codes d'identification sont générés par le serveur** (section +
  auteurs) : aucun test ne peut produire « LPP-01 ». Les scénarios qui le citent
  l'emploient comme exemple ; les tests utilisent le code renvoyé à la création,
  et un titre suffixé pour rester unique.

- **Les totaux de l'archive dépendent de toute la base jetable.** Un test de
  bout en bout qui compte les lignes de l'archive la vide d'abord
  (`deleted_at = NULL` sur les copies **et** sur les livres, sinon les copies
  emportées réapparaissent comme supprimées seules), et la suite reste
  séquentielle tant que la base est partagée.

- **« Load more » ajoute, il ne remplace pas.** Remplacer le tableau par la page
  suivante passerait le premier coup d'œil et ferait échouer le scénario des 60
  événements.

- **Les tests de bout en bout tournent sur la base jetable**, jamais sur la
  base de développement : `lifecycle_event` est en ajout seul, chaque livre
  supprimé par un test y resterait archivé pour toujours.

- **Le piège de spécificité CSS de Lit.** Un composant qui liste `sharedStyles`
  **en dernier** ne peut pas redéfinir `input, select` avec une règle simple ;
  utiliser un sélecteur plus précis (`.claude/CLAUDE.md`).

- **Ne jamais lancer `prettier --write` ni `npm run format`** ; et
  `class-methods-use-this` échoue déjà sur plusieurs fichiers — vérifier qu'une
  erreur de lint est la sienne avant de la corriger.
