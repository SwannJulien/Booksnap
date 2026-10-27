# Phase 0 — Socle de migrations

> Décider et mettre en place la façon dont une modification de schéma est
> appliquée, **avant** d'en produire une vingtaine.

[← Plan d'implémentation](../README.md)

---

## Pourquoi cette phase existe

La fonctionnalité multi-utilisateur ajoute environ **six tables et huit
colonnes**. Or aujourd'hui :

- `server/sql/schema.sql` n'est joué qu'à la **première création** du volume
  `booksnap-db-data`. Le modifier ne change rien à une base existante.
- `spring.jpa.hibernate.ddl-auto=update` couvre une partie du travail
  silencieusement — tables et colonnes des entités JPA — mais **jamais** les
  valeurs d'énumération, index partiels, triggers, domaines, ni les colonnes
  absentes de l'entité. Et il ne modifie **jamais** le type d'une colonne
  existante.
- **La base réelle a déjà dérivé** de `schema.sql` : `users.email` y est un
  `character varying(255)` là où `schema.sql` déclare un domaine `citext`.

Se tromper sur une table de catalogue abîme une notice. Se tromper sur une table
d'authentification **empêche les gens de se connecter**.

---

## Ce que la phase produit

Un mécanisme unique et reproductible pour appliquer une modification de schéma,
et une base de départ propre pour toutes les phases suivantes.

## Ce que la phase ne fait pas

Aucune fonctionnalité visible. Aucune table métier n'est ajoutée ici : les
tables `auth_identity`, `librarian_library`, `app_setting` arrivent dans leurs
phases respectives, **en utilisant** le mécanisme mis en place ici.

---

## L'arbitrage à rendre

| Option | Avantage | Coût |
|---|---|---|
| **Flyway** (recommandé) | Chaque changement est versionné et appliqué à l'identique partout ; `baselineOnMigrate` s'accommode d'une base existante | Une dépendance, une convention à apprendre |
| **Scripts numérotés à la main** | Aucune dépendance nouvelle | Reste un problème de discipline, pas un problème résolu |

Recommandation : **Flyway**. La dérive mord déjà, et elle est sur le point de
s'aggraver nettement.

---

## Fonctionnalités

| Fonctionnalité | Objet |
|---|---|
| [Outillage de migrations](outillage-migrations/) | Adopter Flyway, aligner la base réelle sur `schema.sql` |

## User stories

| # | Titre | Fonctionnalité |
|---|---|---|
| [US-001](outillage-migrations/US-001-adopter-flyway.md) | Adopter Flyway avec baseline sur la base existante | Outillage |
| [US-002](outillage-migrations/US-002-corriger-derive-email.md) | Corriger la dérive de `users.email` (sensibilité à la casse) | Outillage |
