#!/usr/bin/env bash
# One-time setup of the Wallio control VM (Ubuntu 24.04). Run as root:
#   WALLIO_DOMAIN=1-2-3-4.sslip.io bash bootstrap-control.sh
# Safe to re-run. Never writes provider secrets: push-secrets.sh does that.
set -euo pipefail
: "${WALLIO_DOMAIN:?set WALLIO_DOMAIN}"
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl ca-certificates gnupg ufw unattended-upgrades postgresql rsync debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -yq nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi
dpkg-reconfigure -fnoninteractive unattended-upgrades

echo "== firewall (host): SSH + HTTPS only. The Vultr firewall group limits SSH to the admin IP"
# SSH is key-only. Restricting it by IP here as well locked us out whenever the
# admin's IP changed, and the host firewall can only be fixed from the web console.
# The Vultr firewall group (edited in the console) is the IP restriction.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "ssh (keys only; IP-limited by Vultr firewall group)"
ufw allow 443/tcp comment "https"
ufw allow 443/udp comment "http3"
ufw --force enable

echo "== ssh: keys only"
sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/; s/^#?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true

echo "== postgres: localhost only"
PGCONF=$(ls /etc/postgresql/*/main/postgresql.conf | head -1)
sed -i -E "s/^#?listen_addresses.*/listen_addresses = 'localhost'/" "$PGCONF"
systemctl restart postgresql

echo "== app user and directories"
id wallio >/dev/null 2>&1 || useradd --system --home /opt/wallio --shell /usr/sbin/nologin wallio
install -d -o root -g root -m 755 /opt/wallio /opt/wallio/releases
# 711: the API user can open the runner certificate (644) by name but cannot list the
# directory; api.env stays 600 root-only.
install -d -o root -g root -m 711 /etc/wallio

ENVF=/etc/wallio/api.env
if [ ! -f "$ENVF" ]; then
  PW=$(openssl rand -base64 33 | tr -dc 'A-Za-z0-9' | head -c 40)
  umask 077
  cat > "$ENVF" <<ENV
NODE_ENV=production
PORT=8787
RUN_MODE=mock
COOKIE_SECURE=true
APP_ORIGIN=https://${WALLIO_DOMAIN}
RUN_SPEND_CAP_MINOR=50
DATABASE_URL=postgres://wallio_app:${PW}@localhost:5432/wallio
DATABASE_ADMIN_URL=postgres:///wallio?host=/var/run/postgresql
VULTR_INFERENCE_BASE_URL=https://api.vultrinference.com/v1
ENV
  echo "  wrote $ENVF (DB password generated on this server)"
fi

echo "== caddy"
sed "s/__WALLIO_DOMAIN__/${WALLIO_DOMAIN}/" /tmp/wallio-deploy/Caddyfile > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo "== systemd unit"
install -m 644 /tmp/wallio-deploy/wallio-api.service /etc/systemd/system/wallio-api.service
systemctl daemon-reload
systemctl enable wallio-api

echo "Bootstrap done. Next: push-secrets.sh, then deploy.sh."
