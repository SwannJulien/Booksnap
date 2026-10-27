# Règles de prêt par bibliothèque

Aujourd'hui, toutes les bibliothèques de l'école prêtent avec les mêmes règles
codées en dur — 2 semaines d'emprunt, 1 semaine pour retirer une copie mise de
côté — et les réservations ignorent les bibliothèques : la file d'attente d'un
livre est commune à toute l'école. Une fois la feature livrée, chaque
bibliothèque a ses propres **règles de prêt** (durée d'emprunt, fenêtre de
retrait) que seul l'administrateur modifie dans Settings ; une réservation
appartient à la bibliothèque de la copie depuis laquelle elle a été posée et
n'est servie que par les copies de cette bibliothèque ; et une copie mise de côté
qui n'est pas retirée à temps est rendue à la file suivante ou au rayon.

Voir le glossaire : [Loan rules, Borrowing duration, Pickup window, Hold, Loan,
Copy](../../GLOSSARY.md).

## Pourquoi maintenant

Preschool et Primary n'ont pas les mêmes besoins (un enfant de quatre ans et un
collégien), et rien ne permet de les distinguer. C'est le contenu de la phase 3
du plan multi-utilisateur
([phase-3-parametres-durees](../authentication-system/phase-3-parametres-durees/README.md)),
révisé par les décisions ci-dessous. Le parcours de première installation, qui
réglera ces valeurs au premier démarrage, s'appuiera sur ce que cette feature
construit.

---

## Décisions valables pour toute la feature

- **Les règles de prêt sont propres à chaque bibliothèque ; il n'existe aucune
  valeur globale.** Remplace le modèle « défaut global + surcharge par
  bibliothèque » de
  [règles paramètres §1](../../business-rules/REGLES-METIER-PARAMETRES.md) :
  chaque bibliothèque de l'école se configure comme elle l'entend.
- **Seul l'`ADMIN` modifie les règles de prêt.** Remplace
  [règles paramètres §5](../../business-rules/REGLES-METIER-PARAMETRES.md), qui
  laissait le `LIBRARIAN` modifier les surcharges de ses bibliothèques.
- **Une réservation appartient à la bibliothèque de la copie depuis laquelle
  elle a été posée**, et elle est servie par n'importe quelle copie du même livre
  dans cette bibliothèque — pas par une copie précise. Rejeté : la réservation
  d'une copie précise (un élève attendrait pendant qu'une copie identique dort
  au rayon) ; le choix de la bibliothèque dans la modale (la copie la donne
  déjà).
- **Les durées sont saisies et stockées en jours**, entiers de 1 à 365
  ([règles paramètres §6](../../business-rules/REGLES-METIER-PARAMETRES.md)).
  Pas de contrainte croisée : une fenêtre de retrait plus longue que l'emprunt
  est acceptée.
- **Règle du gel** ([règles paramètres §4](../../business-rules/REGLES-METIER-PARAMETRES.md)) :
  modifier une valeur n'a d'effet que sur les emprunts créés et les copies mises
  de côté ensuite ; une date déjà fixée ne bouge jamais.

**Hors périmètre de la feature** :

- **Le parcours de première installation** (assistant joué une seule fois au
  premier démarrage pour régler tous les paramètres) : feature ultérieure, qui
  réutilisera les règles de prêt de US-01.
- **Le nombre maximal d'emprunts simultanés par élève** : il est rattaché à la
  bibliothèque de l'élève, et `users` n'a pas encore de `library_id`. Il attend
  la feature qui l'ajoutera, aux élèves comme aux bibliothécaires.
- **La durée de vie maximale d'une réservation `pending` (5 semaines) et
  `hold.expires_at`** : non demandées ; une réservation `pending` n'expire
  toujours jamais.
- **La réservation par l'élève lui-même** : les élèves n'ont pas de compte avant
  la phase « espace élève ». Les règles écrites ici valent quel que soit l'auteur
  de la réservation.
- **Le prêt et la réservation entre bibliothèques** — question ouverte, à
  trancher avec `users.library_id`. L'utilisateur juge l'idée intéressante (un
  élève de Preschool qui réserve un livre de Primary) mais s'inquiète du
  désordre physique : des livres de Preschool qui finissent à Primary et
  inversement. Trois formes possibles, notées pour cette feature-là :
  1. la réservation n'est servie que par les copies de la bibliothèque de
     l'élève — aucun livre ne change de bâtiment ;
  2. inter-bibliothèques, retrait là où est la copie — les livres ne bougent pas,
     l'élève se déplace ;
  3. inter-bibliothèques avec transfert — exige un statut « en transit » et une
     notion d'emplacement physique que le modèle n'a pas (`copy.library_id` est
     la bibliothèque propriétaire).

---

## User stories

L'ordre est l'ordre d'implémentation recommandé. Chaque story est vérifiable de
bout en bout seule et livrable sans la suivante ; sa section **Vérification de
bout en bout** décrit le parcours exact.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-regles-de-pret/US-01-regles-de-pret-spec.md) | Chaque bibliothèque a ses règles de prêt | feature | db + back + front | FEAT03 |
| [US-02](US-02-reservation-par-bibliotheque/US-02-reservation-par-bibliotheque-spec.md) | Une réservation appartient à une bibliothèque | feature | back + front | — |
| [US-03](US-03-expiration-des-reservations/US-03-expiration-des-reservations-spec.md) | Une copie non retirée à temps est libérée | feature | back + front | US-02 |

---

## Préparation commune aux vérifications

- **Base** : `docker compose up -d db`. Les fixtures de développement donnent
  Preschool (id 1) et Primary (id 2), mais **toutes les copies des fixtures sont
  à Preschool** (`server/sql/seed.sql`, `INSERT INTO copy … library_id = 1`).
  Les vérifications qui ont besoin d'une copie à Primary en créent une
  (`psql` : `INSERT INTO copy (book_id, section_name, identification_code,
  library_id, status) VALUES (<livre>, 'Fiction', 'E2E-PRI', 2, 'available')`)
  — et le front ne sait pas encore créer de copie ailleurs qu'à la bibliothèque
  1 (`copy-table-bks.js:318`, `libraryId: 1`).
- **Comptes** : le harnais de bout en bout (`npm run test:e2e` dans `web/`)
  fournit un compte par rôle (`web/test/e2e/support/accounts.js`) sur la base
  jetable `booksnap_e2e`. Pour le parcours manuel, un compte administrateur de la
  base de développement (`server/README.md`) et un compte bibliothécaire.
- **Dates** : les vérifications qui dépendent du temps (échéance, expiration)
  se font en réécrivant une date en base (`UPDATE hold SET end_date = …`), pas en
  attendant.
- **Nettoyage** : `lifecycle_event` est en ajout seul — tout emprunt ou
  réservation créé sur la base de développement y laisse des lignes définitives.
  Préférer la base `booksnap_e2e` pour les parcours qui écrivent.

---

## Points de vigilance connus

- **La documentation existante est en partie fausse ou dépassée.**
  [Règles paramètres §3.1](../../business-rules/REGLES-METIER-PARAMETRES.md) et le
  README de la phase 3 situent `HOLD_PICKUP_WINDOW_WEEKS` dans
  `BorrowingServiceImpl` ; elle était dans `HoldServiceImpl` avant US-01 et
  n'existe plus : la valeur vit dans `library.pickup_window_days`. Les §1, §2
  et §5 du même document (défaut global, `LIBRARIAN`, fenêtre dérivée d'un
  `hold.library_id` choisi au hasard) sont remplacés par les décisions ci-dessus.
- **`copy.status` appartient aux triggers** (`.claude/CLAUDE.md`) : toute
  écriture sur `hold` ou `borrowing` rend l'entité `Copy` en mémoire périmée, et
  l'ordre des flushs décide du statut final.
- **`lifecycle_event` est en ajout seul** : les tests d'intégration du back
  tournent sur la base de développement et doivent préférer des écritures
  annulées.
