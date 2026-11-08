#!/usr/bin/env bash
# One-time server setup. Usage: deploy/setup-server.sh <server-ip> [domain]
# Domain defaults to <ip-with-dashes>.sslip.io, which resolves to the IP with no DNS setup.
source "$(dirname "$0")/_common.sh" "$1"
DOMAIN="${2:-$(echo "$HOST" | tr . -).sslip.io}"
echo "Setting up $HOST as $DOMAIN (limit SSH to your IP in the Vultr firewall group)"
"${SSH[@]}" "mkdir -p /tmp/wallio-deploy"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new -q "$REPO_ROOT/deploy/bootstrap-control.sh" "$REPO_ROOT/deploy/Caddyfile" "$REPO_ROOT/deploy/wallio-api.service" "root@$HOST:/tmp/wallio-deploy/"
"${SSH[@]}" "WALLIO_DOMAIN='$DOMAIN' bash /tmp/wallio-deploy/bootstrap-control.sh"
echo "$DOMAIN" > "$REPO_ROOT/deploy/.domain"
