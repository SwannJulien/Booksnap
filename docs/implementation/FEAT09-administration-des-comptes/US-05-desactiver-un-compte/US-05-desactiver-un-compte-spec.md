# US-05 — Désactiver et réactiver un compte

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Administration des comptes |
| **Statut** | draft |
| **Nature** | feature |
| **Dépend de** | US-01 (vue « Users », filtre de statut) |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Oui, à la marge : `POST /borrowings` et `POST /holds` refusent désormais un compte désactivé, qu'ils acceptaient. Le comptoir ne le proposait déjà pas. |

---

## Story

**En tant qu'** administrateur
**je veux** désactiver le compte d'un élève qui part ou d'un membre du personnel
qui quitte l'école, et le réactiver s'il revient
**afin que** la personne ne puisse plus se connecter ni emprunter, et ne bloque
plus la file d'attente d'un livre, sans que son historique ni les livres qu'elle
doit encore rendre disparaissent.

---

## Contexte

### La désactivation existe en base, et à moitié dans le code

```java
// server/src/main/java/net/booksnap/domain/auth/service/UserDetailsServiceImpl.java
// is_active is nullable in the database, hence Boolean rather than boolean.
if (!Boolean.TRUE.equals(user.getIsActive())) {
    log.info("Login rejected: account {} is inactive", user.getId());
    throw new UsernameNotFoundException(REJECTION_MESSAGE);
}
```

`searchActiveUsers` (`UserRepository`) ne propose que les comptes actifs aux
modales de prêt et de réservation. En revanche `BorrowingServiceImpl.createBorrowing`
(ligne 68) et `HoldServiceImpl.createHold` (ligne 63) chargent le compte par
`userRepository.findById` sans regarder `is_active` : par l'API, un compte
désactivé peut encore emprunter et réserver. Rien ne ferme les sessions d'un
compte désactivé : `is_active` n'est lu qu'à la connexion.

### Expirer une réservation `active` existe déjà

```java
// server/src/main/java/net/booksnap/domain/hold/service/HoldServiceImpl.java:166
@Transactional
public boolean expireHold(Long holdId) {
    Hold hold = holdRepository.findById(holdId)
            .filter(h -> h.getStatus() == Status.active)
            .orElse(null);
    …
    hold.setStatus(Status.expired);
    holdRepository.saveAndFlush(hold);

    Copy copy = hold.getCopy();
    entityManager.refresh(copy);
    promoteNextPendingHold(copy);
    return true;
}
```

Il ne traite que les réservations `active` (une réservation `pending` n'a pas de
copie). `HoldExpirationScheduler` l'appelle chaque nuit pour les copies non
retirées. Ce code est **modifié et non commité** sur la branche
`book-lifecycle` au moment de l'écriture. `copy.status` suit les réservations
par des triggers (`.claude/CLAUDE.md`, « Copy status is owned by database
triggers »).

### Ce que garde un compte désactivé

Un emprunt en cours a le statut `borrowed` ou `overdue` (`borrowing.status`) ;
le retour (`POST /borrowings/{id}/return`) ne regarde pas le compte.

Règles : [règles accès §6](../../../business-rules/REGLES-METIER-ACCES.md)
(« Désactiver un compte n'annule pas ses emprunts en cours »),
[décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature),
[cycle de vie des réservations](../../../../.claude/CLAUDE.md).

---

## Décisions et non-objectifs

- **Désactiver ferme toutes les sessions du compte, immédiatement** (décision de
  la feature).
- **Désactiver expire les réservations `pending` et `active` du compte.** Une
  copie mise de côté est libérée comme à une expiration normale : elle sert la
  réservation `pending` la plus ancienne pour ce livre dans cette bibliothèque,
  ou redevient `available`. Rejetés : conserver les réservations (un élève parti
  se verrait mettre une copie de côté, au détriment du suivant pendant toute la
  fenêtre de retrait) ; refuser la désactivation tant qu'une réservation est en
  cours (aucun moyen d'annuler une réservation n'existe).
- **Désactiver n'annule pas les emprunts en cours** : les livres restent dus,
  ils se rendent au comptoir comme d'habitude, et ils restent dans la liste des
  emprunts.
- **La confirmation annonce le nombre d'emprunts en cours et de réservations qui
  vont expirer**, pour que l'administrateur sache ce qu'il déclenche.
- **Réactiver rend la connexion (s'il y a un mot de passe) et la recherche du
  comptoir, mais pas les réservations** : elles restent `expired`.
- **Un compte désactivé ne peut ni emprunter ni réserver, même par l'API.**
  Décidé avec l'utilisateur. Le comptoir ne le propose déjà pas. Sans ce
  contrôle, une réservation posée par l'API recréerait le blocage de file que
  la désactivation supprime.
- **Un administrateur ne désactive jamais son propre compte** (décision de la
  feature).
- **Désactiver un compte déjà désactivé, ou réactiver un compte actif, ne change
  rien** et répond comme un succès.

**Hors périmètre de cette story** : la suspension datée (`suspended_until`,
phase 6) ; l'annulation d'une réservation par le personnel (backlog) ; la
notification d'une réservation expirée (backlog notifications).

---

## Scénarios

### Scenario: la confirmation annonce ce que la désactivation déclenche

```gherkin
Given l'élève "Clara Dupont" avec 2 emprunts en cours, une réservation "pending" et une réservation "active"
And un administrateur sur "Users"
When il choisit "Deactivate" dans le menu de la ligne de Clara Dupont
Then une modale "Deactivate account" affiche "Clara Dupont will be signed out and will no longer be able to sign in."
And "Loans in progress: 2. The books stay due and are returned at the desk as usual."
And "Holds that will expire: 2."
```

### Scenario: l'administrateur désactive un élève

```gherkin
Given un administrateur dans "Deactivate account" de Clara Dupont
When il clique sur "Deactivate"
Then Clara Dupont disparaît de la liste filtrée sur "Active"
And elle apparaît avec "Deactivated" quand le filtre "Status" vaut "Deactivated"
```

### Scenario: un compte désactivé ne peut plus se connecter

```gherkin
Given le compte de Clara Dupont, qui a un mot de passe, désactivé
When elle se connecte avec son email et son mot de passe
Then l'écran de connexion affiche "Email or password is incorrect."
```

### Scenario: une session ouverte est fermée à la désactivation

```gherkin
Given le bibliothécaire Bob Johnson connecté dans un autre navigateur
When un administrateur désactive son compte
Then à sa prochaine action, Bob arrive sur l'écran de connexion qui affiche "Your session has expired. Sign in again to carry on where you left off."
And sa session précédente reçoit 401 sur toute requête
```

### Scenario: un compte désactivé n'est plus proposé au comptoir

```gherkin
Given le compte de Clara Dupont désactivé
When un bibliothécaire cherche "Dupont" dans la modale de prêt
Then "Clara Dupont" n'est pas proposée
And elle n'est pas proposée non plus dans la modale de réservation
```

### Scenario: l'API refuse un prêt ou une réservation pour un compte désactivé

```gherkin
Given le compte de Clara Dupont désactivé
When un bibliothécaire crée par l'API <geste> pour Clara Dupont
Then la réponse est 409 avec le message "This account is deactivated."
And rien n'est créé

Examples:
  | geste                                   |
  | un prêt d'une copie disponible          |
  | une réservation d'un livre sans copie libre |
```

### Scenario: une réservation en attente expire à la désactivation

```gherkin
Given une réservation "pending" de Clara Dupont
When un administrateur désactive son compte
Then cette réservation est "expired"
And la réservation suivante de la file pour ce livre et cette bibliothèque devient la première
```

### Scenario: une copie mise de côté passe au suivant de la file

```gherkin
Given une réservation "active" de Clara Dupont sur une copie de Preschool
And une réservation "pending" de Daniel Smith pour le même livre à Preschool
When un administrateur désactive le compte de Clara Dupont
Then la réservation de Clara Dupont est "expired"
And la réservation de Daniel Smith est "active" sur cette copie
And la copie est "on_hold"
```

### Scenario: une copie mise de côté sans suivant redevient disponible

```gherkin
Given une réservation "active" de Clara Dupont sur une copie, et personne d'autre en file pour ce livre dans cette bibliothèque
When un administrateur désactive le compte de Clara Dupont
Then la copie est "available"
```

### Scenario: les emprunts en cours restent dus et se rendent normalement

```gherkin
Given un emprunt en cours de Clara Dupont
When un administrateur désactive son compte
Then l'emprunt figure toujours dans la liste des emprunts
When un bibliothécaire enregistre le retour de la copie
Then l'emprunt est rendu et la copie est "available"
```

### Scenario: réactiver un compte

```gherkin
Given le compte de Clara Dupont désactivé, qui a un mot de passe
And un administrateur sur "Users", filtre "Status" à "Deactivated"
When il choisit "Reactivate" dans le menu de la ligne de Clara Dupont
Then une modale "Reactivate account" affiche "Clara Dupont will be able to sign in again. Expired holds are not restored."
When il clique sur "Reactivate"
Then Clara Dupont apparaît avec "Active" quand le filtre "Status" vaut "Active"
And elle se connecte avec son mot de passe
And elle est de nouveau proposée dans la modale de prêt
```

### Scenario: les réservations ne reviennent pas à la réactivation

```gherkin
Given une réservation de Clara Dupont expirée par la désactivation de son compte
When un administrateur réactive son compte
Then cette réservation est toujours "expired"
```

### Scenario: le menu propose l'action qui correspond au statut

```gherkin
Given un administrateur sur "Users", filtre "Status" à "All statuses"
Then le menu de la ligne d'un compte actif propose "Deactivate" et pas "Reactivate"
And le menu de la ligne d'un compte désactivé propose "Reactivate" et pas "Deactivate"
```

### Scenario: abandonner la désactivation

```gherkin
Given un administrateur dans "Deactivate account" de Clara Dupont
When il clique sur "Cancel"
Then Clara Dupont est toujours "Active"
And ses réservations n'ont pas changé
```

### Scenario: l'administrateur ne peut pas se désactiver lui-même

```gherkin
Given l'administrateur Alice Martin sur "Users"
Then le menu de sa propre ligne ne propose pas "Deactivate"
When il désactive son propre compte par l'API
Then la réponse est 403 avec le message "You cannot deactivate your own account."
And son compte est toujours actif
```

### Scenario: répéter le geste ne change rien

```gherkin
Given le compte de Clara Dupont déjà désactivé
When un administrateur le désactive de nouveau par l'API
Then la réponse est 200
And le compte est toujours désactivé
```

### Scenario: un compte inconnu

```gherkin
Given un administrateur connecté
When il désactive par l'API un compte qui n'existe pas
Then la réponse est 404
```

### Scenario: seul l'administrateur désactive ou réactive

```gherkin
Given un utilisateur connecté de rôle "<rôle>"
When il <geste> par l'API le compte de Clara Dupont
Then la réponse est 403
And le statut du compte est inchangé

Examples:
  | rôle      | geste      |
  | LIBRARIAN | désactive  |
  | LIBRARIAN | réactive   |
  | USER      | désactive  |
```

---

## Critères d'acceptation

- [ ] `POST /api/v1/users/{id}/deactivate` et `POST /api/v1/users/{id}/reactivate`
      → `200` avec le compte ; `403` (`ApiError`,
      `"You cannot deactivate your own account."`) pour sa propre
      désactivation ; `404` (`ApiError`) pour un compte inconnu ; `ADMIN`
      seulement.
- [ ] Une lecture renvoie, pour la confirmation, le nombre d'emprunts en cours
      (`borrowed` ou `overdue`) et de réservations `pending` ou `active` d'un
      compte ; `ADMIN` seulement.
- [ ] Le changement de statut et l'expiration des réservations sont dans une
      même transaction ; les sessions sont fermées après sa validation.
- [ ] Une réservation `active` est expirée par le même chemin que
      `HoldServiceImpl.expireHold` (promotion de la suivante comprise), pas par
      une mise à jour en masse.
- [ ] `POST /borrowings` et `POST /holds` répondent `409` (`ApiError`,
      `"This account is deactivated."`) pour un compte désactivé.
- [ ] Les règles sont déclarées dans `SecurityConfig` et ajoutées à
      `ApiAuthorizationMatrixTest` comme `ADMIN_ONLY`.
- [ ] Textes de l'interface : actions « Deactivate » et « Reactivate » ; modale
      « Deactivate account » avec « {Name} will be signed out and will no
      longer be able to sign in. », « Loans in progress: {n}. The books stay
      due and are returned at the desk as usual. », « Holds that will expire:
      {m}. », boutons « Deactivate » et « Cancel » ; modale « Reactivate
      account » avec « {Name} will be able to sign in again. Expired holds are
      not restored. », boutons « Reactivate » et « Cancel » ; en cas d'échec
      « The account could not be deactivated. » / « The account could not be
      reactivated. » {Name} comme dans US-04.
- [ ] Un `.bru` par endpoint dans `server/API/UserController/`.
- [ ] Critères permanents :
  - [ ] Chaque scénario a un test automatisé nommé `US-05: <titre du scénario>`
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
l'un, Bob (bibliothécaire) dans l'autre. Un livre A avec une seule copie à
Preschool, un livre B avec une copie disponible, et une troisième copie
disponible d'un autre livre.

1. Bob prête la copie du livre B à Clara Dupont. Bob prête la copie du livre A
   à Emma Wilson, puis réserve le livre A pour Clara, puis pour Daniel Smith.
   Bob enregistre le retour du livre A → la réservation de Clara passe
   « active » (onglet des réservations).
2. Alice, **Users** → menu de sa propre ligne : pas de « Deactivate ».
3. Alice, « Deactivate » sur Clara Dupont → « Loans in progress: 1… », « Holds
   that will expire: 1. » → « Cancel » → rien n'a changé.
4. Alice, « Deactivate » sur Clara → « Deactivate » → Clara disparaît de la
   liste ; filtre « Deactivated » → Clara « Deactivated ».
5. Bob, onglet des réservations → la réservation de Clara est expirée, celle de
   Daniel est « active » sur la copie du livre A. Bob ouvre la modale de prêt
   d'une autre copie disponible et cherche « Dupont » → Clara n'est pas
   proposée.
6. Bob, liste des emprunts → l'emprunt de Clara (livre B) y est toujours ;
   enregistrer son retour → rendu.
7. Alice désactive Bob → dans le navigateur de Bob, cliquer → « Your session
   has expired… » ; se reconnecter → « Email or password is incorrect. »
8. Alice, filtre « Deactivated » → « Reactivate » sur Bob → « Bob Johnson will
   be able to sign in again… » → « Reactivate ». Bob se reconnecte → connecté.
9. Alice réactive Clara → la réservation expirée de Clara est toujours expirée.

**Nettoyage** : rien sur `booksnap_e2e`. Sur la base de développement, les
emprunts et réservations créés restent dans `lifecycle_event`.

---

## Points de vigilance

- **Ne pas expirer les réservations par un `UPDATE hold SET status = 'expired'`** :
  la promotion de la réservation suivante est dans le service, pas dans un
  trigger (`.claude/CLAUDE.md`, « Hold lifecycle »). Une mise à jour en masse
  libère la copie sans servir la file.
- **L'ordre des flushs décide du statut de la copie** : expirer une réservation
  `active`, relire la copie (`entityManager.refresh`), puis promouvoir — comme
  `expireHold`. Plusieurs réservations du même compte dans une transaction
  multiplient ce piège.
- **`expireHold` ignore les réservations `pending`** (`filter(h -> h.getStatus() == Status.active)`) :
  l'appeler sur une réservation en attente renvoie `false` sans rien faire.
- **`expireHold` est en cours de modification** sur la branche : relire son état
  au moment du plan, et ne pas casser `HoldExpirationScheduler`, qui l'appelle
  hors transaction englobante.
- **`is_active` est nullable** : un `NULL` compte comme désactivé (US-01), comme
  dans `UserDetailsServiceImpl`. La vérification ajoutée à `createBorrowing` /
  `createHold` doit suivre la même règle.
- **`lifecycle_event` est en ajout seul** : les tests d'intégration qui créent
  prêts et réservations doivent annuler leurs écritures.
