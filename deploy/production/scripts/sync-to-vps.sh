#!/usr/bin/env bash
# Run from the Mac: copies the versioned deploy files (never .env, state or
# backups) to the VPS. Usage: bash deploy/production/scripts/sync-to-vps.sh
set -euo pipefail
HOST="${DEPLOY_HOST:-149.56.210.42}"
USER_="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/ovh_chatbotx}"
src="$(cd "$(dirname "$0")/.." && pwd)"
rsync -rltv -e "ssh -i $KEY" \
  --exclude .env --exclude state/ --exclude backups/ \
  "$src/docker-compose.yml" "$src/Caddyfile" "$src/.env.production.example" "$src/scripts" \
  "$USER_@$HOST:/opt/chatbotx/"
ssh -i "$KEY" "$USER_@$HOST" 'chmod -R go-rwx /opt/chatbotx/scripts /opt/chatbotx/Caddyfile /opt/chatbotx/docker-compose.yml && chmod 750 /opt/chatbotx/scripts/*.sh'
