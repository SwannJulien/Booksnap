# Phase 4 — Gestion des utilisateurs

> Créer, inviter et administrer des comptes depuis l'application — au lieu du SQL
> écrit à la main.

[← Plan d'implémentation](../README.md)

> **Stories à détailler.** La première feature est spécifiée :
> [FEAT09 — Administration des comptes](../../FEAT09-administration-des-comptes/README.md).
> Les suivantes (activation par email, import iSAMS, rattachements et portée)
> sont dans le [backlog](../../../BACKLOG.md).

---

## Pourquoi cette phase est indispensable

Jusqu'ici, un compte du personnel ne peut naître que de l'amorçage (US-007) ou
d'un `INSERT` manuel. Aucune interface ne permet de créer un bibliothécaire, de
le rattacher à une bibliothèque, ni de préparer les comptes élèves de la phase 5.

C'est aussi la phase qui apporte **SMTP** — la même couche dont dépend tout le
backlog de notifications (`hold_ready`, `overdue_reminder`…). Elle est construite
une fois et sert deux fois.

---

## Ce que la phase produit

- Liste et fiche des utilisateurs, création de comptes du personnel.
- Changement de rôle, rattachement des bibliothécaires, désactivation.
- Couche d'envoi d'emails et jetons d'invitation à usage unique.
- Import en masse des élèves.

---

## Découpage en fonctionnalités

| Fonctionnalité | Contenu |
|---|---|
| **Administration des comptes** | Liste, recherche, fiche, création d'un compte du personnel, désactivation. |
| **Rôles et rattachements** | Changer un rôle (`ADMIN` seul), rattacher un bibliothécaire à ses bibliothèques, affecter un élève à sa bibliothèque. |
| **Couche email** | Configuration SMTP, gabarits, envoi, traitement des échecs. |
| **Invitations** | Table `invite_token`, génération, envoi, page d'activation, choix du mot de passe. |
| **Import en masse** | Import d'une classe, détection des doublons, compte rendu. |

---

## Les trois voies d'activation

Le personnel crée le compte ; la façon de l'activer découle du domaine de
l'adresse ([règles accès §5.3](../../REGLES-METIER-ACCES.md)) :

| Situation | Activation |
|---|---|
| Domaine de l'école | Invitation « connectez-vous avec Microsoft » (effective en phase 7) |
| Adresse personnelle | Jeton à usage unique, l'usager choisit son mot de passe |
| Aucune adresse exploitable | Mot de passe généré, affiché **une seule fois** |

La troisième voie est le **secours** en cas de panne SMTP.

---

## Points d'attention connus

- **Un utilisateur n'est jamais supprimé, seulement désactivé.** `borrowing.user_id`
  est `ON DELETE CASCADE` alors que `hold.user_id` ne l'est pas : une suppression
  détruit silencieusement l'historique d'emprunts, ou échoue, selon les données de
  la personne ([règles structurelles §3](../../REGLES-METIER-STRUCTURE.md)).
  **L'interface ne doit proposer aucune suppression.**
- **Les jetons d'invitation sont des identifiants.** À stocker hachés, à usage
  unique, avec expiration — jamais journalisés, jamais placés dans une URL
  consignée dans les logs d'accès.
- **Un bibliothécaire ne peut pas changer de rôle**, ni le sien ni celui d'un
  autre : sinon la séparation `LIBRARIAN` / `ADMIN` ne tient pas.
- **Un administrateur ne doit pas pouvoir se retirer son propre rôle** s'il est le
  dernier : cela reproduirait le problème d'amorçage de US-007, sans variable
  d'environnement pour s'en sortir.
- **L'import en masse touche de vraies personnes.** Prévoir une prévisualisation
  avant écriture, et un traitement explicite des adresses déjà connues
  (`users.email` est unique).
- **La casse des adresses** doit être réglée depuis US-002 : un import qui crée
  `Alice@…` à côté de `alice@…` produit deux comptes pour un élève.
