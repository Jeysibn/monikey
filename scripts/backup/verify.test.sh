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

echo 'Backup verification regression checks passed.'
