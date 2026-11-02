#!/usr/bin/env bash
# Restores a dump into a NEW database and never touches an existing one. Point the app at
# the restored database only after checking it. Usage: restore.sh <dump> <new_database>
set -euo pipefail
FILE="${1:?dump file required}"
TARGET="${2:?new database name required}"
USER_NAME="${POSTGRES_USER:-rankforge}"
PSQL_RUN="${PG_RUN:-docker compose exec -T postgres}"

$PSQL_RUN createdb -U "$USER_NAME" "$TARGET"   # fails if it already exists
$PSQL_RUN pg_restore -U "$USER_NAME" -d "$TARGET" --no-owner --exit-on-error < "$FILE"
$PSQL_RUN psql -U "$USER_NAME" -d "$TARGET" -Atc "SELECT 'restored migrations: ' || count(*) FROM _migrations"
