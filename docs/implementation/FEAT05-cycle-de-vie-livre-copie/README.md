# Cycle de vie d'un livre et d'une copie

La suppression d'un livre ou d'une copie cesse d'être gouvernée par son
**historique** et devient gouvernée par ce qui se passe **maintenant** : un
administrateur peut supprimer n'importe quoi, sauf si un emprunt est dehors ou
une réservation en attente — auquel cas le refus nomme les élèves concernés. La
suppression elle-même devient logique (`deleted_at`) et non plus physique :
aucune ligne d'emprunt n'est jamais détruite. À côté, un bibliothécaire gagne la
seule action manuelle de statut qui lui revienne — déclarer une copie perdue ou retrouvée —
ce qui la retire de ce que voit un élève. Et tout ce qui arrive à un livre ou à
une copie est consigné dans un journal en ajout seul qui survit à la
suppression, lisible depuis un écran d'archive réservé au personnel.

Une fois les six stories livrées, l'application sait faire ce qu'elle ne sait
pas faire aujourd'hui : supprimer une notice empruntée trois ans plus tôt,
expliquer un refus autrement que par un message générique, sortir une copie
perdue des rayons sans la faire disparaître des registres, et répondre à la
question « qu'est-il arrivé à cet exemplaire ? » après qu'il a été supprimé.

## Pourquoi maintenant

[US-016](../authentication-system/phase-2-bibliotheques/correction-suppression-copie/US-016-suppression-copie-409.md)
avait été implémentée, puis **son code a disparu du dépôt** : il n'est ni dans
l'arbre de travail, ni dans une branche, ni dans le stash, et
`CopyHasHistoryException` n'apparaît dans aucun commit. Le bug qu'elle corrigeait
est donc de retour — une suppression bloquée remonte en 500, et le front annonce
un faux succès — et la règle qu'elle gravait au passage, celle dont on ne veut
pas, n'a jamais été écrite : **tout** historique interdit la suppression, y
compris un emprunt `returned` d'il y a trois ans. US-01 reprend donc les deux
corrections et pose la bonne règle du même coup.

La règle correcte demande de ne plus rien détruire du tout, ce qui est la porte
d'entrée naturelle vers le journal de cycle de vie — la seconde chose qui manque
aujourd'hui, et qu'aucune colonne d'audit ne fournit : `last_modified_by` dit
**qui en dernier**, jamais **ce qui s'est passé**.

---

## Décisions qui valent pour toute la fonctionnalité

- **D1 — La suppression est logique, pas physique.** Une colonne `deleted_at`
  sur `book` et sur `copy`. La ligne reste, les lignes `borrowing` et `hold`
  continuent de la référencer, l'historique de prêt d'un élève est intact et une
  suppression par erreur se rattrape en psql. Rejeté : la suppression physique
  avec cascade vers `borrowing`/`hold`, qui détruirait l'historique de prêt —
  exactement ce que protègent les
  [règles structurelles §2](../../business-rules/REGLES-METIER-STRUCTURE.md).
  Rejeté aussi : passer `borrowing.copy_id` en `ON DELETE SET NULL`, qui garde
  les emprunts mais leur retire ce qu'ils désignaient.

- **D2 — « Actif » se définit par quatre statuts, et par eux seuls.** Un
  `borrowing` en `borrowed` ou `overdue`, un `hold` en `pending` ou `active`.
  `returned`, `expired` et `fulfilled` ne bloquent rien. Un `hold` `pending`
  n'a pas de copie attachée : il bloque le **livre**, jamais une copie
  particulière.

- **D3 — Le changement manuel de statut d'une copie se limite à
  `available` ↔ `lost`.** Bibliothécaire comme administrateur : `available` →
  `lost` quand la copie a disparu, `lost` → `available` quand elle est
  retrouvée. `damaged` n'en fait pas partie (D10).
  `borrowed` et `on_hold` restent la propriété exclusive des triggers
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md))
  et sont refusés par l'API quelle que soit la provenance.

- **D4 — Le journal est en ajout seul et sans clé étrangère vers `book` ou
  `copy`.** Il n'est jamais modifié, jamais supprimé, et ses lignes survivent à
  l'entité qu'elles décrivent. L'acteur y est enregistré comme **adresse
  e-mail**, convention de `Auditable` et de `AuditorAwareImpl` — jamais une clé
  étrangère vers `users`
  ([règles structurelles §8](../../business-rules/REGLES-METIER-STRUCTURE.md)).

- **D5 — L'archive est en lecture seule.** L'administrateur consulte ce qui a
  été supprimé et son historique ; il ne le restaure pas depuis l'interface.
  `UPDATE book SET deleted_at = NULL` en psql suffit tant que le besoin n'est
  pas avéré, et construire un parcours de restauration imposerait de trancher ce
  que devient un livre restauré dont les copies avaient été supprimées aussi.

- **D6 — US-016 est remplacée, pas annulée.** Son code ayant disparu du dépôt,
  US-01 réécrit les deux vrais défauts qu'elle corrigeait et qu'on garde : la
  traduction du 500 en réponse `ApiError`, et `deleteCopy()` / `deleteBook()`
  côté front qui n'annoncent plus un faux succès. Seule la **règle** change. Les
  classes `CopyHasHistoryException` et `BookHasHistoryException` qu'elle
  nommait porteraient un nom faux et ne reparaissent pas : US-01 en choisit
  d'autres.

- **D7 — `copy_status = 'removed'` est abandonné.** `deleted_at` dit la même
  chose, mieux. La valeur reste dans l'enum PostgreSQL — la retirer demanderait
  de reconstruire le type — mais plus rien ne l'écrit, et elle n'apparaît dans
  aucune interface.

- **D8 — Supprimer est réservé à l'administrateur, livre comme copie.**
  `DELETE /copies/{id}` rejoint `DELETE /books/{id}` en `hasRole(ADMIN)` : il est
  aujourd'hui ouvert au `LIBRARIAN`, et le bibliothécaire perd donc une action
  qu'il a (US-01). Ce que la base interdisait par accident — une copie déjà
  empruntée était indestructible — devient permis par D1, et la décision de
  retirer un exemplaire du fonds cesse d'être un geste de comptoir. La
  contrepartie du bibliothécaire est D3 : déclarer la copie `lost`, ce qui la
  sort des rayons sans rien effacer. Rejeté : laisser le `DELETE` au
  bibliothécaire en comptant sur le journal (D4) pour tracer qui a supprimé
  quoi — un journal explique après coup, il n'empêche rien.

- **D9 — Un refus de suppression s'affiche dans sa propre modale, sans action.**
  Le parcours est à deux temps : confirmation, puis — si le serveur refuse — une
  modale d'information qui dit pourquoi et n'offre qu'un bouton de fermeture.
  Rien de ce que l'administrateur peut faire depuis cet écran ne changerait la
  réponse : le blocage se lève en rendant l'emprunt ou en annulant la
  réservation, pas en réessayant. US-01 construit ce parcours avec le message
  générique du serveur ; US-02 remplit le contenu de la modale sans toucher au
  parcours.

- **D10 — L'état de conservation (`damaged`) n'est pas traité par cette
  fonctionnalité.** `copy.status` mêle deux axes : où se trouve l'exemplaire
  (`available`, `borrowed`, `on_hold`, `lost`, écrits par les triggers) et dans
  quel état il est (`damaged`, posé à la main). Une seule colonne ne peut pas
  dire « emprunté et abîmé » : chaque trigger qui déplace la copie écrase son
  état, et seul le cycle d'emprunt le rétablit (`borrowing.pre_borrow_copy_status`)
  — les triggers de `hold` ne le font pas. `damaged` garde donc son comportement
  actuel (posé en psql, empruntable, jamais proposé dans l'interface) jusqu'à
  une fonctionnalité qui donne à l'état de conservation sa propre colonne. Voir
  la [pré-spec](../etat-de-conservation-copie/pre-spec.md). Rejeté : ajouter
  `damaged` aux transitions manuelles de US-03 et rafistoler les triggers de
  `hold` comme ceux de `borrowing`.

- **D11 — Le journal est la seule source de l'historique, et la future vue
  d'analyse le lit.** Les graphiques du bibliothécaire (livres les plus
  empruntés, élèves qui empruntent le plus, volume d'emprunts) seront des
  requêtes d'agrégation sur le journal, sans stockage d'analyse à eux. Le
  journal est donc conçu pour deux lectures : événement par événement (US-05,
  US-06) et en agrégat. Cela impose trois choses à US-04 : les axes de
  regroupement (livre, copie, bibliothèque, élève, type, date) sont des colonnes
  indexées ; l'élève est désigné par un identifiant sans clé étrangère, ce qui
  ne touche pas D4, qui porte sur l'acteur ; et l'historique d'emprunt et de
  réservation déjà en base est repris, chaque date approchée étant marquée
  comme telle. Rejeté : un stockage d'analyse séparé, qui dupliquerait les
  faits ; une analyse qui lirait `borrowing` et `hold` pour une partie et le
  journal pour le reste.

**Hors périmètre de la fonctionnalité** : restaurer depuis l'interface (D5) ;
l'interface élève, qui n'existe pas (phase 5 du plan authentification) — les
règles de visibilité par rôle sont donc vérifiées côté serveur, depuis Bruno,
avec une session `user` ; la portée par bibliothèque (US-023 à US-027), un
bibliothécaire agissant encore sur toutes les bibliothèques ; la purge ou la
rétention du journal ; toute suppression définitive de type RGPD ; le statut
`removed`, qui reste tel quel ; l'état de conservation d'une copie (D10) ; la
vue d'analyse elle-même, dont US-04 ne pose que la source (D11).

---

## User stories

L'ordre est l'ordre de livraison recommandé. Chaque story est vérifiable de bout
en bout seule et livrable sans la suivante ; sa section **Vérification de bout
en bout** décrit le parcours exact.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-suppression-logique.md) | Supprimer un livre ou une copie sans détruire son historique | feature | db · back · front | — (remplace US-016) |
| [US-02](US-02-detail-du-refus.md) | Dire qui empêche la suppression | feature | back · front | US-01 |
| [US-03](US-03-copie-perdue.md) | Déclarer une copie perdue ou retrouvée, et la retirer du catalogue élève | feature | back · front | US-02 (à livrer après US-01) |
| [US-04](US-04-journal-cycle-de-vie.md) | Journaliser le cycle de vie d'un livre et d'une copie | feature | db · back | US-01, US-03 |
| [US-05](US-05-lecture-historique.md) | Lire l'historique, y compris celui d'un livre supprimé | feature | back | US-04 |
| [US-06](US-06-ecran-archive.md) | L'écran d'archive et l'historique | feature | back · front | US-05, [FEAT-tests-bout-en-bout/US-01](../FEAT-tests-bout-en-bout/US-01-harnais-playwright/US-01-harnais-playwright-spec.md) |

Deux migrations Flyway, chacune dans la story qui la rend observable : `deleted_at`
avec US-01, le journal avec US-04. Aucune story d'infrastructure isolée.

**US-04 est la plus lourde des six** et pour une raison structurelle, pas de
volume : `copy.status` est écrit par des triggers, donc une partie des
événements à journaliser n'est jamais vue par le code Java. Voir ses points de
vigilance avant de la planifier.

---

## Socle commun de vérification

Trois comptes sont nécessaires, et servent à toutes les stories. Les fixtures
(`server/scripts/load-dev-fixtures.sh`) créent neuf élèves sans rôle explicite —
`users.role` vaut `user` par défaut depuis `V7`. Le personnel se fabrique en
promouvant deux d'entre eux :

```sql
-- dans docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
UPDATE users SET role = 'admin'     WHERE email = 'alice.martin@example.com';
UPDATE users SET role = 'librarian' WHERE email = 'bob.johnson@example.com';
-- Élève de référence, laissé en `user` : clara.dupont@example.com
```

Chacun a besoin d'un moyen de connexion : soit l'administrateur de bootstrap
(`BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL` / `..._PASSWORD`, voir
`application.properties`), soit un mot de passe posé via le parcours de US-007 /
US-008 du plan authentification.

Côté Bruno, l'environnement fournit `{{vipa}}` et `{{csrfToken}}` ; les requêtes
héritent de l'authentification de la collection (`auth: inherit`), donc **changer
de rôle veut dire se reconnecter** avec `AuthController/login.bru`.

Un jeu de données utile pour presque toutes les stories, à construire depuis le
front (vue Catalogue) une fois et à réutiliser :

| Objet | État voulu | Comment |
|---|---|---|
| Livre A, copie A1 | emprunt `returned` | emprunter puis rendre |
| Livre A, copie A2 | emprunt `borrowed` en cours | emprunter, ne pas rendre |
| Livre B, copie B1 | réservation `expired` | réserver, laisser expirer ou forcer le statut en psql |
| Livre C | aucune copie empruntée ni réservée | créer le livre, ne rien en faire |

**Nettoyage.** Il n'y en a pas à faire à la main : à partir de US-01 plus rien
n'est détruit, un livre supprimé par erreur se rattrape avec
`UPDATE book SET deleted_at = NULL WHERE id = …`, et une base repartie de zéro
s'obtient avec `server/scripts/reset-dev-db.sh`. Ne **jamais** lancer
`server/sql/reset.sql` seul : il vide les tables Dewey que Flyway ne
repeuplera pas.

---

## Pièges connus de la fonctionnalité

- **`copy.status` appartient aux triggers**
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)).
  Cinq fonctions définies dans `V1__baseline_schema.sql` écrivent `copy.status`
  depuis des changements sur `borrowing` et `hold`. Après une écriture qui en
  déclenche un, l'entité `Copy` en mémoire est périmée : `saveAndFlush(...)`
  puis `entityManager.refresh(copy)`. Quand plusieurs de ces écritures partagent
  une transaction, **l'ordre des flush décide du statut final**.

- **Les clés étrangères sont en `NO ACTION` dans les deux sens.**
  `borrowing.copy_id → copy(id)`, `hold.copy_id → copy(id)` et
  `hold.book_id → book(id)` n'ont pas d'`ON DELETE`. Tant que D1 est respectée,
  elles ne gênent personne ; la tentation de les passer en `CASCADE` pour
  « débloquer » revient à détruire l'historique sans prévenir.

- **`copy.book_id → book(id)` est en `ON DELETE CASCADE`**, lui. Supprimer
  physiquement un livre emporte ses copies en silence. Raison de plus pour que
  plus personne n'appelle `deleteById` sur un livre.

- **Il n'y a pas de test automatisé sur ce périmètre.** Les cinq classes JUnit
  du projet couvrent l'authentification, l'audit et la matrice d'autorisation.
  Rien sur les livres, les copies, les emprunts ni les réservations, rien côté
  front, et Maven n'est pas sur le PATH. **Le parcours de vérification de bout
  en bout est le seul contrôle réel** de chaque story.

- **Le backend démarre depuis l'IDE**, jamais depuis le shell ni depuis le
  conteneur `backend`. C'est ce démarrage qui applique les migrations Flyway.

- **Ne jamais lancer `prettier --write` ni `npm run format`** : une douzaine de
  fichiers du dépôt échouent déjà à `prettier --check` pour une divergence de
  version, et un `--write` réécrirait des lignes intactes partout
  (`.claude/CLAUDE.md`).

- **Le piège de spécificité CSS de Lit.** Un composant qui liste `sharedStyles`
  **en dernier** dans `static styles = [...]` ne peut pas redéfinir
  `input, select { padding, font-size }` avec une règle `input` ou `select`
  simple : même spécificité, la feuille la plus tardive gagne. Il a déjà mordu
  `search-bar-bks` deux fois.
