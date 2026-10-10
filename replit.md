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

## Checks

- Frontend production build: `npm run build --prefix web`
- Backend tests: `cd server && mvn test` (requires PostgreSQL per `server/README.md`)
- Health endpoint: `/actuator/health` through the preview
- Without a session, protected API endpoints should return HTTP 401.
