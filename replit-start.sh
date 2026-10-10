#!/usr/bin/env bash
set -e

# --- Base de données ---
# Par défaut : Postgres intégré de Replit (variables PG*).
# Pour une base externe (Neon, Supabase...), définis DB_HOST, DB_PORT,
# POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB dans les Secrets : ils priment.
export DB_HOST="${DB_HOST:-$PGHOST}"
export DB_PORT="${DB_PORT:-${PGPORT:-5432}}"
export POSTGRES_USER="${POSTGRES_USER:-$PGUSER}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$PGPASSWORD}"
export POSTGRES_DB="${POSTGRES_DB:-$PGDATABASE}"

# --- URL publique du back, injectée dans le front ---
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://${REPLIT_DEV_DOMAIN}:8080}"

# --- Back : Flyway crée le schéma au démarrage ---
(cd server && mvn -q spring-boot:run) &

# --- Front : serveur de dev Vite ---
(cd web && npm install && npm run dev -- --host 0.0.0.0 --port 3000) &

wait
