#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key. In ~/.ssh/authorized_keys:
#   command="/opt/chatbotx/scripts/ci-deploy-gate.sh",restrict ssh-ed25519 AAAA... github-deploy
# The key can then only run "deploy sha-<commit>" — no shell, no forwarding.
set -euo pipefail
read -r verb tag extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [ "$verb" != "deploy" ] || [ -n "${extra:-}" ] || ! [[ "${tag:-}" =~ ^sha-[0-9a-f]{40}$ ]]; then
  echo "rejected" >&2
  exit 1
fi
exec flock -n /opt/chatbotx/state/deploy.lock bash /opt/chatbotx/scripts/deploy.sh "$tag"
