#!/usr/bin/env bash
# Looks for real secret VALUES where they must never appear. Prints only names and
# counts, never a value. Exit code 1 if anything is found.
#
#   local:  every tracked file and the full git history, for the values in your .env,
#           plus common key patterns (private keys, AWS/OpenAI-style tokens)
#   server: service logs (API, Caddy, sentinel), a full database dump (run events,
#           evidence, recommendations, approvals, audit, usage...), live API
#           responses, and the static web files
#
# Usage: deploy/check-secrets.sh [server-ip]
set -euo pipefail
cd "$(dirname "$0")/.."
found=0

echo "== local repository"
if [ -f .env ]; then
  while IFS='=' read -r name value; do
    case "$name" in VULTR_INFERENCE_API_KEY|RUNNER_SHARED_TOKEN|RUNNER_APPROVAL_KEY|SENTINEL_RESET_TOKEN|*PASSWORD*) ;; *) continue ;; esac
    [ "${#value}" -ge 12 ] || continue
    if grep -qF -e "$value" .env.example; then echo "  $name: published local-dev default in .env.example (not a secret)"; continue; fi
    files=$( (git grep -l -F -e "$value" -- . 2>/dev/null || true) | wc -l | tr -d ' ')
    hist=$(git log --all -p 2>/dev/null | grep -c -F -e "$value" || true)
    echo "  $name: tracked files=$files, git history=$hist"
    [ "$files" = 0 ] && [ "$hist" = 0 ] || found=1
  done < <(grep -E '^[A-Z_]+=' .env)
  # Database passwords inside connection URLs.
  for name in DATABASE_URL DATABASE_ADMIN_URL TEST_DATABASE_URL TEST_DATABASE_ADMIN_URL; do
    pw=$(grep -E "^$name=" .env | sed -nE 's#^[^=]+=[a-z]+://[^:/]+:([^@]*)@.*#\1#p' || true)
    [ "${#pw}" -ge 12 ] || continue
    if grep -qF -e "$pw" .env.example; then echo "  $name password: published local-dev default in .env.example (not a secret)"; continue; fi
    n=$(git log --all -p 2>/dev/null | grep -c -F -e "$pw" || true)
    echo "  $name password: git history=$n"
    [ "$n" = 0 ] || found=1
  done
fi
patterns='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}'
n=$( (git grep -l -E -e "$patterns" -- . ':!deploy/check-secrets.sh' 2>/dev/null || true) | wc -l | tr -d ' ')
echo "  key-shaped strings in tracked files: $n"
[ "$n" = 0 ] || found=1
tracked_env=$( (git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true) | wc -l | tr -d ' ')
echo "  tracked .env files (besides .env.example): $tracked_env"
[ "$tracked_env" = 0 ] || found=1

if [ -n "${1:-}" ]; then
  source deploy/_common.sh "$1"
  echo "== server $1"
  "${SSH[@]}" bash -s <<'REMOTE' || found=1
set -uo pipefail
bad=0
set -a; . /etc/wallio/api.env; [ -f /etc/wallio/sentinel.env ] && . /etc/wallio/sentinel.env; set +a
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
journalctl -u wallio-api -u caddy -u wallio-sentinel --no-pager -o cat > "$tmp/logs" 2>/dev/null || true
db=$(printf '%s' "$DATABASE_ADMIN_URL" | sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#')
sudo -u postgres pg_dump --data-only "$db" > "$tmp/db" 2>/dev/null || echo "  (database dump failed)"
for p in /api/health /api/catalog /api/profile /api/inventory; do
  curl -sS -H 'x-forwarded-for: 127.0.0.1' "http://127.0.0.1:8787$p" >> "$tmp/api" 2>/dev/null || true
done
cat /opt/wallio/current/deploy/web/* /etc/caddy/Caddyfile > "$tmp/static" 2>/dev/null || true
dbpw=$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^:]+:([^@]*)@.*#\1#')
for name in VULTR_INFERENCE_API_KEY RUNNER_SHARED_TOKEN RUNNER_APPROVAL_KEY SENTINEL_RESET_TOKEN DB_APP_PASSWORD; do
  if [ "$name" = DB_APP_PASSWORD ]; then v="$dbpw"; else v="${!name:-}"; fi
  [ "${#v}" -ge 12 ] || { echo "  $name: not set here"; continue; }
  line="  $name:"
  for f in logs db api static; do
    c=$(grep -c -F -e "$v" "$tmp/$f" 2>/dev/null || true)
    line="$line $f=$c"
    [ "$c" = 0 ] || bad=1
  done
  echo "$line"
done
perm=$(stat -c %a /etc/wallio/api.env)
echo "  api.env mode: $perm"
[ "$perm" = 600 ] || bad=1
exit $bad
REMOTE
fi

if [ "$found" = 0 ]; then echo "OK: no secret values found"; else echo "FOUND secret values or key-shaped strings above"; exit 1; fi
