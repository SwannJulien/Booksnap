# US-03 — Revue

[← Spec](US-03-renommer-bibliotheque-spec.md) · [← Plan](US-03-renommer-bibliotheque-plan.md) · [← Feature](../README.md)

| | |
|---|---|
| **Tour** | 1 — 2026-10-26 |
| **Diff relue** | arbre de travail (sale) contre `c5a49ef` : 9 fichiers modifiés et 2 nouveaux sous `server/`, 2 modifiés et 1 nouveau sous `web/src` et `web/test/e2e/library-rename.spec.js`, plus le renommage des quatre fichiers e2e (étape 0) |
| **Fichiers hors story** | Les quatre fichiers e2e (`US-01-harness-playwright`, `US-01-see-library`, `US-02-create-library`, `US-06-archive-view`) : supprimés en `.js`, recréés en `.spec.js` à l'identique (`diff` octet pour octet avec `HEAD`). C'est l'étape 0 du plan, marquée « à confirmer, hors story » — voir N1. Aucun autre fichier étranger à la story. |
| **Verdict** | prêt pour la revue manuelle — 0 bloquant, 1 à corriger |

> La revue écrit les constats ; build remplit **Statut** quand il y répond, et le
> tour suivant les vérifie. Rien d'autre dans ce document n'est modifié par build.

---

## Critères décochés

Aucun. Chaque critère coché a été vérifié en exécutant quelque chose :

- **`PUT /api/v1/libraries/{id}` 200/400/404/409/admin** — `LibraryTest` (19 tests) et `LibraryRenameRaceTest` (1) verts ; les statuts, les corps et le nom stocké sont assertés pour 200, 400 (`{}`, `""`, `"   "`, 256 caractères), 404, 409 (vérification et index), 403 (`LIBRARIAN`, `USER`).
- **Règle dans `SecurityConfig` + ligne `ADMIN_ONLY` dans la matrice** — `SecurityConfig.java:209` et `ApiAuthorizationMatrixTest.java:120` (Javadoc passée à 35) ; la matrice est verte.
- **Champ limité à 255 caractères** — `maxlength="255"` dans `library-section-bks.js`, assertion dans `US-03: the rename field is pre-filled`, verte.
- **`.bru`** — `server/API/LibraryController/renameLibrary.bru` (`put`, `seq: 3`, mêmes en-têtes que `createLibrary.bru`) et bloc `docs` de `folder.bru` complété.
- **Un test `US-03: <titre>` par scénario** — 14 scénarios, 15 titres `US-03:` distincts retrouvés par recherche dans `server/src/test` et `web/test/e2e` (le scénario « nom vide dans la ligne » a deux tests, comme le plan le prévoit).
- **Suite complète, lint, démarrage avec `ddl-auto=validate`** — voir le tableau ci-dessous ; aucune migration ajoutée, le contexte Spring démarre dans chaque test `@SpringBootTest`.
- **Commentaires en anglais, réduits** — un seul commentaire ajouté (`LibraryServiceImpl`, ordre vérification/`setName`), qui documente une dépendance d'ordre non évidente : justifié.

## Lint et tests

| Niveau | Commande | Résultat |
|---|---|---|
| lint | `npm run lint` (dans `web/`) | 9 erreurs, 9 avertissements, tous préexistants : 6 × `class-methods-use-this` (`book-table-bks`, `create-book-bks`, `copy-qr-modal-bks`, `copy-table-bks`), 2 × `lit/attribute-value-entities` (`book-form-bks`) et 1 × `import/no-extraneous-dependencies` (`barcode-scanner-bks`). Aucun dans `library*`, `src/api/library.js` ni `test/e2e`. |
| format | `npx prettier --check` sur `library.js`, `library-section-bks.js`, `library-rename.spec.js` | propre (les 11 fichiers signalés par `npm run lint` sont hors story) |
| back unit + integration | `cd server && ./mvnw -q test` | 109 / 109 (0 échec, 0 erreur) d'après `target/surefire-reports` |
| end-to-end | `cd web && npm run test:e2e` | 55 / 55 (US-01, US-02, US-03, US-06) |

Le backend de `:8080` et le serveur de `:5000` appartiennent à l'utilisateur : je n'y ai pas touché ; le harnais e2e a utilisé ses propres ports.

---

## Constats

### Bloquants

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| — | — | Aucun. | — | — |

Contrôles qui ont mené à ce résultat :

- Chaque `Then`/`And` des 14 scénarios est assertée (corps JSON + `storedName` côté back ; valeur du champ, `alert` de la ligne, absence de champ, `queryE2eDb` côté e2e). Le test de course ne relit rien en base après la requête, comme le plan l'exige.
- Les tests passent par les vrais points d'entrée de la carte (`PUT /api/v1/libraries/{id}` via MockMvc et la chaîne de filtres ; l'UI Settings via Playwright). Seule exception voulue : `@MockitoSpyBean` sur `findByNameAndIdNot` dans le test de course, qui force le seul chemin que l'index unique voit.
- Aucun test n'asserte quelque chose que la spec ne dit pas.
- Aucun non-objectif construit : pas de modale, pas de touche aux copies/réservations, `LibraryDTO` et les QR codes inchangés, pas d'archivage ni de suppression.
- Textes utilisateur conformes mot pour mot : `Enter a name for the library.`, `A library named "Preschool" already exists.` (casse du nom stocké, via `existing.getName()`), `Library not found: 999999999`, libellés `Rename`, `Save`, `Cancel`, `New name`.
- Pièges de la spec / du plan respectés : doublon cherché parmi les *autres* bibliothèques (`findByNameAndIdNot`) ; vérification avant `setName` ; `saveAndFlush` dans le `try` partagé avec `create` (bloc extrait en `saveCatchingNameTaken`, sans copier le test sur `library_name_key`) ; saisie tenue dans `_renameDraft` lié en `.value=`, donc conservée après un `409`.

### À corriger

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| S1 | `web/src/features/library/library-section-bks/library-section-bks-styles.js` (inchangé) | L'étape 7 du plan prévoyait une règle de style locale sur `li input` pour le champ de renommage (« Cibler `li input` plutôt que `input`, pour ne pas toucher le champ d'ajout »). Le fichier de styles n'est pas modifié (`git status` : seul `library-section-bks.js` bouge dans ce dossier) : le champ, `Save`, `Cancel` et l'alerte héritent uniquement de `sharedStyles`. Écart non couvert par les tests, que je n'ai pas évalué à l'écran — à comparer au rapport de build, et à regarder lors de la revue manuelle (étape 1 : champ, `Save`, `Cancel` lisibles dans la ligne). | Plan, étape 7 « Styles » | disputed — le plan ne définit aucune règle (il dit seulement de cibler `li input` *si* on en écrit une) et rien à l'écran n'en appelle une : capture de la section Settings (admin, Vite `:5000`, ligne en édition, aucun envoi) — le champ prend déjà le `padding`, la bordure et la `font-size` de `sharedStyles`, comme le champ d'ajout ; `Save` et `Cancel` sont alignés sur le champ ; l'alerte `Enter a name for the library.` est lisible sur le fond sombre. Une règle `li input` n'aurait rien à y changer et ne serait pas couverte par la spec ; à confirmer par l'utilisateur à l'étape 1 de la vérification. |

### Notes

- **N1** — Étape 0 (rétablir `.spec.js` sur les quatre fichiers e2e de `c5a49ef`) : exécutée, contenu identique à `HEAD`. Le plan la donnait « à confirmer, hors story » ; je ne vois pas la confirmation. Sans elle, `npm run test:e2e` ne trouvait aucun test, et le critère permanent n'était pas observable. À l'état de l'arbre elle apparaît comme 4 suppressions + 4 fichiers non suivis : un `git mv` ou un commit séparé garderait l'historique lisible et la séparerait de la story.
- **N2** — Le plan propose de promouvoir dans la spec (« À promouvoir dans la spec ») l'ordre vérification-puis-`setName` et la persistance de `booksnap_e2e` d'un test à l'autre ; le second point est respecté par l'`afterEach` de `library-rename.spec.js`. Rien n'a été promu : décision de l'utilisateur.
- **N3** — Les noms `US-01-see-library…` / `US-02-create-library…` portent l'ID de story, contre `.claude/spec/conventions.md` (déjà relevé par le plan, hors périmètre).
- **N4** — La sécurité du `PUT` repose sur `requestMatchers(PUT, "/api/v1/libraries/*")` ; la règle de fermeture par défaut couvrirait un oubli en `403`, ce que la matrice vérifie.

### Problèmes de spec

Aucun.

---

## Tour précédent

Premier tour.

| # | Statut maintenant | Preuve |
|---|---|---|
| | | |
