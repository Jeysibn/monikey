# Disaster Recovery Guide for Monikey

This document describes how to perform backup and recovery operations for the Monikey application, including database and receipt storage.

## Table of Contents

1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Database Backup & Restore](#database-backup--restore)
4. [Receipt Storage Backup & Restore](#receipt-storage-backup--restore)
5. [Full Stack Recovery](#full-stack-recovery)
6. [Verification and Testing](#verification-and-testing)
7. [Automation and Scheduling](#automation-and-scheduling)

## Overview

Monikey uses two critical data stores that require backup and recovery planning:

1. **PostgreSQL Database** - Stores all financial data, user accounts, transactions, etc.
2. **Receipt Storage** - Stores uploaded receipt images and processed OCR data (filesystem-based)

Both are included in the disaster recovery procedures.

## Backup Strategy

### Recommended Backup Schedule

- **Database backups**: Daily (recommended at off-peak hours)
- **Receipt storage backups**: Daily or weekly (depends on upload volume)
- **Retention policy**: Keep at least 7-14 days of daily backups

### Backup Location

Backups are stored in:
- Database: `backups/pg/` directory
- Receipts: `backups/receipts/` directory

Store backups on:
- A separate storage medium (external drive, NAS, cloud storage)
- Ideally in a different geographic location for critical systems
- With appropriate access controls and encryption

## Database Backup & Restore

### Prerequisites

- PostgreSQL client tools installed: `pg_dump`, `psql`
- Database credentials available (from `.env` file)
- Connection to the PostgreSQL server

### Backing Up the Database

#### From Docker Compose

```bash
# Method 1: Using the backup script
cd /path/to/monikey
./scripts/backup/pg-backup.sh

# Method 2: With a custom backup name
./scripts/backup/pg-backup.sh "production-$(date +%Y-%m-%d)"

# Method 3: From running container
docker compose exec db pg_dump -U monikey monikey | gzip > backup-$(date +%Y-%m-%d_%H:%M:%S).sql.gz
```

#### Backup Output

```
Starting PostgreSQL backup...
  Database: monikey@localhost:5432
  User: monikey
  Output: backups/pg/monikey-2024-01-15_10:30:45.sql.gz
Backup completed successfully!
  File: backups/pg/monikey-2024-01-15_10:30:45.sql.gz
  Size: 5.2M
```

#### Backup File Contents

The backup file is a gzip-compressed SQL dump containing:
- Complete schema (tables, indexes, constraints)
- All data rows
- Sequences and identities
- Foreign key relationships
- Triggers and functions (if any)

### Restoring the Database

#### Prerequisites for Restore

Before restoring, ensure:
- PostgreSQL server is running and accessible
- You have admin access or the `monikey` user credentials
- The backup file exists and is readable
- You have confirmed you want to restore (this will DROP the existing database)

#### Using the Restore Script

```bash
# Restore from a backup file
cd /path/to/monikey
./scripts/backup/pg-restore.sh backups/pg/monikey-2024-01-15_10:30:45.sql.gz

# Restore from a custom backup
./scripts/backup/pg-restore.sh /path/to/backup-file.sql.gz
```

#### Manual Restore Process

If the script fails or you prefer manual steps:

```bash
# 1. Connect to PostgreSQL as admin
psql -h localhost -U monikey -d postgres

# 2. Drop existing database (if needed)
DROP DATABASE IF EXISTS monikey;

# 3. Create fresh database
CREATE DATABASE monikey;

# 4. Exit psql
\q

# 5. Restore from backup
gunzip -c backups/pg/monikey-2024-01-15_10:30:45.sql.gz | \
  psql -h localhost -U monikey -d monikey
```

#### Restore Verification

After restore, verify the data:

```bash
# Check database size
docker compose exec db psql -U monikey -d monikey -c "SELECT pg_size_pretty(pg_database_size('monikey'));"

# Check table counts
docker compose exec db psql -U monikey -d monikey -c "\dt+"

# Sample query - count transactions
docker compose exec db psql -U monikey -d monikey -c "SELECT COUNT(*) FROM transactions;"

# Verify foreign key integrity
docker compose exec db psql -U monikey -d monikey << 'EOF'
  SELECT DISTINCT constraint_name FROM information_schema.table_constraints 
  WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
EOF
```

## Receipt Storage Backup & Restore

### Backing Up Receipt Storage

#### Using the Backup Script

```bash
cd /path/to/monikey

# Method 1: Default backup name
./scripts/backup/receipt-backup.sh

# Method 2: With custom backup name
./scripts/backup/receipt-backup.sh "production-$(date +%Y-%m-%d)"

# Method 3: From running Docker container
docker compose exec -it api tar czf - /data/receipts > receipts-$(date +%Y-%m-%d).tar.gz
```

#### Backup Output

```
Starting receipt storage backup...
  Source: /data/receipts
  Output: backups/receipts/receipts-2024-01-15_10:30:45.tar.gz
Backup completed successfully!
  File: backups/receipts/receipts-2024-01-15_10:30:45.tar.gz
  Size: 1.8G
  Files: 2547
```

### Restoring Receipt Storage

#### Using the Restore Script

```bash
cd /path/to/monikey

# Restore from a backup file
./scripts/backup/receipt-restore.sh backups/receipts/receipts-2024-01-15_10:30:45.tar.gz

# Restore from a custom backup
./scripts/backup/receipt-restore.sh /path/to/receipts-backup.tar.gz
```

#### Manual Restore Process

```bash
# 1. Stop the running containers (if needed)
docker compose down

# 2. Remove existing receipt storage
rm -rf /data/receipts

# 3. Extract from backup
mkdir -p /data
tar xzf backups/receipts/receipts-2024-01-15_10:30:45.tar.gz -C /

# 4. Set correct permissions (if using Docker)
docker compose exec -u root api chown -R app:app /data/receipts

# 5. Restart containers
docker compose up -d
```

### Receipt Storage Verification

After restore, verify the receipt storage:

```bash
# Check storage directory
ls -lh /data/receipts/

# Count receipt files
find /data/receipts -type f | wc -l

# Check disk usage
du -sh /data/receipts/

# Verify file integrity (sample)
file /data/receipts/*.jpg | head -5
```

## Full Stack Recovery

### Scenario: Complete Infrastructure Failure

You need to restore the entire Monikey stack from scratch. This includes database, receipts, and application code.

#### Step 1: Prepare Environment

```bash
# Clone repository (or use existing)
git clone https://github.com/Jeysibn/monikey.git
cd monikey

# Restore .env file
# (You should have backed this up separately, or recreate from .env.example)
cp .env.example .env
# Edit .env with production values
nano .env

# Create backup directories (should exist)
mkdir -p backups/pg backups/receipts
```

#### Step 2: Restore Database

```bash
# Ensure Docker and PostgreSQL are running
docker compose up -d db

# Wait for database to be ready
sleep 10

# Check database connectivity
docker compose exec db pg_isready

# Restore from backup
./scripts/backup/pg-restore.sh backups/pg/monikey-2024-01-15_10:30:45.sql.gz

# Expected output: "Restore completed successfully!"
```

#### Step 3: Restore Receipt Storage

```bash
# Restore receipt storage
./scripts/backup/receipt-restore.sh backups/receipts/receipts-2024-01-15_10:30:45.tar.gz

# Expected output: "Restore completed successfully!"
```

#### Step 4: Start Full Stack

```bash
# Start all services
docker compose up -d

# Wait for services to be healthy
docker compose ps

# Check logs
docker compose logs -f api
```

#### Step 5: Verification

```bash
# Test API health
curl http://localhost:3000/health

# Check web interface
curl http://localhost:8080

# Login and verify data
# Navigate to http://localhost:8080 and log in with test user
```

### Example: Hourly Automated Backup Cron Job

```bash
# Add to crontab (crontab -e)
# Database backup at 2 AM daily
0 2 * * * cd /path/to/monikey && ./scripts/backup/pg-backup.sh "db-daily-$(date +\%Y\%m\%d)"

# Receipt backup at 3 AM daily
0 3 * * * cd /path/to/monikey && ./scripts/backup/receipt-backup.sh "receipts-daily-$(date +\%Y\%m\%d)"

# Cleanup old backups (keep last 30 days)
30 4 * * * find /path/to/monikey/backups -name "*.tar.gz" -o -name "*.sql.gz" | while read f; do find "$f" -mtime +30 -delete; done
```

## Verification and Testing

### Backup Integrity Tests

Test your backups regularly to ensure they can be restored:

```bash
# Weekly backup restoration test
# 1. Create test database
docker run -d --name test-postgres -e POSTGRES_DB=test -e POSTGRES_PASSWORD=test postgres:16-alpine

# 2. Restore backup to test database
# (Use the restore script with test database connection)

# 3. Run data integrity checks
# - Count rows in critical tables
# - Verify no orphaned foreign keys
# - Check for missing sequences

# 4. Clean up test environment
docker stop test-postgres && docker rm test-postgres
```

### Regular Testing Schedule

- **Weekly**: Test restoring latest backup to a test environment
- **Monthly**: Full end-to-end recovery test (database + receipts + application)
- **Quarterly**: Test recovery on different hardware/cloud provider

### Monitoring and Alerts

Recommend setting up alerts for:
- Failed backup jobs
- Backup storage running low on space
- Database size growing unexpectedly
- Missing expected daily backups

## Automation and Scheduling

### Docker-Based Automated Backups

Create a backup container that runs on schedule:

```yaml
# Add to docker-compose.yaml
backup:
  image: ubuntu:24.04
  command: |
    /bin/bash -c "
    apt-get update && apt-get install -y postgresql-client cron
    # Run backup script on schedule
    (crontab -l 2>/dev/null; echo '0 2 * * * /app/scripts/backup/pg-backup.sh') | crontab -
    crond -f
    "
  volumes:
    - .:/app
    - ./backups:/app/backups
  depends_on:
    - db
```

### Cloud Backup Strategy

For production systems, consider:
- **AWS S3**: Upload backups to S3 with lifecycle policies
- **Google Cloud Storage**: Similar to S3
- **Backblaze B2**: Cost-effective backup storage
- **Azure Blob Storage**: For Azure deployments

Example: Upload to S3 after backup

```bash
#!/bin/bash
# scripts/backup/pg-backup-to-s3.sh

./pg-backup.sh "auto-$(date +%Y-%m-%d-%H)"
BACKUP_FILE=$(ls -t backups/pg/*.sql.gz | head -1)

aws s3 cp "$BACKUP_FILE" s3://your-bucket/monikey-backups/
```

## Disaster Recovery RTO/RPO

### Recovery Time Objective (RTO)

- **Database**: 15-30 minutes (depending on database size)
- **Receipt storage**: 10-20 minutes (depending on storage size)
- **Full stack**: 30-60 minutes

### Recovery Point Objective (RPO)

- **Current setup**: 24 hours (daily backups)
- **Recommended improvement**: 4 hours (6 backups/day) or continuous replication

## Checklist for DR Implementation

- [ ] Backup scripts are executable and tested
- [ ] Backups directory exists and has sufficient storage
- [ ] `.env` file is securely backed up (separately from code)
- [ ] Backup retention policy is defined
- [ ] Automated backup schedule is configured
- [ ] Restore procedures have been tested
- [ ] Database integrity is verified after restore
- [ ] Receipt storage permissions are correct after restore
- [ ] Application boots successfully after full restore
- [ ] Monitoring/alerting is configured for backup failures
- [ ] Team members are trained on recovery procedures
- [ ] Recovery procedure is documented and accessible

## Additional Resources

- [PostgreSQL Backup & Restore Guide](https://www.postgresql.org/docs/current/backup.html)
- [Docker Compose Backup Strategy](https://docs.docker.com/compose/)
- [File System Backup Best Practices](https://www.gnu.org/software/tar/manual/)

## Support and Questions

For questions or issues with disaster recovery:
1. Check the logs in `docker compose logs`
2. Review the backup script output for errors
3. Test restoration procedures regularly
4. Keep backups in multiple locations
