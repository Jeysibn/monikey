#!/usr/bin/env bash
# Stage 7B rollout rehearsal: restore the tested backup into a fresh DB, migrate, seed system categories, set synthetic password.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
DB=${1:-monikey_7b_restore}
t0=$(date +%s.%N)
restore_fresh "$DB"; t1=$(date +%s.%N)
echo "restore: $(echo "$t1 - $t0" | bc)s"
migrate "$DB" 2; t2=$(date +%s.%N); echo "migrate: $(echo "$t2 - $t1" | bc)s"
(cd "$BACKEND" && DATABASE_URL=$(url "$DB") npm run -s db:seed:system 2>&1 | tail -1 && DATABASE_URL=$(url "$DB") npx tsx scripts/rehearsal/set-synthetic-password.ts)
