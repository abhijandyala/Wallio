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
# The control VM's private (VPC) address: the containment sentinel listens there.
PRIVATE_IP="$("${SSH[@]}" "ip -4 -o addr show | awk '{print \$4}' | cut -d/ -f1 | grep -E '^10\\.' | head -1" || true)"
SENTINEL_URL="${PRIVATE_IP:+http://$PRIVATE_IP:9099}"
if [ -n "$DOMAIN" ]; then
  echo "== caddy config"
  sed -e "s/__WALLIO_DOMAIN__/$DOMAIN/" -e "s#__SENTINEL_URL__#${SENTINEL_URL:-http://10.0.0.5:9099}#" deploy/Caddyfile | "${SSH[@]}" "cat > /tmp/Caddyfile.new && caddy validate --config /tmp/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 && (cmp -s /tmp/Caddyfile.new /etc/caddy/Caddyfile || (mv /tmp/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy && echo 'caddy reloaded'))"
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
# Containment sentinel (Adhvik's): private IP only, reachable only from inside the VPC.
if [ -n "$PRIVATE_IP" ]; then
  if [ ! -f /etc/wallio/sentinel.env ]; then
    umask 077
    printf "SENTINEL_HOST=%s\nSENTINEL_PORT=9099\nSENTINEL_RESET_TOKEN=%s\n" "$PRIVATE_IP" "\$(openssl rand -hex 24)" > /etc/wallio/sentinel.env
    umask 022
  fi
  if ! cmp -s "$REL/deploy/runner/wallio-sentinel.service" /etc/systemd/system/wallio-sentinel.service; then
    install -m 644 "$REL/deploy/runner/wallio-sentinel.service" /etc/systemd/system/wallio-sentinel.service
    systemctl daemon-reload
  fi
  systemctl enable --now wallio-sentinel >/dev/null 2>&1 || true
  systemctl restart wallio-sentinel
  # Only the runner may reach the sentinel once its address is known (from RUNNER_URL);
  # until then, the whole VPC.
  RUNNER_IP=\$(sed -nE 's#^RUNNER_URL=https://([0-9.]+):.*#\1#p' /etc/wallio/api.env)
  SENTINEL_FROM=\${RUNNER_IP:-10.5.96.0/20}
  ufw status | grep -q "9099/tcp.*\$SENTINEL_FROM " || ufw allow proto tcp from "\$SENTINEL_FROM" to "$PRIVATE_IP" port 9099 comment "sentinel: runner only" >/dev/null
  if [ -n "\$RUNNER_IP" ]; then ufw delete allow proto tcp from 10.5.96.0/20 to "$PRIVATE_IP" port 9099 >/dev/null 2>&1 || true; fi
  grep -q "^SENTINEL_URL=" /etc/wallio/api.env || echo "SENTINEL_URL=http://$PRIVATE_IP:9099" >> /etc/wallio/api.env
fi
# Abuse limits and the daily cost ceiling, explicit in production. Existing values win.
for kv in DAILY_SPEND_CAP_MINOR=500 RUN_SPEND_CAP_MINOR=50 MAX_QUEUED_RUNS=5 RATE_LIMIT_PER_MINUTE=300 \
          GUESTS_PER_HOUR_PER_IP=20 RUNS_PER_DAY_PER_WORKSPACE=12 RUNS_PER_HOUR_PER_IP=30 APPROVAL_TTL_SECS=120; do
  grep -q "^\${kv%%=*}=" /etc/wallio/api.env || echo "\$kv" >> /etc/wallio/api.env
done
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
