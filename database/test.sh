#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
postgres_test_image="${MONIKEY_TEST_POSTGRES_IMAGE:-postgres:17.6-alpine}"
test_container="monikey-db-test-$$"

cleanup() {
  docker rm --force "$test_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach \
  --name "$test_container" \
  --env POSTGRES_DB=monikey_test \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  "$postgres_test_image" >/dev/null

ready=false
for attempt in {1..30}; do
  if docker exec "$test_container" pg_isready --username=postgres --dbname=monikey_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != true ]]; then
  docker logs "$test_container"
  exit 1
fi

run_sql_file() {
  docker exec --interactive "$test_container" \
    psql --set=ON_ERROR_STOP=1 --username=postgres --dbname=monikey_test < "$1"
}

run_sql_file "$script_dir/001_init.sql"
run_sql_file "$script_dir/seed.sql"
run_sql_file "$script_dir/seed.sql"
run_sql_file "$script_dir/tests/accounting.sql"
