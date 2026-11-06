#!/usr/bin/env bash
# One-time runner VM setup from your laptop.
# Usage: deploy/runner/setup-runner.sh <runner-public-ip> <runner-private-ip> <control-private-ip>
# Optional: EXTRA_ADMIN_IPS="1.2.3.4,5.6.7.8" also allows SSH from those addresses.
source "$(dirname "$0")/../_common.sh" "$1"
RUNNER_PRIVATE_IP="${2:?runner private (VPC) IP}"
CONTROL_PRIVATE_IP="${3:?control VM private (VPC) IP}"
ADMIN_IP="$(curl -fsS --max-time 5 https://api.ipify.org)"
EXTRA_ADMIN_IPS="${EXTRA_ADMIN_IPS:-}"
echo "Setting up runner $HOST (VPC $RUNNER_PRIVATE_IP), API reachable only from $CONTROL_PRIVATE_IP, SSH from $ADMIN_IP ${EXTRA_ADMIN_IPS}"
D="$REPO_ROOT/deploy/runner"
"${SSH[@]}" "mkdir -p /tmp/wallio-runner-deploy"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new -q "$D/bootstrap-runner.sh" "$D/firewall.sh" "$D/wallio-runner.service" "$D/wallio-runner-firewall.service" "root@$HOST:/tmp/wallio-runner-deploy/"
"${SSH[@]}" "RUNNER_PRIVATE_IP='$RUNNER_PRIVATE_IP' CONTROL_PRIVATE_IP='$CONTROL_PRIVATE_IP' ADMIN_IP='$ADMIN_IP' EXTRA_ADMIN_IPS='$EXTRA_ADMIN_IPS' bash /tmp/wallio-runner-deploy/bootstrap-runner.sh"
printf '%s\n%s\n' "$RUNNER_PRIVATE_IP" "$HOST" > "$REPO_ROOT/deploy/.runner"
