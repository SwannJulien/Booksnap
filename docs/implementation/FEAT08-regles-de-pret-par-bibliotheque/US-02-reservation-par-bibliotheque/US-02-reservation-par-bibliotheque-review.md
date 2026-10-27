# US-02 — Revue

[← Spec](US-02-reservation-par-bibliotheque-spec.md) · [← Plan](US-02-reservation-par-bibliotheque-plan.md) · [← Feature](../README.md)

| | |
|---|---|
| **Tour** | 1 — 2026-10-27 |
| **Diff relue** | arbre de travail (sale) contre `f6ff273`, fichiers non suivis compris. `.claude/CLAUDE.md` est ignoré par git : relu directement, hors diff. |
| **Fichiers hors story** | aucun — les 20 entrées de `git status` s'attribuent à la spec, aux étapes du plan ou à sa carte des tests |
| **Verdict** | prêt pour la vérification de bout en bout — 0 bloquant |

> La revue écrit les constats ; build renseigne **Statut** en y répondant, et le
> tour suivant les vérifie. Rien d'autre dans ce document n'est modifié par build.

---

## Critères décochés

Aucun. Chaque critère coché a été vérifié :

- **`POST /api/v1/holds` prend `{ userId, copyId }`, 201 / 404 / 409** — `HoldTest` (10 tests, tous verts) pilote l'endpoint : 201 avec `queuePosition` de la file de la bibliothèque, 409 `copy_available` avec le message exact de la spec, 409 `duplicate_hold`, 404 pour une copie inexistante et pour une copie supprimée. `HoldServiceImpl.createHold:60-73` lit la copie par `findByIdAndDeletedAtIsNull` et compte les copies disponibles par requête (`...BookIdAndLibraryIdAndStatusAndDeletedAtIsNull`), pas par `copy.getStatus()`.
- **Le front distingue les deux 409 sans lire le message** — `hold-modal-bks.js:241-251` choisit sur `err.reason` ; `hold.js` pose `error.reason = errorData.reason`. Les deux scénarios de modale (`copy_available`, `duplicate_hold`) passent en bout en bout.
- **`createHold` front envoie la copie ; la vue passe copie et bibliothèque** — `hold.js`, `catalog-view.js:689-695` (`copyId`, `libraryName`), vérifié par `holds.spec.js` (« available at Preschool » s'affiche, pas « undefined »).
- **`createHold.bru` avec `copyId`** — diff lue.
- **Aucune réservation existante modifiée** — aucune migration dans le diff ; `promoteNextPendingHold` et `createHold` sont les seules écritures.
- **`.claude/CLAUDE.md` et règles emprunts §4, §6.C** — *Hold lifecycle* relu (réservation « from a copy », file par bibliothèque, règle « in that library », une réservation par élève pour toute l'école) ; §4 (création, file, statuts, promotion) et §6.C relus dans le diff.
- **Critères permanents** — voir le tableau ci-dessous. Chaque scénario a un test `US-02: …` (14 scénarios : 10 back, 6 bout en bout, deux scénarios ont les deux niveaux, comme le plan le prévoit).

## Lint et tests

| Niveau | Commande | Résultat |
|---|---|---|
| lint | `npm run lint` (web/) | 9 erreurs, 9 avertissements — **aucun dans un fichier de la story**, hors `copy-table-bks.js:305` (`_getStatusClass`, `class-methods-use-this`, ligne non touchée). Le `prettier --check` signale `src/api/hold.js` et `copy-table-bks.js` ; `hold.js` à `HEAD` échoue déjà de la même façon (vérifié sur une copie de la version de `HEAD`). |
| back (unitaire + intégration) | `./mvnw -q test` (server/) | 138 / 138 passés, dont `HoldTest` 10 / 10 ; le contexte démarre avec `ddl-auto=validate` |
| bout en bout | `npm run test:e2e` (web/) | 84 / 84 passés, dont les 6 de `holds.spec.js` |

Une première passe de `./mvnw test` lancée **en même temps** que le bout en bout a échoué (13 erreurs « Unable to find a @SpringBootConfiguration ») : les deux reconstruisent `server/target`. Ce n'est pas un défaut de la story ; la suite a été relancée seule, voir ci-dessus.

---

## Constats

### Bloquants

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| — | — | aucun | — | — |

### À corriger

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| — | — | aucun | — | — |

### Notes

- **N1** — `docs/business-rules/REGLES-METIER-ACCES.md:27` et `:146` disent toujours que `POST /holds` reçoit `{ bookId, userId }`. Le contrat a changé dans cette story ; la spec ne demandait que §4 et §6.C des règles emprunts, donc ce n'est pas un écart de build, mais le document est désormais faux.
- **N2** — `REGLES-METIER-EMPRUNTS-RESERVATIONS.md:293` (« Fenêtre de retrait … **1 semaine** … `HOLD_PICKUP_WINDOW_WEEKS` ») et `:311` (« après 1 semaine ») restent périmés depuis US-01. Build a corrigé §4 *Statuts* et *Promotion* comme le plan le proposait « au passage », mais pas ces deux lignes.
- **N3** — Les trois points de *À promouvoir dans la spec* du plan (code d'identification non unique, `created_date` = début de transaction, réservation `pending` orpheline) ne sont pas encore dans la spec ; c'est à la clôture de la story.
- **N4** — `.claude/CLAUDE.md` est ignoré par git (`.gitignore:64`) : la modification de *Hold lifecycle* n'apparaît pas dans le diff et ne sera pas commitée avec la story.
- **N5** — Écart plan / diff sans conséquence : aucun. Les 10 étapes du plan se retrouvent dans le diff (anciens finders supprimés, `BookRepository` retiré du constructeur, `HoldRefusedError` / `HoldRefusalReason` comme prévu, `giveBack` et `libraryId` ajoutés aux fixtures). Le seul choix de conception non trivial — le champ `reason` — figure dans les *Choix de conception* du plan.

### Problèmes de spec

- **P1** — *Points de vigilance*, premier point : « `findAllByBookId(...).findFirst()` … ne regarde même pas `deleted_at` ». La requête filtre bien `c.deletedAt IS NULL` (déjà relevé par le plan, *Problèmes trouvés dans la spec*). La phrase n'a pas été corrigée dans la spec.

---

## Tests contre les scénarios

Lus un à un contre les `Given` / `When` / `Then` / `And` :

- Chaque `Then` / `And` est affirmé. Points vérifiés : la copie rendue sert la bonne bibliothèque (Bob, plus ancien mais à Primary, reste `pending` ; P2 `on_hold` en base), la copie de Primary ne sert pas Alice, la plus ancienne de Preschool est servie (dates explicites en SQL), aucune ligne `hold` après un 409 ou un 404.
- Les tests discriminent l'ancien comportement : file de toute l'école → la position vaudrait 2 et Bob serait servi ; filtre `deleted_at` absent → P2 supprimée ferait répondre 409 au lieu de 201.
- Ils pilotent les entrées de la carte des tests (endpoint réel via MockMvc, UI réelle via Playwright) ; rien n'est simulé. Les tests back sont `@Transactional` (pas de ligne durable dans `lifecycle_event`).
- Les tests n'affirment rien que la spec ne dise pas, hors le champ `reason`, qui est le contrat voulu par le plan.

---

## Tour précédent

Premier tour.
