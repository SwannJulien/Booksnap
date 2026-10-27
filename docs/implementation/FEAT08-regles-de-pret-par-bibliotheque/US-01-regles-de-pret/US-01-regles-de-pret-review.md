# US-01 — Revue

[← Spec](US-01-regles-de-pret-spec.md) · [← Plan](US-01-regles-de-pret-plan.md) · [← Feature](../README.md)

| | |
|---|---|
| **Round** | 1 — 2026-10-27 |
| **Diff reviewed** | arbre de travail (sale) contre `8498337fe6c349e42004a9150073b5f056abb5f7` : 15 fichiers suivis modifiés + fichiers non suivis (migration `V12`, deux DTO, deux `.bru`, `LoanRulesTest`, `LoanDatesTest`, `loan-rules.spec.js`, composant `loan-rules-section-bks/`) |
| **Files outside the story** | `docs/GLOSSARY.md` (+37 lignes : Copy, Loan, Hold, Borrowing duration, Pickup window, Loan rules). Le README de la feature y renvoie : c'est très probablement le travail de l'étape `spec`, pas de build. Non revu comme code de la story ; à confirmer par l'utilisateur. |
| **Verdict** | ready for walkthrough — 0 blocking |

> Review writes the findings; build fills **Status** when it answers them, and
> the next round checks them. Nothing else in this document is edited by build.

---

## Criteria unticked

Aucun. Chaque critère coché a été vérifié :

- **Migration `V12`** — `flyway_schema_history` : versions 11 → 12, `success = t` ; `SELECT … FROM library` → Preschool et Primary à 14 / 7 ; `CHECK` nommés, refusés à 0 et 366 par `LoanRulesTest` ; commentaires en anglais ; `V1`–`V11` non modifiées (aucun fichier de migration existant dans le diff).
- **Création par `POST`** — `LibraryServiceImpl.create` inchangé côté requête (`{ name }`) ; le test e2e « a created library starts at 14 and 7 days » passe, sans rechargement.
- **Constantes supprimées** — `grep plusWeeks|plusDays|WEEKS` dans `server/src/main` : seules les deux lignes `plusDays(copy.getLibrary()…)` ; aucune durée en dur dans `web/src` hors du composant.
- **Endpoints et sécurité** — `LoanRulesTest` (200/400/404/403), `ApiAuthorizationMatrixTest` (37 lignes, `STAFF` / `ADMIN_ONLY`), règles dans le groupe « Libraries » de `SecurityConfig`.
- **Composant, textes, `.bru`, règles métier** — lus contre le texte verbatim de la spec : conformes (titre, sous-titre, « Edit loan rules », « Loan » / « Pickup » / « days », « Save » / « Cancel », les trois messages). `docs/business-rules/REGLES-METIER-PARAMETRES.md` §1, §2, §3.1, §5 réécrites comme demandé.
- **Un test par scénario** — les 19 scénarios ont un test `US-01: …` (les exemples du scénario « hors bornes » sont un test par exemple, côté front comme côté API).

## Lint and tests

| Level | Command | Result |
|---|---|---|
| lint (fichiers de la story) | `npx eslint src/features/library src/views/settings-view src/api/library.js test/e2e/loan-rules.spec.js` | 0 erreur, 0 avertissement |
| lint (repo) | `npm run lint` dans `web/` | 9 erreurs, 9 avertissements, **tous dans des fichiers hors story** (`book-table-bks`, `create-book-bks`, `copy-qr-modal-bks`, `copy-table-bks`, `barcode-scanner-bks`, `scan-qrcode-view`) — `class-methods-use-this` préexistants et `@zxing/library` |
| format | `npx prettier --check` sur les fichiers de la story | conformes. `--check` global : 11 fichiers signalés, aucun de la story (le problème Prettier 3.9.5 connu) |
| back (unitaires + intégration) | `./mvnw -q test` depuis `server/` | 128 tests, 0 échec, 0 erreur, 0 ignoré (exit 0) |
| end-to-end | `npm run test:e2e` dans `web/` | 78 passés, 0 échec (exit 0) |

Aucun backend n'occupait `:8080` ; l'e2e a démarré le sien (`:8180`). La base de développement est restée à 14 / 7 pour les deux bibliothèques.

---

## Findings

Lecture des tests contre les `Then` / `And` : chaque scénario est affirmé jusqu'au bout (valeurs rechargées après `reload()`, état en base pour « rien n'est enregistré » et pour les `400`, `403` avec `csrf()` pour que le refus vienne bien de l'autorisation, échéance et date limite relues en base après le `PUT` pour les deux scénarios de gel). Aucun test ne s'appuie sur un détail privé. Aucun finding bloquant.

### Blocking

| # | Where | Finding | Judged against | Status |
|---|---|---|---|---|
| — | — | Aucun | — | — |

### Should fix

| # | Where | Finding | Judged against | Status |
|---|---|---|---|---|
| S1 | `server/src/main/java/net/booksnap/domain/library/Library.java:25-29` ; `LibraryServiceImpl.java:21-30,47-50` | Le plan retenait `@Generated(event = EventType.INSERT)` sur les deux champs (« première entité du projet à utiliser `@Generated` ») et rejetait explicitement les alternatives. Le diff fait autre chose : `insertable = false` sur la colonne, plus un `entityManager.refresh(library)` dans `create`, ce qui ajoute une dépendance `EntityManager` à `LibraryServiceImpl` et une requête de relecture. Départ non listé dans « Choix de conception ». Conséquence : la relecture des défauts dépend de ce seul appel ; une autre insertion de `Library` par JPA laisserait des `null` dans l'entité. À ma lecture, aucun test n'exerce ce `refresh` (la création est vérifiée par une lecture ultérieure, dans une autre transaction) — je ne l'ai pas démontré en le retirant. | Plan, « Choix de conception », 2ᵉ puce ; étape 2 | open |

### Notes

- **N1** — `docs/business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md:280-281` cite encore `BorrowingServiceImpl.BORROWING_DURATION_WEEKS` / `HOLD_PICKUP_WINDOW_WEEKS` et « 2 semaines » / « 1 semaine » comme valeurs courantes. Hors critères de la story (seule la page « paramètres » y figure), mais désormais faux. Même chose, en documentation historique, dans `docs/implementation/authentication-system/` et `docs/todo.md`.
- **N2** — `docs/GLOSSARY.md` : les ajouts (dont la définition de *Hold* « at one library », qui relève d'US-02) ne sont pas dans le périmètre de build. À valider avec l'utilisateur comme sortie de l'étape `spec`.
- **N3** — Le plan prévoit que `LoanDatesTest` règle les durées en SQL avant la première requête, à cause du cache de l'`EntityManager` partagé. C'est fait ainsi ; si un test futur ajoute un `UPDATE library` après une requête, il lira l'ancienne valeur sans erreur.
- **N4** — Le `REGLES-METIER-PARAMETRES.md` est resté cohérent avec la story, mais §3.2 et §6 parlent toujours de « durée de vie `pending` ≥ fenêtre de retrait » sans que cette contrainte croisée existe (la spec la rejette : « sans contrainte croisée »). Pour US-03, pas pour cette story.

### Spec problems

Aucun. Observation sans conséquence : l'API refuse `14.0` (un flottant) alors que « entier » pourrait le laisser passer ; la spec ne donne que `1.5` en exemple et le message dit « whole numbers ».

---

## Previous round

Premier tour.

| # | Status now | Evidence |
|---|---|---|
| | | |
