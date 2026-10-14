#!/usr/bin/env bash
# Stage 7B failure injection + recovery. Disposable DBs only. The OLD (auto-posting) worker is never used for recovery.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
API=http://127.0.0.1:3000/api/v1; O='Origin: http://localhost:5173'; JAR=$S/fi-jar
BASE_ORACLE=$EV/oracle-01-pre-migration.json
ok() { echo "  RESULT: PASS - $*"; }; bad() { echo "  RESULT: FAIL - $*"; FAILS=$((FAILS+1)); }
FAILS=0
jget() { python3 -c "import sys,json; d=json.load(sys.stdin)
for k in sys.argv[1].split('.'):
    d=d[k] if isinstance(d,dict) else d[int(k)]
print(d)" "$1"; }
login() { rm -f $JAR; curl -s -c $JAR -H "$O" -H 'content-type: application/json' -d '{"email":"ana.synthetic@rehearsal.test","password":"Rehearsal-Pass-1!"}' $API/auth/login >/dev/null; }
confirm() { curl -s -b $JAR -H "$O" -H 'content-type: application/json' -w ' HTTP%{http_code}' -d "{\"expectedDueDate\":\"$2\",\"amountMinor\":\"50000\",\"paidOn\":\"2026-10-15\"}" $API/recurring/$1/confirm-payment; }
snap() { psqlc $1 -Atc "select (select count(*) from transactions)||'/'||(select count(*) from recurring_occurrences)||'/'||(select string_agg(current_balance_minor::text,',' order by id) from financial_accounts)||'/'||(select string_agg(next_due_date::text,',' order by id) from recurring_items)"; }
WW=00000000-0000-4000-8000-000000000505

echo "=== F1 failure BEFORE migration (restore only, rollout aborted)"
restore_fresh f1 >/dev/null 2>&1
if [ "$(oracle f1 | md5sum)" = "$(md5sum < $BASE_ORACLE)" ]; then ok "DB equals tested backup; nothing to undo, abandon and drop the disposable DB"; else bad "restored DB differs"; fi

echo "=== F2 failure DURING migration (broken 3rd migration)"
W=$S/f2; rm -rf $W; mkdir -p $W; cp -r $BACKEND/prisma $W/prisma
echo "SELECT this_is_not_valid_sql_7b;" >> $W/prisma/migrations/20261016000000_recurring_posting_guard/migration.sql
restore_fresh f2 >/dev/null 2>&1
before=$(fin_hash f2)
(cd $BACKEND && DATABASE_URL=$(url f2) npx prisma migrate deploy --schema $W/prisma/schema.prisma 2>&1 | grep -E "Error|failed|P3009|P3018|this_is_not" | head -3)
psqlc f2 -Atc "select migration_name||' finished='||(finished_at is not null)||' rolled_back='||(rolled_back_at is not null) from _prisma_migrations where migration_name >= '20261014' order by 1"
echo "  state: favorite_rank column exists=$(psqlc f2 -Atc "select count(*) from information_schema.columns where column_name='favorite_rank'"), occurrences table=$(psqlc f2 -Atc "select to_regclass('recurring_occurrences') is not null"), guard trigger=$(psqlc f2 -Atc "select count(*) from pg_trigger where tgname='transactions_guard_recurring_posting'")"
[ "$(fin_hash f2)" = "$before" ] && ok "financial data untouched by the partial migration (additive only)" || bad "financial data changed"
echo "  -> app must NOT start on this DB (status check):"; (cd $BACKEND && DATABASE_URL=$(url f2) npx prisma migrate status --schema $W/prisma/schema.prisma 2>&1 | grep -iE "failed|unapplied|have not yet" | head -2)
echo "  RECOVERY: restore tested backup into a fresh DB and migrate with the approved HEAD"
restore_fresh f2r >/dev/null 2>&1; migrate f2r 1 >/dev/null; 
[ "$(fin_hash f2r)" = "$before" ] && [ "$(psqlc f2r -Atc "select count(*) from pg_trigger where tgname in ('transactions_guard_recurring_posting','recurring_items_guard_schedule')")" = 2 ] && ok "recovered DB reconciles with the recovery point, both guards present" || bad "recovery mismatch"

echo "=== F3 failure AFTER migration, BEFORE the API starts"
restore_fresh f3 >/dev/null 2>&1; migrate f3 1 >/dev/null; (cd $BACKEND && DATABASE_URL=$(url f3) npm run -s db:seed:system >/dev/null 2>&1; DATABASE_URL=$(url f3) npx tsx scripts/rehearsal/set-synthetic-password.ts >/dev/null)
s3=$(snap f3); sleep 2
[ "$(snap f3)" = "$s3" ] && ok "with no app running the DB is static (no hidden writer); old worker guard installed: $(psqlc f3 -Atc "select count(*) from pg_trigger where tgname in ('transactions_guard_recurring_posting','recurring_items_guard_schedule')") triggers" || bad "DB changed with no app running"
echo "  start API on the migrated DB after the pause:"; $(dirname "$0")/services.sh start-api f3 | tail -1; login
[ "$(curl -s -b $JAR $API/auth/me | jget user.id)" = "00000000-0000-4000-8000-000000000001" ] && ok "API healthy and authenticates after the delayed start" || bad "API not healthy"

echo "=== F5 partial startup: API only (no worker)"
r=$(confirm $WW 2026-10-10); echo "  confirm via API-only: ${r:0:60}... ${r: -8}"
echo "$r" | grep -q '"outcome":"confirmed"' && ok "manual confirmation works without the worker (worker is not needed for posting)" || bad "confirm failed API-only"
curl -s -b $JAR "$API/reports/net-tracked-position?from=2026-10-01&to=2026-10-31" | grep -q liquidTotal && ok "reports served without the worker (snapshots may lag until the worker starts)" || bad "reports failed"
$(dirname "$0")/services.sh stop-api >/dev/null

echo "=== F5b partial startup: worker only (no API)"
restore_fresh f5b >/dev/null 2>&1; migrate f5b 1 >/dev/null; b=$(fin_hash f5b)
$(dirname "$0")/services.sh start-worker f5b | tail -1; sleep 4
[ "$(fin_hash f5b)" = "$b" ] && [ "$(psqlc f5b -Atc "select count(*) from transactions where source='recurring'")" = 4 ] && ok "new worker alone changes no financial state and posts no recurring expense (4 legacy rows only)" || bad "worker-only changed state"

echo "=== F4 failure AFTER new worker startup: kill -9 the worker, then restart"
pids=$(cat $S/pids/worker.pids); for p in $pids; do kill -9 $p 2>/dev/null; done; sleep 1
[ "$(fin_hash f5b)" = "$b" ] && ok "state consistent after hard kill; stuck jobs: $(psqlc f5b -Atc "select count(*) from worker_jobs where status='running'")" || bad "state changed after kill"
$(dirname "$0")/services.sh start-worker f5b | tail -1; sleep 3
[ "$(fin_hash f5b)" = "$b" ] && ok "restarted worker is clean and still cannot post" || bad "restart changed state"
$(dirname "$0")/services.sh stop-worker >/dev/null

echo "=== F6 failure DURING recurring confirmation (backend terminated mid-transaction)"
restore_fresh f6 >/dev/null 2>&1; migrate f6 1 >/dev/null; (cd $BACKEND && DATABASE_URL=$(url f6) npx tsx scripts/rehearsal/set-synthetic-password.ts >/dev/null; DATABASE_URL=$(url f6) npm run -s db:seed:system >/dev/null 2>&1)
$(dirname "$0")/services.sh start-api f6 | tail -1; login; s6=$(snap f6)
psqlc f6 -qc "CREATE FUNCTION slow_occ() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN PERFORM pg_sleep(6); RETURN NEW; END \$\$; CREATE TRIGGER slow_occ BEFORE INSERT ON recurring_occurrences FOR EACH ROW EXECUTE FUNCTION slow_occ();"
confirm $WW 2026-10-10 > $S/f6-first.txt &
sleep 2
killed=$(psqlc f6 -Atc "select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity where datname='f6' and pid<>pg_backend_pid() and state='active' and query ilike '%pg_sleep%' or (datname='f6' and wait_event='PgSleep')) x")
wait; echo "  terminated backends: $killed; first attempt: $(cat $S/f6-first.txt | cut -c1-120)"
[ "$(snap f6)" = "$s6" ] && ok "atomic: no ledger row, occurrence, balance or schedule change after the killed confirmation" || bad "partial write: $s6 -> $(snap f6)"
psqlc f6 -qc "DROP TRIGGER slow_occ ON recurring_occurrences; DROP FUNCTION slow_occ()"
r1=$(confirm $WW 2026-10-10); r2=$(confirm $WW 2026-10-10)
echo "$r1" | grep -q '"outcome":"confirmed"' && echo "$r2" | grep -q '"outcome":"replayed"' && ok "retry posts exactly once; second retry is a replay" || bad "retry: ${r1: -60} / ${r2: -60}"
[ "$(psqlc f6 -Atc "select count(*) from transactions where idempotency_key='recurring:$WW:2026-10-10'")" = 1 ] && ok "exactly one ledger row for the cycle" || bad "ledger row count"
$(dirname "$0")/services.sh stop-api >/dev/null

echo "=== F7 restore-point limitation: writes after the backup are lost on restore"
restore_fresh f7 >/dev/null 2>&1; migrate f7 1 >/dev/null; (cd $BACKEND && DATABASE_URL=$(url f7) npx tsx scripts/rehearsal/set-synthetic-password.ts >/dev/null; DATABASE_URL=$(url f7) npm run -s db:seed:system >/dev/null 2>&1)
docker exec $RC pg_dump -U rehearsal -Fc f7 -f /tmp/f7-restorepoint.dump; echo "  restore point taken $(date -u +%FT%TZ)"
$(dirname "$0")/services.sh start-api f7 | tail -1; login
confirm $WW 2026-10-10 >/dev/null
curl -s -b $JAR -H "$O" -H 'content-type: application/json' -d '{"type":"expense","title":"after-backup coffee","amountMinor":"12300","fromAccountId":"00000000-0000-4000-8000-000000000101","occurredOn":"2026-10-15","source":"manual","status":"cleared","idempotencyKey":"f7-after-backup"}' $API/transactions >/dev/null
$(dirname "$0")/services.sh stop-api >/dev/null
psqlc f7 -Atc "select id||'|'||title||'|'||amount_minor from transactions order by id" > $S/f7-live.txt
docker exec $RC psql -U rehearsal -d postgres -qc "DROP DATABASE IF EXISTS f7r WITH (FORCE)" -c "CREATE DATABASE f7r" && docker exec $RC pg_restore -U rehearsal -d f7r --no-owner --exit-on-error /tmp/f7-restorepoint.dump
psqlc f7r -Atc "select id||'|'||title||'|'||amount_minor from transactions order by id" > $S/f7-restored.txt
echo "  RECONCILIATION LIST (in live DB, missing after restore - must be re-entered/replayed):"; comm -23 $S/f7-live.txt $S/f7-restored.txt | sed 's/^/    /'
[ "$(comm -23 $S/f7-live.txt $S/f7-restored.txt | wc -l)" = 2 ] && [ "$(comm -13 $S/f7-live.txt $S/f7-restored.txt | wc -l)" = 0 ] && ok "restore lost exactly the 2 post-backup writes and invented nothing; restored DB balanced: $(oracle f7r | grep -c '"balanced": true')/7 accounts" || bad "unexpected difference"
echo
echo "FAILURE INJECTION SUMMARY: failures=$FAILS"
exit $FAILS
