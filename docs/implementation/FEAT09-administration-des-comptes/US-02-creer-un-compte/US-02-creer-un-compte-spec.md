# US-02 — Créer un compte élève ou du personnel

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | US-01 (vue « Users ») |
| **Bloque** | US-03, US-06 |
| **Portée** | back + front |
| **Casse l'existant ?** | Non |

---

## Story

**En tant qu'** administrateur
**je veux** créer depuis la vue « Users » un compte élève ou un compte de
bibliothécaire ou d'administrateur
**afin qu'**un élève inscrit en cours d'année puisse emprunter dès le jour même,
et qu'un nouveau membre du personnel puisse se connecter, sans que personne
n'écrive un `INSERT` dans `psql`.

---

## Contexte

### Un compte ne naît aujourd'hui que de trois façons

`server/sql/seed.sql`, un `INSERT` à la main, ou `AdminBootstrapRunner`
(`server/src/main/java/net/booksnap/config/AdminBootstrapRunner.java`), qui
crée le premier administrateur au démarrage quand aucun n'existe. Aucun
endpoint n'écrit dans `users`.

### Le compte et le moyen de se connecter sont deux lignes

```text
-- \d auth_identity (base réelle)
user_id        bigint NOT NULL  → users(id), sans ON DELETE
provider       auth_provider NOT NULL
password_hash  text
"uq_auth_identity_user_provider" UNIQUE (user_id, provider)
"ck_auth_identity_shape" CHECK (provider = 'local' AND password_hash IS NOT NULL AND subject IS NULL
                             OR provider <> 'local' AND subject IS NOT NULL AND password_hash IS NULL)
```

Un compte sans ligne `auth_identity` ne peut pas se connecter :
`UserDetailsServiceImpl.loadUserByUsername` le rejette (« account {} has no
local identity »), et l'écran de connexion affiche alors le même message que
pour un mauvais mot de passe :

```js
// web/src/views/login-view/login-view.js:20
const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';
```

### La règle du mot de passe existe déjà, pour cet usage

```java
// server/src/main/java/net/booksnap/domain/auth/service/PasswordPolicy.java
 * Three callers need this rule and none of them may disagree with the others: the
 * bootstrap runner refusing to create a weak administrator, the password change of
 * US-008, and the invitations of phase 4.
public static final int MINIMUM_LENGTH = 12;
```

Le membre du personnel change ensuite son mot de passe dans « My account »
(`web/src/views/account-view/account-view.js`, `POST /api/v1/auth/password`),
qui exige le mot de passe actuel.

### Les champs et leurs valeurs

`users.email` est du domaine `email` (`citext`), unique (`users_email_key`) ;
`parent_email` aussi, sans unicité. `key_stage` est l'énumération `key_stage`
(`pre_school`, `ks_1` … `ks_5`), affichée « Pre-school », « KS-1 » … « KS-5 »
par `book-form-bks.js:208-213`. `house` et `genre` sont du `text` libre ; les
fixtures y mettent `Goya`, `Velazquez`, `Picasso`, `Dali` et `female`, `male`.
L'entité `User` ne mappe ni `key_stage`, ni `house`, ni `genre`, ni
`parent_email`.

Le journal fige `key_stage` et `house` dans chaque événement de prêt ou de
réservation (`V10__lifecycle_event.sql:126`, `u.key_stage::text, u.house`).

Règles : [règles accès §5.1 et §5.3](../../../business-rules/REGLES-METIER-ACCES.md),
[décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Le rôle se choisit en premier**, « Student » par défaut. Les champs propres
  à l'élève (key stage, maison, email parent, sexe) n'apparaissent que pour
  « Student », et ne sont pas enregistrés pour un membre du personnel.
- **Obligatoires** : prénom, nom, email pour tous ; key stage pour un élève.
  **Facultatifs** : maison, email parent, sexe.
- **Un élève est créé sans aucun moyen de se connecter**, et un membre du
  personnel avec un **mot de passe temporaire** — voir la
  [feature](../README.md#décisions-valables-pour-toute-la-feature).
- **Le mot de passe temporaire est montré une seule fois**, dans la réponse de
  création et dans la modale qui la suit. Il n'est jamais relu, jamais
  réaffiché, jamais écrit dans les logs. Fermer la modale le perd pour de bon ;
  il n'existe pas de régénération (décision de la feature).
- **Le mot de passe temporaire n'est pas à usage unique** et n'oblige pas à en
  changer : son propriétaire le remplace quand il veut dans « My account ».
  Décidé avec l'utilisateur. Rejeté : un changement forcé à la première
  connexion, qui demanderait un état de compte de plus (migration, garde back
  et front) pour une voie que l'activation par email reléguera au rang de
  secours ([backlog](../../../BACKLOG.md), feature B).
- **L'email est unique sans tenir compte de la casse**, et les espaces en début
  et en fin de chaque champ texte sont retirés. Le texte est enregistré tel que
  saisi (pas de mise en minuscules).
- **La maison se saisit avec des suggestions tirées des maisons déjà
  utilisées**, sans tenir compte de la casse, et une valeur nouvelle est
  acceptée. Décidé avec l'utilisateur. Rejetés : le texte libre sans aide (une
  faute de frappe crée une maison de plus) et une liste fixe (une maison
  ajoutée ou renommée demanderait de modifier le code). La gestion des maisons
  par l'administrateur, qui les crée lui-même, appartient à la future feature de
  configuration initiale ([backlog](../../../BACKLOG.md)). Elle remplacera ces
  suggestions.
- **Le sexe se choisit parmi « Female », « Male » et « Other », ou reste
  vide**, et s'enregistre `female` / `male` / `other` (les deux premières
  valeurs sont celles des fixtures). Décidé avec l'utilisateur. Une liste
  fermée garde des données exploitables ; rejetées : les suggestions sur les
  valeurs existantes, et la liste sans « Other ». À confronter au format réel
  lors de l'import iSAMS.
- **Aucune bibliothèque n'est demandée** (décision de la feature).

**Hors périmètre de cette story** : modifier un compte (US-03) ; l'invitation
par email et l'activation (feature B du backlog) ; l'import en masse
(feature C).

---

## Scénarios

### Scenario: l'administrateur crée un élève

```gherkin
Given un administrateur sur "Users"
When il clique sur "New account"
And laisse "Role" à "Student"
And saisit "Léa" dans "First name", "Moreau" dans "Last name", "lea.moreau@example.com" dans "Email"
And choisit "KS-2" dans "Key stage", saisit "Goya" dans "House", "parent.moreau@example.com" dans "Parent email", choisit "Female" dans "Sex"
And clique sur "Create"
Then la modale se ferme
And la liste montre "Léa Moreau", "lea.moreau@example.com", "Student", "Active"
```

### Scenario: un élève créé peut emprunter tout de suite

```gherkin
Given l'élève "Léa Moreau" créé depuis "Users"
When un bibliothécaire ouvre la modale de prêt d'une copie disponible et cherche "Moreau"
Then "Léa Moreau" est proposée
```

### Scenario: un élève créé n'a pas de mot de passe

```gherkin
Given l'élève "lea.moreau@example.com" créé depuis "Users"
When quelqu'un tente de se connecter avec "lea.moreau@example.com" et n'importe quel mot de passe
Then l'écran de connexion affiche "Email or password is incorrect."
```

### Scenario: les informations de l'élève sont enregistrées

```gherkin
Given l'élève "Léa Moreau" créé avec "KS-2", "Goya", "parent.moreau@example.com" et "Female"
When un administrateur lit ce compte par l'API
Then il a pour key stage "ks_2", pour maison "Goya", pour email parent "parent.moreau@example.com" et pour sexe "female"
And il a pour rôle "user" et il est actif
```

### Scenario: le sexe se choisit dans une liste fermée

```gherkin
Given un administrateur dans "New account", rôle "Student"
Then "Sex" propose une valeur vide, "Female", "Male" et "Other"
When il crée l'élève "Léa Moreau" avec "Other"
Then le compte a pour sexe "other"
```

### Scenario: l'API refuse un sexe hors liste

```gherkin
Given un administrateur connecté
When il crée par l'API un élève de sexe "unknown"
Then la réponse est 400
And aucun compte n'est créé
```

### Scenario: les champs facultatifs de l'élève peuvent rester vides

```gherkin
Given un administrateur dans "New account", rôle "Student"
When il saisit seulement le prénom, le nom, l'email et le key stage, puis clique sur "Create"
Then le compte est créé, sans maison, sans email parent et sans sexe
```

### Scenario: la maison propose les maisons déjà utilisées

```gherkin
Given des élèves dans les maisons "Goya", "Velazquez", "Picasso" et "Dali"
And un administrateur dans "New account", rôle "Student"
When il saisit "ve" dans "House"
Then "Velazquez" est proposée
And "Goya" n'est pas proposée
When il choisit "Velazquez"
Then "House" contient "Velazquez"
```

### Scenario: une maison nouvelle est acceptée

```gherkin
Given aucun élève dans la maison "Miró"
When un administrateur crée l'élève "Léa Moreau" avec "Miró" dans "House"
Then le compte est créé avec la maison "Miró"
And la création d'un élève suivant propose "Miró" pour "mi"
```

### Scenario: les champs de l'élève disparaissent pour un membre du personnel

```gherkin
Given un administrateur dans "New account"
When il choisit "Librarian" dans "Role"
Then "Key stage", "House", "Parent email" et "Sex" ne sont plus affichés
When il revient à "Student"
Then ils sont affichés de nouveau
```

### Scenario: l'administrateur crée un bibliothécaire et reçoit son mot de passe temporaire

```gherkin
Given un administrateur dans "New account"
When il choisit "Librarian", saisit "Paul", "Girard", "paul.girard@example.com", et clique sur "Create"
Then la modale affiche "Account created."
And "Temporary password:" suivi d'un mot de passe d'au moins 12 caractères
And "Give it to Paul Girard in person. It will not be shown again."
And les boutons "Copy" et "Done"
When il clique sur "Done"
Then la modale se ferme
And la liste montre "Paul Girard", "Librarian", "Active"
```

### Scenario: le mot de passe temporaire ouvre une session avec le bon rôle

```gherkin
Given le bibliothécaire "paul.girard@example.com" créé, et son mot de passe temporaire noté
When il se connecte avec cet email et ce mot de passe
Then il est connecté comme bibliothécaire
And il peut remplacer ce mot de passe dans "My account"
```

### Scenario: un administrateur créé est administrateur

```gherkin
Given un administrateur crée le compte "Admin" de "nina.roux@example.com" et note son mot de passe temporaire
When Nina Roux se connecte avec
Then la navigation lui propose "Users"
```

### Scenario: "Copy" copie le mot de passe temporaire

```gherkin
Given la modale qui affiche le mot de passe temporaire de Paul Girard
When l'administrateur clique sur "Copy"
Then le presse-papiers contient ce mot de passe
And le bouton affiche "Copied"
```

### Scenario: le mot de passe temporaire n'est jamais relu

```gherkin
Given le bibliothécaire "paul.girard@example.com" créé
When un administrateur lit la liste des comptes ou ce compte par l'API
Then aucune réponse ne contient de mot de passe ni de hash
```

### Scenario: un élève créé ne reçoit pas de mot de passe temporaire

```gherkin
Given un administrateur dans "New account", rôle "Student", champs obligatoires remplis
When il clique sur "Create"
Then la réponse de création ne contient pas de mot de passe
And aucune modale de mot de passe n'est affichée
```

### Scenario: un email déjà utilisé est refusé, quelle que soit la casse

```gherkin
Given le compte "clara.dupont@example.com"
And un administrateur dans "New account", rôle "Student", champs obligatoires remplis
When il saisit "Clara.Dupont@Example.com" dans "Email" et clique sur "Create"
Then la modale reste ouverte
And "Email" affiche "An account already uses this email."
And aucun compte n'est créé
```

### Scenario: l'API refuse un email déjà utilisé

```gherkin
Given le compte "clara.dupont@example.com"
When un administrateur crée par l'API un compte d'email "CLARA.DUPONT@example.com"
Then la réponse est 409
And aucun compte n'est créé
```

### Scenario: un champ obligatoire manque

```gherkin
Given un administrateur dans "New account", rôle "<rôle>"
When il laisse "<champ>" vide, remplit les autres champs obligatoires, et clique sur "Create"
Then la modale reste ouverte
And "<champ>" affiche "This field is required."
And aucun compte n'est créé

Examples:
  | rôle      | champ      |
  | Student   | First name |
  | Student   | Last name  |
  | Student   | Email      |
  | Student   | Key stage  |
  | Librarian | First name |
```

### Scenario: un champ fait uniquement d'espaces compte comme vide

```gherkin
Given un administrateur dans "New account", rôle "Student"
When il saisit "   " dans "Last name", remplit les autres champs obligatoires, et clique sur "Create"
Then "Last name" affiche "This field is required."
```

### Scenario: une adresse invalide est refusée

```gherkin
Given un administrateur dans "New account", rôle "Student", champs obligatoires remplis
When il saisit "<valeur>" dans "<champ>" et clique sur "Create"
Then "<champ>" affiche "Enter a valid email address."
And aucun compte n'est créé

Examples:
  | champ        | valeur       |
  | Email        | lea.moreau   |
  | Parent email | parent@      |
```

### Scenario: les espaces autour des champs sont retirés

```gherkin
Given un administrateur dans "New account", rôle "Student"
When il saisit "  Léa " dans "First name" et " lea.moreau@example.com " dans "Email", remplit le reste, et clique sur "Create"
Then le compte a pour prénom "Léa" et pour email "lea.moreau@example.com"
```

### Scenario: l'API refuse un compte incomplet

```gherkin
Given un administrateur connecté
When il crée par l'API un compte <cas>
Then la réponse est 400
And aucun compte n'est créé

Examples:
  | cas                                   |
  | sans email                            |
  | de rôle "user" sans key stage         |
  | de rôle "superuser"                   |
  | dont l'email parent n'est pas valide  |
```

### Scenario: abandonner la création

```gherkin
Given un administrateur dans "New account", avec des champs remplis
When il clique sur "Cancel"
Then la modale se ferme
And aucun compte n'est créé
```

### Scenario: seul l'administrateur crée un compte

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il crée un compte par l'API
Then la réponse est 403
And aucun compte n'est créé

Examples:
  | rôle      |
  | LIBRARIAN |
  | USER      |
```

### Scenario: l'auteur de la création est enregistré

```gherkin
Given l'administrateur "alice.martin@example.com" connecté
When il crée le compte de "lea.moreau@example.com"
Then la colonne created_by de ce compte vaut "alice.martin@example.com"
```

---

## Critères d'acceptation

- [ ] `POST /api/v1/users`
      `{ role, firstName, lastName, email, keyStage?, house?, parentEmail?, sex? }`
      → `201` avec le compte créé et, pour un rôle `librarian` ou `admin`
      seulement, un champ `temporaryPassword` ; `400` (`ApiError`) pour un champ
      obligatoire manquant ou vide, un email ou un email parent invalide, un
      rôle ou un key stage inconnu ; `409` (`ApiError`,
      `"An account already uses this email."`) pour un email déjà pris ;
      `ADMIN` seulement.
- [ ] La lecture d'un compte et la liste de US-01 renvoient aussi `keyStage`,
      `house`, `parentEmail` et `sex` ; aucune réponse ne contient de mot de
      passe ni de hash, en dehors de `temporaryPassword` à la création.
- [ ] Les maisons suggérées sont les valeurs non vides de `users.house`,
      distinctes sans tenir compte de la casse, servies par une lecture `ADMIN` seulement (déclarée dans
      `SecurityConfig` et dans `ApiAuthorizationMatrixTest`), avec son `.bru`.
- [ ] Le mot de passe temporaire est produit par un générateur aléatoire
      cryptographique, satisfait `PasswordPolicy`, est stocké haché BCrypt dans
      une identité `local`, et n'apparaît dans aucun log.
- [ ] Le compte et son identité sont écrits dans la même transaction : un échec
      ne laisse ni compte sans identité pour le personnel, ni identité orpheline.
- [ ] Les entités mappent les colonnes existantes de `users` sans migration ;
      `parent_email` déclare le domaine `email` comme `email`
      (`.claude/CLAUDE.md`, « Case-insensitive columns »).
- [ ] La règle est déclarée dans `SecurityConfig` et ajoutée à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`.
- [ ] La modale est un composant de `web/src/features/` avec son `-styles.js` ;
      l'appel API est dans `web/src/api/user.js`, et une erreur `409` y porte
      `error.status`.
- [ ] Textes de l'interface : bouton « New account », titre de modale « New
      account », champs « Role » (« Student », « Librarian », « Admin »),
      « First name », « Last name », « Email », « Key stage » (« Pre-school »,
      « KS-1 » … « KS-5 »), « House », « Parent email », « Sex » (vide,
      « Female », « Male », « Other »), boutons « Create » et « Cancel » ; erreurs « This
      field is required. », « Enter a valid email address. », « An account
      already uses this email. », et pour tout autre échec « The account could
      not be created. » ; modale du mot de passe : « Account created. »,
      « Temporary password: », « Give it to {First name} {Last name} in person.
      It will not be shown again. », boutons « Copy » (puis « Copied ») et
      « Done ».
- [ ] Un `.bru` pour la création dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-02: <titre du scénario>`
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
`booksnap_e2e`, backend et `npm run dev`. Une copie disponible au catalogue.

1. Admin Alice Martin, **Users** → « New account ». Rôle « Student »,
   « Léa », « Moreau », « Clara.Dupont@Example.com », « KS-2 » → « Create » →
   « An account already uses this email. »
2. Remplacer l'email par `lea.moreau` → « Enter a valid email address. ».
   Remplacer par `lea.moreau@example.com`, ajouter « Goya », un email parent,
   « Female » → « Create » → Léa Moreau apparaît, « Student », « Active ».
3. « New account », rôle « Librarian » → les champs d'élève disparaissent.
   « Paul », « Girard », `paul.girard@example.com` → « Create » → « Account
   created. », un mot de passe, la phrase « Give it to Paul Girard in person… ».
   « Copy » → « Copied ». Coller le mot de passe dans un bloc-notes. « Done ».
4. Se déconnecter. Se connecter avec `lea.moreau@example.com` et n'importe quel
   mot de passe → « Email or password is incorrect. »
5. Se connecter avec `paul.girard@example.com` et le mot de passe collé →
   connecté, sans entrée « Users ». **My account** → changer le mot de passe →
   succès. Se déconnecter, se reconnecter avec le nouveau.
6. Comme Paul (bibliothécaire), ouvrir la modale de prêt de la copie, chercher
   « Moreau » → Léa Moreau est proposée. Fermer sans prêter.

**Nettoyage** : rien sur `booksnap_e2e`. Sur la base de développement, Léa se
supprime avec US-06 ou dans `psql` (voir la
[feature](../README.md#préparation-commune-aux-vérifications)) ; Paul s'est
connecté, il ne se supprime plus que dans `psql`.

---

## Points de vigilance

- **Ne pas journaliser la réponse ni la requête de création** : la réponse
  porte le mot de passe en clair. Un `log.info("created {}", response)` ou un
  `toString()` de DTO qui l'inclut suffit à le mettre dans les logs.
- **Ne pas créer d'identité `local` pour un élève** avec un hash factice ou
  vide : `ck_auth_identity_shape` refuse un hash nul, et un hash vide ferait
  répondre `UserDetailsServiceImpl` par un rejet pour une autre raison que
  « pas d'identité ».
- **Ne pas comparer les emails en Java** (`equalsIgnoreCase` sur une liste) :
  l'index `citext` est l'autorité. Un `existsByEmail` repose sur
  `stringtype=unspecified` pour ignorer la casse ; la violation de
  `users_email_key` doit aussi devenir un `409`, pour une création concurrente.
- **`parent_email` est du domaine `email`** : une valeur vide doit être
  enregistrée `NULL`, pas `''`, que le domaine refuserait.
- **Le domaine `email` a sa propre expression régulière** (`\dD email` : partie
  locale ASCII, `@`, domaine en `[a-zA-Z0-9-]`). Une adresse que le `@Email` de
  Jakarta accepte et que le domaine refuse (un caractère accentué, par exemple)
  finirait en violation de contrainte, donc en `500`, au lieu du `400` « Enter
  a valid email address. ». La validation du serveur doit refuser au moins ce
  que refuse le domaine.
- **Le mot de passe temporaire doit passer `PasswordPolicy`** : un générateur
  qui produit moins de 12 caractères donnerait un compte dont le propriétaire ne
  pourrait pas réenregistrer un mot de passe de même forme.
