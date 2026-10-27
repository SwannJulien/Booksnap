#!/usr/bin/env bash
# Shared functions for the scripts in server/scripts/.
# Not meant to be run directly.

set -euo pipefail

CONTAINER="${BOOKSNAP_CONTAINER:-booksnap-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../sql"
MIGRATION_DIR="$SCRIPT_DIR/../src/main/resources/db/migration"

# Target database. Defaults to $POSTGRES_DB as defined in the container; can be
# overridden with --database to work on a throwaway database.
TARGET_DB=""
PG_USER=""

die() { printf '\033[31merror\033[0m: %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m•\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }

parse_common_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --database) TARGET_DB="${2:-}"; [ -n "$TARGET_DB" ] || die "--database expects a name"; shift 2 ;;
            --database=*) TARGET_DB="${1#*=}"; shift ;;
            --yes|-y) ASSUME_YES=1; shift ;;
            -h|--help) usage; exit 0 ;;
            *) die "unknown argument: $1 (see --help)" ;;
        esac
    done
}

require_container() {
    docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
        || die "container $CONTAINER is not running. Start it with: docker compose up -d db"

    # Credentials are read from the container's environment: no need to parse
    # .env from the host, and no password to handle (psql local to the container
    # goes through local trust).
    PG_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
    [ -n "$PG_USER" ] || die "POSTGRES_USER missing from the environment of $CONTAINER"
    if [ -z "$TARGET_DB" ]; then
        TARGET_DB="$(docker exec "$CONTAINER" printenv POSTGRES_DB)"
        [ -n "$TARGET_DB" ] || die "POSTGRES_DB missing from the environment of $CONTAINER"
    fi
}

# Like require_container, for scripts that must never act on the development
# database: --database is mandatory and may not name the container's $POSTGRES_DB.
require_throwaway_db() {
    [ -n "$TARGET_DB" ] || die "--database is required: this script never targets the container's default database"
    require_container
    [ "$TARGET_DB" != "$(docker exec "$CONTAINER" printenv POSTGRES_DB)" ] \
        || die "$TARGET_DB is the development database; this script only works on a throwaway one"
}

# psql on the target database. Arguments are passed straight to psql, with no
# intermediate shell: the SQL may contain parentheses, quotes and $$ without
# any special care.
db_exec() {
    docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 "$@"
}

# Runs a SQL file from the host without mounting it into the container.
db_run_file() {
    local file="$1"
    [ -f "$file" ] || die "file not found: $file"
    db_exec -q -f - < "$file"
}

db_scalar() { db_exec -Atc "$1"; }

require_schema() {
    local n
    n="$(db_scalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='book'")"
    [ "$n" = "1" ] || die "table 'book' does not exist in database $TARGET_DB.
  The schema belongs to Flyway and is built when the backend starts.
  Start the backend from the IDE, then run this script again."
}

print_counts() {
    db_exec -c "SELECT
        (SELECT count(*) FROM book)            AS books,
        (SELECT count(*) FROM copy)            AS copies,
        (SELECT count(*) FROM author)          AS authors,
        (SELECT count(*) FROM genre)           AS genres,
        (SELECT count(*) FROM users)           AS users,
        (SELECT count(*) FROM cover)           AS covers,
        (SELECT count(*) FROM dewey_category)  AS dewey;"
}

confirm() {
    [ "${ASSUME_YES:-0}" = "1" ] && return 0
    printf '\033[33m⚠\033[0m  %s\n' "$1"
    printf '   Database: %s (container %s)\n' "$TARGET_DB" "$CONTAINER"
    printf '   Type "yes" to continue: '
    local answer; read -r answer
    [ "$answer" = "yes" ] || die "cancelled"
}
