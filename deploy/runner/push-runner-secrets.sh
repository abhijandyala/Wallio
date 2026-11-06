#!/usr/bin/env bash
# Copies the runner's bearer token, approval key and certificate to the control
# VM over SSH pipes. Values are never printed or written to local disk.
# Usage: deploy/runner/push-runner-secrets.sh <runner-public-ip> <control-public-ip>
source "$(dirname "$0")/../_common.sh" "$1"
RUNNER_SSH=("${SSH[@]}")
CONTROL="${2:?control VM public IP}"
CONTROL_SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "root@$CONTROL")

"${RUNNER_SSH[@]}" 'set -e; . /etc/wallio/runner.env
  printf "RUNNER_URL=https://%s:8443\nRUNNER_SHARED_TOKEN=%s\nRUNNER_APPROVAL_KEY=%s\nRUNNER_CA_FILE=/etc/wallio/runner-cert.pem\n" \
    "$RUNNER_BIND_HOST" "$RUNNER_SHARED_TOKEN" "$RUNNER_APPROVAL_KEY"' \
| "${CONTROL_SSH[@]}" 'set -e; umask 077; F=/etc/wallio/api.env
  grep -v -E "^(RUNNER_URL|RUNNER_SHARED_TOKEN|RUNNER_APPROVAL_KEY|RUNNER_CA_FILE)=" "$F" > "$F.new" || true
  cat >> "$F.new"; mv "$F.new" "$F"; chmod 600 "$F"
  echo "runner settings stored in $F"'

"${RUNNER_SSH[@]}" 'cat /etc/wallio/runner-cert.pem' \
| "${CONTROL_SSH[@]}" 'install -m 644 /dev/stdin /etc/wallio/runner-cert.pem && echo "runner certificate pinned at /etc/wallio/runner-cert.pem"'
