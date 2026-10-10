#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d web/node_modules ]]; then
  npm ci --prefix web
fi

cleanup() {
  trap - EXIT INT TERM
  kill "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
  wait "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  cd server
  exec mvn spring-boot:run -Dspring-boot.run.profiles=replit
) &
backend_pid=$!

(
  cd web
  exec npm run dev
) &
frontend_pid=$!

# Stop both services if either one exits, rather than leaving a broken preview.
wait -n "$backend_pid" "$frontend_pid"
