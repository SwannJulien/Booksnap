# Fonctionnalité — Connexion côté front

[← Phase 1](../README.md) · [← Plan](../../README.md)

---

## De quoi il s'agit

Donner au front de quoi vivre dans une application authentifiée : un écran de
connexion, une garde sur les routes, et une réaction correcte au 401.

## Pourquoi les trois stories sont indissociables de US-009

US-009 ferme l'API. Sans ces trois stories, l'application est inutilisable : le
`booksnap-app` charge une vue qui appelle l'API, reçoit 401, et n'affiche rien —
sans même expliquer pourquoi.

**Ces trois stories et US-009 forment un seul déploiement.**

## L'existant

| Élément | État |
|---|---|
| Routeur | `@vaadin/router`, routes déclarées dans `booksnap-app.js:16` |
| Vues | `home`, `add`, `scan`, `catalog`, `borrowings`, `analytics`, `settings`, `account` |
| Couche API | `web/src/api/*.js`, lève une `Error`, expose `error.status` |
| Composants | Lit, un dossier par composant avec un `-styles.js` voisin |

Le routeur applique un motif répétitif de gestion de la classe `active`, déjà
signalé par un `TODO` dans le code. La garde de routes touche à cet endroit :
c'est l'occasion de le traiter, ou au minimum de ne pas l'aggraver.

## Périmètre

**Inclus :** vue de connexion, garde de routes, redirection, gestion du 401,
bouton de déconnexion, état utilisateur courant partagé.

**Exclu :** l'affichage conditionnel du menu selon le rôle (les élèves n'ont pas
encore de compte — phase 5), le « mot de passe oublié » (phase 4), le bouton
Microsoft (phase 7).

## User stories

| # | Titre |
|---|---|
| [US-011](US-011-vue-connexion.md) | Écran de connexion |
| [US-012](US-012-garde-de-routes.md) | Garde de routes et redirection |
| [US-013](US-013-gestion-401-deconnexion.md) | Gérer le 401 et se déconnecter |
