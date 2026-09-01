#!/bin/bash

# PostgreSQL Restore Script for Monikey
# Usage: ./pg-restore.sh <backup_file>
#
# This script restores a PostgreSQL database from a backup file.
# It will drop the existing database and recreate it from the backup.
#
# Environment variables (set in .env):
#   POSTGRES_DB - Database name (default: monikey)
#   POSTGRES_USER - Database user (default: monikey)
#   POSTGRES_PASSWORD - Database password
#   DATABASE_URL - Full PostgreSQL connection string
#
# WARNING: This will DROP the existing database. Make sure you have a backup!
#
# Examples:
#   ./pg-restore.sh backups/pg/monikey-2024-01-15_10:30:45.sql.gz
#   ./pg-restore.sh backups/pg/pre-migration-2024-01-15_10:30:45.sql.gz

set -euo pipefail

# Check for backup file argument
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 backups/pg/monikey-2024-01-15_10:30:45.sql.gz"
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
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-monikey}"
DB_USER="${POSTGRES_USER:-monikey}"
DB_PASSWORD="${POSTGRES_PASSWORD:-change-me}"

# Parse from DATABASE_URL if set
if [ -n "${DATABASE_URL:-}" ]; then
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

echo "PostgreSQL Restore Script"
echo "  Backup file: ${BACKUP_FILE}"
echo "  Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "  User: ${DB_USER}"
echo ""
echo "WARNING: This will DROP the existing database '${DB_NAME}' and restore from backup!"
echo "Make sure you have a backup before proceeding."
echo ""
read -p "Are you sure? (yes/no): " confirmation

if [ "${confirmation}" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

export PGPASSWORD="${DB_PASSWORD}"

echo "Connecting to database at ${DB_HOST}:${DB_PORT}..."

# Check if database exists and attempt to drop it
echo "Dropping existing database (if it exists)..."
psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --no-password \
  --command="DROP DATABASE IF EXISTS ${DB_NAME};" || true

# Create fresh database
echo "Creating fresh database..."
psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --no-password \
  --command="CREATE DATABASE ${DB_NAME};"

# Restore from backup
echo "Restoring from backup..."
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "  File size: ${BACKUP_SIZE}"

if [ "${BACKUP_FILE}" = "${BACKUP_FILE%.gz}" ]; then
  # Uncompressed SQL file
  psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --no-password \
    --dbname="${DB_NAME}" \
    < "${BACKUP_FILE}"
else
  # Gzip compressed SQL file
  gunzip -c "${BACKUP_FILE}" | psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --no-password \
    --dbname="${DB_NAME}"
fi

echo ""
echo "Restore completed successfully!"
echo "Database '${DB_NAME}' has been restored from backup."
