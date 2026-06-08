#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?Usage: ./restore.sh <backup_file.sql>}"

psql "$DATABASE_URL" < "$1"
echo "Restore completed from $1"
