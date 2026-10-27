# US-003 — Créer la table `auth_identity`

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Modèle d'identité |
| **Dépend de** | [US-001](../../phase-0-socle-migrations/outillage-migrations/US-001-adopter-flyway.md), [US-002](../../phase-0-socle-migrations/outillage-migrations/US-002-corriger-derive-email.md) |
| **Bloque** | US-005, US-007, et toute la phase 7 |
| **Portée** | Back + base |
| **Casse l'existant ?** | Non — structure ajoutée, lue par personne |

---

## Récit

**En tant que** développeur de Booksnap
**je veux** que le moyen de s'authentifier soit une donnée rattachée au compte,
et non une colonne du compte
**afin qu'** un usager puisse avoir un mot de passe, un compte Microsoft, les
deux, ou aucun — sans que cela crée un second chemin de code.

## Contexte

L'école est une population mixte : la plupart des élèves et du personnel ont une
adresse gérée par Microsoft, mais certains usagers n'auront qu'une adresse
personnelle. Et les élèves de maternelle ont un compte que personne
n'utilisera avant longtemps.

Voir [règles accès §5.1](../../../business-rules/REGLES-METIER-ACCES.md) et
[décision D2](../../DECISIONS-MULTI-UTILISATEUR.md).

---

## Scénarios

### Scenario: un compte peut porter un mot de passe

```gherkin
Given un utilisateur existant
When une identité de provider "local" avec un hash de mot de passe lui est rattachée
Then l'utilisateur possède une identité "local"
And le mot de passe n'est stocké que sous forme de hash BCrypt
```

### Scenario: un compte peut cumuler deux moyens d'authentification

```gherkin
Given un utilisateur possédant une identité "local"
When une identité "microsoft" lui est rattachée
Then l'utilisateur possède deux identités
And les deux pointent vers le même compte
```

### Scenario: un compte peut n'avoir aucune identité

```gherkin
Given un élève créé par le personnel, sans aucun moyen de connexion
When son compte est consulté
Then il ne possède aucune identité
And le compte est valide et utilisable pour un emprunt au comptoir
```

### Scenario: un même sujet OIDC ne peut pas être rattaché à deux comptes

```gherkin
Given une identité "microsoft" de subject "abc-123" rattachée à Alice
When on tente de rattacher une identité "microsoft" de subject "abc-123" à Bob
Then l'opération est refusée par une contrainte d'unicité
```

### Scenario: un compte ne peut pas avoir deux identités du même provider

```gherkin
Given un utilisateur possédant une identité "local"
When on tente de lui rattacher une seconde identité "local"
Then l'opération est refusée par une contrainte d'unicité
```

---

## Critères d'acceptation

- [x] Table `auth_identity` créée par une migration Flyway versionnée.
- [x] Colonnes : `id`, `user_id`, `provider`, `subject`, `password_hash`, plus les colonnes d'audit du projet (`created_by`, `created_date`, `last_modified_by`, `last_modified_date`).
- [x] `provider` est une énumération PostgreSQL `auth_provider` : `local`, `microsoft`, `google`.
- [x] `UNIQUE (provider, subject)` — un sujet OIDC appartient à un seul compte.
- [x] `UNIQUE (user_id, provider)` — un compte a au plus une identité par fournisseur.
- [x] `user_id` référence `users(id)` **sans `ON DELETE CASCADE`** — voir points de vigilance.
- [x] `password_hash` est `NULL` pour un fournisseur OIDC ; `subject` est `NULL` pour `local`. Une contrainte `CHECK` l'impose.
- [x] Entité JPA `AuthIdentity` étendant `Auditable`, avec `AuthIdentityRepository`.
- [x] Le repository sait retrouver une identité par `(provider, subject)` et par `(user_id, provider)`.
- [x] Aucun endpoint n'expose cette table à ce stade.
- [x] Aucun mot de passe ni hash n'apparaît dans les logs ni dans un `toString()` — attention à `@Data` de Lombok, utilisé partout dans le projet.

---

## Plan d'implémentation

1. **Migration Flyway** `V<n>__auth_identity.sql` :

   ```sql
   CREATE TYPE auth_provider AS ENUM ('local', 'microsoft', 'google');

   CREATE TABLE auth_identity (
       id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES users(id),
       provider auth_provider NOT NULL,
       subject TEXT,
       password_hash TEXT,
       created_by TEXT,
       created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
       last_modified_by TEXT,
       last_modified_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

       CONSTRAINT uq_auth_identity_subject UNIQUE (provider, subject),
       CONSTRAINT uq_auth_identity_user_provider UNIQUE (user_id, provider),
       CONSTRAINT ck_auth_identity_shape CHECK (
           (provider = 'local'  AND password_hash IS NOT NULL AND subject IS NULL)
        OR (provider <> 'local' AND subject IS NOT NULL AND password_hash IS NULL)
       )
   );
   ```

2. **Entité `AuthIdentity`** dans `net.booksnap.domain.auth`, étendant
   `Auditable` comme les autres entités du projet.

   `provider` en `@Enumerated` sur un type PostgreSQL : suivre la façon dont
   `Copy.status` mappe déjà `copy_status`, pour rester cohérent.

3. **Masquer le hash.** Le projet utilise `@Data` partout, qui génère un
   `toString()` incluant tous les champs. Exclure `password_hash` :
   `@ToString.Exclude` — sinon le hash finira dans un log au premier debug.

4. **`AuthIdentityRepository`** avec `findByProviderAndSubject` et
   `findByUserIdAndProvider`.

5. **Vérifier** : les contraintes d'unicité et le `CHECK` rejettent bien les cas
   des scénarios ci-dessus (test d'intégration ou vérification `psql`).

---

## Points de vigilance

- **Pas de `ON DELETE CASCADE` sur `user_id`.** La règle du projet est qu'un
  utilisateur n'est jamais supprimé, seulement désactivé
  ([règles structurelles §3](../../../REGLES-METIER-STRUCTURE.md)). Une cascade
  ici suggérerait le contraire. Le blocage par clé étrangère est la protection
  voulue.
- **Le `CHECK` est volontairement strict.** Il empêche une ligne `local` sans
  hash, qui laisserait croire à un compte protégé alors qu'il ne l'est pas.
- **`subject` est `NULL` pour `local`**, donc `UNIQUE (provider, subject)`
  n'empêche pas plusieurs lignes `local` — les `NULL` sont distincts en
  PostgreSQL. C'est `UNIQUE (user_id, provider)` qui fait le travail dans ce cas.
  Même piège que pour `app_setting`
  ([règles paramètres §1](../../../REGLES-METIER-PARAMETRES.md)).
- **Ne pas ajouter `google` par anticipation dans le code** : la valeur existe
  dans l'énumération car ajouter une valeur d'énumération PostgreSQL plus tard
  est pénible, mais aucun code ne doit la traiter tant qu'elle n'est pas voulue.
