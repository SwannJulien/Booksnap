# US-04 — Changer le rôle d'un compte

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | US-01 (vue « Users ») |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Non |

---

## Story

**En tant qu'** administrateur
**je veux** faire passer un compte d'élève à bibliothécaire ou à administrateur,
et inversement
**afin qu'**un assistant de bibliothèque, un second administrateur ou un membre
du personnel qui change de fonction n'ait pas à attendre une modification dans
`psql` — et que l'école ne dépende pas d'un seul administrateur.

---

## Contexte

### Le rôle est une colonne, lu une fois par session

```java
// server/src/main/java/net/booksnap/domain/user/User.java
@Column(name = "role", nullable = false)
@Enumerated(EnumType.STRING)
@JdbcType(PostgreSQLEnumJdbcType.class)
private Role role = Role.user;
```

`users.role` est l'énumération `user_role` (`user`, `librarian`, `admin`,
`V7__user_role.sql`). `AuthController.login` place un `AuthenticatedUser` dans
la session avec le rôle lu à la connexion ; `SecurityConfig` décide ensuite sur
ce rôle (`hasRole(ADMIN)`, `hasAnyRole(LIBRARIAN, ADMIN)`). Changer la colonne
ne change rien à une session ouverte.

`SessionInvalidator` ferme les sessions d'un compte (voir
[US-03](../US-03-modifier-un-compte/US-03-modifier-un-compte-spec.md#contexte)) ;
la personne arrive alors sur l'écran de connexion avec « Your session has
expired. Sign in again to carry on where you left off. »

### Personne ne rouvre la porte si le dernier administrateur disparaît

```java
// server/src/main/java/net/booksnap/domain/user/repository/UserRepository.java
 * <p>Deliberately blind to {@code is_active}: a deactivated administrator still
 * counts. Someone who suspended the last admin account did so on purpose, and a
 * restart must not hand out a fresh one behind their back.
boolean existsByRole(Role role);
```

Règles : [règles accès §1 et §3](../../../business-rules/REGLES-METIER-ACCES.md)
(« Changer le rôle d'un utilisateur : `ADMIN` »),
[décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Tous les passages entre les trois rôles sont possibles.**
- **Le changement de rôle ne touche pas aux identifiants.** Un élève sans mot
  de passe promu bibliothécaire n'en reçoit pas, et ne peut pas se connecter
  tant qu'il n'en a pas (feature B, ou `psql`). Un membre du personnel
  rétrogradé élève garde son mot de passe. Décidé avec l'utilisateur ; rejetés :
  générer un mot de passe à la promotion, retirer le mot de passe à la
  rétrogradation.
- **La confirmation prévient quand le compte promu ne pourra pas se
  connecter**, pour que l'administrateur ne le découvre pas au comptoir.
- **Le changement prend effet immédiatement** : toutes les sessions du compte
  sont fermées (décision de la feature).
- **Un administrateur ne change jamais son propre rôle** (décision de la
  feature) : l'action est absente de sa ligne, et l'API répond `403`.
- **Les informations d'élève sont conservées** quand un élève devient membre du
  personnel, et retrouvées s'il redevient élève.
- **Un élève a toujours un key stage.** Quand le nouveau rôle est « Student »
  et que le compte n'en a pas, la modale demande le key stage, obligatoire, et
  l'API refuse la rétrogradation sans lui. Un compte qui a déjà un key stage
  (un ancien élève) n'est pas interrogé ; il garde le sien. Décidé avec
  l'utilisateur. Rejetés : laisser passer un élève sans key stage jusqu'à la
  prochaine modification, et refuser la rétrogradation tant que le key stage
  n'est pas saisi via « Edit » (qui n'affiche les champs d'élève qu'à un
  élève).
- **Le rôle se change sur un compte désactivé comme sur un compte actif.**

**Hors périmètre de cette story** : le rattachement d'un bibliothécaire à des
bibliothèques (backlog) ; un mot de passe pour le compte promu (feature B).

---

## Scénarios

### Scenario: l'administrateur promeut un élève bibliothécaire

```gherkin
Given l'élève "Clara Dupont", qui a un mot de passe
And un administrateur sur "Users"
When il choisit "Change role" dans le menu de la ligne de Clara Dupont
And choisit "Librarian" dans "Role"
Then la modale affiche "Clara Dupont will be signed out and will sign in again as Librarian."
When il clique sur "Change role"
Then la ligne de Clara Dupont montre "Librarian"
```

### Scenario: le compte promu se connecte avec son nouveau rôle

```gherkin
Given Clara Dupont, qui a un mot de passe, promue "Librarian"
When elle se connecte
Then elle est connectée comme bibliothécaire
And l'API lui permet de créer un prêt
```

### Scenario: la confirmation prévient qu'un compte sans mot de passe ne pourra pas se connecter

```gherkin
Given l'élève "Daniel Smith", sans mot de passe
And un administrateur dans "Change role" de Daniel Smith
When il choisit "Librarian"
Then la modale affiche aussi "Daniel Smith has no password yet and cannot sign in until one is set."
```

### Scenario: un compte promu sans mot de passe ne reçoit pas de mot de passe

```gherkin
Given l'élève "Daniel Smith", sans mot de passe, promu "Librarian"
When quelqu'un tente de se connecter avec "daniel.smith@example.com"
Then l'écran de connexion affiche "Email or password is incorrect."
```

### Scenario: une session ouverte prend le nouveau rôle immédiatement

```gherkin
Given le bibliothécaire Bob Johnson connecté dans un autre navigateur
When un administrateur le fait passer à "Student"
Then à sa prochaine action, Bob arrive sur l'écran de connexion qui affiche "Your session has expired. Sign in again to carry on where you left off."
And sa session précédente reçoit 401 sur toute requête
```

### Scenario: un membre du personnel rétrogradé garde son mot de passe

```gherkin
Given le bibliothécaire Bob Johnson, rétrogradé "Student"
When il se connecte avec son mot de passe habituel
Then il est connecté comme élève
And l'API lui refuse la création d'un prêt par 403
```

### Scenario: rétrograder en élève un compte sans key stage demande le key stage

```gherkin
Given le bibliothécaire Bob Johnson, sans key stage
And un administrateur dans "Change role" de Bob Johnson
When il choisit "Student" dans "Role"
Then la modale affiche le champ "Key stage", vide
And le bouton "Change role" est désactivé tant que "Key stage" est vide
When il choisit "KS-3" et clique sur "Change role"
Then Bob Johnson est élève, en "KS-3"
```

### Scenario: un compte qui a déjà un key stage le garde sans question

```gherkin
Given Clara Dupont, élève en "KS-1", promue "Librarian"
When un administrateur ouvre "Change role" de Clara Dupont et choisit "Student"
Then la modale n'affiche pas de champ "Key stage"
When il clique sur "Change role"
Then Clara Dupont est élève, en "KS-1"
```

### Scenario: le key stage n'est demandé que pour un passage à élève

```gherkin
Given un administrateur dans "Change role" de Bob Johnson, sans key stage
When il choisit "Admin" dans "Role"
Then la modale n'affiche pas de champ "Key stage"
```

### Scenario: l'API refuse de rétrograder en élève sans key stage

```gherkin
Given le bibliothécaire Bob Johnson, sans key stage
When un administrateur change par l'API son rôle en "user" sans key stage
Then la réponse est 400
And Bob Johnson est toujours bibliothécaire
```

### Scenario: l'administrateur nomme un second administrateur

```gherkin
Given le bibliothécaire Bob Johnson
When un administrateur le fait passer à "Admin"
And Bob se connecte
Then la navigation lui propose "Users"
```

### Scenario: le rôle actuel est présélectionné et ne peut pas être confirmé tel quel

```gherkin
Given un administrateur qui ouvre "Change role" de l'élève Clara Dupont
Then "Role" vaut "Student"
And le bouton "Change role" est désactivé
```

### Scenario: abandonner le changement

```gherkin
Given un administrateur dans "Change role" de Clara Dupont, avec "Admin" choisi
When il clique sur "Cancel"
Then la ligne de Clara Dupont montre toujours "Student"
```

### Scenario: l'administrateur ne peut pas changer son propre rôle

```gherkin
Given l'administrateur Alice Martin sur "Users"
Then le menu de sa propre ligne ne propose pas "Change role"
When il change son propre rôle par l'API
Then la réponse est 403 avec le message "You cannot change your own role."
And il est toujours administrateur
```

### Scenario: les informations d'élève reviennent avec le rôle

```gherkin
Given l'élève Clara Dupont en "KS-1", maison "Picasso", promue "Librarian"
When un administrateur la refait passer à "Student"
Then son compte a toujours "KS-1" et "Picasso"
```

### Scenario: un rôle inconnu ou un compte inconnu

```gherkin
Given un administrateur connecté
When il change par l'API <cas>
Then la réponse est <statut>

Examples:
  | cas                                       | statut |
  | le rôle de Clara Dupont en "superuser"    | 400    |
  | le rôle d'un compte qui n'existe pas      | 404    |
```

### Scenario: seul l'administrateur change un rôle

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il change par l'API le rôle de Clara Dupont en "admin"
Then la réponse est 403
And Clara Dupont est toujours élève

Examples:
  | rôle      |
  | LIBRARIAN |
  | USER      |
```

---

## Critères d'acceptation

- [ ] `PUT /api/v1/users/{id}/role` `{ role, keyStage? }` → `200` avec le
      compte ; `400` (`ApiError`) pour un rôle absent ou inconnu, ou pour un
      passage à `user` d'un compte sans key stage quand `keyStage` manque ou
      est inconnu ; `keyStage` est ignoré dans les autres cas ; `403` (`ApiError`,
      `"You cannot change your own role."`) sur son propre compte ; `404`
      (`ApiError`) pour un compte inconnu ; `ADMIN` seulement. Le même rôle
      que l'actuel répond `200` sans fermer de session.
- [ ] La lecture d'un compte (liste de US-01) indique si le compte a un mot de
      passe, sans jamais en exposer le hash, pour que la modale puisse
      prévenir.
- [ ] Les sessions du compte sont fermées après la validation de la
      transaction.
- [ ] La règle est déclarée dans `SecurityConfig` et ajoutée à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`.
- [ ] Textes de l'interface : action « Change role », titre de modale « Change
      role », champ « Role » (« Student », « Librarian », « Admin »), champ
      « Key stage » (« Pre-school », « KS-1 » … « KS-5 »), phrases
      « {Name} will be signed out and will sign in again as {Role}. » et
      « {Name} has no password yet and cannot sign in until one is set. »,
      boutons « Change role » et « Cancel » ; en cas d'échec « The role could
      not be changed. » {Name} est « {First name} {Last name} », ou l'email si
      le compte n'a ni prénom ni nom.
- [ ] Un `.bru` pour le changement de rôle dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-04: <titre du scénario>`
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
`booksnap_e2e`, backend et `npm run dev`. Deux navigateurs : Alice (admin) dans
l'un, Bob (bibliothécaire) dans l'autre.

1. Alice, **Users** → menu de sa propre ligne : pas de « Change role ».
2. Alice, « Change role » sur Clara Dupont → « Student » présélectionné, bouton
   désactivé. Choisir « Librarian » → phrase de confirmation, sans
   avertissement de mot de passe → « Change role » → « Librarian ».
3. « Change role » sur Daniel Smith → « Librarian » → l'avertissement « Daniel
   Smith has no password yet… » s'affiche → « Cancel » → Daniel est toujours
   « Student ».
4. Alice, « Change role » sur Bob → « Student » → le champ « Key stage »
   apparaît, bouton désactivé → « KS-3 » → « Change role ». Dans le navigateur de Bob, cliquer
   n'importe où → écran de connexion, « Your session has expired… ». Bob se
   reconnecte avec son mot de passe → connecté, sans les écrans du personnel
   que l'application réserve au rôle (pas d'« Archive » dans la navigation).
5. Alice refait passer Bob à « Admin ». Bob est de nouveau renvoyé à la
   connexion ; reconnecté, il voit « Users ».
6. Alice remet Clara à « Student » et Bob à « Librarian ».

**Nettoyage** : l'étape 6 ; rien d'autre sur `booksnap_e2e`.

---

## Points de vigilance

- **Ne pas changer le rôle dans la session au lieu de la fermer** : modifier le
  `SecurityContext` d'une autre session n'est pas possible proprement, et la
  fermeture est ce que la décision demande.
- **Ne pas épargner la session de l'appelant** par réflexe copié de
  `changePassword` : ici, l'appelant n'est jamais le compte visé (refus `403`),
  donc toutes les sessions du compte visé se ferment.
- **Le refus sur son propre compte compare des identifiants de compte**, celui
  du principal et celui du chemin, pas des emails : l'email peut changer (US-03)
  et la casse varier.
- **`existsByRole` ignore `is_active`** : il ne protège pas contre la perte du
  dernier administrateur actif. C'est la règle « jamais sur son propre compte »
  qui le fait.
