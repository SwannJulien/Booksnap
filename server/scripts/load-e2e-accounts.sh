#!/usr/bin/env bash
#
# Gives the three fixture accounts of the end-to-end suite their role and a
# password, in a throwaway database that already holds the fixtures.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

usage() {
    cat <<'EOF2'
Usage: BOOKSNAP_E2E_PASSWORD=SECRET load-e2e-accounts.sh --database NAME

  --database NAME  Throwaway database. Required, and never the container's
                   $POSTGRES_DB.
EOF2
}

parse_common_args "$@"
require_throwaway_db
require_schema
[ -n "${BOOKSNAP_E2E_PASSWORD:-}" ] || die "BOOKSNAP_E2E_PASSWORD is required"

db_exec -q -v password="$BOOKSNAP_E2E_PASSWORD" -f - < "$SQL_DIR/e2e-accounts.sql"

accounts="$(db_scalar "SELECT count(*) FROM auth_identity WHERE provider = 'local'")"
[ "$accounts" = "3" ] || die "expected 3 local accounts in $TARGET_DB, found $accounts: did seed.sql change?"
ok "3 accounts in $TARGET_DB"
