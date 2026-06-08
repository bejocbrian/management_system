#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_${TIMESTAMP}.sql"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
echo "Backup created at $BACKUP_FILE"
