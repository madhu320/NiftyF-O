#!/bin/bash

# =====================================================
# POSTGRESQL BACKUP SCRIPT
# =====================================================
# Automated backup solution for trading platform database
# Supports both dev and production environments
#
# Usage: ./backup.sh [dev|prod]
# Cron Example (daily 2 AM): 0 2 * * * /path/to/backup.sh prod
# =====================================================

set -e

ENV=${1:-dev}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/postgresql/${ENV}"
RETENTION_DAYS=30
LOG_FILE="/var/log/postgresql/backup_${ENV}.log"

# =====================================================
# LOAD ENVIRONMENT CONFIGURATION
# =====================================================

if [ "$ENV" = "prod" ]; then
    DB_HOST="${DB_HOST_PROD:-trading-db-prod.internal}"
    DB_PORT="${DB_PORT_PROD:-5432}"
    DB_NAME="${DB_NAME_PROD:-trading_prod}"
    DB_USER="${DB_USER_PROD:-trading_prod_user}"
    BACKUP_RETENTION=30
    REMOTE_BACKUP=true
    S3_BUCKET="s3://trading-backups-prod"
else
    DB_HOST="${DB_HOST_DEV:-localhost}"
    DB_PORT="${DB_PORT_DEV:-5432}"
    DB_NAME="${DB_NAME_DEV:-trading_dev}"
    DB_USER="${DB_USER_DEV:-trading_dev_user}"
    BACKUP_RETENTION=7
    REMOTE_BACKUP=false
fi

# =====================================================
# CREATE BACKUP DIRECTORY
# =====================================================

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# =====================================================
# FULL BACKUP
# =====================================================

log "Starting full database backup for $ENV environment"
log "Database: $DB_NAME on $DB_HOST:$DB_PORT"

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_full_${TIMESTAMP}.sql"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

# Perform backup
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --no-owner \
    --no-privileges \
    > "$BACKUP_FILE" 2>> "$LOG_FILE"

if [ $? -ne 0 ]; then
    log "ERROR: Database dump failed"
    exit 1
fi

log "Backup file created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Compress backup
gzip -9 "$BACKUP_FILE"
log "Compressed backup: $BACKUP_FILE_GZ ($(du -h "$BACKUP_FILE_GZ" | cut -f1))"

# =====================================================
# REMOTE BACKUP (Production only)
# =====================================================

if [ "$REMOTE_BACKUP" = true ]; then
    log "Uploading to S3: $S3_BUCKET"
    
    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_FILE_GZ" "$S3_BUCKET/full_backups/" \
            --storage-class GLACIER \
            --sse AES256 \
            2>> "$LOG_FILE"
        
        if [ $? -eq 0 ]; then
            log "Successfully uploaded to S3"
        else
            log "WARNING: S3 upload failed"
        fi
    else
        log "WARNING: AWS CLI not found, skipping S3 upload"
    fi
fi

# =====================================================
# CUSTOM BACKUP (Schema + Data separately)
# =====================================================

log "Creating custom backup (schema + data)"

SCHEMA_FILE="$BACKUP_DIR/${DB_NAME}_schema_${TIMESTAMP}.sql"
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --schema-only \
    > "$SCHEMA_FILE" 2>> "$LOG_FILE"

log "Schema backup: $SCHEMA_FILE ($(du -h "$SCHEMA_FILE" | cut -f1))"

# =====================================================
# BACKUP VERIFICATION
# =====================================================

log "Verifying backup integrity..."

# Check if backup file is valid
if gunzip -t "$BACKUP_FILE_GZ" 2>/dev/null; then
    log "✓ Backup integrity verified"
else
    log "ERROR: Backup integrity check failed"
    rm "$BACKUP_FILE_GZ"
    exit 1
fi

# =====================================================
# CLEANUP OLD BACKUPS
# =====================================================

log "Cleaning up backups older than $BACKUP_RETENTION days"

find "$BACKUP_DIR" -name "*_full_*.sql.gz" -type f -mtime +$BACKUP_RETENTION -delete
find "$BACKUP_DIR" -name "*_schema_*.sql" -type f -mtime +$BACKUP_RETENTION -delete

log "Cleanup completed"

# =====================================================
# BACKUP STATISTICS
# =====================================================

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.gz 2>/dev/null | wc -l)

log "=========================================="
log "BACKUP SUMMARY"
log "=========================================="
log "Environment: $ENV"
log "Database: $DB_NAME"
log "Timestamp: $TIMESTAMP"
log "Backup file: $(basename $BACKUP_FILE_GZ)"
log "File size: $(du -h "$BACKUP_FILE_GZ" | cut -f1)"
log "Total backups: $BACKUP_COUNT"
log "Total backup size: $TOTAL_SIZE"
log "=========================================="
log "Backup completed successfully"

# =====================================================
# SEND ALERT (Optional)
# =====================================================

# Uncomment to send backup notification
# curl -X POST https://monitoring.example.com/api/alerts \
#     -H "Content-Type: application/json" \
#     -d "{\"status\": \"success\", \"env\": \"$ENV\", \"timestamp\": \"$TIMESTAMP\"}"
