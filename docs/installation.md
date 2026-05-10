# Installation

## Prerequisites

- Docker with Docker Compose plugin
- Bun runtime
- Cloudflare account with domain access

---

## Loki Docker Plugin (Required)

Centralized logging requires the Loki Docker logging driver to be installed **before** running `docker compose`.

```bash
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

Verify the plugin is enabled:

```bash
docker plugin ls | grep loki
```

If the plugin is disabled after a server reboot, re-enable it:

```bash
docker plugin enable loki
```

---

## Environment Setup

```bash
cp .env.example .env
```

Set the required variables in `.env`:

| Variable | Description |
|----------|-------------|
| `TUNNEL_TOKEN` | Cloudflare Tunnel token (see [Cloudflare Tunnel Setup](./cloudflare-tunnel.md)) |
| `MINIO_ROOT_USER` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | MinIO admin password |
| `GEMINI_API_KEY` | Google Gemini API key for TTS |
| `GRAFANA_USER` | Grafana admin username (optional, default: `admin`) |
| `GRAFANA_PASSWORD` | Grafana admin password (optional, default: `admin123`) |

---

## Deploy

```bash
docker compose up -d
```

---

## Verify Services

Check that all containers are running:

```bash
docker compose ps
```

Tail logs from Loki:

```bash
docker compose logs loki
```

Access Grafana at `https://grafana.trypitch.co` (ensure the hostname is configured in Cloudflare Tunnel).

---

## Uninstall Loki Plugin

To remove the Loki Docker logging driver:

```bash
docker plugin disable loki
docker plugin rm loki
```