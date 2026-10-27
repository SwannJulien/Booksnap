# US-004 — Ajouter le rôle sur `users`

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Modèle d'identité |
| **Dépend de** | [US-001](../../phase-0-socle-migrations/outillage-migrations/US-001-adopter-flyway.md) |
| **Bloque** | US-007, US-009, et toute décision d'autorisation |
| **Portée** | Back + base |
| **Casse l'existant ?** | Non — colonne ajoutée avec une valeur par défaut |

---

## Récit

**En tant qu'** administrateur de Booksnap
**je veux** que chaque compte porte un rôle explicite
**afin de** pouvoir distinguer un élève, un bibliothécaire et un administrateur,
et fonder les autorisations dessus.

## Contexte

`users` porte aujourd'hui un `is_super BOOLEAN` **qui n'est lu nulle part** dans
le code — vérifié sur l'ensemble du back et du front. Il est seulement peuplé
par `seed.sql`. Un booléen ne peut de toute façon pas exprimer trois rôles.

Voir [règles accès §1](../../../REGLES-METIER-ACCES.md).

---

## Scénarios

### Scenario: tous les comptes existants deviennent des élèves

```gherkin
Given une base contenant des utilisateurs sans rôle
When la migration ajoutant le rôle est jouée
Then chaque utilisateur existant porte le rôle "user"
And aucun compte ne se retrouve avec un rôle nul
```

### Scenario: le rôle est obligatoire

```gherkin
Given la colonne de rôle en place
When on tente d'insérer un utilisateur sans rôle
Then l'insertion est refusée
```

### Scenario: seuls les trois rôles prévus sont acceptés

```gherkin
Given la colonne de rôle en place
When on tente d'affecter un rôle "SUPERVISOR"
Then l'opération est refusée par le type énuméré
```

---

## Critères d'acceptation

- [x] Énumération PostgreSQL `user_role` : `user`, `librarian`, `admin`.
- [x] Colonne `users.role` **non nulle**, valeur par défaut `user`.
- [x] Tous les comptes existants sont migrés en `user` — voir points de vigilance sur les comptes `is_super = true`.
- [x] `is_super` est supprimée de la table, de l'entité `User` et de `seed.sql`.
- [x] L'entité `User` expose `role` avec un type Java énuméré.
- [x] `UserRepository` sait filtrer par rôle (nécessaire dès US-007).
- [x] Aucun endpoint n'expose ni ne modifie le rôle à ce stade — la gestion des rôles est en phase 4.
- [x] `UserSearchResponse` **n'expose pas** le rôle : ce DTO alimente la recherche d'usager au comptoir, le rôle n'y a pas sa place.

---

## Plan d'implémentation

1. **Vérifier d'abord ce que contient `is_super` en base réelle** — il pourrait
   désigner des comptes qui devraient devenir `admin` :

   ```sql
   SELECT id, first_name, last_name, email, is_super
   FROM users WHERE is_super IS TRUE;
   ```

   Dans `seed.sql` tous les élèves sont à `false`, mais la base en service peut
   différer. **Ne pas supprimer la colonne avant d'avoir regardé.**

2. **Migration Flyway** `V<n>__user_role.sql` :

   ```sql
   CREATE TYPE user_role AS ENUM ('user', 'librarian', 'admin');

   ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';
   ```

   Si l'étape 1 a révélé des comptes à promouvoir, les passer en `admin` dans la
   **même** migration, explicitement, par email — jamais par `id`, qui n'est pas
   stable entre environnements.

3. **Retirer `is_super`** dans une migration **séparée et postérieure**, pour
   pouvoir dérouler l'étape 2 en production avant de détruire quoi que ce soit.
   Retirer aussi le champ de l'entité `User` et la colonne de `seed.sql`.

4. **Entité `User`** : ajouter `role`, mappé sur le type PostgreSQL comme
   `Copy.status` l'est déjà sur `copy_status`.

5. **Vérifier** : les comptes existants sont bien tous `user`, l'application
   démarre, `GET /users/search` est inchangé.

---

## Points de vigilance

- **`DEFAULT 'user'` est volontaire.** Un compte dont le rôle n'aurait pas été
  précisé doit atterrir sur le rôle **le moins privilégié**, jamais l'inverse.
- **Deux migrations, pas une.** Ajouter le rôle et supprimer `is_super` sont
  deux opérations de risque très différent : la seconde est destructrice et
  irréversible.
- **Le rôle seul ne suffira pas.** Un `LIBRARIAN` sera restreint à ses
  bibliothèques en phase 2. Pendant toute la phase 1, un bibliothécaire a ses
  droits sur **toutes** les bibliothèques — c'est assumé, et sans conséquence
  tant qu'une seule bibliothèque est réellement utilisée (le front code
  `libraryId: 1` en dur).
- **Attention au nom `role`** : c'est un mot réservé dans certains SGBD. Il ne
  l'est pas en PostgreSQL pour un nom de colonne, mais rester vigilant si une
  requête native le manipule sans guillemets.
