#!/usr/bin/env bash
#
# Recreates the throwaway database, then runs the backend on it in the foreground.
# Started by the Playwright config; BOOKSNAP_E2E_BACKEND_PORT sets the port.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

usage() {
    cat <<'EOF2'
Usage: BOOKSNAP_E2E_BACKEND_PORT=PORT run-e2e-backend.sh --database NAME

  --database NAME  Throwaway database. Required, and never the container's
                   $POSTGRES_DB.
EOF2
}

parse_common_args "$@"
require_throwaway_db
[ -n "${BOOKSNAP_E2E_BACKEND_PORT:-}" ] || die "BOOKSNAP_E2E_BACKEND_PORT is required"

"$SCRIPT_DIR/recreate-e2e-db.sh" --database "$TARGET_DB"

# Command-line arguments outrank server/.env, which spring-dotenv reads from the
# working directory. The admin bootstrap is disabled because the fixtures bring
# their own accounts; CORS is disabled because the Vite proxy is same-origin.
cd "$SCRIPT_DIR/.."
exec ./mvnw -q spring-boot:run \
    -Dspring-boot.run.arguments="--server.port=$BOOKSNAP_E2E_BACKEND_PORT --POSTGRES_DB=$TARGET_DB --booksnap.cors.allowed-origins= --booksnap.bootstrap.admin.email="
