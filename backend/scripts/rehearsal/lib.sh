# Shared helpers for Stage 7B rehearsal scripts. Disposable containers only.
S=${REHEARSAL_SCRATCH:-/tmp/claude-1000/-home-jeysi-monikey/492cf832-c5ce-4bd7-bfd9-bb83d3d63d8c/scratchpad}
DUMP=${DUMP:-$S/7b/premigration.dump}
RC=${RESTORE_CONTAINER:-monikey-7b-restore}
RPORT=${RESTORE_PORT:-58412}
BACKEND=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
EV=$(cd "$BACKEND/../docs/remake/stage7b" && pwd)
url() { echo "postgresql://rehearsal:rehearsal_pw@127.0.0.1:$RPORT/$1"; }
psqlc() { docker exec -i $RC psql -U rehearsal -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }
oracle() { docker exec -i $RC psql -U rehearsal -d "$1" -f - < "$BACKEND/scripts/rehearsal/oracle.sql"; }
# restore_fresh <db>: drop/create <db> and restore the tested pre-migration backup into it
restore_fresh() {
  docker cp "$DUMP" $RC:/tmp/r.dump >/dev/null
  docker exec $RC psql -U rehearsal -d postgres -qc "DROP DATABASE IF EXISTS $1 WITH (FORCE)" -c "CREATE DATABASE $1"
  docker exec $RC pg_restore -U rehearsal -d "$1" --no-owner --exit-on-error /tmp/r.dump
}
migrate() { (cd "$BACKEND" && DATABASE_URL=$(url "$1") npx prisma migrate deploy 2>&1 | tail -${2:-3}); }
# fingerprint of financial state only (excludes categories/snapshots/metadata)
fin_hash() { oracle "$1" | grep -E '"(accounts|transactions|budgetPeriods|budgetAllocations|recurringItems)"' | md5sum | cut -c1-12; }
