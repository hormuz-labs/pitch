#!/usr/bin/env bash
#
# Install the pitch Cloudflare Tunnel as a bare-metal systemd service.
#
# This moves the connector OUT of Docker (the old `cloudflared` compose service)
# and onto the host, so the tunnel can also reach other non-Docker services on
# this machine via http://localhost:<port>.
#
# It installs a SECOND, independent connector (cloudflared-pitch.service) for the
# trypitch.co token-tunnel and leaves the existing obybuy.com `cloudflared.service`
# untouched.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_NAME="cloudflared-pitch.service"
UNIT_SRC="$REPO_DIR/scripts/cloudflared/$UNIT_NAME"
UNIT_DST="/etc/systemd/system/$UNIT_NAME"
ENV_FILE="$REPO_DIR/.env"

echo "==> Repo:        $REPO_DIR"
echo "==> Unit source: $UNIT_SRC"
echo "==> Env file:    $ENV_FILE"
echo

# --- Pre-flight checks ---------------------------------------------------------
if [[ ! -x /usr/bin/cloudflared ]]; then
  echo "ERROR: /usr/bin/cloudflared not found. Install cloudflared on the host first." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Create it (cp .env.example .env) and set TUNNEL_TOKEN." >&2
  exit 1
fi

token="$(grep -E '^TUNNEL_TOKEN=' "$ENV_FILE" | sed -E 's/^TUNNEL_TOKEN=//; s/^"//; s/"$//')"
if [[ -z "$token" || "$token" == "your_cloudflare_tunnel_token_here" ]]; then
  echo "ERROR: TUNNEL_TOKEN is not set (or still the placeholder) in $ENV_FILE." >&2
  exit 1
fi
echo "==> TUNNEL_TOKEN present (${#token} chars)."

# --- Install the unit ----------------------------------------------------------
echo "==> Installing $UNIT_DST (requires sudo)..."
sudo cp "$UNIT_SRC" "$UNIT_DST"

# If the repo path differs from the one baked into the unit, rewrite EnvironmentFile.
if ! grep -qF "EnvironmentFile=$ENV_FILE" "$UNIT_DST"; then
  echo "==> Updating EnvironmentFile path in the installed unit to $ENV_FILE"
  sudo sed -i "s#^EnvironmentFile=.*#EnvironmentFile=$ENV_FILE#" "$UNIT_DST"
fi

sudo systemctl daemon-reload
sudo systemctl enable "$UNIT_NAME"

echo
echo "==> Installed and enabled $UNIT_NAME (not started yet)."
echo
echo "Cutover (do this to avoid two connectors flapping on the same tunnel):"
echo "  1) Apply the compose changes (removes the in-Docker connector, binds ports to 127.0.0.1):"
echo "       cd \"$REPO_DIR\""
echo "       docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo "       docker rm -f pitch_cloudflared 2>/dev/null || true   # remove the orphan connector"
echo "  2) Start the host connector:"
echo "       sudo systemctl start $UNIT_NAME"
echo "  3) Verify it registered the pitch tunnel (NOT the obybuy hostnames):"
echo "       journalctl -u $UNIT_NAME -n 50 --no-pager"
echo "       # look for: 'Registered tunnel connection' and your trypitch.co hostnames"
echo
echo "Handy commands:"
echo "  systemctl status $UNIT_NAME"
echo "  journalctl -u $UNIT_NAME -f"
echo "  sudo systemctl restart $UNIT_NAME   # after changing TUNNEL_TOKEN in .env"
