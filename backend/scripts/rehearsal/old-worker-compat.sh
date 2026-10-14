#!/usr/bin/env bash
# Stage 7B: run the LEGACY worker (git 2f8b119, last commit before manual-only recurring) against disposable clones.
#   control = legacy-complete schema (no guard)  -> proves the harness really exposes auto-posting
#   guarded = fully migrated schema (with guard) -> proves the legacy binary cannot post
# Usage: old-worker-compat.sh <legacy-backend-dir> <outdir>
set -uo pipefail
LEG=$(realpath "$1"); mkdir -p "$2"; OUT=$(realpath "$2")
ORACLE="$(dirname "$0")/oracle.sql"
psqlc() { docker exec -i "$1" psql -U rehearsal -d "$2" -v ON_ERROR_STOP=1 "${@:3}"; }
run_worker() { # container port db label
  ( cd "$LEG" && DATABASE_URL=postgresql://rehearsal:rehearsal_pw@127.0.0.1:$2/$3 APP_ORIGIN=http://localhost:8080 NODE_ENV=development LOG_LEVEL=info \
      setsid npx tsx src/worker.ts > "$OUT/legacy-worker-$4.log" 2>&1 & echo $! > "$OUT/.pid" )
  sleep 25
  # stop exactly the processes whose working directory is the legacy tree (by PID; never a name-based pkill)
  for d in /proc/[0-9]*; do [ "$(readlink "$d/cwd" 2>/dev/null)" = "$LEG" ] && kill -TERM "${d#/proc/}" 2>/dev/null; done; sleep 2
  left=0; for d in /proc/[0-9]*; do [ "$(readlink "$d/cwd" 2>/dev/null)" = "$LEG" ] && { kill -KILL "${d#/proc/}" 2>/dev/null; left=$((left+1)); }; done
  echo "legacy worker ($4) stopped; processes needing SIGKILL: $left"
}
snap() { psqlc "$1" "$2" -tA -c "select jsonb_pretty(jsonb_build_object(
  'recurringItems',(select jsonb_agg(jsonb_build_object('merchant',merchant,'next_due',next_due_date,'last_paid',last_paid_date,'status',status) order by merchant) from recurring_items),
  'recurringLedgerRows',(select count(*) from transactions where source='recurring'),
  'transactions',(select count(*) from transactions),
  'balances',(select jsonb_object_agg(name,current_balance_minor::text) from financial_accounts)))" > "$3"; }

echo "### CONTROL (no guard)"
psqlc monikey-7b-restore postgres -qc "DROP DATABASE IF EXISTS ctl WITH (FORCE)" -c "CREATE DATABASE ctl TEMPLATE monikey_7b_restore"
psqlc monikey-7b-restore ctl -q < "$(dirname "$0")/../../prisma/migrations/20261014000000_favorite_accounts/migration.sql"
snap monikey-7b-restore ctl "$OUT/control-before.json"; run_worker monikey-7b-restore 58412 ctl control; snap monikey-7b-restore ctl "$OUT/control-after.json"
diff "$OUT/control-before.json" "$OUT/control-after.json" > "$OUT/control.diff" && echo "control: NO change (harness would be meaningless)" || echo "control: legacy worker changed data (expected):"; cat "$OUT/control.diff"

echo "### GUARDED (all migrations, guard installed)"
psqlc monikey-7b-src postgres -qc "DROP DATABASE IF EXISTS guarded WITH (FORCE)" -c "CREATE DATABASE guarded TEMPLATE monikey_7b_rehearsal"
psqlc monikey-7b-src guarded -q < "$ORACLE" > "$OUT/guarded-oracle-before.json"
snap monikey-7b-src guarded "$OUT/guarded-before.json"; run_worker monikey-7b-src 58411 guarded guarded; snap monikey-7b-src guarded "$OUT/guarded-after.json"
psqlc monikey-7b-src guarded -q < "$ORACLE" > "$OUT/guarded-oracle-after.json"
diff "$OUT/guarded-before.json" "$OUT/guarded-after.json" > "$OUT/guarded.diff" && echo "guarded: no change" || echo "guarded: differences:"; cat "$OUT/guarded.diff"
echo "guarded oracle diff:"; diff "$OUT/guarded-oracle-before.json" "$OUT/guarded-oracle-after.json" || true
