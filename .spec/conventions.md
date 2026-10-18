# Spec conventions

Used by the `spec`, `spec-plan` and `spec-implement` skills. Edit freely — these
are read, not enforced.

## Documents

- **Language**: French (all documents under `docs/` are in French)
- **Specs root**: `docs/implementation/` — one folder per feature,
  `<slug>/README.md` + `US-NN-<slug>.md`
- **Numbering**: per feature folder, from `US-01`
  - *Exception, already on disk*: the `authentication-system/` plan numbers its
    stories globally `US-001`…`US-027` across phase sub-folders. That plan keeps
    its own scheme; new feature folders use `US-01`.
- **Code language**: English — identifiers, comments, Javadoc, JSDoc, commit
  messages and log lines. French lives in `docs/` only, and a French spec never
  carries French comments into the code it describes (`.claude/CLAUDE.md`).

## Layers

| Layer | Where |
|---|---|
| `db` | `server/src/main/resources/db/migration/` (Flyway) |
| `back` | `server/src/main/java/net/booksnap/` — `domain/<entity>/{api,api/dto,mapper,repository,service}`, `exception/<entity>/`, `config/` |
| `front` | `web/src/` — `features/<domain>/<component>/`, `components/`, `views/`, `api/` |

## How a change is verified

- **Automated tests**: `server/src/test/java/…` holds 5 JUnit classes (auth,
  auditing, the authorization matrix). There is **no test suite on the front
  end, none on books/copies/borrowings/holds, and no way to run Maven from the
  shell** — no `mvnw`, no Maven on PATH. Backend tests are run from the IDE.
  Treat the end-to-end walkthrough as the real check.
- **Lint**: `npm run lint` in `web/` (eslint + `prettier --check`). Several
  files carry pre-existing `class-methods-use-this` errors and ~12 files already
  fail `prettier --check` — check whether a failure is yours before fixing it.
- **HTTP collection**: Bruno, `server/API/<Controller>/*.bru`, one file per
  endpoint. A new endpoint requires a new file.
- **Database**:
  ```bash
  docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ```
- **Running the app**:
  - Database: `docker compose up -d db`.
  - Backend: **from the IDE only** — never from the shell, never from the
    `backend` container. Flyway migrations are applied by that startup.
  - Frontend: `npm run dev` in `web/` (Vite).
- **Fixtures**: `server/scripts/load-dev-fixtures.sh` (loads `seed.sql` then
  `covers.sql`), `server/scripts/reset-dev-db.sh` (empties the business tables,
  reloads Dewey and the fixtures). Both take `--database NAME` and `--yes`.
  **Never run `server/sql/reset.sql` on its own** — it truncates the Dewey
  tables that Flyway will not repopulate.

## Schema changes

Flyway owns the schema. Migrations are `server/src/main/resources/db/migration/V<n>__<description>.sql`,
applied at backend startup (i.e. from the IDE). Current head: `V8`.

- **Never edit an applied migration** — Flyway checksums them and refuses to
  start. Corrections are new migrations.
- `spring.jpa.hibernate.ddl-auto=validate`: Hibernate never writes to the
  schema. A validation error at startup means entity and schema disagree — fix
  it with a migration, never by switching back to `update`.
- `V1` was generated from the **live** database, not from `schema.sql`. Check
  the real column type before relying on it.

## Hazards to carry into every spec

- `.claude/CLAUDE.md` — the canonical list. In particular `?stringtype=unspecified`
  in the JDBC URL (case-insensitive `citext` lookups break silently without it),
  and the `sharedStyles`-last CSS specificity trap in Lit components.
- `docs/business-rules/REGLES-METIER-STRUCTURE.md` — foreign keys, cascades,
  unique indexes and triggers. §2 deletion of a book/copy, §5 `copy.status` is
  owned by database triggers, §8 audit columns are not foreign keys.
- `docs/business-rules/REGLES-METIER-ACCES.md` — the three roles, library scope,
  and the endpoint permission matrix implemented in `config/SecurityConfig.java`.
- `docs/business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md` — borrowing and
  hold lifecycle.
- `copy.status` is written by database triggers, not by application code. After
  a write that fires one, `saveAndFlush(...)` then `entityManager.refresh(copy)`;
  when several such writes share a transaction, flush order decides the final
  status.

## Tooling that needs permission

- **Never run `prettier --write`** or `npm run format`. `package.json` pins
  `prettier` differently from how the repo was formatted; running it rewrites
  untouched lines across the repo. `prettier --check` is fine.
- **Never install Playwright or launch a headless browser** without asking —
  not a project dependency, ~115MB of Chromium.
- Never run Maven or try to build/run the backend from the shell; ask instead.
