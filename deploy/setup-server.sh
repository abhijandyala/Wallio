#!/usr/bin/env bash
# One-time server setup. Usage: deploy/setup-server.sh <server-ip> [domain]
# Domain defaults to <ip-with-dashes>.sslip.io, which resolves to the IP with no DNS setup.
source "$(dirname "$0")/_common.sh" "$1"
DOMAIN="${2:-$(echo "$HOST" | tr . -).sslip.io}"
ADMIN_IP="$(curl -fsS --max-time 5 https://api.ipify.org)"
echo "Setting up $HOST as $DOMAIN (SSH allowed from $ADMIN_IP)"
"${SSH[@]}" "mkdir -p /tmp/wallio-deploy"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new -q "$REPO_ROOT/deploy/bootstrap-control.sh" "$REPO_ROOT/deploy/Caddyfile" "$REPO_ROOT/deploy/wallio-api.service" "root@$HOST:/tmp/wallio-deploy/"
"${SSH[@]}" "WALLIO_DOMAIN='$DOMAIN' ADMIN_IP='$ADMIN_IP' bash /tmp/wallio-deploy/bootstrap-control.sh"
echo "$DOMAIN" > "$REPO_ROOT/deploy/.domain"
