# Règles de prêt par bibliothèque — notes

- **`hold` rejects `start_date > end_date`, so backdating a hold's `end_date` alone fails when it was promoted today**
  `server/src/main/resources/db/migration/V1__baseline_schema.sql`, constraint `hold_check`.
  Found: build US-03, 2026-10-27. Affects: any test or walkthrough that makes an `active` hold overdue with `UPDATE hold SET end_date = current_date - 1` (as US-03's walkthrough step 1 is written): set `start_date = current_date - 8` in the same statement.

- **The `system` actor in a scheduled task comes from `ActorAwareJpaTransactionManager`, not from the absence of `booksnap.actor`**
  `server/src/main/java/net/booksnap/config/ActorAwareJpaTransactionManager.java` (`doBegin` sets `booksnap.actor` to `Auditable.SYSTEM_AUDITOR` when the thread has no authentication).
  Found: build US-03, 2026-10-27. Affects: a test that calls `set_config('booksnap.actor', …)` inside its own transaction before running a scheduler makes the scheduler's writes inherit that actor.

- **`HoldExpirationScheduler` must stay non-`@Transactional`, and call `HoldService.expireHold` through the injected bean**
  `server/src/main/java/net/booksnap/domain/hold/service/HoldExpirationScheduler.java`. `OverdueBorrowingScheduler` is `@Transactional`; copying that here would join every `expireHold` into one transaction.
  Found: build US-03, 2026-10-27. Affects: the `pending` lifetime story (out of this feature) should expire through `expireHold` too, and a failing hold would roll back the whole batch — and an exception escaping an `ApplicationReadyEvent` listener stops Spring Boot from starting.

- **`server/scripts/run-e2e-backend.sh` starts the backend with `spring-boot:run`, which compiles the test sources**
  `server/scripts/run-e2e-backend.sh:27`.
  Found: build US-03, 2026-10-27. Affects: while back tests that reference a not-yet-written class do not compile, `npm run test:e2e` cannot start its backend; the red-phase e2e run needs those test files moved aside temporarily.

- **Booting the test context runs the schedulers for real against the development database**
  `HoldExpirationScheduler` and `OverdueBorrowingScheduler` are `ApplicationReadyEvent` listeners; `@SpringBootTest` publishes it.
  Found: build US-03, 2026-10-27. Affects: after US-03, running the back suite commits the expiry (and its append-only `lifecycle_event` rows) of every overdue `active` hold already in the dev database.

- **`Hold` has no `@Version` and `HoldServiceImpl.expireHold` writes the whole row, so a hold fulfilled between its `findById` and its `saveAndFlush` is overwritten as `expired`**
  `server/src/main/java/net/booksnap/domain/hold/Hold.java` (no version column), `HoldServiceImpl.java` (`expireHold`, `findById` then `saveAndFlush`). Window of milliseconds, at startup or 00:05; `returnBorrowing` has the same lack of lock.
  Found: review US-03, 2026-10-27. Affects: the `pending` lifetime story reusing `expireHold` — add a status guard or a lock there rather than assume the re-read in `expireHold` is atomic.
