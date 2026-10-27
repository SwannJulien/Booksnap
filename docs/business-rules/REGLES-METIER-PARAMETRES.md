# Règles métier — Paramètres configurables

> Les valeurs qui pilotent les règles de prêt, où elles sont stockées, comment
> elles sont résolues, et **quand un changement prend effet**.

Documents liés :
[règles emprunts/réservations](REGLES-METIER-EMPRUNTS-RESERVATIONS.md) ·
[règles accès](REGLES-METIER-ACCES.md) ·
[règles structurelles](REGLES-METIER-STRUCTURE.md)

---

## Table des matières

- [1. Principe : des règles propres à chaque bibliothèque](#1-principe--des-règles-propres-à-chaque-bibliothèque)
- [2. Résolution : d'où vient la bibliothèque](#2-résolution--doù-vient-la-bibliothèque)
- [3. Liste des paramètres](#3-liste-des-paramètres)
- [4. Règle du gel : un changement ne réécrit jamais l'existant](#4-règle-du-gel--un-changement-ne-réécrit-jamais-lexistant)
- [5. Qui peut modifier quoi](#5-qui-peut-modifier-quoi)
- [6. Validation](#6-validation)

---

## 1. Principe : des règles propres à chaque bibliothèque

Chaque bibliothèque a **ses propres valeurs** pour chaque paramètre. Il n'existe
aucune valeur globale, aucune surcharge, aucune résolution à deux niveaux : la
valeur d'une bibliothèque est celle qui est enregistrée pour elle, et rien
d'autre.

Motivation : Preschool et Primary n'ont pas les mêmes besoins — une durée de
prêt d'une semaine pour un enfant de quatre ans, deux semaines pour un
collégien.

### Stockage

Colonnes de la table `library`, en jours, non nulles, bornées par une contrainte
`CHECK` (1 à 365) :

| Colonne | Paramètre | Valeur de départ |
|---|---|---|
| `library.borrowing_duration_days` | Durée d'un emprunt | 14 |
| `library.pickup_window_days` | Fenêtre de retrait d'une réservation `active` | 7 |

Les valeurs de départ sont le `DEFAULT` de la migration `V12` : une bibliothèque
créée par son seul nom les reçoit, et le code Java n'en porte aucune copie.

---

## 2. Résolution : d'où vient la bibliothèque

La bibliothèque servant à résoudre un paramètre est **toujours dérivée côté
serveur**, jamais transmise par le client.

| Paramètre | Bibliothèque dérivée de |
|---|---|
| Durée d'un emprunt | `copy.library_id` de la copie empruntée |
| Fenêtre de retrait d'une réservation | `copy.library_id` de la copie mise de côté (là où elle attend sur le rayon), pas `hold.library_id` |
| Durée de vie d'une réservation `pending` | `hold.library_id` |
| Nombre max d'emprunts simultanés | `users.library_id` de l'emprunteur |
| Nombre max de réservations simultanées | `users.library_id` de l'emprunteur |
| Renouvellement (durée, nombre) | `copy.library_id` de la copie empruntée |
| Pénalité (seuil, durée) | `users.library_id` de l'usager |

Deux ancrages différents cohabitent volontairement : ce qui concerne **un
document** suit la bibliothèque du document ; ce qui concerne **une personne**
suit la bibliothèque de la personne.

---

## 3. Liste des paramètres

### 3.1 Durées

| Paramètre | Valeur de départ | Où c'est stocké / lu |
|---|---|---|
| Durée d'un emprunt | 14 jours | `library.borrowing_duration_days`, lue dans `BorrowingServiceImpl.createBorrowing` |
| Fenêtre de retrait d'une réservation `active` | 7 jours | `library.pickup_window_days`, lue dans `HoldServiceImpl.promoteNextPendingHold` |
| Durée de vie max d'une réservation `pending` | 5 semaines | **nulle part** — documentée, jamais implémentée |

Les anciennes constantes `BORROWING_DURATION_WEEKS` (2 semaines) et
`HOLD_PICKUP_WINDOW_WEEKS` (1 semaine) n'existent plus. La seconde se trouvait
dans `HoldServiceImpl`, et non dans `BorrowingServiceImpl` comme cette page le
disait.

> La troisième valeur n'a **aucun effet** aujourd'hui : aucun scheduler ne fait
> expirer les réservations. La rendre configurable sans la rendre effective
> serait pire que de la laisser en dur — l'implémentation du scheduler fait
> partie du même lot. Voir
> [règles emprunts §8](REGLES-METIER-EMPRUNTS-RESERVATIONS.md).

### 3.2 Limites, renouvellement, pénalités

**Aucune de ces fonctionnalités n'existe dans le code aujourd'hui.** Les rendre
configurables suppose de les implémenter d'abord.

| Paramètre | Rôle |
|---|---|
| Nombre max d'emprunts simultanés | Vérifié à `POST /borrowings`, compte les emprunts `borrowed` + `overdue` |
| Nombre max de réservations simultanées | Vérifié à `POST /holds`, compte les réservations `pending` + `active` |
| Renouvellement autorisé (oui/non) | Active l'endpoint de prolongation |
| Durée d'un renouvellement | +1 semaine par défaut |
| Nombre de renouvellements autorisés | 1 par défaut (`borrowing.renewal_count`) |
| Seuil de pénalité | Retard au-delà duquel une suspension s'applique (1 semaine par défaut) |
| Durée de la suspension | 1 semaine par défaut (`users.suspended_until`) |

#### Règles associées

- **Renouvellement refusé** si : le quota de renouvellements est atteint, **ou**
  l'emprunt est déjà `overdue`, **ou** un *autre* usager a une réservation
  `pending` ou `active` sur ce livre. Cette dernière condition est essentielle :
  sans elle, les renouvellements affament la file d'attente.
- **Pénalité appliquée au retour** d'un document en retard, et non par le
  scheduler pendant le retard. Ainsi la sanction est déterministe et annoncée à
  l'usager au comptoir, au moment où il rend le livre.
- Un usager suspendu **peut se connecter** et consulter ; il ne peut ni
  emprunter ni réserver.

### 3.3 Candidats identifiés, non retenus pour l'instant

| Paramètre | Pourquoi il reviendra |
|---|---|
| Domaines email de l'école | Détermine si une invitation propose Microsoft ou un mot de passe ([règles accès §5.3](REGLES-METIER-ACCES.md)) |
| Création de compte à la volée (JIT) sur SSO | Désactivée par défaut pour raison de sécurité ; à rendre explicite si un jour souhaitée |
| Destinataire des notifications | `email`, `parent_email`, ou les deux selon le `key_stage` — à trancher au moment des notifications |

---

## 4. Règle du gel : un changement ne réécrit jamais l'existant

**Modifier un paramètre n'a d'effet que sur les opérations futures.**

Un emprunt calcule sa `end_date` **une fois**, à sa création, à partir de la
valeur en vigueur à cet instant. Elle est ensuite figée. Un élève à qui on a
annoncé « à rendre le 15 mars » ne doit pas se retrouver avec une autre date
parce qu'un administrateur a modifié un nombre entre-temps.

La même règle s'applique à la fenêtre de retrait d'une réservation `active` :
`start_date` et `end_date` sont fixées à la promotion.

### L'asymétrie à corriger

La durée de vie d'une réservation `pending` n'a, elle, **aucune date stockée** :
l'expiration serait évaluée par un scheduler à partir de `created_date`. Passer
le paramètre de 5 à 3 semaines ferait donc expirer **rétroactivement** des
réservations déjà plus anciennes que 3 semaines — en contradiction avec la règle
du gel.

**Décision : ajouter `hold.expires_at`, calculée à la création**, comme les
autres dates. Le scheduler compare alors à une date figée, et le gel vaut pour
les trois durées.

---

## 5. Qui peut modifier quoi

| Action | `USER` | `LIBRARIAN` | `ADMIN` |
|---|:--:|:--:|:--:|
| Lire les règles de prêt de toutes les bibliothèques | ❌ | ✅ | ✅ |
| Modifier les règles de prêt d'une bibliothèque | ❌ | ❌ | ✅ |

Un bibliothécaire voit les règles de **toutes** les bibliothèques en lecture
seule, faute de `users.library_id` pour le restreindre à la sienne. Seul
l'administrateur les modifie.

---

## 6. Validation

Toute valeur est bornée côté serveur — un paramètre absurde casse le service
pour tout le monde.

| Contrainte | Raison |
|---|---|
| Toutes les durées : entiers **strictement positifs** | Une durée nulle ou négative produirait une `end_date` antérieure à `start_date`, violant la contrainte `CHECK (start_date <= end_date)` de `borrowing` |
| Bornes hautes raisonnables (ex. 365 jours) | Évite la faute de frappe qui prête un livre pour 20 ans |
| Limites (emprunts, réservations) : entiers positifs | `0` signifierait « interdit d'emprunter » — à refuser explicitement si ce n'est pas voulu |
| Durée de vie `pending` ≥ fenêtre de retrait | Sinon une réservation peut expirer avant même d'avoir pu être retirée |

Les durées sont stockées **en jours**, pas en semaines : les constantes actuelles
sont exprimées en semaines, ce qui interdit une durée de 10 jours sans raison.
