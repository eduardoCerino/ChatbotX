#!/usr/bin/env bash
# Creates /opt/chatbotx/.env from .env.production.example with fresh random
# secrets. Refuses to overwrite an existing .env (rotating secrets such as
# ENCRYPTION_KEY or POSTGRES_PASSWORD on a live install breaks data access).
#
# Usage: ACME_EMAIL=.. PLATFORM_ADMIN_EMAIL=.. SMTP_SERVER=.. SMTP_FROM=.. \
#          bash scripts/generate-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

out=.env
[ -e "$out" ] && { echo "$out already exists; not overwriting" >&2; exit 1; }

hex() { openssl rand -hex "$1"; }
umask 077
tmp=$(mktemp)
cp .env.production.example "$tmp"

pg=$(hex 24); redis=$(hex 24)
# Each placeholder occurrence gets its own value.
while grep -q '__GENERATE_HEX_32__' "$tmp"; do sed -i "0,/__GENERATE_HEX_32__/s//$(hex 32)/" "$tmp"; done
while grep -q '__GENERATE_BASE64_32__' "$tmp"; do
  v=$(openssl rand -base64 32 | tr -d '\n' | sed 's/[\/&]/\\&/g')
  sed -i "0,/__GENERATE_BASE64_32__/s//$v/" "$tmp"
done
sed -i "s/^POSTGRES_PASSWORD=__GENERATE_HEX_24__/POSTGRES_PASSWORD=$pg/" "$tmp"
sed -i "s/^REDIS_PASSWORD=__GENERATE_HEX_24__/REDIS_PASSWORD=$redis/" "$tmp"
while grep -q '__GENERATE_HEX_24__' "$tmp"; do sed -i "0,/__GENERATE_HEX_24__/s//$(hex 24)/" "$tmp"; done
# Write URLs literally instead of relying on ${VAR} expansion inside env files.
sed -i "s/\${POSTGRES_PASSWORD}/$pg/; s/\${REDIS_PASSWORD}/$redis/" "$tmp"

for key in ACME_EMAIL PLATFORM_ADMIN_EMAIL SMTP_SERVER SMTP_FROM; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    esc=$(printf '%s' "$val" | sed 's/[\/&|]/\\&/g')
    sed -i "s|^$key=__ASK__|$key=$esc|" "$tmp"
  fi
done

mv "$tmp" "$out"
chmod 600 "$out"
echo "wrote $out (secrets not printed)."
grep -n '__ASK__' "$out" | cut -d= -f1 | sed 's/^/still missing: /' || true
