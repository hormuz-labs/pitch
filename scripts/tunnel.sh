#!/usr/bin/env bash
# Pitch Dev Tunnel - Expose local services over public HTTPS (*.trypitch.tech)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env if present
if [ -f "${REPO_ROOT}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^(PITCH_TUNNEL_|FRP_)' "${REPO_ROOT}/.env" || true)
    set +a
fi

PORT="${1:-}"
SUBDOMAIN="${2:-}"

if [ -z "$PORT" ]; then
    echo "Usage: $0 <port> [subdomain]"
    echo ""
    echo "Examples:"
    echo "  $0 3000          # Exposes localhost:3000 with a random subdomain (e.g. https://x7k2a.trypitch.tech)"
    echo "  $0 3000 pitch    # Exposes localhost:3000 as https://pitch.trypitch.tech"
    echo "  $0 3000 @        # Exposes localhost:3000 as the apex domain https://trypitch.tech"
    exit 1
fi

# Ensure frpc is available
if ! command -v frpc &>/dev/null; then
    echo "Error: 'frpc' binary is not installed."
    echo ""
    echo "Install it via:"
    echo "  macOS:  brew install frpc"
    echo "  Linux:  curl -fsSL https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz | tar -xz && sudo mv frp_*/frpc /usr/local/bin/"
    exit 1
fi

SERVER_HOST="${PITCH_TUNNEL_HOST:-connect.trypitch.tech}"
SERVER_PORT="${PITCH_TUNNEL_PORT:-7000}"
TOKEN="${PITCH_TUNNEL_TOKEN:-${FRP_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
    echo "Error: set PITCH_TUNNEL_TOKEN (or FRP_TOKEN) to your frps auth token."
    exit 1
fi
DOMAIN_BASE="${PITCH_TUNNEL_DOMAIN:-trypitch.tech}"

TMP_CONFIG=$(mktemp /tmp/frpc.XXXXXX)
trap 'rm -f "$TMP_CONFIG"' EXIT INT TERM

if [ "$SUBDOMAIN" = "@" ] || [ "$SUBDOMAIN" = "root" ]; then
    PUBLIC_URL="https://${DOMAIN_BASE}"
    cat <<CONFIG > "$TMP_CONFIG"
serverAddr = "${SERVER_HOST}"
serverPort = ${SERVER_PORT}
auth.method = "token"
auth.token = "${TOKEN}"

[[proxies]]
name = "root-$(date +%s)"
type = "http"
localPort = ${PORT}
customDomains = ["${DOMAIN_BASE}"]
CONFIG
else
    if [ -z "$SUBDOMAIN" ]; then
        SUBDOMAIN="$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 6)"
    fi
    PUBLIC_URL="https://${SUBDOMAIN}.${DOMAIN_BASE}"
    cat <<CONFIG > "$TMP_CONFIG"
serverAddr = "${SERVER_HOST}"
serverPort = ${SERVER_PORT}
auth.method = "token"
auth.token = "${TOKEN}"

[[proxies]]
name = "${SUBDOMAIN}-$(date +%s)"
type = "http"
localPort = ${PORT}
subdomain = "${SUBDOMAIN}"
CONFIG
fi

echo ""
echo "🚀 Tunnel active!"
echo "   Forwarding: ${PUBLIC_URL} -> http://localhost:${PORT}"
echo "   Server:     ${SERVER_HOST}:${SERVER_PORT}"
echo ""
echo "Press Ctrl+C to stop the tunnel."
echo ""

exec frpc -c "$TMP_CONFIG"
