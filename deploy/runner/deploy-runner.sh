#!/usr/bin/env bash
# Deploys the committed HEAD of the runner (never your working tree) and rebuilds the pinned images.
# Usage: deploy/runner/deploy-runner.sh <runner-public-ip>
source "$(dirname "$0")/../_common.sh" "$1"
cd "$REPO_ROOT"
SHA="$(git rev-parse --short HEAD)"
[ -n "$(git status --porcelain --untracked-files=no)" ] && echo "Note: uncommitted changes are NOT deployed. Deploying $SHA."
REL="/opt/wallio-runner/releases/$SHA"
echo "== upload $SHA (runner + contracts only)"
git archive --format=tar.gz HEAD package.json package-lock.json packages/contracts packages/runner \
  | "${SSH[@]}" "set -e; rm -rf '$REL'; mkdir -p '$REL'; tar -xz -C '$REL'"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd "$REL"
echo "== install production dependencies"
npm ci --omit=dev --no-audit --no-fund --loglevel=error -w @wallio/runner -w @wallio/contracts
echo "== build pinned images"
node packages/runner/scripts/build-images.ts
echo "== switch and restart"
ln -sfn "$REL" /opt/wallio-runner/current
systemctl restart wallio-runner-firewall wallio-runner
set -a; . /etc/wallio/runner.env; set +a
for i in \$(seq 1 40); do
  if curl -fsS --cacert "\$RUNNER_TLS_CERT" -H "authorization: Bearer \$RUNNER_SHARED_TOKEN" "https://\$RUNNER_BIND_HOST:8443/healthz" >/dev/null; then echo "runner healthy"; break; fi
  sleep 0.5
  [ "\$i" = 40 ] && { echo "runner did not become healthy"; journalctl -u wallio-runner -n 40 --no-pager; exit 1; }
done
cd packages/runner && NODE_EXTRA_CA_CERTS="\$RUNNER_TLS_CERT" RUNNER_URL="https://\$RUNNER_BIND_HOST:8443" sudo -E -u wallio-runner node scripts/preflight.ts || true
ls -1dt /opt/wallio-runner/releases/* | tail -n +4 | xargs -r rm -rf
REMOTE
