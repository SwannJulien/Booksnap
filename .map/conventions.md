# Map conventions

Used by the `map` skill. Edit freely — these are read, not enforced.

## Output

- **Maps root**: `docs/map/`
- **Language**: English. This is the one deliberate exception to the
  `docs/` = French rule in `CLAUDE.md`: every cell in these maps is a Java or
  JavaScript identifier, a route, or a column name, and the surrounding prose
  (`Why` cells, `Gaps`) sits inches from code that is English by project rule.
  The French documentation is `docs/business-rules/` and
  `docs/implementation/` — written for people, and unaffected by this.
- **Split threshold**: 250 rows — past that, a map becomes a directory grouped
  by domain, using the same domain names as the backend packages under
  `net.booksnap.domain` (auth, book, borrowing, copy, cover, dewey, genre,
  hold, user).

## Maps

| Map | Template | Sources (globs) | Mechanical source |
|---|---|---|---|
| db | `db.md` | `server/src/main/resources/db/migration/**` | `docker exec booksnap-postgres sh -c 'pg_dump -s -U "$POSTGRES_USER" "$POSTGRES_DB"'` |
| api | `api.md` | `server/src/main/java/net/booksnap/**`, `server/src/main/resources/application*.properties` | none — no springdoc/OpenAPI dependency in `server/pom.xml`; read the controllers |
| front | `front.md` | `web/src/**`, `web/index.html`, `web/vite.config.js` | none |
| deploy | `deploy.md` | `docker-compose.yml`, `server/Dockerfile`, `web/Dockerfile`, `web/nginx.conf`, `server/scripts/**`, `.env.example`, `server/src/main/resources/application*.properties`, `server/pom.xml`, `web/package.json` | none |

Four maps, matching the four layers that actually exist here. Notes on the
globs, since Stage 1 uses them to decide what regenerates:

- **`db` is migrations only.** Flyway owns the schema; a column cannot appear
  without a `V<n>__…sql`. JPA entities are deliberately *not* a db source — they
  cannot change the schema, and `ddl-auto=validate` fails at startup if they
  disagree with it. Entity-level facts belong in `api`.
- **`api` is the whole backend source tree,** not just `**/api/**`. The
  `Tables` column is a controller → service → repository → entity → table
  resolution, so a change in a service genuinely changes the map. It also
  catches `GenreController.java`, which sits at `domain/genre/` rather than
  under an `api/` package.
- **`application*.properties` feeds both `api` and `deploy`** — the first for
  the auth and error-handling conventions, the second for configuration
  provenance. Overlap is intended.

## Seam ownership

Default skill ownership, with two project-specific notes:

- **`front` owns component → endpoint (`Calls`).** The front end reaches the API
  through two hops: a component imports from `web/src/api/*.js`, and those
  modules build their URLs from `web/src/api/api-routes.js` via
  `web/src/api/http.js`. The `Calls` column must record the resolved
  `METHOD /api/...` path, never the JS function name — otherwise it will not
  transpose against `api.md`.
- **`api` owns endpoint → table (`Tables`).** It also carries non-HTTP entry
  points as rows, currently `OverdueBorrowingScheduler`
  (`domain/borrowing/service/`) and `AdminBootstrapRunner` (`config/`). They are
  not endpoints, but they write tables, and without them `db.md`'s
  `Written by` column would claim nobody writes what they write. Mark them
  clearly as non-HTTP.
- **`db` receives everything** — `Written by` / `Read by` are pure transposes
  of `api.Tables`. Note that `copy.status` is written by database triggers, not
  by any endpoint; that belongs in the table's `Triggers` line and its `Why`,
  not in `Written by`.
- No consumer of this API lives outside the repository, so an empty
  `Called from` in `api.md` means dead, not `external`.

## Diagrams

One per map, capped at ~15 nodes, falling back to a table when it would exceed
the cap:

| Map | Diagram |
|---|---|
| db | foreign-key graph, clustered by domain (catalog / lending / identity) if it exceeds the cap |
| api | the Spring Security filter chain, from request through CSRF and session auth to `GlobalExceptionHandler` |
| front | route → view → endpoint data flow for `/catalog` — the application's central screen |
| deploy | source → compose build → the two environments (IDE dev, compose) |

## Commands that need permission

- `docker exec booksnap-postgres … pg_dump -s …` — read-only, schema only, but
  it talks to the running development database. Approved for the run of
  2026-10-18; ask again each run.
- **Never** `mvn`/`mvnw` anything: there is no Maven on PATH and no wrapper in
  `server/`. The backend runs from the IDE. A map run must not try to build it.
- **Never** `prettier --write` or `npm run format`, per `CLAUDE.md`. Maps are
  markdown and are not formatted by either.
- Do not run `server/sql/reset.sql`, or any fixture or reset script. A map run
  is read-only with respect to the database's *contents*.

## Not covered

- **Business rules.** Loan durations, hold queue policy, penalty rules — these
  are specified in French under `docs/business-rules/` and are the authority.
  The maps record the code that implements them, never the rule itself.
- **In-flight specifications.** `docs/implementation/` holds the spec/plan/build
  pipeline output, including stories not yet built. The maps record only what
  exists in the code today.
- **CI.** There is none: no `.github/`, no `.gitlab-ci.yml`. `deploy.md` covers
  the Docker Compose stack and says so in its `Gaps`.
- **Bruno API collections** (`server/API/**`). They mirror the endpoints rather
  than defining them; `api.md` is derived from the controllers. A missing
  `.bru` file is a convention gap, not a map gap.
- **The Dewey reference data** (`V2`, ~1000 rows). `db.md` records the tables,
  not their contents.
