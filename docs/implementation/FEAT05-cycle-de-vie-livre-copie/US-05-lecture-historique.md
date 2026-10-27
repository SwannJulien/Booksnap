# US-05 — Lire l'historique, y compris celui d'un livre supprimé

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Nature** | feature |
| **Dépend de** | [US-04](US-04-journal-cycle-de-vie.md) |
| **Bloque** | US-06 |
| **Portée** | back |
| **Casse l'existant ?** | Non — quatre endpoints s'ajoutent, aucun ne change |

---

## Récit

**En tant qu'** administrateur
**je veux** interroger la chronologie d'un livre ou d'un exemplaire, et
retrouver ceux qui ont été supprimés
**afin de** répondre à une question sur un exemplaire disparu sans ouvrir un
client SQL.

## Contexte

Depuis US-04, tout est enregistré dans `lifecycle_event` et **rien n'est
lisible hors de psql** : aucune entité JPA, aucun repository, aucun endpoint ne
lit la table. Elle n'est écrite que par des triggers.

```sql
-- server/src/main/resources/db/migration/V10__lifecycle_event.sql
CREATE TABLE lifecycle_event (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at        timestamp with time zone NOT NULL DEFAULT now(),
    type               lifecycle_event_type NOT NULL,
    actor              text NOT NULL,
    book_id            bigint NOT NULL,
    copy_id            bigint,
    ...
    student_id         bigint,
    student_first_name text,
    student_last_name  text,
    ...
    detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
    backfilled         boolean NOT NULL DEFAULT false,
    approximate_date   boolean NOT NULL DEFAULT false,
    ...
);
CREATE INDEX idx_lifecycle_event_book ON lifecycle_event (book_id, occurred_at, id);
CREATE INDEX idx_lifecycle_event_copy ON lifecycle_event (copy_id, occurred_at, id) WHERE copy_id IS NOT NULL;
```

Trois propriétés du journal, telles que `V10` les a posées, déterminent ce que
cette story lit :

- **Chaque emprunt est consigné deux fois.** Le trigger de `copy` écrit un
  `copy_status_changed` (`available` → `borrowed`) et celui de `borrowing` écrit
  un `borrowed`, dans la même transaction, donc au même `occurred_at`
  (`now()` est l'heure de début de transaction). Même chose pour un retour et
  pour les transitions de réservation qui déplacent la copie. Le fichier le dit
  lui-même :

  ```sql
  -- Business events (borrowed, returned, overdue, hold_*) are what analytics counts.
  -- copy_status_changed serves a copy's timeline: counting both doubles every loan.
  ```

  Un `copy_status_changed` sans événement métier jumeau existe aussi : la
  déclaration de perte ou de retour d'une copie (US-03, `available` ↔ `lost`).

- **Les libellés sont figés dans `detail`** (`title`, `identification_code`,
  `section_name`) au moment de l'écriture — sauf pour les lignes reprises par
  `V10`, qui portent ceux du jour de la migration :

  ```sql
  -- Labels are those of today's rows; the values of the time are lost.
  ```

- **Tout livre et toute copie ont au moins un événement** : la reprise a écrit
  un `book_created` par livre et un `copy_created` par copie existants, et les
  triggers en écrivent un à chaque création depuis.

Depuis US-01, un livre supprimé répond 404 sur `GET /books/{id}` et n'apparaît
dans aucune liste. Toutes les lectures de `BookRepository` et `CopyRepository`
filtrent sur `deleted_at IS NULL` (`findByIdAndDeletedAtIsNull`, …). La
suppression d'un livre estampille ses copies vivantes de **la même date** :

```java
// server/src/main/java/net/booksnap/domain/book/service/BookServiceImpl.java
LocalDateTime deletedAt = LocalDateTime.now();
book.setDeletedAt(deletedAt);
bookRepository.save(book);
...
List<Copy> copies = copyRepository.findAllByBookId(bookId);
copies.forEach(copy -> copy.setDeletedAt(deletedAt));
```

Une copie supprimée seule auparavant garde sa propre date, plus ancienne : elle
n'est pas touchée par la suppression de son livre.

La pagination du projet est indexée **à partir de 1** :

```properties
# server/src/main/resources/application.properties
spring.data.web.pageable.one-indexed-parameters=true
spring.data.web.pageable.default-page-size=10
```

La matrice d'autorisation est écrite en un seul bloc dans
`server/src/main/java/net/booksnap/config/SecurityConfig.java`, et elle se
referme sur « connecté », pas sur « interdit » :

```java
// Closed by default, and never permitAll(): an endpoint added tomorrow is
// protected until someone opens it here on purpose, rather than the reverse.
.anyRequest().authenticated();
```

Et l'ordre compte, le fichier le signale :

```java
// Before the plain /copies/* read below, which would otherwise open the QR
// code — a desk tool — to students.
.requestMatchers(HttpMethod.GET, "/api/v1/copies/*/qrcode").hasAnyRole(LIBRARIAN, ADMIN)
```

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Back | Le journal n'est exposé par aucun endpoint |
| Back | Un livre ou une copie supprimés sont inatteignables : 404 partout |
| Back | `ApiAuthorizationMatrixTest` (`server/src/test/java/net/booksnap/config/`) vérifie la matrice ligne par ligne contre la vraie chaîne de filtres ; il annonce « The 28 business endpoints of the project » |

Contraintes du projet :
[règles accès §3](../../business-rules/REGLES-METIER-ACCES.md#3-matrice-des-permissions),
[D4, D5 et D11](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité).

---

## Décisions et non-objectifs

- **Réservé à l'`ADMIN`.** Le journal nomme des élèves et retrace des emprunts
  clos ; c'est une donnée de consultation exceptionnelle, pas un outil de
  comptoir. Un `LIBRARIAN` qui veut savoir qui détient un exemplaire a déjà
  `GET /borrowings`.
  *Décision remplacée par [US-06](US-06-ecran-archive.md), qui ouvre les quatre
  endpoints au `LIBRARIAN`.*

- **L'historique d'un livre inclut celui de ses copies**, supprimées comprises,
  fusionné dans une seule chronologie, chaque entrée disant de quelle copie elle
  parle. C'est la question qu'on pose réellement — « que s'est-il passé pour ce
  livre ? » — et la reconstituer côté client obligerait à connaître la liste des
  copies, y compris celles qui ont été supprimées.

- **L'historique d'une copie ne contient que les événements qui la désignent**,
  sans ceux du livre seul (création, renommage, réservation encore en attente) :
  c'est la vue de détail, et y mêler les renommages du livre la rendrait
  bruyante.

- **Les doublons de statut sont masqués.** Un `copy_status_changed` n'est pas
  renvoyé lorsque, à la fois, il touche un statut que possèdent les triggers
  (`borrowed` ou `on_hold`, en départ ou en arrivée) et qu'un événement métier
  (`borrowed`, `returned`, `overdue`, `hold_*`) porte sur la même copie au même
  `occurred_at` : il dit la même chose une seconde fois. Un changement
  `available` ↔ `lost` n'est donc jamais masqué — la déclaration de perte, la
  copie retrouvée — même quand retrouver la copie promeut une réservation dans
  la même transaction. Le total annoncé par la pagination ne compte que ce qui
  est renvoyé. Rejeté : tout renvoyer brut et laisser US-06 filtrer, ce qui
  fausserait la pagination et obligerait chaque client à refaire le même tri ;
  masquer tous les `copy_status_changed`, ce qui ferait disparaître « déclarée
  perdue » de la chronologie ; juger le jumeau sur la seule copie et le seul
  instant, ce qui masquerait « retrouvée » dès qu'une réservation attend
  (`CopyServiceImpl.updateCopy` promeut la réservation dans la transaction du
  retour) et montrerait une réservation promue sur une copie encore perdue.

- **L'acteur d'une suppression se lit dans le journal.** Sur une ligne
  d'archive, c'est l'acteur du dernier événement `book_deleted` (ou
  `copy_deleted`) de ce livre ou de cette copie — la dernière suppression, si
  une restauration en psql a été suivie d'une nouvelle suppression. Rejeté :
  `last_modified_by`, qui dit qui a écrit la ligne en dernier, pas qui l'a
  supprimée.

- **Deux listes d'archive séparées**, l'une pour les livres supprimés, l'autre
  pour les copies. Rejeté : une liste unique mélangeant les deux, qui demande
  une colonne « type » et deux formes de ligne pour un gain nul.

- **L'archive des copies liste les copies supprimées seules**, c'est-à-dire
  dont la date de suppression diffère de celle de leur livre — que ce livre soit
  vivant ou supprimé plus tard. Les copies emportées par la suppression de leur
  livre (même date) se lisent dans l'historique de ce livre et sont comptées
  sur sa ligne d'archive ; les lister à part noierait, pour un livre à vingt
  exemplaires, la ligne qui intéresse quelqu'un dans vingt lignes qui
  n'intéressent personne. Rejeté : « seulement les copies dont le livre est
  vivant », qui ferait disparaître de l'archive une copie supprimée seule en
  mars au moment où son livre est supprimé en juin.

- **L'ordre par défaut diffère entre les deux.** Une chronologie se lit du plus
  ancien au plus récent ; une liste d'archive se consulte du plus récemment
  supprimé au plus ancien, parce que ce qu'on cherche vient en général d'être
  supprimé.

- **Les libellés sont lus dans le journal, jamais par jointure** (D4). Pour un
  événement repris par `V10`, c'est donc le libellé du jour de la migration ;
  la réponse dit qu'il s'agit d'une reprise, et c'est tout ce qu'on peut faire.

- **Un identifiant inconnu répond 404.** Il n'y a pas de cas « connu mais sans
  événement » : tout livre et toute copie ont au moins leur événement de
  création (voir Contexte). L'existence se juge sur les tables `book` et
  `copy`, supprimés compris.

- **Assumé, non confirmé** : les quatre endpoints sont paginés avec le
  `PagedResponse` du projet (`domain/common/dto/`), l'historique par pages de
  50 et l'archive par pages de 10, comme les listes existantes.

**Hors périmètre de cette story** : l'affichage (US-06) ; restaurer un livre ou
une copie, qui reste une opération psql (D5) ; filtrer ou chercher dans
l'historique ou dans l'archive ; l'exporter ; les agrégats d'analyse (D11).

---

## Scénarios

### Scenario: la chronologie d'un livre vivant se lit dans l'ordre

```gherkin
Given un livre créé, renommé, puis dont une copie a été empruntée et rendue
When un administrateur demande l'historique de ce livre
Then la réponse est 200
And les événements sont renvoyés du plus ancien au plus récent
And la chronologie contient la création, le renommage, l'emprunt et le retour
And l'emprunt et le retour désignent la copie empruntée
And la création et le renommage ne désignent aucune copie
```

### Scenario: un emprunt n'apparaît qu'une fois

```gherkin
Given un livre dont une copie a été empruntée puis rendue, et rien d'autre depuis sa création
When un administrateur demande l'historique de ce livre
Then la chronologie ne contient aucun événement "copy_status_changed"
And le total annoncé par la page est égal au nombre d'événements renvoyés
```

### Scenario: une déclaration de perte reste dans la chronologie

```gherkin
Given une copie déclarée perdue puis retrouvée
When un administrateur demande l'historique de cette copie
Then la chronologie contient deux événements "copy_status_changed"
And le premier va de "available" à "lost", le second de "lost" à "available"
```

### Scenario: une copie retrouvée reste visible quand une réservation l'attend

```gherkin
Given un livre dont l'unique copie est déclarée perdue
And une réservation en attente sur ce livre
When la copie est déclarée retrouvée, ce qui promeut la réservation
And un administrateur demande l'historique de cette copie
Then la chronologie contient le "copy_status_changed" de "lost" à "available"
And elle contient la promotion de la réservation
And elle ne contient aucun "copy_status_changed" de "available" à "on_hold"
```

### Scenario: la chronologie d'un livre supprimé reste lisible

```gherkin
Given un livre supprimé, qui avait été emprunté puis rendu avant sa suppression
When un administrateur demande l'historique de ce livre
Then la réponse est 200
And la chronologie contient l'emprunt, le retour et la suppression du livre
And elle contient la suppression de chacune des copies emportées avec lui
```

### Scenario: la chronologie d'une copie supprimée reste lisible

```gherkin
Given une copie supprimée, qui avait été empruntée puis rendue avant sa suppression
When un administrateur demande l'historique de cette copie
Then la réponse est 200
And la chronologie contient l'emprunt, le retour et la suppression de la copie
```

### Scenario: la chronologie d'une copie ne contient qu'elle

```gherkin
Given un livre renommé, à deux copies, toutes deux empruntées au moins une fois
When un administrateur demande l'historique de la première copie
Then aucun événement de la seconde copie n'y figure
And le renommage du livre n'y figure pas
```

### Scenario: l'emprunteur est nommé

```gherkin
Given une copie empruntée par l'élève Clara Dupont
When un administrateur demande l'historique de cette copie
Then l'événement d'emprunt porte l'identifiant, le prénom "Clara" et le nom "Dupont" de l'élève
And il porte l'adresse e-mail de la personne qui a enregistré l'emprunt
```

### Scenario: les libellés sont ceux de l'époque

```gherkin
Given un livre créé depuis l'application sous le titre "Le Petit Prince" puis renommé "Le petit prince"
When un administrateur demande l'historique de ce livre
Then l'événement de création porte le titre "Le Petit Prince"
```

### Scenario: un événement repris par la migration se signale comme tel

```gherkin
Given un emprunt rendu avant la mise en service du journal
When un administrateur demande l'historique de sa copie
Then l'événement de retour se signale comme repris
And sa date se signale comme approchée
```

### Scenario: un identifiant de livre inconnu n'est pas une chronologie

```gherkin
Given un identifiant de livre qui n'a jamais existé
When un administrateur demande l'historique de ce livre
Then la réponse est 404
```

### Scenario: un identifiant de copie inconnu non plus

```gherkin
Given un identifiant de copie qui n'a jamais existé
When un administrateur demande l'historique de cette copie
Then la réponse est 404
```

### Scenario: un bibliothécaire n'accède ni à l'historique ni à l'archive

```gherkin
Given un bibliothécaire connecté
When il demande l'historique d'un livre, celui d'une copie, l'archive des livres ou l'archive des copies
Then la réponse est 403 dans les quatre cas
```

### Scenario: un élève non plus

```gherkin
Given un élève connecté
When il demande l'historique d'un livre, celui d'une copie, l'archive des livres ou l'archive des copies
Then la réponse est 403 dans les quatre cas
```

### Scenario: l'archive liste les livres supprimés, le dernier d'abord

```gherkin
Given trois livres supprimés l'un après l'autre
When un administrateur demande l'archive des livres
Then les trois apparaissent, du plus récemment supprimé au plus ancien
And chacun porte son titre, sa date de suppression et l'adresse de qui l'a supprimé
```

### Scenario: un livre vivant n'est pas dans l'archive

```gherkin
Given un livre qui n'a jamais été supprimé
When un administrateur demande l'archive des livres
Then ce livre n'y figure pas
```

### Scenario: la ligne d'archive d'un livre compte les copies parties avec lui

```gherkin
Given un livre à trois copies, dont une supprimée seule plus tôt, puis le livre supprimé
When un administrateur demande l'archive des livres
Then la ligne de ce livre annonce 2 copies supprimées avec lui
```

### Scenario: une copie supprimée seule apparaît dans l'archive des copies

```gherkin
Given un livre vivant dont une copie a été supprimée
When un administrateur demande l'archive des copies
Then cette copie y figure, avec son code d'identification, le titre de son livre et sa date de suppression
```

### Scenario: les copies emportées par leur livre n'encombrent pas l'archive des copies

```gherkin
Given un livre à trois copies, supprimé en une seule opération
When un administrateur demande l'archive des copies
Then aucune des trois copies n'y figure
And le livre figure dans l'archive des livres
```

### Scenario: une copie supprimée seule y reste quand son livre est supprimé ensuite

```gherkin
Given une copie supprimée seule, puis son livre supprimé plus tard
When un administrateur demande l'archive des copies
Then cette copie y figure toujours
```

### Scenario: l'archive se parcourt page par page

```gherkin
Given plus de dix livres supprimés
When un administrateur demande la page 2 de l'archive des livres
Then elle ne contient aucun des livres de la page 1
And elle annonce le nombre total de livres supprimés
```

---

## Critères d'acceptation

- [x] `GET /api/v1/books/{bookId}/history` et
  `GET /api/v1/copies/{copyId}/history` renvoient un `PagedResponse`
  d'événements, triés par `occurred_at` croissant puis par `id`, par pages de
  50 par défaut.
- [x] `GET /api/v1/archive/books` et `GET /api/v1/archive/copies` renvoient un
  `PagedResponse`, trié par date de suppression décroissante, par pages de 10
  par défaut.
- [x] Le paramètre `page` suit la convention du projet (première page = 1).
- [x] Chaque événement renvoyé porte : identifiant, date d'occurrence, type
  (valeur de `lifecycle_event_type` telle quelle), acteur, identifiant et code
  d'identification de la copie concernée (`null` pour un événement portant sur
  le seul livre), l'élève concerné le cas échéant (identifiant, prénom, nom,
  `null` sinon), `detail` tel qu'il a été enregistré, `backfilled` et
  `approximateDate`.
- [x] Chaque ligne d'archive de livre porte : identifiant, titre, date de
  suppression, acteur de la suppression, nombre de copies supprimées avec lui.
  Chaque ligne d'archive de copie porte : identifiant, code d'identification,
  identifiant et titre du livre, date de suppression, acteur. L'acteur est
  celui du dernier événement `book_deleted` / `copy_deleted` du journal.
- [x] Un `copy_status_changed` n'est masqué que s'il part de ou arrive à
  `borrowed` ou `on_hold` et qu'un événement métier porte sur la même copie au
  même `occurred_at`.
- [x] Les 404 sont portés par les exceptions existantes `BookNotFoundException`
  et `CopyNotFoundException`, rendues au format `ApiError`.
- [x] Les quatre endpoints sont déclarés explicitement dans
  `SecurityConfig.authorize(...)` en `hasRole(ADMIN)` ; les deux règles
  `/history` sont placées **avant** les règles `GET /api/v1/books/*` et
  `GET /api/v1/copies/*`.
- [x] `ApiAuthorizationMatrixTest` couvre les quatre nouveaux chemins et son
  décompte d'endpoints est mis à jour.
- [x] Les DTO de réponse sont des records, suivant le reste de la couche API.
- [ ] `server/API/` gagne un fichier `.bru` par endpoint : deux dans
  `BookController/` et `CopyController/`, deux dans un nouveau dossier pour
  l'archive avec son `folder.bru` sur le modèle des dossiers existants.
- [x] `docs/business-rules/REGLES-METIER-ACCES.md` §3 : la matrice gagne les
  lignes correspondantes (`ADMIN` seul).
- [x] Chaque scénario a un test automatisé nommé `US-05: <titre du scénario>`.
- [x] La suite complète passe (`./mvnw -q test` depuis `server/`).
- [x] Aucune migration appliquée n'est modifiée ; si un index s'avère
  nécessaire, c'est un nouveau `V<n>__….sql`.
- [x] Le backend démarre avec `ddl-auto=validate` satisfait.
- [x] Les commentaires du code sont en anglais et limités à ce que le code ne
  peut pas dire (`.claude/CLAUDE.md`).

---

## Vérification de bout en bout

**Préparation** : US-04 livrée ; base de développement avec fixtures ; backend
lancé sur `:8080` ; frontend lancé (`npm run dev`) pour fabriquer les données.
Comptes du [socle commun](README.md#socle-commun-de-vérification). Depuis la vue
Catalogue, en administrateur, construire une fois :

| Objet | État voulu |
|---|---|
| Livre L (vivant), copies L1 et L2 | L renommé ; L1 empruntée par Clara Dupont puis rendue ; L2 déclarée perdue puis retrouvée |
| Livre M (vivant), copie M1 | M1 supprimée |
| Livre S, copies S1, S2, S3 | S1 supprimée seule ; puis S supprimé (après un emprunt rendu sur S2) |

Les requêtes se jouent dans Bruno ; **changer de rôle veut dire se
reconnecter** avec `AuthController/login.bru`.

1. Session administrateur. Historique de L → 200, du plus ancien au plus
   récent : création (titre d'origine), renommage, emprunt et retour de L1,
   perte et retour de L2. L'emprunt n'apparaît qu'une fois, sans
   `copy_status_changed` à côté ; Clara Dupont est nommée sur l'emprunt.
2. Historique de L1 → seuls ses événements, ni ceux de L2 ni le renommage.
3. Historique de L2 → les deux changements de statut, `available` → `lost` puis
   `lost` → `available`.
4. Historique de S → 200 malgré la suppression : l'emprunt et le retour de S2,
   la suppression de S1, la suppression de S et celles de S2 et S3. Confronter
   au même identifiant sur `BookController/getBook.bru`, qui répond 404 : les
   deux réponses sont correctes et cohérentes.
5. Historique d'un livre et d'une copie à l'identifiant inventé (999999) → 404
   les deux fois.
6. Trouver en psql une copie ayant un retour repris —
   `SELECT copy_id FROM lifecycle_event WHERE type = 'returned' AND backfilled LIMIT 1;`
   — et demander son historique → l'événement de retour est marqué repris et à
   date approchée. Si la requête ne renvoie rien (base créée après `V10`, dont
   les fixtures ont été journalisées en direct), l'étape est sans objet : le
   test automatisé du scénario la couvre.
7. Archive des livres → S en tête, avec sa date, l'adresse de l'administrateur
   et **2** copies supprimées avec lui. L et M n'y figurent pas.
8. Archive des copies → M1 et S1 y figurent avec le titre de leur livre ; S2 et
   S3 n'y figurent pas.
9. Supprimer dix livres de plus depuis le front, puis demander `?page=2` sur
   l'archive des livres → aucun recouvrement avec `?page=1`, total correct.
10. Se reconnecter **en bibliothécaire** et rejouer les quatre requêtes → 403 à
    chaque fois.
11. Se reconnecter **en élève** et rejouer les quatre requêtes → 403 à chaque
    fois.

**Nettoyage** : `server/scripts/reset-dev-db.sh`, ou remettre à `NULL` le
`deleted_at` des livres et copies supprimés en chemin —
`UPDATE book SET deleted_at = NULL WHERE id IN (…);` et de même sur `copy`. Les
événements de journal produits en chemin ne peuvent pas être effacés et se
gardent.

---

## Points de vigilance

- **Un endpoint non déclaré dans `SecurityConfig` n'est pas fermé.**
  `anyRequest().authenticated()` le rend accessible à n'importe quel élève
  connecté. Pour ces quatre-là, l'oubli publierait le nom des emprunteurs de
  toute l'école.

- **L'ordre des règles décide.** `GET /api/v1/books/*` ne couvre pas
  `/api/v1/books/*/history` — un `*` ne traverse pas un `/` — mais le fichier
  rappelle que l'ordre a déjà failli ouvrir quelque chose par accident. Placer
  les règles d'historique avec les autres règles spécifiques, au-dessus des
  règles génériques, et vérifier par le test plutôt que par la lecture.

- **Ne pas vérifier l'existence avec les lectures du catalogue.**
  `findByIdAndDeletedAtIsNull` et tout ce qui passe par `BookSpecifications`
  filtrent les supprimés : l'endpoint d'historique répondrait 404 précisément
  dans le cas qui justifie son existence.

- **Les lectures de l'archive font l'inverse de celles du catalogue.** Tout le
  reste du code filtre `deleted_at IS NULL` ; ici il faut `IS NOT NULL`.
  Réutiliser une méthode de repository déjà filtrée rendra une archive toujours
  vide — et une archive vide ressemble beaucoup à « rien n'a été supprimé ».

- **« Supprimée seule » se juge sur l'égalité des dates, pas sur l'état du
  livre.** Les copies emportées ont exactement le `deleted_at` de leur livre
  parce que `deleteBookById` leur passe la même valeur. Comparer à « le livre est
  vivant » était la règle rejetée.

- **Masquer les doublons avant de paginer, pas après.** Retirer les
  `copy_status_changed` jumeaux d'une page déjà découpée donnerait des pages de
  taille variable et un total faux. Le jumeau se reconnaît à la même copie et au
  même `occurred_at`, **et** à un changement qui touche `borrowed` ou `on_hold` ;
  une transaction qui rend un exemplaire et promeut une réservation dans la
  foulée produit deux changements de statut et deux événements métier au même
  instant — les deux changements sont des doublons. Une copie retrouvée qui
  promeut une réservation produit `lost` → `available` puis `available` →
  `on_hold` : seul le second est un doublon.

- **Ne pas reconstituer les libellés par jointure** (D4). Joindre `book`, `copy`
  ou `users` à la lecture pour « enrichir » la réponse afficherait le titre
  actuel sur un événement ancien. Le code d'identification et le nom de l'élève
  viennent de `detail` et des colonnes `student_*` du journal. La seule lecture
  de `book`/`copy` légitime est celle de l'existence (404) et de l'archive.

- **La chronologie d'un livre se lit sur `lifecycle_event.book_id`, pas en
  passant par la liste de ses copies.** Passer par les copies vivantes
  manquerait justement celles qui intéressent ; et un `hold_placed` sur le livre
  n'a pas de copie du tout.

- **Le journal est en ajout seul, la base de test est la base de
  développement.** Un test qui valide sa transaction laisse dans
  `lifecycle_event` des lignes qu'on ne pourra jamais supprimer (le trigger
  `trg_lifecycle_event_immutable` refuse `DELETE`). Les tests de cette story
  doivent écrire puis annuler, et ne pas supposer que l'archive est vide au
  départ : le développeur a peut-être déjà supprimé des livres.
