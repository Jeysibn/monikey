#!/bin/bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fixture_dir=$(mktemp -d)
trap 'find "${fixture_dir}" -depth -delete' EXIT

printf '%s\n' '-- PostgreSQL database dump' 'CREATE TABLE test (id integer);' \
  | gzip > "${fixture_dir}/valid.sql.gz"
printf '%s\n' 'not a PostgreSQL dump' | gzip > "${fixture_dir}/invalid.sql.gz"
mkdir "${fixture_dir}/receipts"
printf '%s\n' 'receipt' > "${fixture_dir}/receipts/example.txt"
tar czf "${fixture_dir}/valid.tar.gz" -C "${fixture_dir}" receipts

"${script_dir}/verify.sh" "${fixture_dir}/valid.sql.gz" "${fixture_dir}/valid.tar.gz"

if "${script_dir}/verify.sh" "${fixture_dir}/invalid.sql.gz" >/dev/null 2>&1; then
  echo 'Expected invalid SQL archive verification to fail.' >&2
  exit 1
fi

# Explicit targets must win over repository `.env` values. This also exercises
# the destructive restore helper only inside the dedicated temporary fixture.
mkdir "${fixture_dir}/receipt-source" "${fixture_dir}/receipt-backups"
printf '%s\n' 'original receipt' > "${fixture_dir}/receipt-source/example.txt"
RECEIPT_STORAGE_PATH="${fixture_dir}/receipt-source" \
  BACKUP_DIR="${fixture_dir}/receipt-backups" \
  "${script_dir}/receipt-backup.sh" test >/dev/null
receipt_archive=$(find "${fixture_dir}/receipt-backups" -type f -name '*.tar.gz' -print -quit)
printf '%s\n' 'changed receipt' > "${fixture_dir}/receipt-source/example.txt"
printf 'yes\n' | RECEIPT_STORAGE_PATH="${fixture_dir}/receipt-source" \
  "${script_dir}/receipt-restore.sh" "${receipt_archive}" >/dev/null
grep -qx 'original receipt' "${fixture_dir}/receipt-source/example.txt"

echo 'Backup verification regression checks passed.'
