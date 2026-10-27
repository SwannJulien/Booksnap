# Phase 6 — Limites, renouvellements, pénalités

> De nouvelles règles de prêt, et les paramètres qui les pilotent.

[← Plan d'implémentation](../README.md)

> **Stories à détailler.**

---

## La phase la plus lourde, et la seule qui puisse glisser

Les cinq phases précédentes **sécurisent et structurent l'existant**. Celle-ci
crée des fonctionnalités qui n'existent pas du tout : aucun endpoint de
prolongation, aucune notion de suspension, aucun décompte des emprunts par
usager.

Rendre ces règles configurables suppose donc **de les implémenter d'abord**. Elle
est aussi la seule phase qui peut être décalée sans bloquer les autres.

---

## Ce que la phase produit

| Règle | Support |
|---|---|
| Nombre maximal d'emprunts simultanés | Décompte à `POST /borrowings` |
| Nombre maximal de réservations simultanées | Décompte à `POST /holds` |
| Prolongation d'un emprunt | Nouvel endpoint, colonne `borrowing.renewal_count` |
| Suspension après retard | Colonne `users.suspended_until` |

---

## Découpage en fonctionnalités

| Fonctionnalité | Contenu |
|---|---|
| **Limites d'emprunt et de réservation** | Décomptes, messages d'erreur explicites, paramètres associés. |
| **Prolongation** | `POST /borrowings/{id}/renew`, `renewal_count`, règle anti-famine de la file d'attente. |
| **Suspension** | `users.suspended_until`, application au retour d'un document en retard, blocage de l'emprunt et de la réservation. |
| **Paramétrage** | Branchement des sept valeurs sur la page de paramètres de la phase 3. |

---

## Les règles à ne pas manquer

### La prolongation ne doit pas affamer la file d'attente

Une prolongation est **refusée** si :

- le quota de prolongations est atteint (`renewal_count`), **ou**
- l'emprunt est déjà `overdue`, **ou**
- **un autre usager a une réservation `pending` ou `active` sur ce livre.**

Sans la troisième condition, un emprunteur peut prolonger indéfiniment un
ouvrage que d'autres attendent.

### La pénalité s'applique au retour

Et non pendant le retard, par le scheduler. La sanction est ainsi déterministe
et annoncée à l'usager **au comptoir**, au moment où il rend le livre — plutôt
que découverte plus tard sans explication.

### Un usager suspendu peut se connecter

Il consulte, mais n'emprunte ni ne réserve. La suspension n'est pas une
désactivation de compte.

Voir [règles paramètres §3.2](../../REGLES-METIER-PARAMETRES.md).

---

## Points d'attention connus

- **Le personnel est aussi un usager.** Les limites et pénalités s'appliquent à
  un bibliothécaire qui emprunte ([règles accès §1](../../REGLES-METIER-ACCES.md)).
  Décider explicitement si l'on veut une exception — et l'assumer.
- **La prolongation modifie `end_date` après coup.** C'est la seule exception
  volontaire à la règle du gel, et elle est à l'initiative de l'usager, pas d'un
  changement de paramètre.
- **Attention aux triggers.** La prolongation ne change pas `copy.status`, mais
  toute écriture sur `borrowing` en déclenche : vérifier l'ordre des flushs
  ([règles structurelles §5](../../REGLES-METIER-STRUCTURE.md)).
- **Un emprunt `overdue` qui redevient `borrowed`** après prolongation
  poserait un problème de cohérence avec `OverdueBorrowingScheduler`. La règle
  « pas de prolongation si `overdue` » l'évite — ne pas l'assouplir sans y
  repenser.
- **Qui peut prolonger ?** L'usager lui-même, un bibliothécaire, ou les deux ?
  À trancher lors de la rédaction des stories.
