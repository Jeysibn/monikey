#!/bin/bash

# PostgreSQL Backup Script for Monikey
# Usage: ./pg-backup.sh [backup_name]
#
# This script creates a compressed backup of the PostgreSQL database.
# Backups are stored in backups/pg/ directory with timestamp.
#
# Environment variables (set in .env):
#   POSTGRES_DB - Database name (default: monikey)
#   POSTGRES_USER - Database user (default: monikey)
#   POSTGRES_PASSWORD - Database password
#   DATABASE_URL - Full PostgreSQL connection string
#
# Examples:
#   ./pg-backup.sh                    # Creates backups/pg/monikey-YYYY-MM-DD_HH:MM:SS.sql.gz
#   ./pg-backup.sh pre-migration      # Creates backups/pg/pre-migration-YYYY-MM-DD_HH:MM:SS.sql.gz
#   ./pg-backup.sh with-seed          # Creates backups/pg/with-seed-YYYY-MM-DD_HH:MM:SS.sql.gz

set -euo pipefail

# Source .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-backups/pg}"
BACKUP_PREFIX="${1:-monikey}"
TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}-${TIMESTAMP}.sql.gz"

# Parse database connection info
if [ -z "${DATABASE_URL:-}" ]; then
  DB_HOST="${POSTGRES_HOST:-localhost}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  DB_NAME="${POSTGRES_DB:-monikey}"
  DB_USER="${POSTGRES_USER:-monikey}"
  DB_PASSWORD="${POSTGRES_PASSWORD:-change-me}"
else
  # Extract from DATABASE_URL: postgresql://user:password@host:port/dbname
  DB_URL="${DATABASE_URL#postgresql://}"
  DB_USER="${DB_URL%%:*}"
  DB_PASS_HOST="${DB_URL#${DB_USER}:}"
  DB_PASSWORD="${DB_PASS_HOST%%@*}"
  DB_HOST_PORT="${DB_PASS_HOST#${DB_PASSWORD}@}"
  DB_HOST="${DB_HOST_PORT%%:*}"
  DB_PORT="${DB_HOST_PORT##*:}"
  DB_NAME="${DB_HOST_PORT##*/}"
  DB_PORT="${DB_PORT%%/*}"
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Perform backup
echo "Starting PostgreSQL backup..."
echo "  Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "  User: ${DB_USER}"
echo "  Output: ${BACKUP_FILE}"

export PGPASSWORD="${DB_PASSWORD}"

if pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --no-password \
  --format=plain \
  "${DB_NAME}" | gzip > "${BACKUP_FILE}"; then

  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "Backup completed successfully!"
  echo "  File: ${BACKUP_FILE}"
  echo "  Size: ${BACKUP_SIZE}"
  exit 0
else
  echo "ERROR: Backup failed!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi
