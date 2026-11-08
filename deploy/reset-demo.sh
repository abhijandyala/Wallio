#!/usr/bin/env bash
# Resets only synthetic demo data (guest workspaces) on the server. Dry run unless --yes.
# Usage: deploy/reset-demo.sh <server-ip> [--older-than-minutes N] [--yes]
source "$(dirname "$0")/_common.sh" "$1"
shift
"${SSH[@]}" bash -s -- "$@" <<'REMOTE'
set -euo pipefail
set -a; . /etc/wallio/api.env; set +a
cd /opt/wallio/current/packages/api
sudo -u postgres --preserve-env=DATABASE_ADMIN_URL node scripts/reset-demo.ts "$@"
REMOTE
