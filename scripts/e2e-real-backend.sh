#!/usr/bin/env bash
# Repeatable real-backend Playwright run against a FRESH disposable PostgreSQL. Never touches any existing database or container.
# Usage: scripts/e2e-real-backend.sh [spec ...]   (default: all e2e/v3-*-backend*.spec.ts + v3-backend-local + v3-journey)
# Requires: docker, free ports 3000 (API) and 5173 (Vite). The API runs with its normal production rate limits and security checks.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="monikey-e2e-$$-$(date +%s)"
PGPORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')"
for p in 3000 5173; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "port $p is busy; stop that process first (not killing it for you)" >&2; exit 2; fi
done
API_PID=""; VITE_PID=""
listener_pids() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u; }
cleanup() {
  # Ports 3000/5173 were verified free at start, so whatever listens there now is ours. Kill by PID, never by name.
  for p in 5173 3000; do for pid in $(listener_pids "$p"); do kill "$pid" 2>/dev/null || true; done; done
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  docker rm -f "$RUN" >/dev/null 2>&1 || true
}
trap cleanup EXIT
DB="postgresql://e2e:e2e_pw@127.0.0.1:$PGPORT/monikey_e2e"
docker run -d --name "$RUN" -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_pw -e POSTGRES_DB=monikey_e2e -p "127.0.0.1:$PGPORT:5432" postgres:16-alpine >/dev/null
for i in $(seq 1 60); do docker exec "$RUN" pg_isready -h 127.0.0.1 -U e2e -d monikey_e2e >/dev/null 2>&1 && break; sleep 1; done
cd "$ROOT/backend"
DATABASE_URL="$DB" npx prisma migrate deploy >/dev/null
DATABASE_URL="$DB" npm run -s db:seed:system >/dev/null
DATABASE_URL="$DB" APP_ORIGIN=http://localhost:5173 NODE_ENV=development setsid npx tsx src/server.ts >"$ROOT/test-results/e2e-api.log" 2>&1 &
API_PID=$!
for i in $(seq 1 60); do curl -fs http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 && break; sleep 1; done
cd "$ROOT/frontend"
VITE_FINANCE_BACKEND=true setsid npx vite --port 5173 --strictPort >"$ROOT/test-results/e2e-vite.log" 2>&1 &
VITE_PID=$!
for i in $(seq 1 60); do curl -fs http://localhost:5173/ >/dev/null 2>&1 && break; sleep 1; done
SPECS=("$@")
[ ${#SPECS[@]} -eq 0 ] && SPECS=(e2e/v3-backend-local.spec.ts e2e/v3-quickadd-backend.spec.ts e2e/v3-favorites-backend.spec.ts e2e/v3-planning-backend.spec.ts e2e/v3-planning-confirm-backend.spec.ts e2e/v3-planning-skip-backend.spec.ts e2e/v3-journey-backend.spec.ts)
echo "fresh DB $RUN on :$PGPORT"
V3_BACKEND_LOCAL=1 PLAYWRIGHT_TEST_BASE_URL=http://localhost:5173 npx playwright test "${SPECS[@]}" --workers=1 --reporter=list
