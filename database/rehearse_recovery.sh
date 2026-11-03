#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
postgres_test_image="${MONIKEY_TEST_POSTGRES_IMAGE:-postgres:17.6-alpine}"
test_container="monikey-kakeibo-recovery-$$"
source_db="monikey_prior_schema"
restore_db="monikey_backup_restore"
migration_db="monikey_migration_copy"

cleanup() {
  docker rm --force "$test_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach \
  --name "$test_container" \
  --env POSTGRES_DB="$source_db" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --publish 127.0.0.1::5432 \
  "$postgres_test_image" >/dev/null

ready=false
for attempt in {1..30}; do
  if docker exec "$test_container" psql --username=postgres --dbname="$source_db" --tuples-only --no-align --command='SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$test_container"
  exit 1
fi

echo "Disposable PostgreSQL: $(docker exec "$test_container" postgres --version)"

run_sql_file() {
  docker exec --interactive "$test_container" \
    psql --set=ON_ERROR_STOP=1 --username=postgres --dbname="$1" < "$2"
}

# Simulate the reviewed pre-Kakeibo database: core schema through migration 004.
run_sql_file "$source_db" "$script_dir/001_init.sql"
docker exec "$test_container" psql --set=ON_ERROR_STOP=1 --username=postgres --dbname="$source_db" \
  --command='ALTER TABLE accounts ADD CONSTRAINT accounts_opening_balance_check CHECK (opening_balance >= 0), ADD CONSTRAINT accounts_opening_debt_check CHECK (opening_debt >= 0);' >/dev/null
run_sql_file "$source_db" "$script_dir/003_current_account_amounts.sql"
run_sql_file "$source_db" "$script_dir/004_account_card_product.sql"
run_sql_file "$source_db" "$script_dir/seed.sql"
run_sql_file "$source_db" "$script_dir/tests/kakeibo_before_migration.sql"

financial_snapshot() {
  docker exec "$test_container" psql --username=postgres --dbname="$1" --tuples-only --no-align --field-separator='|' --command='
    SELECT
      (SELECT COUNT(*) FROM accounts),
      (SELECT COUNT(*) FROM transactions),
      (SELECT COUNT(*) FROM credit_card_payments),
      (SELECT COUNT(*) FROM account_transfers),
      (SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) FROM transactions),
      (SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) FROM credit_card_payments),
      (SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) FROM account_transfers),
      (SELECT string_agg(a.id::TEXT || $$:$$ ||
        CASE WHEN a.type = $$credit_card$$ THEN
          (a.opening_debt
            + COALESCE((SELECT SUM(t.amount) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE t.account_id = a.id AND c.type = $$expense$$), 0)
            - COALESCE((SELECT SUM(p.amount) FROM credit_card_payments p WHERE p.card_account_id = a.id), 0))::TEXT
        ELSE
          (a.opening_balance
            + COALESCE((SELECT SUM(t.amount) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE t.account_id = a.id AND c.type = $$income$$), 0)
            - COALESCE((SELECT SUM(t.amount) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE t.account_id = a.id AND c.type = $$expense$$), 0)
            - COALESCE((SELECT SUM(p.amount) FROM credit_card_payments p WHERE p.source_account_id = a.id), 0)
            - COALESCE((SELECT SUM(x.amount) FROM account_transfers x WHERE x.source_account_id = a.id), 0)
            + COALESCE((SELECT SUM(x.amount) FROM account_transfers x WHERE x.destination_account_id = a.id), 0))::TEXT
        END, $$,$$ ORDER BY a.id) FROM accounts a)
  '
}

before_snapshot="$(financial_snapshot "$source_db")"
echo "Prior-schema synthetic financial snapshot: $before_snapshot"

# Create a custom-format logical backup inside the disposable PostgreSQL container.
docker exec "$test_container" pg_dump --username=postgres --format=custom --file=/tmp/monikey-prior-schema.dump "$source_db"
docker exec "$test_container" pg_restore --list /tmp/monikey-prior-schema.dump >/dev/null
echo "Custom-format backup created and pg_restore --list verified."

# Restore once as an independent recovery check, then restore a second copy for migration rehearsal.
docker exec "$test_container" createdb --username=postgres "$restore_db"
docker exec "$test_container" pg_restore --username=postgres --dbname="$restore_db" /tmp/monikey-prior-schema.dump
restore_snapshot="$(financial_snapshot "$restore_db")"
if [[ "$restore_snapshot" != "$before_snapshot" ]]; then
  echo "Backup restore financial snapshot mismatch." >&2
  exit 1
fi
echo "Independent backup restore matches all financial row counts, totals, and account positions."

docker exec "$test_container" createdb --username=postgres "$migration_db"
docker exec "$test_container" pg_restore --username=postgres --dbname="$migration_db" /tmp/monikey-prior-schema.dump
run_sql_file "$migration_db" "$script_dir/005_kakeibo.sql"
run_sql_file "$migration_db" "$script_dir/006_kakeibo_plan_presence.sql"
migrated_snapshot="$(financial_snapshot "$migration_db")"
if [[ "$migrated_snapshot" != "$before_snapshot" ]]; then
  echo "Migration changed the financial snapshot." >&2
  exit 1
fi
unclassified="$(docker exec "$test_container" psql --username=postgres --dbname="$migration_db" --tuples-only --no-align --command='SELECT COUNT(*) FROM transactions WHERE kakeibo_envelope IS NOT NULL')"
if [[ "$unclassified" != "0" ]]; then
  echo "Migration assigned a historical Kakeibo classification." >&2
  exit 1
fi
echo "Migrations 005 and 006 preserve synthetic records, balances, totals, and historical NULL classifications."

port_mapping="$(docker port "$test_container" 5432/tcp | head -n 1)"
test_port="${port_mapping##*:}"
PYTHONPATH="$repo_root/backend" DATABASE_URL="postgresql://postgres@127.0.0.1:${test_port}/${migration_db}" \
  "$repo_root/backend/.venv/bin/python" - <<'PY'
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
report = client.get('/api/kakeibo/months/2026-10/report')
assert report.status_code == 200, report.text
assert report.json()['total_expenses'] == '375.00'
assert report.json()['actual_income'] == '1000.00'
assert report.json()['unclassified_expenses'] == '375.00'

review = client.put('/api/kakeibo/months/2026-11/review', json={
    'actual_saved_declared': None,
    'review_available': 'Recovery rehearsal reflection.',
})
assert review.status_code == 200, review.text
assert review.json()['plan'] is None
assert review.json()['plan_status'] == 'not_saved'
assert review.json()['review']['review_available'] == 'Recovery rehearsal reflection.'

zero_plan = {
    'planned_income': '0.00', 'allocated_starting_funds': '0.00',
    'savings_target': '0.00', 'prior_period_debt_reserve': '0.00',
    'needs_limit': '0.00', 'wants_limit': '0.00',
    'culture_limit': '0.00', 'unexpected_limit': '0.00',
    'monthly_intention': None,
}
saved_plan = client.put('/api/kakeibo/months/2026-11', json=zero_plan)
assert saved_plan.status_code == 200, saved_plan.text
assert saved_plan.json()['plan_status'] == 'saved'
assert saved_plan.json()['plan'] is not None
assert saved_plan.json()['review']['review_available'] == 'Recovery rehearsal reflection.'

print('API against migrated backup copy: ledger report, reflection-only month, and explicit zero plan passed.')
PY

after_api_snapshot="$(financial_snapshot "$migration_db")"
if [[ "$after_api_snapshot" != "$before_snapshot" ]]; then
  echo "Kakeibo API metadata writes changed financial records or account positions." >&2
  exit 1
fi
echo "API metadata operations leave financial snapshot unchanged."
