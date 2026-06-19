#!/usr/bin/env bash
# Run all agent LTM migrations against postgres-agents (port 5438).
# Safe to re-run — all statements use IF NOT EXISTS.
# Prerequisites: docker compose up -d postgres-agents
set -e

PGPASSWORD=postgres
export PGPASSWORD

HOST="${AGENT_DB_HOST:-localhost}"
PORT="${AGENT_DB_PORT:-5438}"
USER="postgres"
DB="agent_ltm"

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../../agents/migrations" && pwd)"

echo "Running agent LTM migrations on $HOST:$PORT/$DB ..."

for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  -> $(basename "$f")"
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -f "$f"
done

echo "All migrations complete."
