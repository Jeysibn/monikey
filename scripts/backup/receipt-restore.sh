#!/bin/bash

# Receipt Storage Restore Script for Monikey
# Usage: ./receipt-restore.sh <backup_file>
#
# This script restores the receipt storage directory from a backup file.
# It will remove the existing receipt storage and restore from backup.
#
# Environment variables (set in .env):
#   RECEIPT_STORAGE_PATH - Path to receipt storage directory (default: /data/receipts)
#
# WARNING: This will remove the existing receipt storage. Make sure you have a backup!
#
# Examples:
#   ./receipt-restore.sh backups/receipts/receipts-2024-01-15_10:30:45.tar.gz
#   ./receipt-restore.sh backups/receipts/with-test-data-2024-01-15_10:30:45.tar.gz

set -euo pipefail

# Check for backup file argument
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 backups/receipts/receipts-2024-01-15_10:30:45.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"

# Verify backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# Source .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Configuration
RECEIPT_STORAGE_PATH="${RECEIPT_STORAGE_PATH:-/data/receipts}"

echo "Receipt Storage Restore Script"
echo "  Backup file: ${BACKUP_FILE}"
echo "  Target: ${RECEIPT_STORAGE_PATH}"
echo ""
echo "WARNING: This will remove the existing receipt storage at '${RECEIPT_STORAGE_PATH}' and restore from backup!"
echo "Make sure you have a backup before proceeding."
echo ""
read -p "Are you sure? (yes/no): " confirmation

if [ "${confirmation}" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

# Check file size and contents
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup file size: ${BACKUP_SIZE}"

echo "Removing existing receipt storage..."
if [ -d "${RECEIPT_STORAGE_PATH}" ]; then
  rm -rf "${RECEIPT_STORAGE_PATH}"
fi

# Create parent directory
mkdir -p "$(dirname "${RECEIPT_STORAGE_PATH}")"

echo "Extracting backup..."
if tar xzf "${BACKUP_FILE}" -C "$(dirname "${RECEIPT_STORAGE_PATH}")"; then
  FILE_COUNT=$(find "${RECEIPT_STORAGE_PATH}" -type f 2>/dev/null | wc -l)
  echo ""
  echo "Restore completed successfully!"
  echo "Receipt storage '${RECEIPT_STORAGE_PATH}' has been restored from backup."
  echo "Files restored: ${FILE_COUNT}"
else
  echo "ERROR: Restore failed!"
  exit 1
fi
