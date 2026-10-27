# Phase 5 — Espace élève

> Les élèves obtiennent un compte et une interface à eux. C'est la phase qui
> transforme Booksnap en application multi-utilisateur au sens plein.

[← Plan d'implémentation](../README.md)

> **Stories à détailler.**

---

## Ce qui change de nature

Jusqu'ici, un élève est une **fiche sur laquelle on agit** au comptoir. À partir
de cette phase, c'est un **utilisateur qui agit**. Trois défauts de l'API
actuelle, sans danger tant que personne ne se connecte, deviennent alors des
failles exploitables.

| # | Défaut | Où |
|---|---|---|
| 1 | `GET /users/search` renvoie nom et email de **tous** les usagers actifs | `UserController:22` |
| 2 | `POST /holds` fait confiance au `userId` du corps de requête → réserver au nom d'autrui | `HoldController:35` |
| 3 | Aucun endpoint « les miens » : `GET /borrowings` et `GET /holds` renvoient **tout** | `BorrowingController:42`, `HoldController:42` |

Voir [règles accès §7](../../REGLES-METIER-ACCES.md).

---

## Ce que la phase produit

- Les comptes élèves activés, rattachés à leur bibliothèque.
- `GET /borrowings/me` et `GET /holds/me`.
- La correction des trois défauts ci-dessus.
- L'interface élève.

---

## Découpage en fonctionnalités

| Fonctionnalité | Contenu |
|---|---|
| **Endpoints personnels** | `/borrowings/me`, `/holds/me` : emprunts en cours, historique, position dans la file. |
| **Correction des failles** | `userId` dérivé de la session sur `POST /holds`, fermeture de `GET /users/search` au rôle `USER`. |
| **Réservation en libre-service** | Un élève pose une réservation pour lui-même, dans le respect des règles existantes. |
| **Interface élève** | Catalogue de sa bibliothèque, ses emprunts, ses réservations. Navigation distincte. |
| **Activation des comptes élèves** | Invitations en masse, rattachement à la bibliothèque, mise en service progressive. |

---

## L'interface élève n'est pas l'application du personnel filtrée

Un élève et un bibliothécaire ne cherchent pas la même chose. Le second gère un
fonds ; le premier veut savoir ce qu'il a emprunté, quand le rendre, et où il en
est dans la file d'attente. Masquer des boutons dans l'interface actuelle
donnerait une application mutilée plutôt qu'une application adaptée.

Le `<nav>` de `booksnap-app.js` liste huit entrées dont la plupart n'ont aucun
sens pour un élève.

---

## Points d'attention connus

- **Les règles de réservation existantes s'appliquent telles quelles.** On ne
  peut réserver un livre que si **aucune** copie n'est `available` — sinon 409
  `BookHasAvailableCopyException`. L'interface élève doit l'expliquer, pas
  seulement masquer le bouton
  ([règles emprunts §4](../../REGLES-METIER-EMPRUNTS-RESERVATIONS.md)).
- **Un élève ne voit que sa bibliothèque** ([décision D5](../../DECISIONS-MULTI-UTILISATEUR.md)) :
  la portée de la phase 2 devient visible ici.
- **L'emprunt reste une opération de comptoir.** Un élève ne crée pas
  d'emprunt : il y a remise physique d'un livre. Seule la réservation est en
  libre-service.
- **Les élèves de maternelle** ont un compte administré en pratique par leurs
  parents ([décision D7](../../DECISIONS-MULTI-UTILISATEUR.md)). Aucun rôle
  parent, aucune délégation : l'interface doit rester compréhensible pour un
  adulte agissant au nom d'un enfant.
- **Mise en service progressive.** Activer plusieurs centaines de comptes d'un
  coup expose l'application à une charge et à un flux de questions inédits.
  Envisager une bibliothèque, ou un niveau, d'abord.
