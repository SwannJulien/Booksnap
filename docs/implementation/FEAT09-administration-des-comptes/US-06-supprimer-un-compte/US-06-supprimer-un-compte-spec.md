# US-06 — Supprimer un compte qui n'a jamais servi

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | US-02 (créer un compte, donc en créer un par erreur) |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Non |

---

## Story

**En tant qu'** administrateur
**je veux** supprimer un compte créé par erreur — une faute dans l'email, un
doublon, une personne qui n'est finalement pas venue
**afin que** la liste des comptes ne garde pas d'erreurs pour toujours, et que
l'email redevienne libre, sans que la suppression puisse jamais effacer
l'historique de quelqu'un.

---

## Contexte

### Ce qui référence un compte

```text
-- \d users (base réelle), « Referenced by »
auth_identity  auth_identity_user_id_fkey  FOREIGN KEY (user_id) REFERENCES users(id)
borrowing      borrowing_user_id_fkey      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
hold           hold_user_id_fkey           FOREIGN KEY (user_id) REFERENCES users(id)
notification   notification_user_id_fkey   FOREIGN KEY (user_id) REFERENCES users(id)
```

Sans clé étrangère : `lifecycle_event.student_id` (l'élève d'un prêt ou d'une
réservation) et `lifecycle_event.actor`, `created_by`, `last_modified_by`
(l'email du membre du personnel qui a agi).

`users.last_login` est écrit à chaque connexion (`AuthController.recordLastLogin`).
Un membre du personnel ne peut agir qu'après s'être connecté.

### Pourquoi la suppression est dangereuse

> **Un utilisateur ne doit jamais être supprimé physiquement — uniquement
> désactivé.** Ce n'est pas une préférence : `borrowing.user_id` est
> `ON DELETE CASCADE` alors que `hold.user_id` et `notification.user_id` ne le
> sont pas. — [règles accès §6](../../../business-rules/REGLES-METIER-ACCES.md)

Cette story fait une exception à cette règle, et une seule : le compte qui n'a
jamais servi, sur le modèle de D6 pour les bibliothèques
([décisions](../../authentication-system/DECISIONS-MULTI-UTILISATEUR.md)).

Règles : [décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Un compte est supprimable s'il n'a jamais servi** (_Unused account_) : il
  ne s'est jamais connecté (`last_login` vide) et il n'a aucun emprunt, aucune
  réservation et aucune notification, quel qu'en soit le statut. Rejeté :
  « aucune donnée de prêt » sans regarder les connexions. Un bibliothécaire qui
  a travaillé serait supprimable, et si son email était ensuite réattribué, le
  journal attribuerait ses gestes à la nouvelle personne.
- **Supprimer retire le compte et ses moyens de connexion** (son identité
  `local`, s'il en a une). L'email redevient disponible.
- **L'action « Delete » n'apparaît que sur un compte qui n'a jamais servi.**
  Pour les autres, l'API refuse et renvoie vers la désactivation.
- **Un compte désactivé qui n'a jamais servi est supprimable** aussi.
- **Un administrateur ne supprime jamais son propre compte** (décision de la
  feature). Comme il s'est connecté pour agir, son compte n'est de toute façon
  jamais « jamais servi » ; l'API refuse tout de même explicitement.
- **La suppression demande une confirmation.** Elle est définitive.

**Hors périmètre de cette story** : la suppression d'un compte qui a servi
(jamais) ; l'anonymisation d'un compte ancien (non demandée).

---

## Scénarios

### Scenario: l'administrateur supprime un compte créé par erreur

```gherkin
Given l'élève "Léa Moreau" créé depuis "Users", qui n'a jamais servi
And un administrateur sur "Users"
When il choisit "Delete" dans le menu de la ligne de Léa Moreau
Then une modale "Delete account" affiche "Léa Moreau has never been used. The account will be removed for good."
When il clique sur "Delete"
Then Léa Moreau n'apparaît plus dans la liste, quel que soit le filtre "Status"
```

### Scenario: l'email d'un compte supprimé redevient libre

```gherkin
Given le compte "lea.moreau@example.com" supprimé
When un administrateur crée un compte d'email "lea.moreau@example.com"
Then le compte est créé
```

### Scenario: un membre du personnel jamais connecté est supprimable, avec son mot de passe

```gherkin
Given le bibliothécaire "paul.girard@example.com" créé avec un mot de passe temporaire, jamais connecté
When un administrateur supprime ce compte
Then le compte n'existe plus
And la connexion avec "paul.girard@example.com" et ce mot de passe affiche "Email or password is incorrect."
```

### Scenario: "Delete" n'est proposé que pour un compte qui n'a jamais servi

```gherkin
Given un administrateur sur "Users"
Then le menu de la ligne de Léa Moreau, jamais servie, propose "Delete"
And le menu de la ligne de <compte> ne propose pas "Delete"

Examples:
  | compte                                          |
  | Bob Johnson, qui s'est déjà connecté            |
  | Clara Dupont, qui a un emprunt rendu            |
  | Daniel Smith, qui a une réservation expirée     |
```

### Scenario: l'API refuse de supprimer un compte qui a servi

```gherkin
Given un compte qui <a servi>
When un administrateur le supprime par l'API
Then la réponse est 409 avec le message "This account has been used and cannot be deleted. Deactivate it instead."
And le compte, ses emprunts, ses réservations et ses notifications existent toujours

Examples:
  | a servi                              |
  | s'est connecté une fois              |
  | a un emprunt en cours                |
  | a un emprunt rendu                   |
  | a une réservation "pending"          |
  | a une réservation "expired"          |
  | a une notification                   |
```

### Scenario: un compte désactivé jamais servi est supprimable

```gherkin
Given le compte de Léa Moreau, jamais servi, désactivé
And un administrateur sur "Users", filtre "Status" à "Deactivated"
When il choisit "Delete" sur la ligne de Léa Moreau et confirme
Then le compte n'existe plus
```

### Scenario: abandonner la suppression

```gherkin
Given un administrateur dans "Delete account" de Léa Moreau
When il clique sur "Cancel"
Then Léa Moreau est toujours dans la liste
```

### Scenario: l'administrateur ne peut pas supprimer son propre compte

```gherkin
Given l'administrateur Alice Martin connecté
When il supprime son propre compte par l'API
Then la réponse est 403 avec le message "You cannot delete your own account."
And son compte existe toujours
```

### Scenario: un compte inconnu

```gherkin
Given un administrateur connecté
When il supprime par l'API un compte qui n'existe pas
Then la réponse est 404
```

### Scenario: seul l'administrateur supprime

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il supprime par l'API le compte de Léa Moreau
Then la réponse est 403
And le compte existe toujours

Examples:
  | rôle      |
  | LIBRARIAN |
  | USER      |
```

---

## Critères d'acceptation

- [ ] `DELETE /api/v1/users/{id}` → `204` ; `403` (`ApiError`,
      `"You cannot delete your own account."`) sur son propre compte ; `404`
      (`ApiError`) pour un compte inconnu ; `409` (`ApiError`,
      `"This account has been used and cannot be deleted. Deactivate it instead."`)
      pour un compte qui a servi ; `ADMIN` seulement.
- [ ] La lecture d'un compte (liste de US-01) indique s'il est supprimable, pour
      que le menu n'affiche « Delete » qu'à bon escient ; le serveur revérifie
      à la suppression.
- [ ] La vérification et la suppression se font dans une même transaction, et
      la suppression ne peut jamais retirer une ligne de `borrowing`.
- [ ] La règle est déclarée dans `SecurityConfig` et ajoutée à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`.
- [ ] Textes de l'interface : action « Delete », modale « Delete account » avec
      « {Name} has never been used. The account will be removed for good. »,
      boutons « Delete » et « Cancel » ; en cas d'échec « The account could not
      be deleted. » {Name} comme dans US-04.
- [ ] [Règles accès §6](../../../business-rules/REGLES-METIER-ACCES.md) et la
      ligne « Suppression d'un utilisateur » de
      [décisions §4](../../authentication-system/DECISIONS-MULTI-UTILISATEUR.md)
      mentionnent l'exception du compte qui n'a jamais servi.
- [ ] Un `.bru` pour la suppression dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-06: <titre du scénario>`
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
`booksnap_e2e`, backend et `npm run dev`. Un emprunt rendu de Clara Dupont,
fait au comptoir par Bob avant de commencer.

1. Alice, **Users** → menus de Bob Johnson et de Clara Dupont : pas de
   « Delete ».
2. « New account » : élève « Léa Moreau », `lea.moreau@example.com`, « KS-2 » →
   créée. Son menu propose « Delete ».
3. « Delete » → « Léa Moreau has never been used… » → « Cancel » → toujours là.
4. « Delete » → « Delete » → Léa disparaît, y compris avec « All statuses ».
5. « New account » avec de nouveau `lea.moreau@example.com` → créée.
6. « New account » : bibliothécaire « Paul Girard » → noter le mot de passe
   temporaire → « Delete » sur Paul → confirmé. Se déconnecter, se connecter
   avec Paul et ce mot de passe → « Email or password is incorrect. »

**Nettoyage** : rien sur `booksnap_e2e` ; sur la base de développement,
supprimer la seconde Léa par « Delete ».

---

## Points de vigilance

- **Ne jamais laisser la suppression atteindre `borrowing`** : la cascade
  effacerait l'historique en silence. Le contrôle « aucun emprunt » doit être
  fait dans la même transaction que la suppression, pas lu dans l'écran.
- **`auth_identity` ne cascade pas** : supprimer `users` avant l'identité échoue
  sur `auth_identity_user_id_fkey`. Une violation de clé étrangère qui remonte
  en `500` est le symptôme.
- **« Jamais servi » ne se lit pas sur `lifecycle_event`** : un emprunt ou une
  réservation existe dès qu'un événement existe, et le compte est donc déjà
  exclu par `borrowing` et `hold`. Interroger le journal en plus n'ajoute rien.
- **Le compte de l'amorçage s'est connecté** : il n'est jamais supprimable, et
  ce n'est pas un défaut.
