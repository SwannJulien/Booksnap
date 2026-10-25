#!/usr/bin/env bash
#
# Drops and recreates an empty throwaway database for the end-to-end suite.
# The schema is built by Flyway when the backend starts; see run-e2e-backend.sh.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

usage() {
    cat <<'EOF2'
Usage: recreate-e2e-db.sh --database NAME

  --database NAME  Throwaway database to recreate. Required, and never the
                   container's $POSTGRES_DB.
EOF2
}

parse_common_args "$@"
require_throwaway_db

info "recreating $TARGET_DB"
# WITH (FORCE) also drops a psql session left open on the database after a failed run.
docker exec -i "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -q -v db="$TARGET_DB" -f - <<'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE);
CREATE DATABASE :"db";
SQL
ok "$TARGET_DB"
