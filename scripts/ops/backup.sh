#!/usr/bin/env bash
# Writes a compressed logical backup of the Compose database to BACKUP_DIR and prunes old
# ones. Copy the result off this host: a backup on the same disk does not survive its loss.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB="${POSTGRES_DB:-rankforge}"
USER_NAME="${POSTGRES_USER:-rankforge}"
PSQL_RUN="${PG_RUN:-docker compose exec -T postgres}"

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/${DB}_$(date -u +%Y%m%dT%H%M%SZ).dump"
$PSQL_RUN pg_dump -U "$USER_NAME" -d "$DB" --format=custom --no-owner > "$FILE.partial"
mv "$FILE.partial" "$FILE"
find "$BACKUP_DIR" -name "${DB}_*.dump" -mtime "+$RETENTION_DAYS" -delete
echo "$FILE"
