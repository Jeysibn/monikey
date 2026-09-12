#!/bin/bash

# Verify backup archives without modifying application state.
# Usage: ./verify.sh <backup_file> [backup_file ...]

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <backup_file> [backup_file ...]" >&2
  exit 2
fi

for backup_file in "$@"; do
  if [ ! -f "${backup_file}" ]; then
    echo "ERROR: Backup file not found: ${backup_file}" >&2
    exit 1
  fi

  case "${backup_file}" in
    *.sql.gz)
      gzip -t "${backup_file}"
      # Consume the complete stream. With pipefail, `head -n 1` would close
      # early and turn gzip's expected SIGPIPE into a false verification error.
      gzip -dc "${backup_file}" | awk '
        NR == 1 { plausible = ($0 ~ /^(--|SET|\\)/) }
        END { exit plausible ? 0 : 1 }
      ' || {
        echo "ERROR: ${backup_file} is not a plausible PostgreSQL SQL dump" >&2
        exit 1
      }
      ;;
    *.tar.gz)
      gzip -t "${backup_file}"
      tar tzf "${backup_file}" >/dev/null
      ;;
    *)
      echo "ERROR: Unsupported backup format: ${backup_file}" >&2
      exit 2
      ;;
  esac

  echo "Verified: ${backup_file}"
done
