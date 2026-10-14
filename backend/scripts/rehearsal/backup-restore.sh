#!/usr/bin/env bash
# Stage 7B synthetic backup/restore drill. Disposable containers only. The passphrase is a synthetic rehearsal value.
# Usage: backup-restore.sh <src-container> <src-db> <restore-container> <restore-db> <vault-container> <workdir> <label>
set -euo pipefail
SRC=$1 SRCDB=$2 DST=$3 DSTDB=$4 VAULT=$5 W=$6 LABEL=$7
PASS=synthetic-rehearsal-passphrase-not-a-secret
t() { date +%s.%N; }; el() { printf '%.2fs' "$(echo "$2 - $1" | bc)"; }
mkdir -p "$W"
echo "== backup label=$LABEL  utc=$(date -u +%FT%TZ)"
echo "server: $(docker exec $SRC psql -U rehearsal -d $SRCDB -tAc 'select version()')"
a=$(t); docker exec $SRC pg_dump -U rehearsal -d $SRCDB -Fc -f /tmp/$LABEL.dump; b=$(t); echo "pg_dump -Fc elapsed $(el $a $b)"
docker cp $SRC:/tmp/$LABEL.dump "$W/$LABEL.dump"; docker exec $SRC rm -f /tmp/$LABEL.dump
echo "dump bytes: $(stat -c %s "$W/$LABEL.dump")  sha256: $(sha256sum "$W/$LABEL.dump" | cut -d' ' -f1)"
a=$(t); docker run --rm -i -v "$W:/w:ro" postgres:18-alpine pg_restore --list /w/$LABEL.dump > "$W/$LABEL.toc"; b=$(t)
echo "integrity: pg_restore --list parsed $(grep -vc '^;' "$W/$LABEL.toc") TOC entries in $(el $a $b)"
openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:$PASS -in "$W/$LABEL.dump" -out "$W/$LABEL.dump.enc"
ENC=$(sha256sum "$W/$LABEL.dump.enc" | cut -d' ' -f1); echo "encrypted sha256: $ENC"
docker cp "$W/$LABEL.dump.enc" $VAULT:/$LABEL.dump.enc
echo "vault copy sha256 (verified inside the separate container): $(docker exec $VAULT sha256sum /$LABEL.dump.enc | cut -d' ' -f1)"
docker cp $VAULT:/$LABEL.dump.enc "$W/$LABEL.fromvault.enc"
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:$PASS -in "$W/$LABEL.fromvault.enc" -out "$W/$LABEL.restored.dump"
cmp "$W/$LABEL.dump" "$W/$LABEL.restored.dump" && echo "decrypted vault copy is byte-identical to the original dump"
echo "== restore into $DST/$DSTDB"
docker exec $DST psql -U rehearsal -d postgres -qc "DROP DATABASE IF EXISTS $DSTDB WITH (FORCE)" -c "CREATE DATABASE $DSTDB"
docker cp "$W/$LABEL.restored.dump" $DST:/tmp/r.dump
a=$(t); docker exec $DST pg_restore -U rehearsal -d $DSTDB --no-owner --exit-on-error /tmp/r.dump; b=$(t); echo "pg_restore elapsed $(el $a $b)"
docker exec $DST rm -f /tmp/r.dump
