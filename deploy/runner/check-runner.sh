#!/usr/bin/env bash
# Quick runner check between rehearsals. Read-only: changes nothing on the VM.
# Usage: deploy/runner/check-runner.sh <runner-public-ip> [sentinel-url]
source "$(dirname "$0")/../_common.sh" "$1"
SENTINEL="${2:-http://10.5.96.3:9099}"
"${SSH[@]}" SENTINEL="$SENTINEL" bash -s <<'REMOTE'
set -uo pipefail
set -a; . /etc/wallio/runner.env; set +a
fail=0
row() { if [ "$1" = ok ]; then echo "PASS  $2"; else echo "FAIL  $2"; fail=1; fi; }
h=$(curl -fsS -m 5 --cacert "$RUNNER_TLS_CERT" -H "authorization: Bearer $RUNNER_SHARED_TOKEN" "https://$RUNNER_BIND_HOST:8443/healthz" || echo '{}')
echo "$h" | grep -q '"ok":true' && row ok "runner healthy ($h)" || row bad "runner healthy ($h)"
echo "$h" | grep -q '"paused":true' && row bad "runner not paused" || row ok "runner not paused"
# A running job owns one container and one volume; anything beyond that is a leftover.
a=$(echo "$h" | grep -oE '"activeJobs":[0-9]+' | cut -d: -f2); a=${a:-0}
c=$(docker ps -aq --filter label=wallio.job | wc -l); [ "$c" -le "$a" ] && row ok "no leftover job containers ($c for $a active)" || row bad "no leftover job containers ($c for $a active)"
v=$(docker volume ls -q --filter label=wallio.job | wc -l); [ "$v" -le "$a" ] && row ok "no leftover job volumes ($v for $a active)" || row bad "no leftover job volumes ($v for $a active)"
docker ps -q --filter name=wallio-egress --filter status=running | grep -q . && row ok "egress proxy running" || row bad "egress proxy running"
s=$(curl -fsS -m 4 "$SENTINEL/count" || echo '{}')
echo "$s" | grep -q '"hits":0' && row ok "sentinel at 0" || row bad "sentinel at 0 ($s)"
echo "--- job outcomes in the last 3 h"
journalctl -u wallio-runner --since -3h --no-pager -o cat | grep -oE '"msg":"job (cleaned|cancelled|timed_out|failed|cleanup_failed)"' | sort | uniq -c
journalctl -u wallio-runner --since -3h --no-pager -o cat | grep -E '"level":"(error|warn)"' | tail -5
exit $fail
REMOTE
