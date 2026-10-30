#!/usr/bin/env bash
# docker compose with the currently deployed IMAGE_TAG, e.g.:
#   bash scripts/dc.sh ps | logs -f builder | restart worker
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE_TAG="$(cat state/current-tag)" exec docker compose "$@"
