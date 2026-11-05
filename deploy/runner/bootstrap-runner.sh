#!/usr/bin/env bash
# One-time setup of the Wallio RUNNER VM (Ubuntu 24.04). Run as root:
#   RUNNER_PRIVATE_IP=10.1.96.4 CONTROL_PRIVATE_IP=10.1.96.3 ADMIN_IP=203.0.113.7 bash bootstrap-runner.sh
# Safe to re-run. Holds no Vultr API key, no inference key and no cookies:
# only the runner's own bearer token, approval key and TLS key, generated here.
set -euo pipefail
: "${RUNNER_PRIVATE_IP:?set RUNNER_PRIVATE_IP (this VM's VPC address)}"
: "${CONTROL_PRIVATE_IP:?set CONTROL_PRIVATE_IP (the control VM's VPC address)}"
: "${ADMIN_IP:?set ADMIN_IP (your IP, for SSH)}"
export DEBIAN_FRONTEND=noninteractive
SRC=/tmp/wallio-runner-deploy

echo "== packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl ca-certificates gnupg ufw iptables unattended-upgrades rsync openssl
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -yq nodejs
fi
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
dpkg-reconfigure -fnoninteractive unattended-upgrades
# Docker daemon: no inter-container userland proxy surprises, no live debugging endpoints.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<JSON
{ "userland-proxy": false, "live-restore": false, "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
systemctl enable --now docker
systemctl restart docker

echo "== firewall (host): SSH from admin IP; runner API only from the control VM over the VPC"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_IP" to any port 22 proto tcp comment "admin ssh"
ufw allow in from "$CONTROL_PRIVATE_IP" to "$RUNNER_PRIVATE_IP" port 8443 proto tcp comment "control VM -> runner"
ufw --force enable
install -m 755 "$SRC/firewall.sh" /usr/local/sbin/wallio-runner-firewall
install -m 644 "$SRC/wallio-runner-firewall.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable wallio-runner-firewall

echo "== ssh: keys only"
sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/; s/^#?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true

echo "== runner user and directories"
id wallio-runner >/dev/null 2>&1 || useradd --system --home /var/lib/wallio-runner --shell /usr/sbin/nologin wallio-runner
# Docker group access is root-equivalent on this host. That is why this VM runs
# nothing but the runner (PRD §13: separate runner VM).
usermod -aG docker wallio-runner
install -d -o root -g root -m 755 /opt/wallio-runner /opt/wallio-runner/releases
install -d -o wallio-runner -g wallio-runner -m 700 /var/lib/wallio-runner
install -d -o root -g wallio-runner -m 750 /etc/wallio

echo "== TLS certificate for the private address (the control VM pins it)"
if [ ! -f /etc/wallio/runner-key.pem ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 \
    -keyout /etc/wallio/runner-key.pem -out /etc/wallio/runner-cert.pem \
    -subj "/CN=wallio-runner" -addext "subjectAltName=IP:${RUNNER_PRIVATE_IP}" 2>/dev/null
  chown wallio-runner:wallio-runner /etc/wallio/runner-key.pem
  chmod 600 /etc/wallio/runner-key.pem
  chmod 644 /etc/wallio/runner-cert.pem
fi

ENVF=/etc/wallio/runner.env
if [ ! -f "$ENVF" ]; then
  umask 077
  cat > "$ENVF" <<ENV
NODE_ENV=production
RUNNER_DRIVER=docker
RUNNER_BIND_HOST=${RUNNER_PRIVATE_IP}
RUNNER_PORT=8443
RUNNER_TLS_CERT=/etc/wallio/runner-cert.pem
RUNNER_TLS_KEY=/etc/wallio/runner-key.pem
RUNNER_STATE_DIR=/var/lib/wallio-runner
RUNNER_SHARED_TOKEN=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)
RUNNER_APPROVAL_KEY=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)
HOME=/var/lib/wallio-runner
DOCKER_CONFIG=/var/lib/wallio-runner/.docker
ENV
  chown root:wallio-runner "$ENVF"
  chmod 640 "$ENVF"
  echo "  wrote $ENVF (token and approval key generated on this server; push them with push-runner-secrets.sh)"
fi

echo "== systemd unit"
install -m 644 "$SRC/wallio-runner.service" /etc/systemd/system/wallio-runner.service
systemctl daemon-reload
systemctl enable wallio-runner
systemctl start wallio-runner-firewall || true

echo "Bootstrap done. Next: deploy/runner/deploy-runner.sh <runner-public-ip>"
