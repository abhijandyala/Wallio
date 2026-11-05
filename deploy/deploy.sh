#!/usr/bin/env bash
# Deploys the committed HEAD (never your working tree or .env) to the server.
# Usage: deploy/deploy.sh <server-ip>
source "$(dirname "$0")/_common.sh" "$1"
cd "$REPO_ROOT"
SHA="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Note: uncommitted changes are NOT deployed. Deploying $SHA."
fi
REL="/opt/wallio/releases/$SHA"
DOMAIN="$(cat deploy/.domain 2>/dev/null || true)"
if [ -n "$DOMAIN" ]; then
  echo "== caddy config"
  sed "s/__WALLIO_DOMAIN__/$DOMAIN/" deploy/Caddyfile | "${SSH[@]}" "cat > /tmp/Caddyfile.new && caddy validate --config /tmp/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 && (cmp -s /tmp/Caddyfile.new /etc/caddy/Caddyfile || (mv /tmp/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy && echo 'caddy reloaded'))"
fi
echo "== upload $SHA"
git archive --format=tar.gz HEAD | "${SSH[@]}" "set -e; rm -rf '$REL'; mkdir -p '$REL'; tar -xz -C '$REL'"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd "$REL"
echo "== install production dependencies"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
echo "== migrate database"
set -a; . /etc/wallio/api.env; set +a
cd packages/api && sudo -u postgres --preserve-env=DATABASE_URL,DATABASE_ADMIN_URL node scripts/db-setup.ts
echo "== switch and restart"
ln -sfn "$REL" /opt/wallio/current
chmod 711 /etc/wallio   # API user may open the pinned runner cert by name; api.env stays 600
if ! cmp -s "$REL/deploy/wallio-api.service" /etc/systemd/system/wallio-api.service; then
  install -m 644 "$REL/deploy/wallio-api.service" /etc/systemd/system/wallio-api.service
  systemctl daemon-reload
  echo "service unit updated"
fi
systemctl restart wallio-api
for i in \$(seq 1 20); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then echo "API healthy"; break; fi
  sleep 0.5
  [ "\$i" = 20 ] && { echo "API did not become healthy"; journalctl -u wallio-api -n 30 --no-pager; exit 1; }
done
ls -1dt /opt/wallio/releases/* | tail -n +4 | xargs -r rm -rf
REMOTE
[ -n "$DOMAIN" ] && echo "Live: https://$DOMAIN/api/health"
