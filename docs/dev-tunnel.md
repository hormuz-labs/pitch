# Development Tunnel (`trypitch.tech`)

Pitch provides a self-hosted **FRP + Caddy** tunneling service on GCP that allows developers and autonomous AI agents to expose local web services to the public internet with automatic HTTPS certificates on `*.trypitch.tech`.

It replaces third-party tunneling dependencies (like ngrok or Cloudflare Tunnels) for ad-hoc previewing, webhook testing, or sharing local instances.

---

## Architecture

```text
Browser / Webhook
       │  HTTPS (443)
       ▼
   Caddy Proxy (GCP VM, automatic Let's Encrypt TLS)
       │  HTTP (8080)
       ▼
   FRP Server (frps:7000)
       ▲
       │  Encrypted multiplexed TCP tunnel
       │  (laptop/agent dials OUTBOUND to connect.trypitch.tech:7000)
       ▼
   FRP Client (frpc)
       │  HTTP
       ▼
   localhost:<port> (e.g. 3000, 5173, 8080)
```

- **Outbound only:** Your local machine connects outbound to `connect.trypitch.tech:7000`. No incoming firewall ports or router configurations needed on your machine.
- **Automatic HTTPS:** Caddy provisions TLS certificates on-demand via Let's Encrypt when the first request hits any subdomain (`*.trypitch.tech`).
- **WebSocket & Stream support:** Fully supports WebSockets, chunked HTTP/1.1 streaming, and Server-Sent Events (SSE).

---

## Quick Start (for AI Agents & Developers)

A helper script is provided in the repository at `scripts/tunnel.sh`.

### 1. Prerequisites

Ensure `frpc` is installed on the host machine:

- **macOS:**
  ```bash
  brew install frpc
  ```
- **Linux / Docker:**
  ```bash
  curl -fsSL https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz | tar -xz
  sudo mv frp_0.71.0_linux_amd64/frpc /usr/local/bin/
  ```

### 2. Expose a Service

From the root of the repository, run:

```bash
# Expose port 3000 as https://pitch.trypitch.tech
./scripts/tunnel.sh 3000 pitch

# Expose port 3000 as the root apex domain https://trypitch.tech
./scripts/tunnel.sh 3000 @

# Expose port 5173 with a randomized subdomain (e.g. https://x7k2a.trypitch.tech)
./scripts/tunnel.sh 5173

# Expose API port 8080 as https://api.trypitch.tech
./scripts/tunnel.sh 8080 api
```

Press `Ctrl+C` in your terminal to terminate the tunnel.

---

## Environment Configuration

The script reads connection parameters from `.env` in the repository root (falling back to sensible defaults):

```env
# Dev Tunnel configuration
PITCH_TUNNEL_HOST="connect.trypitch.tech"
PITCH_TUNNEL_PORT="7000"
PITCH_TUNNEL_DOMAIN="trypitch.tech"
PITCH_TUNNEL_TOKEN="your_tunnel_token_here"
```

---

## Permanent / Multi-Service Configuration

If you want multiple fixed services exposed simultaneously in the background:

1. Create `~/.config/frp/frpc.toml`:
   ```toml
   serverAddr = "connect.trypitch.tech"
   serverPort = 7000
   auth.method = "token"
   auth.token = "your_tunnel_token_here"

   [[proxies]]
   name = "pitch-app"
   type = "http"
   localPort = 3000
   subdomain = "pitch"

   [[proxies]]
   name = "pitch-api"
   type = "http"
   localPort = 8080
   subdomain = "api"
   ```

2. Run `frpc`:
   ```bash
   frpc -c ~/.config/frp/frpc.toml
   ```
   Or on macOS via Homebrew background services:
   ```bash
   brew services start frpc
   ```

---

## Server Infrastructure Reference

- **GCP Instance:** `tunnel-vm` (`e2-small`, Ubuntu 24.04 LTS) in `asia-southeast1-b`
- **Static Ingress IP:** `34.143.208.222`
- **DNS Endpoints:**
  - `connect.trypitch.tech` (DNS-only, A record -> `34.143.208.222`) for tunnel client control port `7000`
  - `trypitch.tech` & `*.trypitch.tech` for web ingress on ports `80` & `443`
- **FRP Dashboard:** [https://dashboard.trypitch.tech](https://dashboard.trypitch.tech)
  - Default User: `admin`
  - Password: see server `/opt/tunnel/frps.toml`
