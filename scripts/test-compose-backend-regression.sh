#!/usr/bin/env bash
# Run the backend's real-PostgreSQL regression suite against the database in
# the active Compose deployment without letting the live worker consume test
# outbox rows. This is deliberately a release-validation helper, not an app
# runtime path: the worker is restored to its prior state on every exit.
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and configure the Compose stack first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set in .env." >&2
  exit 1
fi

db_container_id="$(docker compose ps --status running -q db)"
if [[ -z "$db_container_id" ]]; then
  echo "Compose database is not running. Start the production-like stack first." >&2
  exit 1
fi

db_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$db_container_id")"
if [[ -z "$db_ip" ]]; then
  echo "Could not resolve the Compose database container address." >&2
  exit 1
fi

test_database_url="${DATABASE_URL//@db:/@$db_ip:}"
if [[ "$test_database_url" == "$DATABASE_URL" ]]; then
  echo "DATABASE_URL must use the Compose db hostname (for example, ...@db:5432/...)." >&2
  exit 1
fi

worker_was_running=0
worker_container_id="$(docker compose ps --status running -q worker)"
if [[ -n "$worker_container_id" ]]; then
  worker_was_running=1
  docker compose stop worker
fi

restore_worker() {
  if [[ "$worker_was_running" -eq 1 ]]; then
    # Start the same container directly so Compose does not re-run the
    # one-shot migration dependency after the regression suite completes.
    docker start "$worker_container_id" >/dev/null
  fi
}
trap restore_worker EXIT INT TERM

DATABASE_URL="$test_database_url" TEST_DATABASE_URL="$test_database_url" npm --prefix backend test
