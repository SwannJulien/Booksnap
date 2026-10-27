# Fonctionnalité — Authentification et session

[← Phase 1](../README.md) · [← Plan](../../README.md)

---

## De quoi il s'agit

Permettre à un membre du personnel de prouver son identité et de rester
authentifié le temps de sa session : connexion par email et mot de passe, cookie
de session, protection CSRF, et l'amorçage du tout premier administrateur.

## Le choix de fond

**Cookie httpOnly plutôt que JWT en `localStorage`.** Un JWT stocké dans
`localStorage` est lisible par n'importe quel script injecté ; un cookie
httpOnly ne l'est pas. En contrepartie, l'authentification par cookie réexpose
au CSRF — protection actuellement **désactivée** dans `SecurityConfig` — d'où
US-006, indissociable de US-005.

Voir [décision D8](../../../DECISIONS-MULTI-UTILISATEUR.md).

## Le problème de l'amorçage

Sans SSO (phase 7) et sans SMTP (phase 4), **rien ne permet de créer le premier
compte administrateur** par les moyens normaux. US-007 traite ce cas
spécifiquement : c'est la porte d'entrée initiale, et une porte dérobée
potentielle si elle est mal conçue.

## Périmètre

**Inclus :** endpoints de connexion / déconnexion / session courante, encodage
BCrypt, cookie de session, CSRF, CORS avec identifiants, amorçage admin,
changement de mot de passe.

**Exclu :** l'écran de connexion (US-011 à US-013), le verrouillage des
endpoints métier (US-009), la réinitialisation de mot de passe par email
(phase 4), Microsoft (phase 7).

## Ordre d'implémentation

US-005 et US-006 vont ensemble : activer l'un sans l'autre laisse une fenêtre où
l'authentification par cookie existe sans protection CSRF. US-007 suit
immédiatement, sinon personne ne peut se connecter à ce qui vient d'être
construit.

## User stories

| # | Titre |
|---|---|
| [US-005](US-005-connexion-mot-de-passe.md) | Se connecter par email et mot de passe |
| [US-006](US-006-csrf-et-cors.md) | Réactiver CSRF et régler CORS |
| [US-007](US-007-bootstrap-premier-admin.md) | Amorcer le premier compte `ADMIN` |
| [US-008](US-008-changer-mot-de-passe.md) | Changer son mot de passe |

## Pour aller plus loin

[Comprendre US-006 — CSRF et CORS, expliqués depuis zéro](US-006-comprendre-csrf-et-cors.md)
— ce que fait réellement la protection CSRF, en quoi CORS est un sujet différent,
et pourquoi la configuration Spring Security prend cette forme-là.
