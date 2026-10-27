# Règles métier — Accès et rôles

> Qui a le droit de faire quoi. Document de référence pour toute décision
> d'autorisation dans Booksnap.
>
> Les valeurs techniques (`USER`, `LIBRARIAN`, `ADMIN`, noms d'endpoints) sont
> laissées en anglais, comme dans le reste du code et de la base.

Documents liés :
[règles emprunts/réservations](REGLES-METIER-EMPRUNTS-RESERVATIONS.md) ·
[règles paramètres](REGLES-METIER-PARAMETRES.md) ·
[règles structurelles](REGLES-METIER-STRUCTURE.md)

---

## Table des matières

- [1. Les trois rôles](#1-les-trois-rôles)
- [2. Portée : le rattachement aux bibliothèques](#2-portée--le-rattachement-aux-bibliothèques)
- [3. Matrice des permissions](#3-matrice-des-permissions)
- [4. Règles d'autorisation non évidentes](#4-règles-dautorisation-non-évidentes)
- [5. Identité et authentification](#5-identité-et-authentification)
- [6. Cycle de vie d'un compte](#6-cycle-de-vie-dun-compte)
- [7. Dette de sécurité de l'API actuelle](#7-dette-de-sécurité-de-lapi-actuelle)

---

## 1. Les trois rôles

Un utilisateur porte **un seul rôle global**, stocké dans `users.role`
(énumération `user_role`).

| Rôle | Qui | Rôle dans l'application |
|---|---|---|
| `USER` | Élève | Emprunteur. Consulte le catalogue de **sa** bibliothèque, voit ses propres emprunts et réservations, pose une réservation pour lui-même. |
| `LIBRARIAN` | Personnel de la bibliothèque | Gère le fonds et les prêts des bibliothèques **auxquelles il est rattaché**. Crée et invite des élèves. |
| `ADMIN` | Responsable de l'application | Portée **globale**. Gère les bibliothèques, les rôles, les paramètres globaux. |

**Les rôles ne sont pas hiérarchiques en portée.** Un `LIBRARIAN` a plus de
capacités qu'un `USER`, mais il est **restreint** à ses bibliothèques ; un
`ADMIN` est le seul rôle sans restriction de portée.

**Le personnel est aussi un usager.** Un `LIBRARIAN` ou un `ADMIN` peut
emprunter des livres comme n'importe quel élève : les règles d'emprunt
(limites, retards, pénalités) s'appliquent à lui de la même manière. Le rôle
gouverne ce qu'on peut administrer, pas le droit d'emprunter.

---

## 2. Portée : le rattachement aux bibliothèques

| Rôle | Rattachement | Table |
|---|---|---|
| `USER` | **Une seule** bibliothèque, obligatoire | `users.library_id` |
| `LIBRARIAN` | **Une ou plusieurs** bibliothèques | `librarian_library (user_id, library_id)` |
| `ADMIN` | Aucun — portée globale par définition | — |

### Ce que la portée contraint

- Un élève ne voit que le catalogue de **sa** bibliothèque, n'emprunte et ne
  réserve que dans celle-ci, et se voit appliquer **ses** paramètres.
- Un bibliothécaire n'agit que sur les `copy`, `borrowing` et `hold` rattachés à
  ses bibliothèques. Une tentative hors portée renvoie **403**.
- La bibliothèque n'est **jamais** transmise par le client pour un contrôle
  d'accès : elle est toujours dérivée côté serveur (voir
  [§4](#4-règles-dautorisation-non-évidentes)).

### Ce que la portée ne contraint pas

Le **livre** (`book`) est une notice bibliographique **partagée entre toutes les
bibliothèques**. Il n'a pas de `library_id`. Seules ses copies sont rattachées à
une bibliothèque. Conséquence importante en [§4](#4-règles-dautorisation-non-évidentes).

---

## 3. Matrice des permissions

« scopé » = limité aux bibliothèques de rattachement du bibliothécaire.

| Action | Endpoint | `USER` | `LIBRARIAN` | `ADMIN` |
|---|---|:--:|:--:|:--:|
| Rechercher / consulter des livres | `GET /books`, `/books/search`, `/books/{id}` | ✅ sa bibliothèque | ✅ scopé | ✅ |
| Voir les copies d'un livre | `GET /books/{id}/copies` | ✅ sa bibliothèque | ✅ scopé | ✅ |
| Créer un livre | `POST /books` | ❌ | ✅ | ✅ |
| Modifier une notice | `PUT /books/{id}` | ❌ | ✅ | ✅ |
| **Supprimer un livre** | `DELETE /books/{id}` | ❌ | ❌ | ✅ |
| Créer / modifier une copie | `POST`,`PUT /copies/*` | ❌ | ✅ scopé | ✅ |
| **Supprimer une copie** | `DELETE /copies/{id}` | ❌ | ❌ | ✅ |
| Consulter l'historique d'un livre ou d'une copie | `GET /books/{id}/history`, `/copies/{id}/history` | ❌ | ✅ | ✅ |
| Consulter l'archive des livres et des copies supprimés | `GET /archive/books`, `/archive/copies` | ❌ | ✅ | ✅ |
| Générer le QR code d'une copie | `GET /copies/{id}/qrcode` | ❌ | ✅ scopé | ✅ |
| Créer un emprunt | `POST /borrowings` | ❌ | ✅ scopé | ✅ |
| Enregistrer un retour | `POST /borrowings/{id}/return` | ❌ | ✅ scopé | ✅ |
| Lister tous les emprunts | `GET /borrowings` | ❌ | ✅ scopé | ✅ |
| Voir **ses** emprunts | `GET /borrowings/me` | ✅ | ✅ | ✅ |
| Poser une réservation | `POST /holds` | ✅ **pour lui-même** | ✅ scopé, pour autrui | ✅ |
| Lister toutes les réservations | `GET /holds` | ❌ | ✅ scopé | ✅ |
| Voir **ses** réservations | `GET /holds/me` | ✅ | ✅ | ✅ |
| Rechercher un utilisateur | `GET /users/search` | ❌ | ✅ scopé | ✅ |
| Référentiels (dewey, genres, key-stages) | `GET` | ✅ | ✅ | ✅ |
| Consulter une couverture | `GET /covers/{isbn}` | ✅ | ✅ | ✅ |
| Envoyer / supprimer une couverture | `POST`,`DELETE /covers` | ❌ | ✅ | ✅ |
| Paramètres — valeurs **globales** | — | ❌ | ❌ | ✅ |
| Paramètres — surcharges **par bibliothèque** | — | ❌ | ✅ ses bibliothèques | ✅ |
| Créer / renommer / archiver / supprimer une bibliothèque | — | ❌ | ❌ | ✅ |
| Changer le rôle d'un utilisateur | — | ❌ | ❌ | ✅ |
| Rattacher un bibliothécaire à une bibliothèque | — | ❌ | ❌ | ✅ |
| Créer / inviter un élève | — | ❌ | ✅ ses bibliothèques | ✅ |
| Désactiver un compte | — | ❌ | ✅ élèves de ses bibliothèques | ✅ |

---

## 4. Règles d'autorisation non évidentes

### 4.1 Supprimer un livre ou une copie est réservé à l'`ADMIN`

Pour le **livre**, la portée suffit à l'expliquer : supprimer une notice retire
**toutes** ses copies, dans **toutes** les bibliothèques. Un bibliothécaire du
Primary retirerait ainsi le rayon du Preschool. Un livre étant partagé (voir
[§2](#2-portée--le-rattachement-aux-bibliothèques)), aucune portée par
bibliothèque ne peut rendre cette action sûre pour un bibliothécaire : elle est
globale, donc `ADMIN`.

Pour la **copie**, la raison est venue avec US-01. La suppression y est désormais
logique (`deleted_at`, [règles structurelles §2](REGLES-METIER-STRUCTURE.md)) : elle
ne rencontre plus de mur de clé étrangère, donc plus rien ne protège **par
accident** un emprunt vieux de trois ans. Retirer une copie du fonds devient une
décision sur l'archive, et non un geste de comptoir.

Le bibliothécaire garde le geste de comptoir qui lui revient : faire passer une
copie `available`/`damaged` à `lost`, ce qui la sort des rayons sans rien effacer,
et la repasser à `available` quand elle est retrouvée. Il peut aussi signaler une
copie `available` comme `damaged` (qui reste empruntable) et la remettre en état.
Un journal des suppressions aurait expliqué après coup ; il n'aurait rien empêché.

### 4.2 Déplacer une copie exige les droits sur les deux bibliothèques

`PUT /copies/{id}` accepte un `libraryId` et **déplace** la copie
(`CopyServiceImpl:125`). Un bibliothécaire doit être rattaché **à la fois** à la
bibliothèque d'origine **et** à celle de destination. Sans cette règle, il
suffirait de déplacer une copie vers sa propre bibliothèque pour en prendre le
contrôle : c'est une évasion de portée.

### 4.3 Un élève ne réserve que pour lui-même

`POST /holds` reçoit `{ bookId, userId }` dans le corps de la requête. Le
`userId` **ne doit jamais être lu depuis le corps pour un appelant `USER`** : il
est dérivé de la session. Le champ n'est accepté que pour un appelant
`LIBRARIAN` ou `ADMIN`, qui pose une réservation au comptoir pour un élève.

### 4.4 Le répertoire des utilisateurs est réservé au personnel

`GET /users/search` renvoie nom, prénom et email de tous les utilisateurs
actifs. Cet endpoint doit être **inaccessible au rôle `USER`**, et le parcours
élève ne doit jamais l'appeler.

### 4.5 La bibliothèque n'est jamais fournie par le client

Pour toute décision d'autorisation ou de résolution de paramètre, la
bibliothèque est dérivée côté serveur :

| Contexte | Source |
|---|---|
| Emprunt | `copy.library_id` de la copie empruntée |
| Réservation | `hold.library_id` |
| Limites par usager | `users.library_id` de l'emprunteur |

---

## 5. Identité et authentification

### 5.1 Le compte et le moyen de preuve sont séparés

La ligne `users` **est** l'identité. Les moyens de s'authentifier y sont
rattachés par la table `auth_identity` :

| Colonne | Rôle |
|---|---|
| `user_id` | Le compte concerné |
| `provider` | `local`, `microsoft`, `google` |
| `subject` | Le claim `sub` OIDC — `NULL` pour `local` |
| `password_hash` | BCrypt — `NULL` pour un fournisseur OIDC |

Un utilisateur peut cumuler plusieurs moyens (un mot de passe **et** Microsoft).
Un utilisateur peut aussi n'en avoir **aucun** : le compte existe, il est
géré au comptoir, personne ne s'y connecte. Tout ce qui est en aval — rôle,
portée, emprunts, audit — est identique quel que soit le moyen utilisé.

### 5.2 Règles de rattachement d'une identité OIDC

Ces trois règles sont des conditions de sécurité, pas des préférences :

1. **Ne rattacher une identité OIDC à un compte que si le fournisseur déclare
   l'email vérifié** (`email_verified`). Sans cette vérification, il suffit de
   faire enregistrer une adresse ressemblant à celle d'un membre du personnel
   pour prendre son compte.
2. **Restreindre la connexion Microsoft au tenant de l'école** (validation du
   claim `tid`). Sans cela, n'importe quel compte Microsoft au monde constitue
   un identifiant valide, à condition que l'email corresponde.
3. **Pas de création de compte à la volée (JIT).** Une connexion OIDC valide
   sans ligne `users` correspondante doit **échouer** (« aucun compte Booksnap,
   contactez la bibliothèque »), et non créer un compte silencieusement. Sinon
   toute personne du tenant devient utilisateur au premier clic. Le JIT peut
   devenir un paramètre `ADMIN` explicite plus tard.

### 5.3 Les trois façons d'obtenir des identifiants

Le personnel crée le compte ; la façon de l'activer découle du domaine email,
les domaines de l'école étant configurables.

| Situation | Activation |
|---|---|
| Email du domaine de l'école | Invitation « connectez-vous avec Microsoft ». Aucun mot de passe. |
| Email personnel | Invitation avec jeton signé à usage unique : l'usager choisit son mot de passe. |
| Aucun email exploitable | Le personnel génère un mot de passe, affiché **une seule fois**. |

La troisième voie est aussi le **secours** en cas de panne SMTP ou de tenant mal
configuré, et la façon d'amorcer le tout premier compte `ADMIN`.

### 5.4 Élèves de maternelle

Les élèves de Preschool possèdent une adresse de l'école, **administrée en
pratique par les parents**. Le compte reste **celui de l'élève** : les emprunts
lui sont rattachés, le parent est seulement la personne devant le clavier.

Conséquences :

- **Aucun rôle « parent »**, **aucun mécanisme de délégation** ou d'usurpation
  d'identité n'est implémenté.
- `users.parent_email` reste ce qu'il est aujourd'hui : un champ de contact pour
  les notifications, **pas une identité**.

### 5.5 Session

- Cookie **httpOnly** plutôt qu'un JWT en `localStorage` : une faille XSS ne peut
  pas lire le cookie.
- La protection **CSRF doit être réactivée** (elle est désactivée dans
  `SecurityConfig`), puisque l'authentification par cookie la rend de nouveau
  nécessaire.

---

## 6. Cycle de vie d'un compte

| État | Effet |
|---|---|
| Actif (`is_active = true`) | Connexion possible, actions selon le rôle. |
| Désactivé (`is_active = false`) | **Connexion refusée.** L'historique, les emprunts en cours et les réservations sont conservés. |
| Suspendu (`suspended_until > today`) | Connexion possible, mais **emprunt et réservation refusés** jusqu'à la date. Voir [règles paramètres](REGLES-METIER-PARAMETRES.md). |

**Un utilisateur ne doit jamais être supprimé physiquement — uniquement
désactivé.** Ce n'est pas une préférence : `borrowing.user_id` est
`ON DELETE CASCADE` alors que `hold.user_id` et `notification.user_id` ne le
sont pas. Une suppression détruit donc silencieusement tout l'historique
d'emprunts, ou échoue sur une violation de clé étrangère si l'usager a une
réservation — selon ses données. Voir
[règles structurelles §3](REGLES-METIER-STRUCTURE.md).

Désactiver un compte **n'annule pas** ses emprunts en cours : les livres restent
dus et doivent être rendus au comptoir.

---

## 7. Dette de sécurité de l'API actuelle

L'API est aujourd'hui **entièrement ouverte** (`SecurityConfig` :
`anyRequest().permitAll()`). Les trois points suivants ne sont sans danger que
parce que personne ne se connecte ; ils deviennent des failles dès que les
élèves ont un compte.

| # | Problème | Où | Règle qui corrige |
|---|---|---|---|
| 1 | Le répertoire complet des usagers (nom, email) est accessible sans authentification | `UserController:22` | [§4.4](#44-le-répertoire-des-utilisateurs-est-réservé-au-personnel) |
| 2 | `POST /holds` fait confiance au `userId` du corps de requête → un élève peut réserver au nom d'un autre | `HoldController:35` | [§4.3](#43-un-élève-ne-réserve-que-pour-lui-même) |
| 3 | Aucun endpoint « mes emprunts » / « mes réservations » : `GET /borrowings` et `GET /holds` renvoient **tout** | `BorrowingController:42`, `HoldController:42` | Nouveaux `/me` en [§3](#3-matrice-des-permissions) |
