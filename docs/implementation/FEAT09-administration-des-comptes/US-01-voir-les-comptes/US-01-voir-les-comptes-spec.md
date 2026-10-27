# US-01 — L'administrateur voit les comptes de l'école

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | — |
| **Bloque** | US-02, US-04, US-05 |
| **Portée** | back + front |
| **Casse l'existant ?** | Non. `GET /api/v1/users/search`, utilisé par les modales de prêt et de réservation, est inchangé. |

---

## Story

**En tant qu'** administrateur
**je veux** une vue qui liste tous les comptes de l'école, avec recherche et
filtres par rôle et par statut
**afin de** savoir qui existe dans BookSnap, avec quel rôle, et qui est
désactivé, sans ouvrir `psql`.

---

## Contexte

### Le seul endpoint sur les comptes est la recherche du comptoir

```java
// server/src/main/java/net/booksnap/domain/user/api/UserController.java
@GetMapping("/search")
public List<UserSearchResponse> searchUsers(
        @RequestParam String q,
        @RequestParam(defaultValue = "10") int limit) {
    return userRepository.searchActiveUsers(q).stream()
            .map(user -> new UserSearchResponse(
                    user.getId(), user.getFirstName(), user.getLastName(), user.getEmail()))
            .limit(limit)
            .toList();
}
```

`searchActiveUsers` (`UserRepository`) ne renvoie que les comptes actifs, sans
rôle ni pagination. Elle sert à choisir l'élève dans `loan-modal-bks` et
`hold-modal-bks` (`web/src/api/user.js`, `searchUsers`). Elle est
`LIBRARIAN`/`ADMIN` (`SecurityConfig`, `GET /api/v1/users/search`).

### Ce que `users` contient

`\d users` sur la base réelle : `first_name`, `last_name` (nullables),
`email` (domaine `email`, `citext`, `NOT NULL`, unique), `genre`, `parent_email`,
`key_stage`, `house`, `is_active` (`boolean`, nullable, défaut `true`),
`last_login`, `role` (`user_role` : `user`, `librarian`, `admin`), plus les
colonnes d'audit. L'entité `User` ne mappe aujourd'hui que `id`, `firstName`,
`lastName`, `email`, `isActive`, `lastLogin` et `role`.

Le compte admin d'amorçage de la base de développement n'a ni prénom ni nom
(`admin@admin.com`).

### Les listes paginées existantes

```java
// server/src/main/java/net/booksnap/domain/common/dto/PagedResponse.java
public record PagedResponse<T>(List<T> data, PageInfo page) { … }
public record PageInfo(int size, int page, long totalElements, int totalPages) {}
```

`GET /api/v1/holds` (`HoldController`) prend `q`, `status` et un `Pageable`
(taille 10 par défaut) et renvoie un `PagedResponse`. Le front a
`components/pagination-bks`.

### La navigation et les routes

`booksnap-app.js` affiche l'entrée « Archive » seulement si `isStaff()`. Aucune
route n'est réservée à un rôle : `_protectedRoute` ne vérifie que
`isAuthenticated()`. `isAdmin()` (`auth-state.js`) lit `role === 'admin'` dans
l'utilisateur renvoyé par `/auth/me`.

Règles : [règles accès §1 et §3](../../../business-rules/REGLES-METIER-ACCES.md),
[décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Une vue dédiée « Users », avec son entrée de navigation, réservée à
  l'`ADMIN`.** Rejeté : une section de Settings. Une école compte des centaines
  d'élèves, et une liste paginée avec recherche ne tient pas dans une section
  parmi d'autres.
- **Un non-admin qui ouvre `/users` est renvoyé à l'accueil**, sans message.
  L'entrée de navigation lui est déjà invisible.
- **La liste montre les comptes actifs par défaut.** Le filtre de statut
  propose aussi les comptes désactivés seuls, ou tous.
- **La recherche porte sur le prénom, le nom et l'email**, sans tenir compte de
  la casse ni de la position (« art » trouve « Martin »), comme la recherche du
  comptoir.
- **Ordre : nom, puis prénom, puis email.** Un compte sans nom ni prénom
  affiche « — » dans la colonne Name. Confirmé avec l'utilisateur, comme la
  redirection silencieuse ; rejetés : le tri par date de création, l'email à la
  place du tiret, un message « pas d'accès ».
- **Libellés de rôle** : `user` s'affiche « Student », `librarian`
  « Librarian », `admin` « Admin ». Un `is_active` à `NULL` compte comme
  désactivé, comme le font déjà la connexion (`UserDetailsServiceImpl` :
  `!Boolean.TRUE.equals(user.getIsActive())`) et la recherche du comptoir
  (`u.isActive = true`).
- **`GET /api/v1/users/search` n'est pas modifié** : il reste la recherche du
  comptoir, et cette story ajoute une lecture à part, réservée à l'`ADMIN`.

**Hors périmètre de cette story** : tout geste sur un compte (US-02 à US-06) ;
le menu d'actions de ligne arrive avec la première story qui y place une action.

---

## Scénarios

### Scenario: l'administrateur ouvre la vue des comptes

```gherkin
Given un administrateur connecté
When il clique sur l'entrée de navigation "Users"
Then la vue a pour titre "Users"
And pour sous-titre "Every student and staff member who has an account."
And la liste a les colonnes "Name", "Email", "Role" et "Status"
And la ligne d'Alice Martin montre "Alice Martin", "alice.martin@example.com", "Admin", "Active"
And la ligne de Bob Johnson montre "Librarian"
And la ligne de Clara Dupont montre "Student"
```

### Scenario: les comptes sont triés par nom

```gherkin
Given les comptes "Clara Dupont", "Alice Martin" et "Daniel Smith"
When un administrateur ouvre "Users"
Then "Clara Dupont" précède "Alice Martin", qui précède "Daniel Smith"
```

### Scenario: un compte sans nom s'affiche avec un tiret

```gherkin
Given un compte administrateur "admin@admin.com" sans prénom ni nom
When un administrateur ouvre "Users"
Then sa ligne montre "—" dans "Name" et "admin@admin.com" dans "Email"
```

### Scenario: la recherche porte sur le prénom, le nom et l'email, sans tenir compte de la casse

```gherkin
Given un administrateur sur "Users"
When il saisit "<recherche>" dans "Search by name or email"
Then la liste montre "Alice Martin"
And ne montre pas "Clara Dupont"

Examples:
  | recherche        |
  | ALI              |
  | art              |
  | MARTIN@EXAMPLE   |
```

### Scenario: une recherche sans résultat

```gherkin
Given un administrateur sur "Users"
When il saisit "zzzz" dans "Search by name or email"
Then la liste est vide et affiche "No account matches your search."
```

### Scenario: filtrer par rôle

```gherkin
Given un administrateur sur "Users"
When il choisit "Librarian" dans le filtre "Role"
Then la liste montre "Bob Johnson"
And ne montre ni "Alice Martin" ni "Clara Dupont"
```

### Scenario: les comptes désactivés sont masqués par défaut

```gherkin
Given le compte de Daniel Smith désactivé
When un administrateur ouvre "Users"
Then le filtre "Status" vaut "Active"
And la liste ne montre pas "Daniel Smith"
```

### Scenario: voir les comptes désactivés

```gherkin
Given le compte de Daniel Smith désactivé
And un administrateur sur "Users"
When il choisit "Deactivated" dans le filtre "Status"
Then la liste montre "Daniel Smith" avec "Deactivated"
And ne montre pas "Clara Dupont"
When il choisit "All statuses" dans le filtre "Status"
Then la liste montre "Daniel Smith" et "Clara Dupont"
```

### Scenario: la liste est paginée

```gherkin
Given 25 comptes actifs
When un administrateur ouvre "Users"
Then la liste montre 10 comptes
And la pagination propose 3 pages
When il passe à la page 3
Then la liste montre 5 comptes
```

### Scenario: la liste ne se charge pas

```gherkin
Given le serveur répond en erreur à la lecture des comptes
When un administrateur ouvre "Users"
Then la vue affiche "The accounts could not be loaded."
```

### Scenario: le personnel non admin ne voit pas l'entrée de navigation

```gherkin
Given un bibliothécaire connecté
Then la navigation ne propose pas "Users"
```

### Scenario: un non-admin qui ouvre l'adresse est renvoyé à l'accueil

```gherkin
Given un bibliothécaire connecté
When il ouvre l'adresse "/users"
Then il arrive sur l'accueil
And la vue "Users" n'est pas affichée
```

### Scenario: seul l'administrateur lit la liste des comptes par l'API

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il lit la liste des comptes
Then la réponse est <statut>

Examples:
  | rôle      | statut |
  | ADMIN     | 200    |
  | LIBRARIAN | 403    |
  | USER      | 403    |
```

### Scenario: sans session, la lecture est refusée

```gherkin
Given aucune session
When on lit la liste des comptes
Then la réponse est 401
```

---

## Critères d'acceptation

- [ ] `GET /api/v1/users` → `200` avec un `PagedResponse` dont chaque élément
      contient au moins `{ id, firstName, lastName, email, role, active }` ;
      paramètres `q` (facultatif), `role` (`user`, `librarian`, `admin`,
      facultatif), `status` (`active` par défaut, `deactivated`, `all`),
      pagination 1-based comme `PagedResponse.PageInfo`, taille 10 par défaut.
      `ADMIN` seulement ; `400` (`ApiError`) pour une valeur de `role` ou de
      `status` inconnue.
- [ ] La règle est déclarée dans `SecurityConfig` et ajoutée à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`. `GET /api/v1/users/search`
      et son contrat sont inchangés.
- [ ] La vue est un composant de `web/src/views/` avec son `-styles.js`, routée
      sur `/users` ; l'entrée de navigation « Users » n'est rendue que pour
      `isAdmin()`.
- [ ] Textes de l'interface : entrée de navigation « Users », titre « Users »,
      sous-titre « Every student and staff member who has an account. »,
      colonnes « Name », « Email », « Role », « Status », libellés de rôle
      « Student », « Librarian », « Admin », de statut « Active »,
      « Deactivated », champ « Search by name or email », filtres « Role »
      (« All roles », « Student », « Librarian », « Admin ») et « Status »
      (« Active », « Deactivated », « All statuses »), liste vide « No account
      matches your search. », erreur « The accounts could not be loaded. »
- [ ] Un `.bru` pour la lecture de la liste dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-01: <titre du scénario>`
  - [ ] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [ ] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [ ] Un nouvel endpoint a son `.bru` dans `server/API/<Controller>/`
  - [ ] Aucune migration appliquée n'est modifiée
  - [ ] Le backend démarre avec `ddl-auto=validate`
  - [ ] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : voir la
[feature](../README.md#préparation-commune-aux-vérifications). Base
`booksnap_e2e`, backend et `npm run dev`. Pour le filtre de statut, désactiver
Daniel Smith dans `psql` :
`UPDATE users SET is_active = false WHERE email = 'daniel.smith@example.com';`

1. Se connecter comme Bob Johnson (bibliothécaire) → pas d'entrée « Users »
   dans la navigation. Taper `/users` dans la barre d'adresse → retour à
   l'accueil. Se déconnecter.
2. Se connecter comme Alice Martin (admin) → l'entrée « Users » est là ;
   cliquer → titre, sous-titre et colonnes attendus ; Alice « Admin », Bob
   « Librarian », Clara « Student », tous « Active » ; ordre Dupont, Johnson,
   Martin… ; Daniel Smith absent.
3. Saisir `ART` → seule Alice Martin. Saisir `zzzz` → « No account matches
   your search. » Vider la recherche.
4. Filtre « Role » à « Librarian » → seul Bob Johnson. Remettre « All roles ».
5. Filtre « Status » à « Deactivated » → Daniel Smith, « Deactivated ». « All
   statuses » → Daniel et les autres.
6. Recharger la page → la liste revient sur « Active ».

**Nettoyage** : `UPDATE users SET is_active = true WHERE email = 'daniel.smith@example.com';`
sur la base de développement ; rien sur `booksnap_e2e`.

---

## Points de vigilance

- **Ne pas étendre `GET /users/search` pour servir la vue** : ses appelants
  (modales de prêt et de réservation) attendent une liste d'actifs sans rôle,
  et il est ouvert au `LIBRARIAN`. Le changer change ce que voit le comptoir.
- **La garde de route n'est pas la sécurité** : rediriger `/users` est du
  confort. Le `403` de l'API est ce qui protège la liste, et c'est lui que
  vérifie la matrice d'autorisation.
- **`is_active` est nullable** (`Boolean` dans l'entité, commentaire dans
  `UserDetailsServiceImpl`). Les filtres « Active » et « Deactivated » doivent
  se partager toutes les lignes : `is_active = true` d'un côté, `is_active IS
  NOT TRUE` de l'autre. Un `is_active = false` perdrait les `NULL` des deux
  côtés.
- **`LOWER(...) LIKE` sur un `citext`** : la recherche existante passe par
  `LOWER` en JPQL. Une recherche écrite autrement doit rester insensible à la
  casse, y compris sur l'email.
- **`sharedStyles` en dernier dans `static styles`** empêche de régler un
  `select` ou un `input` avec un sélecteur simple (`.claude/CLAUDE.md`) : les
  filtres et le champ de recherche en seront affectés.
