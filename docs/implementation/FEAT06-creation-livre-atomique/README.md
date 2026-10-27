# Création de livre atomique

> **Statut : clôturée le 2026-10-25.** US-01 livrée : critères d'acceptation tous
> cochés, vérification de bout en bout déroulée en entier.

Ajouter un livre au catalogue crée en une fois le livre, sa première copie, les
auteurs et genres encore inconnus, et les lignes de journal qui en découlent. Une
fois la feature livrée, cet ajout est **tout ou rien** : un échec, où qu'il
survienne, ne laisse aucune trace en base ni dans `lifecycle_event`, et le
bibliothécaire peut réessayer sans buter sur un `409` provoqué par son propre
essai raté. Les erreurs prévisibles (bibliothèque ou code Dewey inconnus) sont
refusées avant toute écriture, avec le statut que `GlobalExceptionHandler`
prévoit pour elles.

Origine : [pré-spec](../../backlog/creation-livre-atomique/pre-spec.md), relevée
pendant la vérification de US-04 du cycle de vie livre/copie.

## Pourquoi maintenant

Le journal `lifecycle_event` (V10) est en ajout seul. Un `book_created` écrit
par un ajout qui a échoué ensuite y reste pour toujours, et faussera les
agrégations analytiques qu'on prévoit de construire dessus. Plus on attend, plus
il y a de lignes fausses qu'on ne pourra pas effacer.

---

## Décisions valables pour toute la feature

- **Une seule story** : vérifier la bibliothèque en amont, seul, ferait
  disparaître le seul cas d'orphelin connu sans rien corriger — une section de
  plus de 255 caractères produit toujours un livre sans copie. Les deux ne
  forment un correctif vérifiable qu'ensemble.
- **Prévention seulement** : les livres sans copie laissés par des échecs passés
  ne sont pas nettoyés. La vérification les liste ; le nettoyage reste une
  décision manuelle.

**Hors périmètre de la feature** : l'envoi de la couverture (second appel, un
livre sans couverture est un état valide), la course entre deux créations
simultanées du même titre, `updateBook` (déjà transactionnel), le choix de la
bibliothèque dans le formulaire (le front envoie toujours `libraryId = 1`).

---

## User stories

L'ordre est l'ordre d'implémentation recommandé. Chaque story se vérifie de bout
en bout seule ; sa section **Vérification de bout en bout** décrit le parcours.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-ajout-livre-atomique/US-01-ajout-livre-atomique-spec.md) | Un ajout de livre échoué ne laisse aucune trace | feature | back | — |

---

## Socle commun de vérification

- Base avec les fixtures (`server/scripts/load-dev-fixtures.sh`) : bibliothèques
  `Preschool` (id 1) et `Primary`.
- Un compte personnel (bibliothécaire ou admin) connecté dans Bruno — voir le
  « Socle commun de vérification » de
  [cycle-de-vie-livre-copie](../cycle-de-vie-livre-copie/README.md) pour
  promouvoir un élève des fixtures, ou l'admin de bootstrap
  (`server/README.md`).
- Requête de départ : `server/API/BookController/createBook.bru`.

---

## Points de vigilance connus

- `lifecycle_event` refuse `UPDATE` et `DELETE` (`trg_lifecycle_event_immutable`) :
  les lignes créées pendant la vérification restent. Utiliser des titres
  reconnaissables (préfixe `ATOM-`) pour les retrouver.
- Copy status, journal : tout est écrit par des triggers dans la transaction de
  l'opération (`.claude/CLAUDE.md`, « Copy status is owned by database
  triggers »).
