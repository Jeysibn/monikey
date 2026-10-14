#!/usr/bin/env bash
# start|stop the NEW worker + API against a rehearsal DB. PIDs are tracked in files; stop is by PID only.
source "$(dirname "$0")/lib.sh"
P=$S/pids; mkdir -p $P
case "$1" in
  start-worker|start-api)
    DB=${2:-monikey_7b_restore}; kind=${1#start-}; f=src/server.ts; [ $kind = worker ] && f=src/worker.ts
    cd "$BACKEND"; DATABASE_URL=$(url "$DB") APP_ORIGIN=http://localhost:5173 NODE_ENV=development setsid nohup npx tsx $f > $S/$kind.log 2>&1 &
    for i in $(seq 1 40); do
      if [ $kind = api ]; then curl -sf http://127.0.0.1:3000/api/v1/health/ready >/dev/null && break
      else grep -q "durable job runner registered" $S/worker.log 2>/dev/null && break; fi; sleep 0.5; done
    # find the node process whose environ has this DB url and script
    pid=$(for d in /proc/[0-9]*; do tr '\0' ' ' < $d/cmdline 2>/dev/null | grep -q "tsx.*$f\|--import.*$f\|$f" && tr '\0' '\n' < $d/environ 2>/dev/null | grep -q "DATABASE_URL=.*/$DB\$" && echo ${d#/proc/}; done | tr '\n' ' ')
    echo "$pid" > $P/$kind.pids; echo "$kind started pids: $pid";;
  stop-worker|stop-api)
    kind=${1#stop-}; for p in $(cat $P/$kind.pids 2>/dev/null); do kill $p 2>/dev/null; done; sleep 1; rm -f $P/$kind.pids; echo "$kind stopped";;
  stop) $0 stop-worker; $0 stop-api;;
esac
