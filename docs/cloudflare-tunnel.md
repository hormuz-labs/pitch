# Cloudflare Tunnel Setup

This project uses a **Cloudflare Tunnel** (`cloudflared`) to expose services publicly with zero open inbound ports on the server. Cloudflare terminates TLS on its edge — no certificates to manage.

The connector runs **directly on the host** (bare metal), not in Docker. Running it on the host lets the same tunnel also reach other, non-Docker services on the machine over `http://localhost:<port>`.

## How it works

```
  Browser
    │  HTTPS (443)
    ▼
  Cloudflare Edge  ←──  cloudflared (host systemd service, outbound only)
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
     localhost:3000      localhost:9001      localhost:3002
        (api)            (minio console)      (grafana)
     ...and any other service listening on a host port
```

The host `cloudflared` dials **outbound** to Cloudflare. No ports 80 or 443 need to be open on the firewall.

Because the connector is a host process, it reaches the containers through their **host-published ports bound to `127.0.0.1`** (see `docker-compose.yml`). Those ports are reachable only from the host itself — they are not exposed to the LAN.

> This host connector (`cloudflared-pitch.service`, token-tunnel for `trypitch.co`) is independent of any other tunnel on the machine. It deliberately does **not** load `/etc/cloudflared/config.yml`, so it will not interfere with the existing `obybuy.com` connector (`cloudflared.service`).

---

## Prerequisites

- A domain added to Cloudflare (`trypitch.co` is already configured)
- Access to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
- `cloudflared` installed on the host at `/usr/bin/cloudflared` (already present on this server)

---

## Step 1 — Create the tunnel

1. Go to **one.dash.cloudflare.com**
2. Navigate to **Networks → Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** as the connector type
5. Give the tunnel a name, e.g. `pitch`
6. Click **Save tunnel**

---

## Step 2 — Copy the tunnel token

After saving, Cloudflare shows an installation command that includes a long token:

```
cloudflared service install eyJhIjoiABC123...
```

Copy everything after `install ` — that is your `TUNNEL_TOKEN`.

---

## Step 3 — Add the token to your environment

Open the project's `.env` file and set:

```env
TUNNEL_TOKEN="eyJhIjoiABC123..."
```

The host systemd service (`scripts/cloudflared/cloudflared-pitch.service`) reads this variable from the `.env` via `EnvironmentFile=`, so the token stays in one place.

---

## Step 4 — Configure public hostnames

Back in the Cloudflare dashboard, open the tunnel and go to the **Public Hostname** tab. Point each hostname at the **host localhost port** the container is bound to:

| Subdomain | Domain      | Type | URL                    |
|-----------|-------------|------|------------------------|
| `api`     | trypitch.co | HTTP | `http://localhost:3000` |
| `minio`   | trypitch.co | HTTP | `http://localhost:9001` |
| `s3`      | trypitch.co | HTTP | `http://localhost:9002` |
| `loki`    | trypitch.co | HTTP | `http://localhost:3101` |
| `grafana` | trypitch.co | HTTP | `http://localhost:3002` |
| `pgweb`   | trypitch.co | HTTP | `http://localhost:8081` |

> Use `http://localhost:<port>` (equivalently `http://127.0.0.1:<port>`). The connector is a host process, so `localhost` is the host itself.
>
> Do **not** use `host.docker.internal` here — that hostname resolves from *inside a container* back to the host, which is the opposite direction and meaningless to a connector that already runs on the host.

Because the connector is on the host, you can also add hostnames for **any other local service** listening on a host port (Docker or not), e.g. `http://localhost:5173` for a dev server.

Cloudflare will automatically create the DNS records for each hostname.

### Host-port reference (127.0.0.1 only)

| Service  | Container port | Host port (127.0.0.1) |
|----------|----------------|------------------------|
| api      | 3000           | 3000                   |
| minio S3 | 9000           | 9002                   |
| minio UI | 9001           | 9001                   |
| loki     | 3100           | 3101                   |
| grafana  | 3000           | 3002                   |
| pgweb    | 8081           | 8081                   |

---

## Step 5 — Deploy

Apply the compose changes (this binds the service ports to `127.0.0.1` and removes the old in-Docker connector), then install and start the host connector:

```bash
# 1. Apply compose changes and drop the orphan in-Docker connector
docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml up -d
docker rm -f pitch_cloudflared 2>/dev/null || true

# 2. Install + enable the host service (prompts for sudo)
./scripts/cloudflared/install.sh

# 3. Start the host connector
sudo systemctl start cloudflared-pitch
```

Verify the tunnel is connected and serving the **pitch** hostnames (not the `obybuy.com` ones from the other tunnel):

```bash
journalctl -u cloudflared-pitch -n 50 --no-pager
```

You should see a line like:

```
Registered tunnel connection connIndex=0 ... location=SIN
```

The hostnames should now be live with HTTPS, e.g. `https://api.trypitch.co`.

---

## Notes

- The MinIO **S3 API** (port `9000`, host `9002`) is used internally by `api`/`worker` over the Docker network (`http://minio:9000`). Exposing it through the tunnel as `s3.trypitch.co` is only needed if external clients must upload/download directly.
- To rotate the tunnel token, update `TUNNEL_TOKEN` in `.env` and restart the host connector:
  ```bash
  sudo systemctl restart cloudflared-pitch
  ```
- To temporarily take the tunnel offline without touching the rest of the stack:
  ```bash
  sudo systemctl stop cloudflared-pitch
  ```
- The unit is installed at `/etc/systemd/system/cloudflared-pitch.service`. Its source of truth in this repo is `scripts/cloudflared/cloudflared-pitch.service` — re-run `./scripts/cloudflared/install.sh` after editing it.
