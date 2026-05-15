#!/bin/bash

# =====================================================
# POSTGRESQL RESTORE SCRIPT
# =====================================================
# Restore trading platform database from backup
#
# Usage: ./restore.sh [dev|prod] [backup_file]
# Example: ./restore.sh prod trading_prod_full_20260515_020000.sql.gz
# =====================================================

set -e

ENV=${1:-dev}
BACKUP_FILE=${2:-}

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 [dev|prod] [backup_file]"
    echo "Example: $0 prod trading_prod_full_20260515_020000.sql.gz"
    exit 1
fi

LOG_FILE="/var/log/postgresql/restore_${ENV}.log"

# =====================================================
# LOAD ENVIRONMENT CONFIGURATION
# =====================================================

if [ "$ENV" = "prod" ]; then
    DB_HOST="${DB_HOST_PROD:-trading-db-prod.internal}"
    DB_PORT="${DB_PORT_PROD:-5432}"
    DB_NAME="${DB_NAME_PROD:-trading_prod}"
    DB_USER="${DB_USER_PROD:-trading_prod_user}"
    read -p "WARNING: Restoring production database. Continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        echo "Restore cancelled"
        exit 1
    fi
else
    DB_HOST="${DB_HOST_DEV:-localhost}"
    DB_PORT="${DB_PORT_DEV:-5432}"
    DB_NAME="${DB_NAME_DEV:-trading_dev}"
    DB_USER="${DB_USER_DEV:-trading_dev_user}"
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# =====================================================
# VALIDATE BACKUP FILE
# =====================================================

log "Validating backup file: $BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if file is gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
    if ! gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        log "ERROR: Backup file is corrupted"
        exit 1
    fi
    RESTORE_CMD="gunzip -c '$BACKUP_FILE' | psql"
else
    RESTORE_CMD="psql -f '$BACKUP_FILE'"
fi

log "✓ Backup file validated"
log "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# =====================================================
# PRE-RESTORE CHECKS
# =====================================================

log "Running pre-restore checks..."

# Test database connection
if ! PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" 2>/dev/null; then
    log "ERROR: Cannot connect to database server"
    exit 1
fi

log "✓ Database connection successful"

# =====================================================
# BACKUP EXISTING DATABASE
# =====================================================

log "Creating safety backup of existing database..."
SAFETY_BACKUP="/var/backups/postgresql/${ENV}/safety_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
mkdir -p "$(dirname "$SAFETY_BACKUP")"

pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    | gzip -9 > "$SAFETY_BACKUP"

log "Safety backup created: $SAFETY_BACKUP"

# =====================================================
-- TERMINATE EXISTING CONNECTIONS
# =====================================================

log "Terminating existing connections to database..."

PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$DB_NAME'
  AND pid <> pg_backend_pid();

-- Wait for termination
SELECT pg_sleep(1);
EOF

log "✓ Connections terminated"

# =====================================================
# DROP AND RECREATE DATABASE
# =====================================================

log "Dropping existing database: $DB_NAME"

PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
EOF

log "✓ Database recreated"

# =====================================================
# RESTORE DATABASE
# =====================================================

log "Starting database restore..."
log "This may take several minutes depending on backup size..."

if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | \
    PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --quiet 2>&1 | tee -a "$LOG_FILE"
else
    PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$BACKUP_FILE" --quiet 2>&1 | tee -a "$LOG_FILE"
fi

if [ $? -ne 0 ]; then
    log "ERROR: Restore failed. Attempting to restore safety backup..."
    
    # Restore from safety backup
    PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres << EOF
    DROP DATABASE IF EXISTS $DB_NAME;
    CREATE DATABASE $DB_NAME OWNER $DB_USER;
EOF
    
    gunzip -c "$SAFETY_BACKUP" | \
    PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --quiet
    
    log "ERROR: Restore failed and rolled back to safety backup"
    exit 1
fi

log "✓ Database restore completed"

# =====================================================
-- POST-RESTORE VERIFICATION
# =====================================================

log "Running post-restore verification..."

TABLE_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

log "Tables restored: $TABLE_COUNT"

# Check critical tables
for table in users trading_accounts strategies signals orders positions; do
    ROW_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM $table;")
    log "  ✓ $table: $ROW_COUNT rows"
done

log "=========================================="
log "RESTORE SUMMARY"
log "=========================================="
log "Environment: $ENV"
log "Database: $DB_NAME"
log "Backup file: $(basename $BACKUP_FILE)"
log "Safety backup: $SAFETY_BACKUP"
log "Restore completed successfully"
log "=========================================="
