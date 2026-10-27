# Bibliothèques

L'école utilise BookSnap sur plusieurs bibliothèques — aujourd'hui Preschool et
Primary, insérées par `seed.sql`. Personne ne peut les voir, en ajouter une ou
corriger un nom sans passer par `psql`. Une fois la feature livrée,
l'administrateur trouve dans **Settings** une section **Libraries** qui liste les
bibliothèques de l'école, lui permet d'en ajouter une et d'en renommer une. Les
bibliothécaires et les élèves ne voient pas cette section.

Remplace les anciennes stories US-014 et US-015 de la
[phase 2](../authentication-system/phase-2-bibliotheques/README.md), réécrites
d'après le code actuel.

## Pourquoi maintenant

Tout le reste de la phase 2 désigne des bibliothèques : rattacher un
bibliothécaire ou un élève, archiver, restreindre la portée. Tant qu'une
bibliothèque ne peut naître que d'un `INSERT` à la main, aucune de ces stories
ne se vérifie sans `psql`.

---

## Décisions valables pour toute la feature

- **Une bibliothèque n'a pas de livres à elle.** Le livre est une notice unique
  partagée par toutes les bibliothèques ; une bibliothèque possède des copies,
  des réservations, des élèves et des bibliothécaires. « Les livres du Primary »
  sont ceux qui y ont au moins une copie. Rejeté : un `library_id` sur `book`,
  qui dupliquerait chaque notice (couverture, genres, Dewey) par bibliothèque et
  ferait tomber la raison pour laquelle la suppression d'un livre est réservée à
  l'`ADMIN`. Voir [glossaire](../../GLOSSARY.md), _Library_, et
  [règles accès §1](../../business-rules/REGLES-METIER-ACCES.md).
- **Seul l'administrateur gère les bibliothèques, et c'est dans Settings.** Pas
  d'écran ni d'entrée de navigation dédiés : la section **Libraries** de
  `/settings`, rendue pour l'`ADMIN` seulement. Elle remplace l'écran `/libraries`
  prévu par l'ancienne US-019.
- **La liste des bibliothèques est réservée à l'`ADMIN`** — révision de la
  décision P2-5 de la phase 2, qui l'ouvrait à tout utilisateur connecté « parce
  que le sélecteur en a besoin ». Le sélecteur (US-022) lit les bibliothèques
  dans `/auth/me` (US-020), pas dans cette liste : aucun appelant non-admin
  n'existe. Si la phase 5 en a besoin, elle l'ouvrira.
- **Pas d'endpoint de détail** (`GET /libraries/{id}`) : aucun écran ne
  l'appelle.
- **`library.is_active` n'est pas créé ici.** Aucune story de cette feature ne
  peut rendre une bibliothèque inactive ; la colonne arrive avec l'archivage
  (US-017), avec le paramètre `includeArchived` et l'affichage du statut.

**Hors périmètre de la feature** : archiver et supprimer une bibliothèque
(US-017, US-018), rattacher bibliothécaires et élèves (US-020, US-021), le
sélecteur de bibliothèque et la fin du `libraryId: 1` codé en dur côté front
(US-022), la portée (US-023 à US-027). Le **parcours de première installation**,
où l'on nommera la ou les bibliothèques qui utilisent BookSnap, est une feature
future ; il suivra les mêmes règles de nom (espaces retirés, unicité sans tenir
compte de la casse).

---

## User stories

L'ordre est l'ordre d'implémentation recommandé. Chaque story est vérifiable de
bout en bout seule et livrable sans la suivante ; sa section **Vérification de
bout en bout** décrit le parcours exact.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-voir-bibliotheques/US-01-voir-bibliotheques-spec.md) | L'administrateur voit les bibliothèques dans Settings | feature | back + front | — |
| [US-02](US-02-creer-bibliotheque/US-02-creer-bibliotheque-spec.md) | Créer une bibliothèque | feature | db + back + front | US-01 |
| [US-03](US-03-renommer-bibliotheque/US-03-renommer-bibliotheque-spec.md) | Renommer une bibliothèque | feature | back + front | US-02 |

---

## Préparation commune aux vérifications

- **Base** : `docker compose up -d db`. Les fixtures de développement donnent
  Preschool (id 1) et Primary (id 2) ; les 20 copies de développement sont au
  Preschool.
- **Comptes** : le harnais de bout en bout (`npm run test:e2e` dans `web/`)
  fournit un compte par rôle (`web/test/e2e/support/accounts.js`) — admin
  `alice.martin@example.com`, bibliothécaire `bob.johnson@example.com`, élève
  `clara.dupont@example.com`, mot de passe `E2E_PASSWORD`. Il travaille sur la base
  jetable `booksnap_e2e`, reconstruite à chaque exécution : y créer des
  bibliothèques ne laisse rien.
- **Parcours manuel** sur la base de développement : compte admin d'amorçage
  (`server/README.md`), Bruno environnement `Localhost`.
- **Nettoyage** : une bibliothèque créée à la main sur la base de développement
  se supprime par `DELETE FROM library WHERE name = '…';` tant qu'aucune copie ni
  réservation ne la référence (`copy_library_id_fkey`, `hold_library_id_fkey`,
  sans action). La suppression par l'API n'arrive qu'avec US-018.

---

## Points de vigilance connus

- **Deux sens pour « Archive ».** Le glossaire définit _Archive_ comme la liste
  des livres et copies supprimés. Une bibliothèque « archivée » (US-017) est
  autre chose ; le mot devra être tranché avant cette story, pas ici.
- **`citext` ne suffit pas à lui seul** (`.claude/CLAUDE.md`) : la recherche par
  nom n'ignore la casse que grâce à `stringtype=unspecified` dans l'URL JDBC.
  L'unicité, elle, est garantie par l'index quoi qu'il arrive.
- **`LibraryDTO { id, name }` est embarqué dans chaque `CopyResponse`.** Le
  modifier change le JSON de toutes les copies.
