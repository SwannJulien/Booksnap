# US-03 — Modifier les informations d'un compte

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | US-02 (formulaire et règles des champs) |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Non |

---

## Story

**En tant qu'** administrateur
**je veux** corriger le nom, l'email ou les informations scolaires d'un compte
**afin qu'**une faute de frappe, une adresse qui change ou le passage d'un élève
au key stage suivant à la rentrée ne demandent plus `psql`.

---

## Contexte

### Rien n'écrit dans `users` en dehors de la connexion

La seule écriture applicative sur un compte existant est
`AuthController.recordLastLogin`, qui met à jour `last_login` (et, par effet de
bord, les colonnes d'audit). Les champs du compte et leurs règles sont ceux de
[US-02](../US-02-creer-un-compte/US-02-creer-un-compte-spec.md#contexte).

### L'email est l'identifiant de connexion, et il est figé dans la session

`UserDetailsServiceImpl.loadUserByUsername(email)` retrouve le compte par
`findByEmail`. À la connexion, `AuthController.login` place un
`AuthenticatedUser` dans la session, avec l'email lu à ce moment-là.
`AuditorAwareImpl` lit ce principal pour remplir `created_by` /
`last_modified_by`, et le journal écrit l'email de l'acteur dans
`lifecycle_event.actor` (texte, pas de clé étrangère).

`SessionInvalidator.invalidateAllExcept(principal, currentSessionId)` ferme les
sessions d'un compte ; le registre retrouve les sessions par
`AuthenticatedUser.equals`, qui compare l'`id`. Une session fermée fait arriver
la personne, à sa prochaine action, sur l'écran de connexion avec :

```js
// web/src/views/login-view/login-view.js:28
'Your session has expired. Sign in again to carry on where you left off.';
```

### Le journal fige les informations de l'élève

```sql
-- server/src/main/resources/db/migration/V10__lifecycle_event.sql:126
u.id, u.first_name, u.last_name, u.key_stage::text, u.house,
```

Chaque événement de prêt ou de réservation recopie ces valeurs au moment des
faits : la colonne est du texte « so a frozen fact must not follow later
changes » (`V10`, ligne 53). L'historique n'en montre que le prénom et le nom
(`LifecycleEventResponse.StudentRef(id, firstName, lastName)`).

Règles : [décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Tous les champs saisis à la création sont modifiables, email compris**, avec
  les mêmes règles et les mêmes messages que dans US-02. Le rôle ne se modifie
  pas ici (US-04), et il n'y a pas de mot de passe dans ce formulaire.
- **Changer l'email d'un compte ferme toutes ses sessions.** Sinon l'auteur
  enregistré par l'audit et le journal resterait l'ancienne adresse jusqu'à sa
  déconnexion. La personne se reconnecte avec la nouvelle adresse et le même
  mot de passe. Validé avec l'utilisateur lors du découpage. Les autres champs
  ne ferment aucune session.
- **Un administrateur peut modifier ses propres informations.** S'il change son
  propre email, sa propre session est fermée comme les autres, et il se
  reconnecte avec la nouvelle adresse.
- **Le journal n'est pas réécrit** : l'historique d'un livre ou d'une copie
  montre l'élève tel qu'il était au moment de chaque prêt.
- **Vider un champ facultatif l'efface** (maison, email parent, sexe).
- **Un compte désactivé se modifie comme un compte actif.**

**Hors périmètre de cette story** : le rôle (US-04), le statut (US-05) ; le
changement d'email d'une identité Microsoft (phase 7, D9).

---

## Scénarios

### Scenario: le formulaire s'ouvre sur les valeurs du compte

```gherkin
Given l'élève "Clara Dupont", "clara.dupont@example.com", "KS-1", maison "Picasso"
And un administrateur sur "Users"
When il choisit "Edit" dans le menu de la ligne de Clara Dupont
Then une modale "Edit account" s'ouvre
And "First name" contient "Clara", "Last name" "Dupont", "Email" "clara.dupont@example.com", "Key stage" "KS-1", "House" "Picasso"
And aucun champ "Role" ni mot de passe n'est proposé
```

### Scenario: l'administrateur fait passer un élève au key stage suivant

```gherkin
Given l'élève "Clara Dupont" en "KS-1"
When un administrateur choisit "KS-2" dans "Key stage" de "Edit account" et clique sur "Save"
Then la modale se ferme
And après rechargement, "Edit account" de Clara Dupont montre "KS-2"
```

### Scenario: corriger un nom

```gherkin
Given le compte "Clara Dupont"
When un administrateur remplace "Dupont" par "Dupond" dans "Last name" et clique sur "Save"
Then la liste montre "Clara Dupond"
```

### Scenario: le journal garde les valeurs du moment

```gherkin
Given un prêt d'une copie à Clara Dupont, en "KS-1"
When un administrateur renomme son compte "Clara Dupond" et la fait passer en "KS-2"
Then l'historique de cette copie montre toujours l'événement de prêt au nom de "Clara Dupont"
And l'événement enregistré garde "ks_1" comme key stage de l'élève
```

### Scenario: vider un champ facultatif l'efface

```gherkin
Given l'élève "Clara Dupont" avec la maison "Picasso"
When un administrateur vide "House" et clique sur "Save"
Then le compte n'a plus de maison
```

### Scenario: changer l'email d'un membre du personnel

```gherkin
Given le bibliothécaire "bob.johnson@example.com", connecté dans un autre navigateur
When un administrateur remplace son email par "b.johnson@example.com" et clique sur "Save"
Then à sa prochaine action, Bob arrive sur l'écran de connexion qui affiche "Your session has expired. Sign in again to carry on where you left off."
And il se connecte avec "b.johnson@example.com" et son mot de passe habituel
And la connexion avec "bob.johnson@example.com" affiche "Email or password is incorrect."
```

### Scenario: changer un autre champ ne ferme pas les sessions

```gherkin
Given le bibliothécaire Bob Johnson connecté dans un autre navigateur
When un administrateur change son prénom et clique sur "Save"
Then la session de Bob reste ouverte
```

### Scenario: l'administrateur change son propre email

```gherkin
Given l'administrateur "alice.martin@example.com" connecté
When il remplace son propre email par "a.martin@example.com" dans "Edit account" et clique sur "Save"
Then il arrive sur l'écran de connexion qui affiche "Your session has expired. Sign in again to carry on where you left off."
And il se connecte avec "a.martin@example.com" et son mot de passe
```

### Scenario: l'email d'un autre compte est refusé, quelle que soit la casse

```gherkin
Given les comptes "clara.dupont@example.com" et "daniel.smith@example.com"
When un administrateur saisit "Daniel.Smith@example.com" comme email de Clara Dupont et clique sur "Save"
Then "Email" affiche "An account already uses this email."
And l'email de Clara Dupont est inchangé
```

### Scenario: changer seulement la casse de son propre email est accepté

```gherkin
Given le compte "clara.dupont@example.com"
When un administrateur saisit "Clara.Dupont@example.com" comme email de Clara Dupont et clique sur "Save"
Then l'enregistrement réussit
And la liste montre "Clara.Dupont@example.com"
```

### Scenario: un champ obligatoire vidé est refusé

```gherkin
Given un administrateur dans "Edit account" de l'élève Clara Dupont
When il vide "<champ>" et clique sur "Save"
Then "<champ>" affiche "This field is required."
And le compte est inchangé

Examples:
  | champ      |
  | First name |
  | Email      |
  | Key stage  |
```

### Scenario: une adresse invalide est refusée

```gherkin
Given un administrateur dans "Edit account" de Clara Dupont
When il saisit "clara@" dans "Email" et clique sur "Save"
Then "Email" affiche "Enter a valid email address."
And le compte est inchangé
```

### Scenario: abandonner la modification

```gherkin
Given un administrateur dans "Edit account" de Clara Dupont, avec "Dupond" saisi dans "Last name"
When il clique sur "Cancel"
Then la liste montre toujours "Clara Dupont"
```

### Scenario: un compte inconnu

```gherkin
Given un administrateur connecté
When il modifie par l'API un compte qui n'existe pas
Then la réponse est 404
```

### Scenario: seul l'administrateur modifie un compte

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il modifie par l'API le compte de Clara Dupont
Then la réponse est 403
And le compte est inchangé

Examples:
  | rôle      |
  | LIBRARIAN |
  | USER      |
```

---

## Critères d'acceptation

- [ ] `PUT /api/v1/users/{id}`
      `{ firstName, lastName, email, keyStage?, house?, parentEmail?, sex? }`
      → `200` avec le compte ; un champ `role` envoyé est ignoré ; `400`, `409`
      comme à la création (US-02) ; `404` (`ApiError`) pour un compte inconnu ;
      `ADMIN` seulement.
- [ ] Les champs d'élève envoyés pour un membre du personnel sont ignorés ; le
      key stage n'est obligatoire que pour un compte de rôle `user`.
- [ ] Les sessions sont fermées après la validation de la transaction, comme
      dans `AuthController.changePassword`, et seulement si l'email a changé.
- [ ] La règle est déclarée dans `SecurityConfig` et ajoutée à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`.
- [ ] La modale de US-02 est réutilisée en mode modification, ouverte par
      l'action « Edit » du menu de ligne (`dropdown-selected-option`).
- [ ] Textes de l'interface : action « Edit », titre « Edit account », bouton
      « Save » et « Cancel » ; mêmes libellés de champs et mêmes erreurs que
      US-02 ; pour tout autre échec « The account could not be saved. »
- [ ] Un `.bru` pour la modification dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-03: <titre du scénario>`
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
`booksnap_e2e`, backend et `npm run dev`. Deux navigateurs (ou une fenêtre
privée) : Alice (admin) dans l'un, Bob (bibliothécaire) dans l'autre. Une copie
disponible au catalogue.

1. Bob prête la copie à Clara Dupont (KS-1).
2. Alice, **Users** → « Edit » sur Clara Dupont → valeurs attendues, pas de rôle
   ni de mot de passe. Nom « Dupond », « KS-2 », vider « House » → « Save ».
   La liste montre « Clara Dupond ». Recharger, rouvrir → « KS-2 », maison vide.
3. Alice ouvre l'historique de la copie (catalogue) → l'événement de prêt est
   toujours au nom de « Clara Dupont ».
4. Alice, « Edit » sur Clara → email `daniel.smith@example.com` → « An account
   already uses this email. » « Cancel ».
5. Alice, « Edit » sur Bob → prénom « Robert » → « Save ». Bob continue de
   travailler normalement.
6. Alice, « Edit » sur Bob → email `b.johnson@example.com` → « Save ». Bob
   clique n'importe où → écran de connexion, « Your session has expired… ».
   Bob se connecte avec `bob.johnson@example.com` → « Email or password is
   incorrect. » ; avec `b.johnson@example.com` → connecté.

**Nettoyage** : rien sur `booksnap_e2e` ; sur la base de développement, rendre
l'email, le prénom et le key stage d'origine par la même modale, et rendre la
copie.

---

## Points de vigilance

- **Ne pas fermer les sessions dans la transaction** : comme pour le changement
  de mot de passe (`AuthController.changePassword`), une fermeture suivie d'un
  rollback déconnecterait quelqu'un pour une modification qui n'a pas eu lieu.
- **Fermer les sessions demande le principal du compte modifié**, pas celui de
  l'administrateur : `SessionRegistry` cherche par `AuthenticatedUser.equals`,
  c'est-à-dire par `id`. Pour son propre compte, l'administrateur ne garde pas
  sa session (contrairement au changement de mot de passe, qui l'épargne).
- **L'unicité de l'email se vérifie en excluant le compte lui-même**, sinon
  changer la casse de sa propre adresse serait refusé comme un doublon.
- **`recordLastLogin` écrit aussi dans `users`** : une modification et une
  connexion simultanées du même compte se disputent la ligne ; l'entité ne doit
  pas réécrire `last_login` avec une valeur périmée.
