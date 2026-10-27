# US-01 — Chaque bibliothèque a ses règles de prêt

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Règles de prêt par bibliothèque |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | FEAT03 (bibliothèques, section « Libraries » de Settings) |
| **Bloque** | — |
| **Portée** | db + back + front |
| **Casse l'existant ?** | Non — Preschool et Primary démarrent à 14 et 7 jours, soit les 2 et 1 semaines codées en dur aujourd'hui |

---

## Story

**En tant qu'** administrateur
**je veux** régler, pour chaque bibliothèque, la durée d'emprunt et la fenêtre
de retrait depuis Settings
**afin que** Preschool et Primary prêtent chacune selon ses besoins, au lieu des
2 et 1 semaines codées en dur pour toute l'école.

---

## Contexte

### Les deux durées sont des constantes

```java
// server/src/main/java/net/booksnap/domain/borrowing/service/BorrowingServiceImpl.java:40
private static final int BORROWING_DURATION_WEEKS = 2;
// …:83-88, createBorrowing
LocalDate startDate = LocalDate.now();
borrowing.setEndDate(startDate.plusWeeks(BORROWING_DURATION_WEEKS));
```

```java
// server/src/main/java/net/booksnap/domain/hold/service/HoldServiceImpl.java:38
private static final int HOLD_PICKUP_WINDOW_WEEKS = 1;
// …:150-156, promoteNextPendingHold — une copie rendue est mise de côté
LocalDate today = LocalDate.now();
hold.setCopy(copy);
hold.setStatus(Status.active);
hold.setStartDate(today);
hold.setEndDate(today.plusWeeks(HOLD_PICKUP_WINDOW_WEEKS));
```

La documentation se trompe sur l'emplacement de la seconde :
[règles paramètres §3.1](../../../business-rules/REGLES-METIER-PARAMETRES.md) et
le README de la phase 3 la situent dans `BorrowingServiceImpl`.

Les deux dates sont **stockées** (`borrowing.end_date date NOT NULL`,
`hold.end_date date`) : la règle du gel
([règles paramètres §4](../../../business-rules/REGLES-METIER-PARAMETRES.md))
tient pour ces deux durées sans colonne supplémentaire. `borrowing` porte
`CHECK (start_date <= end_date)` (`V1__baseline_schema.sql:391`).

### Rien ne stocke de paramètre

Aucune table de paramètres n'existe. `library` n'a que `id`, `name` et les
colonnes d'audit ; `LibraryResponse` est `(Long id, String name)`
(`domain/library/api/dto/LibraryResponse.java`). Dernière migration appliquée :
`V11__library_name_citext.sql`.

### Settings aujourd'hui

```js
// web/src/views/settings-view/settings-view.js
render() {
  return html`
    <h1>Settings</h1>
    ${isAdmin() ? html`<library-section-bks></library-section-bks>` : nothing}
  `;
}
```

La section « Libraries » (`library-section-bks`) liste les bibliothèques, une
ligne par bibliothèque avec un crayon « Rename » qui ouvre un formulaire d'une
ligne (« Save » / « Cancel », erreur sous le formulaire en `role="alert"`). Toute
section de Settings porte un sous-titre d'une ligne (FEAT07, glossaire :
_Settings section_). `GET/POST/PUT /api/v1/libraries…` sont `ADMIN` seulement
(`SecurityConfig.java:207-209`).

Règles : [règles paramètres §4 et §6](../../../business-rules/REGLES-METIER-PARAMETRES.md),
remplacées sur §1, §2 et §5 par les
[décisions de la feature](../README.md#décisions-valables-pour-toute-la-feature).

---

## Décisions et non-objectifs

- **Valeurs par bibliothèque, aucune valeur globale, `ADMIN` seulement** —
  voir la [feature](../README.md#décisions-valables-pour-toute-la-feature).
- **Valeurs de départ : 14 jours d'emprunt, 7 jours de retrait**, pour Preschool
  et Primary comme pour toute bibliothèque créée ensuite. Rien ne change pour
  personne tant que l'administrateur n'a rien modifié. Rejeté : demander les
  durées dans le formulaire de création de FEAT03 (il resterait d'une ligne).
- **La durée d'emprunt est celle de la bibliothèque de la copie empruntée**
  ([règles paramètres §2](../../../business-rules/REGLES-METIER-PARAMETRES.md)).
- **La fenêtre de retrait est celle de la bibliothèque de la copie mise de
  côté** — là où la copie attend sur le rayon. Une fois US-02 livrée, c'est aussi
  la bibliothèque de la réservation ; cette story n'en dépend pas. Remplace
  « dérivée de `hold.library_id` » de §2, valeur aujourd'hui arbitraire (voir
  US-02).
- **Entiers de 1 à 365, les deux, sans contrainte croisée.** Bornes vérifiées
  par le serveur **et** par la base.
- **Les deux valeurs s'enregistrent ensemble** : si l'une est invalide, aucune
  n'est enregistrée.
- **Une section Settings à part, « Loan rules »**, sous « Libraries ». Rejeté :
  ajouter les durées aux lignes de « Libraries » (une section, une chose).
- **Le bibliothécaire voit la section « Loan rules » en lecture seule** — sans
  crayon — pour toutes les bibliothèques, faute de `users.library_id` pour la
  restreindre à la sienne. Décidé avec l'utilisateur ; rejeté : section masquée.
  Il ne voit toujours pas la section « Libraries », et `GET /api/v1/libraries`
  reste `ADMIN` seulement (décision de FEAT03, non rouverte) : la lecture des
  règles de prêt a sa propre route. Un `USER` n'y a pas accès.
- **Les durées affichées ailleurs ne changent pas** : la date d'échéance et la
  date limite de retrait déjà montrées dans l'application sont les dates
  stockées.

**Hors périmètre de cette story** : la portée des réservations par bibliothèque
(US-02) ; l'expiration des réservations non retirées (US-03) — avant US-03, la
fenêtre de retrait ne fixe que la date limite stockée et affichée ; le nombre
maximal d'emprunts, l'assistant de premier démarrage (voir la
[feature](../README.md)).

---

## Scénarios

### Scenario: l'administrateur voit les règles de prêt de chaque bibliothèque

```gherkin
Given les bibliothèques "Preschool" et "Primary", jamais modifiées
And un administrateur sur Settings
Then une section "Loan rules" suit la section "Libraries"
And elle a pour sous-titre "How long each library lends a copy and keeps one aside for a hold."
And elle montre la ligne "Preschool" avec "Loan 14 days · Pickup 7 days"
And elle montre la ligne "Primary" avec "Loan 14 days · Pickup 7 days"
```

### Scenario: une valeur d'un jour s'écrit au singulier

```gherkin
Given la bibliothèque "Primary" réglée à 1 jour d'emprunt et 1 jour de retrait
When un administrateur ouvre Settings
Then la ligne "Primary" de "Loan rules" affiche "Loan 1 day · Pickup 1 day"
```

### Scenario: une bibliothèque créée démarre à 14 et 7 jours

```gherkin
Given un administrateur sur Settings
When il ajoute la bibliothèque "Secondary" dans la section "Libraries"
Then la section "Loan rules" montre la ligne "Secondary" avec "Loan 14 days · Pickup 7 days"
```

### Scenario: l'administrateur modifie les règles d'une bibliothèque

```gherkin
Given un administrateur sur Settings
When il clique sur "Edit loan rules" de la ligne "Primary"
And il saisit 21 dans "Loan" et 3 dans "Pickup", puis clique sur "Save"
Then la ligne "Primary" affiche "Loan 21 days · Pickup 3 days"
And la ligne "Preschool" affiche toujours "Loan 14 days · Pickup 7 days"
And après rechargement de la page, la ligne "Primary" affiche "Loan 21 days · Pickup 3 days"
```

### Scenario: le formulaire s'ouvre sur les valeurs en vigueur

```gherkin
Given la bibliothèque "Primary" réglée à 21 jours d'emprunt et 3 jours de retrait
When un administrateur clique sur "Edit loan rules" de la ligne "Primary"
Then "Loan" contient 21 et "Pickup" contient 3
```

### Scenario: la modification est abandonnée

```gherkin
Given un administrateur en train de modifier "Primary", avec 30 saisi dans "Loan"
When il clique sur "Cancel"
Then la ligne "Primary" affiche "Loan 14 days · Pickup 7 days"
And rien n'est enregistré
```

### Scenario: une valeur hors bornes est signalée dans le formulaire

```gherkin
Given un administrateur en train de modifier "Primary"
When il saisit <valeur> dans "Loan", 7 dans "Pickup", et clique sur "Save"
Then le formulaire reste ouvert et affiche "Enter a whole number of days between 1 and 365."
And la ligne "Primary" reste à "Loan 14 days · Pickup 7 days" après rechargement

Examples:
  | valeur |
  | 0      |
  | 366    |
  | -3     |
  | 2.5    |
  | (vide) |
```

### Scenario: l'API refuse une valeur hors bornes sans rien enregistrer

```gherkin
Given un administrateur connecté
When il enregistre pour "Primary" une durée d'emprunt de <emprunt> et une fenêtre de retrait de <retrait>
Then la réponse est 400
And "Primary" reste à 14 jours d'emprunt et 7 jours de retrait

Examples:
  | emprunt | retrait |
  | 0       | 7       |
  | 14      | 366     |
  | 14      | (absent)|
  | 1.5     | 7       |
```

### Scenario: les bornes sont acceptées

```gherkin
Given un administrateur connecté
When il enregistre pour "Primary" une durée d'emprunt de 365 jours et une fenêtre de retrait de 1 jour
Then la réponse est 200
And "Primary" est réglée à 365 jours d'emprunt et 1 jour de retrait
```

### Scenario: un emprunt suit la durée de la bibliothèque de la copie

```gherkin
Given "Primary" réglée à 21 jours d'emprunt et "Preschool" à 14 jours
When une copie de Primary est empruntée aujourd'hui
And une copie de Preschool est empruntée aujourd'hui
Then l'emprunt de la copie de Primary a pour échéance aujourd'hui + 21 jours
And l'emprunt de la copie de Preschool a pour échéance aujourd'hui + 14 jours
```

### Scenario: une copie mise de côté suit la fenêtre de sa bibliothèque

```gherkin
Given "Primary" réglée à 3 jours de retrait
And une copie de Primary empruntée, et une réservation "pending" en tête de file pour ce livre
When la copie est rendue aujourd'hui
Then la réservation passe "active" sur cette copie
And sa date limite de retrait est aujourd'hui + 3 jours
```

### Scenario: un emprunt en cours garde son échéance

```gherkin
Given un emprunt d'une copie de Primary, créé quand Primary était à 14 jours, échéance le J
When un administrateur règle Primary à 21 jours d'emprunt
Then l'échéance de cet emprunt est toujours le J
```

### Scenario: une copie déjà mise de côté garde sa date limite

```gherkin
Given une réservation "active" sur une copie de Primary, mise de côté quand Primary était à 7 jours, date limite le J
When un administrateur règle Primary à 3 jours de retrait
Then la date limite de retrait de cette réservation est toujours le J
```

### Scenario: une bibliothèque inconnue

```gherkin
Given un administrateur connecté
When il enregistre des règles de prêt pour une bibliothèque qui n'existe pas
Then la réponse est 404
```

### Scenario: le bibliothécaire voit les règles de prêt sans pouvoir les modifier

```gherkin
Given "Primary" réglée à 21 jours d'emprunt et 3 jours de retrait
And un bibliothécaire sur Settings
Then une section "Loan rules" est affichée, avec le même sous-titre
And elle montre la ligne "Preschool" avec "Loan 14 days · Pickup 7 days"
And elle montre la ligne "Primary" avec "Loan 21 days · Pickup 3 days"
And aucune ligne ne propose "Edit loan rules"
And aucune section "Libraries" n'est affichée
```

### Scenario: le bibliothécaire lit les règles de prêt par l'API

```gherkin
Given un bibliothécaire connecté
When il lit les règles de prêt
Then la réponse est 200 avec chaque bibliothèque, sa durée d'emprunt et sa fenêtre de retrait
```

### Scenario: seul l'administrateur enregistre

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN" ou "USER"
When il enregistre des règles de prêt pour "Primary"
Then la réponse est 403
And les règles de prêt de "Primary" ne changent pas
```

### Scenario: un usager ne lit pas les règles de prêt

```gherkin
Given un utilisateur connecté de rôle "USER"
When il lit les règles de prêt
Then la réponse est 403
```

### Scenario: la base refuse une durée hors bornes

```gherkin
When une durée d'emprunt ou une fenêtre de retrait de 0 ou de 366 est écrite directement en base pour "Primary"
Then l'écriture échoue sur une contrainte de vérification
```

---

## Critères d'acceptation

- [x] Nouvelle migration (`V12__…` ou suivante) : chaque bibliothèque porte une
      durée d'emprunt et une fenêtre de retrait en jours, non nulles, bornées
      1–365 par une contrainte `CHECK` ; Preschool et Primary reçoivent 14 et 7.
      Commentaires de la migration en anglais.
- [x] Une bibliothèque créée par `POST /api/v1/libraries` reçoit 14 et 7 sans
      que la requête change (`{ name }`).
- [x] `BORROWING_DURATION_WEEKS` et `HOLD_PICKUP_WINDOW_WEEKS` n'existent plus ;
      aucune autre durée de prêt ou de retrait n'est codée en dur.
- [x] `GET /api/v1/libraries/loan-rules` → `200` avec, pour chaque
      bibliothèque, `{ id, name, borrowingDurationDays, pickupWindowDays }` ;
      `ADMIN` et `LIBRARIAN`. `GET /api/v1/libraries` est inchangé.
- [x] `PUT /api/v1/libraries/{id}/loan-rules`
      `{ borrowingDurationDays, pickupWindowDays }` → `200` avec la bibliothèque
      et ses deux valeurs ; `400` (`ApiError`, message
      `"Borrowing duration and pickup window must be whole numbers of days between 1 and 365."`)
      si une valeur manque, n'est pas un entier ou sort de 1–365 ; `404`
      (`ApiError`) si la bibliothèque n'existe pas ; `ADMIN` seulement.
- [x] Les deux règles sont déclarées dans le groupe « Libraries » de
      `SecurityConfig` et ajoutées à `ApiAuthorizationMatrixTest` : la lecture
      pour le personnel (`ADMIN`, `LIBRARIAN`), l'enregistrement `ADMIN_ONLY`.
- [x] La section est un composant de feature dans
      `web/src/features/library/`, avec son `-styles.js`, rendu par
      `settings-view` pour l'`ADMIN` (modifiable) et le `LIBRARIAN` (lecture
      seule) ; la section « Libraries » reste `ADMIN` seulement.
- [x] Textes de l'interface : titre « Loan rules », sous-titre « How long each
      library lends a copy and keeps one aside for a hold. », bouton icône
      « Edit loan rules », champs « Loan » et « Pickup » suivis de « days »,
      boutons « Save » et « Cancel » ; si la liste ne se charge pas : « The loan
      rules could not be loaded. » ; si l'enregistrement échoue pour une autre
      raison que la validation : « The loan rules could not be saved. »
- [x] Un `.bru` pour la lecture et un pour l'enregistrement des règles de prêt
      sont dans `server/API/LibraryController/`.
- [x] [Règles paramètres](../../../business-rules/REGLES-METIER-PARAMETRES.md)
      mises à jour : §1, §2 (fenêtre de retrait), §3.1 (emplacement de la
      constante, valeurs en jours), §5 conformes aux décisions de la feature.
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-01: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le changement de schéma est une nouvelle migration ; aucune migration
        appliquée n'est modifiée
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : voir la [feature](../README.md#préparation-commune-aux-vérifications).
Base `booksnap_e2e` après un `npm run test:e2e`, ou base de développement ;
backend et `npm run dev` ; un compte admin, un compte bibliothécaire. Une copie
de Primary disponible (insertion `psql` décrite dans la feature) et une copie
de Preschool disponible d'un autre livre.

1. Démarrer le backend → Flyway applique la migration, `validate` passe.
   `psql` : `SELECT name, <durée>, <fenêtre> FROM library` → 14 et 7 partout.
2. Admin, **Settings** → « Loan rules » sous « Libraries », sous-titre attendu,
   deux lignes « Loan 14 days · Pickup 7 days ».
3. « Edit loan rules » sur Primary → champs à 14 et 7. Saisir `0` dans « Loan »,
   « Save » → « Enter a whole number of days between 1 and 365. ». « Cancel ».
4. « Edit loan rules » sur Primary, `21` et `3`, « Save » → « Loan 21 days ·
   Pickup 3 days » ; recharger → idem ; Preschool inchangée.
5. Ajouter la bibliothèque « Secondary » dans « Libraries » → « Loan rules »
   montre « Secondary » à 14 et 7.
6. Catalogue : emprunter la copie de Primary, puis la copie de Preschool, pour un
   élève → `psql` : `SELECT copy_id, start_date, end_date FROM borrowing ORDER BY id DESC LIMIT 2`
   → +21 jours pour Primary, +14 pour Preschool.
7. Réserver le livre de la copie de Primary pour un autre élève, puis rendre la
   copie de Primary → `psql` : la réservation est `active`, `end_date` =
   aujourd'hui + 3.
8. Régler Primary à `30` / `10` → l'échéance de l'étape 6 et la date limite de
   l'étape 7 n'ont pas bougé.
9. Bibliothécaire, **Settings** → « Loan rules » avec les deux lignes à jour,
   sans crayon ; pas de « Libraries ». Bruno, bibliothécaire : lecture des
   règles de prêt → `200` ; enregistrement → `403`. Bruno, admin : `365` / `1` →
   `200` ; `14` / `366` → `400` ; bibliothèque `999` → `404`.
10. `psql` : `UPDATE library SET <durée> = 0 WHERE name = 'Primary'` → refus
    sur la contrainte `CHECK`.

**Nettoyage** : remettre Primary à 14 / 7 ; supprimer « Secondary » si elle n'a
servi à rien d'autre ; les emprunts et la réservation créés restent dans
`lifecycle_event` — d'où la base `booksnap_e2e`.

---

## Points de vigilance

- **Ne pas chercher la constante de la fenêtre dans `BorrowingServiceImpl`** :
  elle est dans `HoldServiceImpl.java:38`, utilisée par `promoteNextPendingHold`
  — appelé au retour d'un emprunt, et appelé par US-03 à l'expiration.
- **Ne pas recalculer une échéance existante.** La tentation d'« appliquer » une
  nouvelle valeur aux emprunts en cours viole la règle du gel : l'élève a reçu
  sa date.
- **Ne pas lire la fenêtre de retrait sur `hold.library_id`** : avant US-02, cette
  colonne est la bibliothèque d'une copie quelconque du livre
  (`copyRepository.findAllByBookId(...).stream().findFirst()`), pas celle de la
  copie mise de côté.
- **Passer de semaines à jours** : `plusWeeks(2)` et `plusDays(14)` coïncident ;
  `plusWeeks` avec une valeur en jours, non.
- **La validation ne doit pas reposer sur le seul front** : la contrainte `CHECK`
  et le `400` existent pour l'appel Bruno ou un futur client.
- **`sharedStyles` en dernier** dans `static styles` empêche de régler la taille
  d'un `input` avec un sélecteur simple (`.claude/CLAUDE.md`) — les champs
  numériques de la ligne en seront affectés.
- **`lifecycle_event` est en ajout seul** : les tests d'intégration qui créent
  des emprunts doivent annuler leurs écritures.
