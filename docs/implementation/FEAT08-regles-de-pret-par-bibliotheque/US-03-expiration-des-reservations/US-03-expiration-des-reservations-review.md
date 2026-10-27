# US-03 — Revue

[← Spec](US-03-expiration-des-reservations-spec.md) · [← Plan](US-03-expiration-des-reservations-plan.md) · [← Feature](../README.md)

| | |
|---|---|
| **Tour** | 1 — 2026-10-27 |
| **Diff relue** | arbre de travail (sale) contre `03b4320`, fichiers non suivis compris (`HoldExpirationScheduler.java`, `HoldExpirationTest.java`, `HoldExpirationSchedulerTest.java`). `docs/implementation` et `.claude/CLAUDE.md` sont ignorés par git : relus directement, hors diff. |
| **Fichiers hors story** | aucun — les 10 entrées de `git status` s'attribuent aux étapes 1–5 du plan ou à sa carte des tests |
| **Verdict** | retour à build — 1 bloquant |

> La revue écrit les constats ; build renseigne **Statut** en y répondant, et le
> tour suivant les vérifie. Rien d'autre dans ce document n'est modifié par build.

---

## Critères décochés

Aucun. Chaque critère coché a été vérifié, y compris celui du test qui, lui, est faible (B1) :

- **Planifié chaque nuit et exécuté au démarrage** — `HoldExpirationScheduler.java:30-31` porte `@Scheduled(cron = "0 5 0 * * *")` et `@EventListener(ApplicationReadyEvent.class)`, même cron que `OverdueBorrowingScheduler`. Le test « startup catches up missed days » publie un vrai `ApplicationReadyEvent` : la réservation passe `expired`.
- **Écritures en `SYSTEM_AUDITOR`** — `HoldExpirationTest` : la réservation de mise en place porte `last_modified_by = 'librarian@booksnap.net'`, puis `system` après le traitement (réservation expirée et réservation promue de Chloé). L'assertion est falsifiable.
- **Une expiration qui échoue n'empêche pas le démarrage, `ERROR` avec l'identifiant** — le code tient : `try/catch (RuntimeException)` autour de chaque `expireHold` (`:38-45`), la classe et la méthode ne sont **pas** `@Transactional` (grep sur les annotations : aucune), `expireHold` est appelé sur le bean `HoldService` injecté. Le *test* de ce critère est en revanche faux sur un point (B1).
- **`INFO` du nombre, seulement s'il est non nul** — `:46-48` ; le test unitaire vérifie l'absence de « hold(s) expired » avec une liste vide et « 2 hold(s) expired » avec deux `true`. Ligne réelle relevée dans le rapport surefire : `… HoldExpirationScheduler : 2 hold(s) expired`.
- **Règles emprunts §4 et §8** — diff lue : §4 sépare `active → expired` (branchée, lendemain de `end_date`, 00:05 et démarrage, `system`, file de la bibliothèque de la copie) et `pending → expired` (toujours ⚠️) ; l'astérisque de `active --> expired` est retiré, pas celui de `pending --> expired` ; §8 déplace l'expiration `active` dans *Implémenté* et ne garde que `pending` sous *pas encore automatisé* et dans le tableau.
- **Critères permanents** — voir le tableau ci-dessous. 11 scénarios : 10 en intégration back (`HoldExpirationTest`, 10 tests), 1 en bout en bout (`holds.spec.js`) ; chacun a un `@DisplayName` / titre `US-03: …`. Les deux tests unitaires de critères n'ont pas le préfixe, comme le plan le demande.

## Lint et tests

| Niveau | Commande | Résultat |
|---|---|---|
| lint | `npm run lint` (web/) | 9 erreurs, 9 avertissements — **aucun dans un fichier de la story** (`npx eslint` sur `loan-modal-bks`, `copy-status-modal-bks` et `holds.spec.js` : propre). Les erreurs sont les `class-methods-use-this` et `import/no-extraneous-dependencies` d'autres fichiers. `prettier --check` signale 11 fichiers dont `loan-modal-bks.js` : à `HEAD` il échoue déjà de la même façon (version de `HEAD` passée par `--stdin-filepath`) ; `holds.spec.js` et `copy-status-modal-bks.js` passent. |
| back (unitaire + intégration) | `./mvnw -q test` (server/) | 150 / 150 passés (0 échec, 0 erreur, 0 ignoré), dont `HoldExpirationTest` 10 / 10 et `HoldExpirationSchedulerTest` 2 / 2 ; le contexte démarre avec `ddl-auto=validate` |
| bout en bout | `npm run test:e2e` (web/) | 85 / 85 passés, dont `US-03: the loan modal announces the last pickup day` ; `:8180` et `:5180` libres ensuite |

Les deux commandes ont été lancées l'une après l'autre (pas en parallèle : elles reconstruisent toutes deux `server/target`). La base de développement n'avait aucune réservation `active` échue avant la passe (`SELECT count(*) … end_date < current_date` → 0) : le démarrage du contexte de test n'y a rien expiré ni journalisé. `:5000` (Vite de l'utilisateur) n'a pas été touché.

---

## Constats

### Bloquants

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| B1 | `server/src/test/java/net/booksnap/domain/hold/service/HoldExpirationSchedulerTest.java:41-52` | Le test « a failing expiry does not stop the others and is logged » passe sans prouver ce qu'il annonce. (1) Seul `expireHold(2L)` est stubbé ; `MockitoExtension` est strict, donc `expireHold(1L)` et `expireHold(3L)` **lèvent `PotentialStubbingProblem`**, que le planificateur attrape comme n'importe quelle `RuntimeException`. Le rapport surefire (`TEST-…HoldExpirationSchedulerTest.xml`, lignes 67 et 161) contient `ERROR … Could not expire hold 1` (avec `PotentialStubbingProblem`), puis `… hold 2` (avec `boom`). Les deux autres réservations ne sont donc pas expirées avec succès : elles sont seulement *tentées*, et `verify(...)` ne voit que l'appel. (2) `assertThat(output.getAll()).contains("ERROR").contains("2")` : `"2"` figure dans chaque horodatage (`2026-10-27T…`) ; l'assertion ne prouve pas que l'identifiant `2` est journalisé — retirer `holdId` du message la laisserait verte. | Critère « une expiration qui échoue n'empêche pas le backend de démarrer, et est journalisée en `ERROR` avec l'identifiant de la réservation » ; carte des tests du plan (ligne *(critère)*) | fixed — le test stubbe désormais `expireHold(1L)` et `expireHold(3L)` à `true` (plus de `PotentialStubbingProblem`), isole l'unique ligne `ERROR`, en retire le préfixe horodaté et exige que son message contienne `\b2\b` et aucun `\b[13]\b`, puis vérifie « 2 hold(s) expired ». Mutation vérifiée : retirer `holdId` du message fait échouer l'assertion (le code de production est restauré). |

### À corriger

| # | Où | Constat | Jugé contre | Statut |
|---|---|---|---|---|
| — | — | aucun | — | — |

### Notes

- **N1** — `docs/business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md:298` donne encore la fenêtre de retrait à « **1 semaine** » dans `BorrowingServiceImpl.HOLD_PICKUP_WINDOW_WEEKS`. Faux depuis US-01 (fenêtre par bibliothèque, constante supprimée), et ce n'est pas la story : le diff ne touche pas cette ligne. **Corrigé après la revue** à la demande de l'utilisateur : les deux lignes du tableau (durée d'emprunt, fenêtre de retrait) pointent maintenant vers `library.borrowing_duration_days` / `library.pickup_window_days`.
- **N2** — Course théorique dans `HoldServiceImpl.expireHold:166-182` : `Hold` n'a pas de `@Version` et le `UPDATE` ne garde pas sur le statut. Si un prêt qui honore la réservation (`active → fulfilled`) est validé entre le `findById` d'`expireHold` et son `saveAndFlush`, la réservation est réécrite `expired` alors que l'emprunt existe (la copie reste `borrowed`, rien n'est promu). Fenêtre de quelques millisecondes, au démarrage du backend ou à 00:05 ; même absence de verrou que `returnBorrowing`. Rien à faire dans la story ; noté dans `NOTES.md` pour l'expiration `pending`, qui réutilisera `expireHold`.
- **N3** — `expiryIsLoggedUnderTheSystem` ne distingue pas « acteur `system` posé » de « aucun acteur posé » : `fn_lifecycle_actor()` retombe sur `system` dans les deux cas, et la transaction du test commence avant toute requête MockMvc. Le scénario de la spec est bien couvert ; c'est la limite du niveau (pas un constat).
- **N4** — Le README de la feature (« Points de vigilance connus », `README.md:123`) situe encore `HOLD_PICKUP_WINDOW_WEEKS` dans `HoldServiceImpl.java:38` : la constante n'existe plus nulle part dans `server/src` depuis US-01. **Corrigé après la revue** à la demande de l'utilisateur : `README.md:123` dit que la constante a disparu et renvoie à `library.pickup_window_days`.

### Problèmes de spec

- **P1** — La spec (*Points de vigilance*, dernier point) dit que « l'acteur `system` vient de l'absence de `booksnap.actor` ». `NOTES.md` (entrée de build US-03) établit déjà que c'est `ActorAwareJpaTransactionManager.doBegin` qui le pose. À amender, comme le plan le proposait (*À promouvoir dans la spec*) ; aucune incidence sur le code.

---

## Tour précédent

Premier tour.
