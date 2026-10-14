#!/usr/bin/env bash
# Stage 7B: structural and behavioural validation of the additive migrations against the synthetic legacy data.
# Read-only against the migrated DB; constraint probes run in ROLLED-BACK transactions on a throw-away clone.
set -uo pipefail
C=monikey-7b-src DB=$1 URL=$2
q() { docker exec -i $C psql -U rehearsal -d "${2:-$DB}" -tA -v ON_ERROR_STOP=1 -c "$1"; }
echo "== migrations applied since the legacy baseline"; q "select migration_name from _prisma_migrations where migration_name >= '20261014' order by 1"
echo "== new columns / tables (expect: favorite_rank all NULL, anchor_day all NULL, occurrences empty)"
q "select 'favorite_rank non-null rows: '||count(*) from financial_accounts where favorite_rank is not null"
q "select 'anchor_day non-null rows: '||count(*) from recurring_items where anchor_day is not null"
q "select 'recurring_occurrences rows: '||count(*) from recurring_occurrences"
echo "== guard objects"; q "select tgname||' on '||tgrelid::regclass from pg_trigger where not tgisinternal and tgname like '%guard%' order by 1"
echo "== existing accounts/cards/history untouched: see oracle diff; archived resources still present"
q "select 'archived accounts: '||count(*) from financial_accounts where archived_at is not null"; q "select 'archived categories: '||count(*) from categories where archived_at is not null"
echo "== constraint probes on a clone (each in a rolled-back transaction)"
q "drop database if exists constraint_check with (force)" postgres >/dev/null; q "create database constraint_check template $DB" postgres >/dev/null
probe() { out=$(docker exec -i $C psql -U rehearsal -d constraint_check -tA -c "$2" 2>&1 | grep -E "ERROR|COMMIT|ROLLBACK" | head -1); echo "$1 -> ${out:-no error}"; }
probe "favorite_rank 5 (out of range)" "begin; update financial_accounts set favorite_rank=5 where name='Main Checking'; rollback;"
probe "duplicate favorite_rank for one user" "begin; update financial_accounts set favorite_rank=1 where name in ('Main Checking','Savings'); rollback;"
probe "favorite_rank 1 and 2 on distinct accounts (should succeed)" "begin; update financial_accounts set favorite_rank=1 where name='Main Checking'; update financial_accounts set favorite_rank=2 where name='Savings'; rollback;"
probe "schedule edit without the flag (guard)" "begin; update recurring_items set next_due_date=next_due_date+1 where merchant='Gym'; rollback;"
probe "recurring ledger row without the flag (guard)" "begin; insert into transactions(user_id,type,title,from_account_id,occurred_on,amount_minor,source,status,idempotency_key) select user_id,'expense','x',id,'2026-10-01',1,'recurring','cleared','recurring:forged:2026-10-01' from financial_accounts where name='Main Checking'; rollback;"
probe "ordinary ledger insert (must still work)" "begin; insert into transactions(user_id,type,title,from_account_id,occurred_on,amount_minor,source,status,idempotency_key) select user_id,'expense','x',id,'2026-10-01',1,'manual','cleared','probe-1' from financial_accounts where name='Main Checking'; rollback;"
q "drop database constraint_check with (force)" postgres >/dev/null
echo "== read-only legacy dry-run (SELECT-only, READ ONLY transaction) against the migrated synthetic DB"
( cd "$(dirname "$0")/../.." && DATABASE_URL=$URL npx tsx scripts/legacy-dry-run.ts | python3 -c "import json,sys; r=json.load(sys.stdin); [print(f'{k}: {v[\"count\"]}') for k,v in r.items()]" )
