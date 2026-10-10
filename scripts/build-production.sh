#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --prefix web
VITE_API_BASE_URL= npm run build --prefix web
mvn -B -f server/pom.xml -DskipTests package
