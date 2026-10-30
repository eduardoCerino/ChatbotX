#!/usr/bin/env bash
# Logical Postgres backup (pg_dump custom format) + .env copy.
# Keeps the newest $KEEP dumps. Usage: bash scripts/backup.sh [label]
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="${KEEP:-7}"
label="${1:-manual}"
ts=$(date -u +%Y%m%dT%H%M%SZ)
dir=backups
umask 077
mkdir -p "$dir"

# .env is a compose env file, not shell: values like "Name <a@b>" must not be sourced.
envval() { grep -m1 "^$1=" .env | cut -d= -f2-; }
POSTGRES_USER=$(envval POSTGRES_USER)
POSTGRES_DB=$(envval POSTGRES_DB)
file="$dir/db-${ts}-${label}.dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$file"
# A truncated dump must never count as a backup.
docker compose exec -T postgres pg_restore --list < "$file" > /dev/null
cp .env "$dir/env-${ts}.bak"
echo "backup: $file ($(du -h "$file" | cut -f1))"

ls -1t "$dir"/db-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
ls -1t "$dir"/env-*.bak | tail -n +"$((KEEP + 1))" | xargs -r rm -f
