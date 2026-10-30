#!/usr/bin/env bash
# Deploy a specific image tag. Usage:
#   bash scripts/deploy.sh sha-<commit>        # pull, backup, migrate, roll out
#   bash scripts/deploy.sh rollback            # back to the previous app tag
# Rollback only swaps the app images. It never reverts migrations: restore a
# backup from backups/ by hand if a migration itself has to be undone.
set -euo pipefail
cd "$(dirname "$0")/.."

STATE=state
APPS=(javascript-executor builder worker realtime)
mkdir -p "$STATE"

current=$(cat "$STATE/current-tag" 2>/dev/null || true)
target="${1:?usage: deploy.sh <tag>|rollback}"
if [ "$target" = "rollback" ]; then
  target=$(cat "$STATE/previous-tag" 2>/dev/null) || { echo "no previous tag" >&2; exit 1; }
  skip_migrate=1
fi
[[ "$target" =~ ^(sha-[0-9a-f]{7,40}|fork-latest)$ ]] || { echo "invalid tag: $target" >&2; exit 1; }

export IMAGE_TAG="$target"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

if [ -f "$STATE/ghcr-token" ]; then
  set -a; . ./.env; set +a
  docker login ghcr.io -u "$IMAGE_NAMESPACE" --password-stdin < "$STATE/ghcr-token" >/dev/null
fi

log "pulling $IMAGE_TAG"
docker compose pull "${APPS[@]}"

log "starting infrastructure"
docker compose up -d --wait postgres redis filesystem
docker compose up filesystem-init

if [ -z "${skip_migrate:-}" ]; then
  log "backup before migrations"
  bash scripts/backup.sh "pre-${IMAGE_TAG}"
  # List pending migrations (folders under drizzle/ not yet recorded in
  # drizzle.__drizzle_migrations) and stop for a human if any contain
  # destructive statements. A fresh database skips the check (no data yet).
  # Set ALLOW_DESTRUCTIVE=1 to proceed after reviewing the SQL.
  report=$(docker compose run --rm --no-deps --entrypoint node builder -e '
    const { Client } = require("/app/migrate-runner/node_modules/pg");
    const fs = require("fs"), path = require("path");
    const dir = "/app/migrate-runner/drizzle";
    const re = /\b(drop\s+(table|column|schema|type|index)|truncate|delete\s+from|alter\s+column\s+\S+\s+(set\s+data\s+)?type)\b/i;
    (async () => {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      const t = await c.query("select to_regclass(\x27drizzle.__drizzle_migrations\x27) as t");
      const fresh = !t.rows[0].t;
      const done = new Set(fresh ? [] : (await c.query("select name from drizzle.__drizzle_migrations")).rows.map(r => r.name));
      await c.end();
      for (const name of fs.readdirSync(dir).sort()) {
        const f = path.join(dir, name, "migration.sql");
        if (!fs.existsSync(f) || done.has(name)) continue;
        console.log("PENDING " + name);
        if (fresh) continue;
        for (const line of fs.readFileSync(f, "utf8").split("\n"))
          if (re.test(line)) console.log("DANGER " + name + ": " + line.trim().slice(0, 160));
      }
    })().catch(e => { console.log("ERROR " + e.message); process.exit(1); });
  ')
  pending=$(printf '%s\n' "$report" | sed -n 's/^PENDING //p')
  danger=$(printf '%s\n' "$report" | sed -n 's/^DANGER //p')
  if [ -n "$pending" ]; then
    log "pending migrations:"; printf '%s\n' "$pending" | sed 's/^/  - /'
    if [ -n "$danger" ] && [ "${ALLOW_DESTRUCTIVE:-}" != "1" ]; then
      printf '%s\n' "$danger"
      echo "Destructive statements found. Review them, then re-run with ALLOW_DESTRUCTIVE=1." >&2
      exit 2
    fi
    log "running migrations"
    docker compose run --rm --no-deps builder migrate
  else
    log "no pending migrations"
  fi
fi

log "rolling out app containers"
if ! docker compose up -d --wait --wait-timeout 240 "${APPS[@]}" caddy; then
  log "health check failed for $IMAGE_TAG"
  docker compose ps
  if [ -n "$current" ] && [ "$current" != "$IMAGE_TAG" ] && [ -z "${skip_migrate:-}" ]; then
    log "rolling app images back to $current (database left as migrated)"
    IMAGE_TAG="$current" docker compose up -d --wait "${APPS[@]}"
  fi
  exit 1
fi

if [ "$current" != "$IMAGE_TAG" ]; then
  [ -n "$current" ] && echo "$current" > "$STATE/previous-tag"
  echo "$IMAGE_TAG" > "$STATE/current-tag"
fi
docker compose ps
docker image prune -f >/dev/null
log "deployed $IMAGE_TAG"
