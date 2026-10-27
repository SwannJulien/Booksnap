# US-02 — Revue

[← Spec](US-02-creer-bibliotheque-spec.md) · [← Plan](US-02-creer-bibliotheque-plan.md) · [← Feature](../README.md)

| | |
|---|---|
| **Tour** | 2 — 2026-10-26 |
| **Diff relue** | arbre de travail (sale) contre `b74e052` : 13 fichiers modifiés, 6 non suivis |
| **Fichiers hors story** | aucun — chaque fichier modifié ou non suivi correspond à une étape du plan ou à sa carte des tests |
| **Verdict** | prêt pour la visite — 0 bloquant |

> La revue écrit les constats ; build remplit **Statut** quand il y répond, et le
> tour suivant les vérifie. Rien d'autre dans ce document n'est édité par build.

---

## Critères décochés

Aucun. Chaque critère coché a été revérifié en exécutant quelque chose :

- **Migration `citext NOT NULL`, index présent** — `\d library` sur la base de dév : `name citext not null`. `flyway_schema_history` : `V10` et `V11` à `success = t`. Les gardes ont été rejouées au tour 1 (voir ci-dessous) ; `V11` n'a pas changé depuis, son texte relu : même forme que `V4`, commentaires en anglais.
- **Gardes de la migration** — rejouées à la main au tour 1 sur `booksnap_e2e`, dans une transaction annulée : `primary (ids: {2,4})` pour les doublons de casse, `libraries without a name (ids: 6)` pour les noms nuls. Fichier de migration inchangé depuis.
- **Entité `Library`** — `@Column(name = "name", nullable = false, columnDefinition = "citext")` ; la suite démarre avec `ddl-auto=validate`.
- **`POST /api/v1/libraries`** — 201 / 400 / 409 / 403 couverts par les tests, tous verts. Le chemin « seule la base détecte » est réellement emprunté : le journal du test de course montre `insert into library` sans `select` préalable, puis `duplicate key value violates unique constraint "library_name_key"`, et le test reçoit le `409`.
- **Règle `SecurityConfig` + ligne de matrice `ADMIN_ONLY`** — `SecurityConfig.java:208`, matrice portée à 34, `ApiAuthorizationMatrixTest` vert.
- **Champ « Name » limité à 255** — `maxlength="255"`. Aucun scénario ne le teste, la spec ne l'exige pas.
- **`.bru`** — `createLibrary.bru` et `folder.bru` à jour.
- **Un test `US-02: …` par scénario** — 14 scénarios, 15 tests (la moitié « espaces seuls » du scénario « nom vide dans le formulaire » a son propre test) : 10 côté back (9 dans `LibraryTest`, 1 dans `LibraryCreationRaceTest`), 5 de bout en bout.
- **Suite complète, lint, base de dév propre** — voir ci-dessous. Après les tests, `SELECT name FROM library` sur la base de dév : `Preschool`, `Primary`.

## Lint et tests

| Niveau | Commande | Résultat |
|---|---|---|
| lint | `npm run lint` (`web/`) | 9 erreurs, 9 avertissements, tous dans des fichiers hors story (`class-methods-use-this` sur book/copy, `@zxing/library`, `console`). Aucun dans `library-section-bks*`, `library.js` ni `web/test/e2e/US-02*` (`grep "library\|US-02"` ne renvoie que `@zxing/library`). `prettier --check` sur les fichiers de la story : propres ; les 11 fichiers signalés dans le repo sont hors story. |
| back (unitaire + intégration) | `./mvnw -q test` (`server/`) | 100 exécutés, 0 échec, 0 erreur, 0 ignoré (somme des `surefire-reports`). Les traces dans la sortie sont des exceptions journalisées par des tests qui en attendent. |
| bout en bout | `npm run test:e2e` (`web/`) | 48 / 48 passés, dont les 5 `US-02` |

`:8080` et `:5000` sont tenus par votre IDE : le backend n'a pas été démarré, la
suite e2e utilise son propre backend sur `:8180`.

---

## Constats

### Bloquants

Aucun.

### À corriger

Aucun.

### Notes

- **N1** — Départ du plan, sans conséquence : le plan écrivait `findByName(...)` puis `throw` explicite ; le code utilise `ifPresent(existing -> { throw … })`. Même comportement, vérifié par le test « a name differing only by case is refused ».
- **N2** — Cas limite non spécifié, non bloquant : `_submitting` ne désactive que le bouton « Create ». Une double soumission par la touche Entrée pendant la requête (le champ est le seul de son formulaire, donc l'envoi implicite reste possible) enverrait deux `POST` ; le second recevrait un `409` et écrirait `_error` dans un formulaire déjà refermé, d'où une alerte périmée à la prochaine ouverture. Non observé dans un navigateur ; à regarder pendant la visite si la souris est trop lente pour le déclencher.
- **N3** — Les commentaires ajoutés (`V11`, `LibraryNameRequest`, `LibraryServiceImpl.create`, `library-section-bks-styles.js`) sont en anglais et disent chacun une contrainte non évidente : rien à reprocher.
- **N4** — Le plan note que le test e2e d'ajout crée `Secondary` dans `booksnap_e2e` pour le reste de l'exécution ; les e2e de US-03 verront donc trois bibliothèques.

### Problèmes de spec

Aucun. La décision sur le message de doublon est déjà amendée (plan, « Problèmes trouvés dans la spec », point 1), et le code la suit : `LibraryServiceImpl.create` nomme `request.name()` quand seul l'index détecte le conflit.

---

## Tour précédent

| # | Statut maintenant | Preuve |
|---|---|---|
| B1 | résolu | `web/test/e2e/US-02-creer-bibliotheque.spec.js:59-84` : le cas « espaces seuls » est un test à part (`US-02: empty name in the form - only spaces`), sur un formulaire fraîchement ouvert, donc sans alerte au départ ; un seul clic sur « Create ». L'alerte attendue, `Enter a name for the library.`, ne peut venir que du `trim()` du composant : sans lui, `"   "` partirait vers l'API, qui répondrait `400` avec un autre texte, et le `toHaveText` échouerait. Le test passe dans la suite complète (48 / 48). Je n'ai pas rejoué l'échec en retirant le `trim()` — la revue ne modifie pas le code ; le raisonnement ci-dessus suffit. |
| S1 | résolu | `LibraryRepository.java` : `findByName` est maintenant avant le commentaire `// LOWER is required: …`, qui précède de nouveau `findAllOrderByNameIgnoreCase` (visible dans le diff). |
