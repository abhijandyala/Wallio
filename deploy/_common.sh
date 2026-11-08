# Shared by the deploy scripts. Usage: source "$(dirname "$0")/_common.sh" HOST
set -euo pipefail
HOST="${1:?usage: $0 <server-ip>}"
KEY="${WALLIO_SSH_KEY:-$HOME/.ssh/wallio_vultr}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "root@$HOST")
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
