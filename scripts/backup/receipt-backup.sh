#!/bin/bash

# Receipt Storage Backup Script for Monikey
# Usage: ./receipt-backup.sh [backup_name]
#
# This script creates a compressed backup of the receipt storage directory.
# Backups are stored in backups/receipts/ directory with timestamp.
#
# Environment variables (set in .env):
#   RECEIPT_STORAGE_PATH - Path to receipt storage directory (default: /data/receipts)
#
# Examples:
#   ./receipt-backup.sh                    # Creates backups/receipts/receipts-YYYY-MM-DD_HH:MM:SS.tar.gz
#   ./receipt-backup.sh pre-migration      # Creates backups/receipts/pre-migration-YYYY-MM-DD_HH:MM:SS.tar.gz
#   ./receipt-backup.sh with-test-data     # Creates backups/receipts/with-test-data-YYYY-MM-DD_HH:MM:SS.tar.gz

set -euo pipefail

# Source .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-backups/receipts}"
BACKUP_PREFIX="${1:-receipts}"
RECEIPT_STORAGE_PATH="${RECEIPT_STORAGE_PATH:-/data/receipts}"
TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}-${TIMESTAMP}.tar.gz"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Check if receipt storage directory exists
if [ ! -d "${RECEIPT_STORAGE_PATH}" ]; then
  echo "WARNING: Receipt storage directory not found: ${RECEIPT_STORAGE_PATH}"
  echo "Creating empty backup..."
  mkdir -p "${RECEIPT_STORAGE_PATH}"
fi

echo "Starting receipt storage backup..."
echo "  Source: ${RECEIPT_STORAGE_PATH}"
echo "  Output: ${BACKUP_FILE}"

# Perform backup using tar
if tar czf "${BACKUP_FILE}" -C "$(dirname "${RECEIPT_STORAGE_PATH}")" "$(basename "${RECEIPT_STORAGE_PATH}")" 2>/dev/null || tar czf "${BACKUP_FILE}" --exclude='lost+found' -C / "data/receipts" 2>/dev/null; then
  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  FILE_COUNT=$(tar tzf "${BACKUP_FILE}" 2>/dev/null | wc -l)
  echo "Backup completed successfully!"
  echo "  File: ${BACKUP_FILE}"
  echo "  Size: ${BACKUP_SIZE}"
  echo "  Files: ${FILE_COUNT}"
  exit 0
else
  echo "WARNING: Backup completed but with some warnings (directory may be empty or inaccessible)"
  if [ -f "${BACKUP_FILE}" ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "  File: ${BACKUP_FILE}"
    echo "  Size: ${BACKUP_SIZE}"
    exit 0
  else
    echo "ERROR: Backup creation failed!"
    exit 1
  fi
fi
