#!/usr/bin/env bash
# Host-level egress rules for the runner (defence in depth under the egress proxy).
# Even if the proxy or a Docker network setting were wrong:
#  - job containers can only reach the proxy, never the host, the VPC or the internet
#  - the proxy can never reach cloud metadata, link-local or private/VPC ranges
# Runs after docker.service (wallio-runner-firewall.service). Idempotent.
set -euo pipefail
JOBS=172.30.0.0/24
PROXY=172.30.0.2
OUT=172.31.0.0/24

iptables -N WALLIO 2>/dev/null || iptables -F WALLIO
iptables -A WALLIO -s "$JOBS" -d "$PROXY" -j RETURN
iptables -A WALLIO -s "$PROXY" -d "$JOBS" -j RETURN
iptables -A WALLIO -s "$JOBS" -j DROP
iptables -A WALLIO -d "$JOBS" -j DROP
for net in 169.254.0.0/16 10.0.0.0/8 192.168.0.0/16 100.64.0.0/10; do
  iptables -A WALLIO -s "$OUT" -d "$net" -j DROP
done
iptables -A WALLIO -j RETURN

iptables -N DOCKER-USER 2>/dev/null || true
iptables -C DOCKER-USER -j WALLIO 2>/dev/null || iptables -I DOCKER-USER 1 -j WALLIO
# New connections from job containers or the proxy to host services are refused.
for src in "$JOBS" "$OUT"; do
  iptables -C INPUT -s "$src" -m conntrack --ctstate NEW -j DROP 2>/dev/null || iptables -I INPUT 1 -s "$src" -m conntrack --ctstate NEW -j DROP
done
echo "wallio runner firewall rules applied"
