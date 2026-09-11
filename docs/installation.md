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

### Important: Log Driver URL

The Loki Docker log driver runs as a **host process**, not inside a container. This means it cannot resolve Docker service names like `loki`. The `loki-url` in `docker-compose.yml` must point to the **host-mapped port**:

```
# Correct
loki-url: http://localhost:3101/loki/api/v1/push

# Wrong — the plugin cannot resolve Docker hostnames
loki-url: http://loki:3100/loki/api/v1/push
```

`3101` is the host port mapped to Loki's container port `3100` (see `docker-compose.yml`).

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
| `ELEVENLABS_API_KEY` | ElevenLabs key for generated music and sound effects, and for narration when `.pi/audio.json` selects it |
| `GRAFANA_USER` | Grafana admin username (optional, default: `admin`) |
| `GRAFANA_PASSWORD` | Grafana admin password (optional, default: `admin123`) |

---

## Deploy

```bash
docker compose up -d
```

### Pedalboard audio effects

The API image installs the pinned `requirements-audio.txt` into
`/opt/pitch-audio` and sets `STUDIO_PYTHON` automatically. Rebuild the API image
when updating those dependencies.

For a native API server, install Python 3.10+ and create a host environment:

```bash
python3 -m venv "$HOME/.venvs/pitch-audio"
"$HOME/.venvs/pitch-audio/bin/pip" install -r requirements-audio.txt
export STUDIO_PYTHON="$HOME/.venvs/pitch-audio/bin/python"
bun run dev:api
```

You can also set that absolute `STUDIO_PYTHON` path in `.env`. Restart the API
to load the new CLI command and skill. In a studio session,
`pitch media pedalboard --list` verifies the runtime and lists supported DSP
effects. For the local audio regression tests:
`STUDIO_PYTHON="$HOME/.venvs/pitch-audio/bin/python" bunx vitest run tests/pedalboard.test.ts`.

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
