#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
postgres_test_image="${MONIKEY_TEST_POSTGRES_IMAGE:-postgres:17.6-alpine}"
test_container="monikey-api-test-$$"
venv_python="$script_dir/.venv/bin/python"
venv_pytest="$script_dir/.venv/bin/pytest"

cleanup() {
  docker rm --force "$test_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ ! -x "$venv_pytest" ]]; then
  printf 'Backend test environment is missing. Create it with:\n'
  printf '  python3 -m venv backend/.venv\n'
  printf '  backend/.venv/bin/pip install -r backend/requirements-dev.txt\n'
  exit 1
fi

docker run --detach \
  --name "$test_container" \
  --env POSTGRES_DB=monikey_test \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --publish 127.0.0.1::5432 \
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

run_sql_file "$repo_root/database/001_init.sql"
run_sql_file "$repo_root/database/seed.sql"

port_mapping="$(docker port "$test_container" 5432/tcp | head -n 1)"
test_port="${port_mapping##*:}"
export DATABASE_URL="postgresql://postgres@127.0.0.1:${test_port}/monikey_test"

cd "$script_dir"
"$venv_python" -m pytest -q tests
