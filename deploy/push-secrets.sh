#!/usr/bin/env bash
# Copies VULTR_INFERENCE_API_KEY from your local .env into /etc/wallio/api.env
# on the server over SSH stdin. The key is never printed or written to a temp file.
source "$(dirname "$0")/_common.sh" "$1"
KEY_LINE="$(grep -E '^VULTR_INFERENCE_API_KEY=.+' "$REPO_ROOT/.env" || true)"
[ -n "$KEY_LINE" ] || { echo "No VULTR_INFERENCE_API_KEY in .env"; exit 1; }
printf '%s\n' "$KEY_LINE" | "${SSH[@]}" '
  set -e; umask 077; F=/etc/wallio/api.env; read -r LINE
  grep -v "^VULTR_INFERENCE_API_KEY=" "$F" > "$F.new" || true
  printf "%s\n" "$LINE" >> "$F.new"; mv "$F.new" "$F"; chmod 600 "$F"
  echo "Inference key stored in $F ($(wc -l < $F) settings, root-only)"'
