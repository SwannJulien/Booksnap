# Fonctionnalité — Verrouillage de l'API

[← Phase 1](../README.md) · [← Plan](../../README.md)

---

## De quoi il s'agit

Fermer l'API. Chaque endpoint existant passe de « ouvert à tous » à « réservé à
un rôle », conformément à la matrice des
[règles accès §3](../../../REGLES-METIER-ACCES.md).

## ⚠️ C'est la bascule

Toutes les stories précédentes de la phase 1 sont déployables une par une sans
rien casser : elles **ajoutent** des capacités que personne n'utilise encore.

**US-009 est différente.** Le jour où elle est déployée, tout appel non
authentifié échoue en 401 — donc **l'intégralité du front actuel**, qui n'a pas
encore d'écran de connexion. US-009 ne doit être mise en service qu'avec US-011
à US-013.

## Portée : rôle seulement

Un `LIBRARIAN` obtient ici ses droits sur **toutes** les bibliothèques. La
restriction par bibliothèque arrive en phase 2. C'est assumé et sans conséquence
pratique tant que le front code `libraryId: 1` en dur.

## Périmètre

**Inclus :** règles d'autorisation sur tous les endpoints existants, gestion
cohérente des 401 et 403, vérification de la piste d'audit.

**Exclu :** les endpoints `/me` (phase 5), la portée par bibliothèque (phase 2),
les nouveaux endpoints de paramètres et de bibliothèques (phases 2 et 3).

## User stories

| # | Titre |
|---|---|
| [US-009](US-009-verrouillage-endpoints.md) | Verrouiller tous les endpoints par rôle |
| [US-010](US-010-audit-utilisateur-reel.md) | Enregistrer le vrai auteur dans l'audit |
