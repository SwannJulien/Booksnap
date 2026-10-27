# Phase 1 — Authentification du personnel

> Donner une identité aux membres du personnel, verrouiller l'API par rôle, et
> livrer l'écran de connexion. **Les élèves n'ont pas encore de compte.**

[← Plan d'implémentation](../README.md)

---

## Pourquoi cette phase, et pourquoi le personnel seulement

L'API est aujourd'hui entièrement ouverte : `SecurityConfig` se résume à
`anyRequest().permitAll()`. Tant que personne ne se connecte, aucune règle
d'accès ne peut être appliquée nulle part.

Restreindre cette phase au personnel a une conséquence précieuse : **pour les
personnes qui utilisent Booksnap aujourd'hui, rien ne change fonctionnellement**
sinon un écran de connexion en entrée. Les élèves restent ce qu'ils sont
aujourd'hui — des fiches sur lesquelles on agit — jusqu'à la phase 5.

## Ce que la phase produit

- Le modèle d'identité : `auth_identity` (compte ≠ moyen de preuve) et
  `users.role`.
- Connexion et déconnexion par mot de passe, session sur cookie httpOnly, CSRF
  réactivée.
- L'amorçage du tout premier `ADMIN`, sans lequel personne ne peut entrer.
- **Tous** les endpoints existants verrouillés **par rôle**.
- Écran de connexion, garde de routes, gestion du 401 côté front.

## Ce que la phase ne fait pas

| Repoussé à | Quoi |
|---|---|
| Phase 2 | La **portée par bibliothèque**. Ici, un `LIBRARIAN` a les droits de bibliothécaire sur *toutes* les bibliothèques. |
| Phase 4 | La gestion des utilisateurs par l'interface, les invitations, SMTP. Les comptes du personnel sont créés en base ou par l'amorçage. |
| Phase 5 | Les comptes élèves, les endpoints `/me`, l'interface élève. |
| Phase 7 | Le SSO Microsoft. |

---

## ⚠️ Bascule sans retour

Le jour où la chaîne de filtres change, **tous les appels du front renvoient 401**
tant que l'écran de connexion n'existe pas. Le back et le front de cette phase
doivent être livrés ensemble.

Conséquence sur l'ordre : les stories back (US-003 à US-010) sont implémentables
une par une sans casser l'existant **jusqu'à US-009 exclue**. C'est US-009 qui
ferme l'API, et elle ne doit être déployée qu'avec US-011 à US-013.

---

## Bénéfice acquis sans effort

`AuditorAwareImpl` lit déjà `SecurityContextHolder` avec un repli sur
`"system"`. Dès qu'une session existe, `created_by` et `last_modified_by`
enregistrent de vrais noms — **sans modifier cette classe**. US-010 le vérifie.

---

## Fonctionnalités

| Fonctionnalité | Objet |
|---|---|
| [Modèle d'identité](modele-identite/) | `auth_identity`, `users.role` |
| [Authentification et session](authentification-session/) | Connexion, cookie, CSRF, amorçage admin |
| [Verrouillage de l'API](verrouillage-api/) | Chaque endpoint restreint à son rôle |
| [Connexion côté front](login-frontend/) | Écran de connexion, garde de routes, 401 |

## User stories

| # | Titre | Fonctionnalité |
|---|---|---|
| [US-003](modele-identite/US-003-table-auth-identity.md) | Créer la table `auth_identity` | Modèle d'identité |
| [US-004](modele-identite/US-004-role-utilisateur.md) | Ajouter le rôle sur `users` | Modèle d'identité |
| [US-005](authentification-session/US-005-connexion-mot-de-passe.md) | Se connecter par email et mot de passe | Auth & session |
| [US-006](authentification-session/US-006-csrf-et-cors.md) | Réactiver CSRF et régler CORS | Auth & session |
| [US-007](authentification-session/US-007-bootstrap-premier-admin.md) | Amorcer le premier compte `ADMIN` | Auth & session |
| [US-008](authentification-session/US-008-changer-mot-de-passe.md) | Changer son mot de passe | Auth & session |
| [US-009](verrouillage-api/US-009-verrouillage-endpoints.md) | Verrouiller tous les endpoints par rôle | Verrouillage |
| [US-010](verrouillage-api/US-010-audit-utilisateur-reel.md) | Enregistrer le vrai auteur dans l'audit | Verrouillage |
| [US-011](login-frontend/US-011-vue-connexion.md) | Écran de connexion | Front |
| [US-012](login-frontend/US-012-garde-de-routes.md) | Garde de routes et redirection | Front |
| [US-013](login-frontend/US-013-gestion-401-deconnexion.md) | Gérer le 401 et se déconnecter | Front |
