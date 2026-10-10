# Booksnap on Replit

The imported structure and stack are preserved: Java 17 / Spring Boot in `server/`,
Lit / Vite in `web/`, and PostgreSQL. This workspace uses a fresh Replit PostgreSQL
database, not an imported or external Booksnap database.

## Run in development

Click **Run** to start the `Booksnap` workflow, which runs
`bash scripts/start-replit.sh`. It starts the backend on port 8080 and Vite on
`0.0.0.0:5000`. Vite proxies `/api` and `/actuator/health` to the backend.
Leave `VITE_API_BASE_URL` unset so browser requests stay same-origin.

Runtimes: Node.js 24 and Java 17 (`jdk17`); Maven is available in the Java toolchain.
To reinstall frontend dependencies, run `npm ci --prefix web`.
The backend resolves Maven dependencies on its first start.

The development-only `replit` Spring profile reads the runtime-managed
`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` variables.
Flyway runs the existing migrations on the fresh development database, and
Hibernate validates the resulting schema. No Docker or `.env` files are needed.
Do not use this development profile as a production migration configuration.

## First administrator

Before the first sign-in, supply these through Replit **Secrets**:

- `BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL`
- `BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters)

Restart the workflow to create the administrator. The existing bootstrap logic
only runs while no administrator exists. Optional first and last name variables
are described in `server/README.md`.

After signing in, change the password through **My account**, remove the two
bootstrap secrets, and restart. Keep `SECURITY_LOCKDOWN_ENABLED` enabled (the
default); never disable security to make setup easier.

Sessions use secure, HTTP-only cookies because Replit preview is served over
HTTPS. Backend restarts invalidate existing sessions.

## Publish to production

The Booksnap VM deployment builds from both project subdirectories with
`bash scripts/build-production.sh`, then runs `bash scripts/start-production.sh`.
It packages Spring Boot and the built Vite frontend; Vite serves the built site
on port 5000 and proxies `/api` to the private backend on port 8080.
The production Spring profile reads the managed production `PG*` variables,
requires Hibernate schema validation, uses secure session cookies, and leaves
production schema changes to Replit Publish instead of running Flyway there.
The VM is intentional: it keeps the in-memory sign-in sessions and the nightly
overdue-loan scheduler running in one process. Restarting the VM still signs
users out.

The previous published build looked for a root `package.json` and failed before
building the app. A minimal root npm manifest now lets Replit's package-install
step complete; actual web dependencies remain in `web/`. The deployment target
is configured as an always-on VM for the next publish.

The development database has the schema, Dewey reference data and initial
administrator, but no books, copies, or loans. The repository includes optional
fictional development fixtures in `server/sql/seed.sql`; they are not loaded
automatically. The production database currently has no Booksnap tables because
the published build failed before schema application. On the next successful
publish, Replit applies the schema diff. Use its data-copy option only if you
intend to copy the current development rows; never overwrite production data
from development after production contains live records.

## Checks

- Frontend production build: `npm run build --prefix web`
- Production bundle and backend package: `bash scripts/build-production.sh`
- Backend tests: `cd server && mvn test` (requires PostgreSQL per `server/README.md`)
- Health endpoint: `/actuator/health` through the preview
- Without a session, protected API endpoints should return HTTP 401.
