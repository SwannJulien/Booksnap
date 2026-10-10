#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

JAR="server/target/booksnap-backend-0.0.1-SNAPSHOT.jar"
if [[ ! -f "$JAR" || ! -s web/dist/index.html ]]; then
  echo "Production artifacts are missing; run bash scripts/build-production.sh first." >&2
  exit 1
fi

for name in PGHOST PGDATABASE PGUSER PGPASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing runtime-managed PostgreSQL setting: $name" >&2
    exit 1
  fi
done

export SPRING_PROFILES_ACTIVE=production
export BOOKSNAP_API_ORIGIN="${BOOKSNAP_API_ORIGIN:-http://127.0.0.1:8080}"

cleanup() {
  trap - EXIT INT TERM
  kill "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
  wait "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

java -jar "$JAR" &
backend_pid=$!

npm run preview --prefix web -- --host 0.0.0.0 --port 5000 --strictPort &
frontend_pid=$!

# Keep the VM healthy only while both the API and frontend server are running.
wait -n "$backend_pid" "$frontend_pid"
