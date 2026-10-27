# Fonctionnalité — Outillage de migrations

[← Phase 0](../README.md) · [← Plan](../../README.md)

---

## De quoi il s'agit

Mettre en place le mécanisme qui applique une modification de schéma de façon
versionnée et reproductible, puis s'en servir immédiatement pour corriger la
dérive la plus dangereuse : `users.email` sensible à la casse.

## Pourquoi maintenant

Ces deux sujets sont indissociables de la phase 1. L'email devient
**l'identifiant de connexion** ; s'il est sensible à la casse, un usager qui
saisit une majuscule ne retrouve pas son compte. Et les tables
d'authentification doivent être créées par un mécanisme fiable, pas par un
`ALTER` tapé à la main sur une base de production.

## Périmètre

**Inclus :** dépendance et configuration Flyway, baseline sur la base en
service, première migration versionnée, correction du type de `users.email`.

**Exclu :** toute table métier de la fonctionnalité multi-utilisateur. Elles
arrivent dans leurs phases, en utilisant ce socle.

## Points de vigilance

- `ddl-auto=update` et Flyway se marchent dessus. Décider lequel fait autorité
  — voir US-001.
- La base contient des données réelles. La baseline doit être **non
  destructive**.

## User stories

| # | Titre |
|---|---|
| [US-001](US-001-adopter-flyway.md) | Adopter Flyway avec baseline sur la base existante |
| [US-002](US-002-corriger-derive-email.md) | Corriger la dérive de `users.email` |
