# Cloudflare Tunnel Setup

This project uses **Cloudflare Tunnels** (`cloudflared`) to expose services publicly with zero open inbound ports on the server. Cloudflare terminates TLS on its edge — no certificates to manage.

## How it works

```
  Browser
    │  HTTPS (443)
    ▼
  Cloudflare Edge  ←──  cloudflared container (outbound only)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              api:3000               minio:9001
         (api.trypitch.co)    (minio.trypitch.co)
```

The `cloudflared` container dials **outbound** to Cloudflare. No ports 80 or 443 need to be open on the server firewall.

---

## Prerequisites

- A domain added to Cloudflare (trypitch.co is already configured)
- Access to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)

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

Open your `.env` file and set:

```env
TUNNEL_TOKEN="eyJhIjoiABC123..."
```

The `cloudflared` service in `docker-compose.yml` reads this variable automatically.

---

## Step 4 — Configure public hostnames

Back in the Cloudflare dashboard, open the tunnel you just created and go to the **Public Hostname** tab. Add two entries:

| Subdomain | Domain      | Type | URL             |
|-----------|-------------|------|-----------------|
| `api`     | trypitch.co | HTTP | `api:3000`      |
| `minio`   | trypitch.co | HTTP | `minio:9001`    |

> Use `http://` (not `https://`) for the internal service URL — traffic between `cloudflared` and your containers stays inside the Docker network and does not need TLS.

Cloudflare will automatically create the DNS records for both subdomains.

---

## Step 5 — Deploy

```bash
docker compose up -d
```

Verify the tunnel is connected:

```bash
docker compose logs cloudflared
```

You should see a line like:

```
Registered tunnel connection connIndex=0 ... location=SIN
```

Both URLs should now be live with HTTPS:

- `https://api.trypitch.co`
- `https://minio.trypitch.co`

---

## Notes

- The MinIO **S3 API** (port `9000`) is intentionally **not** exposed through the tunnel. It is only used internally by the `api` and `worker` containers via the Docker network.
- To rotate the tunnel token, generate a new one in the Cloudflare dashboard, update `TUNNEL_TOKEN` in `.env`, and restart the `cloudflared` container:
  ```bash
  docker compose restart cloudflared
  ```
- If you need to temporarily take the tunnel offline without stopping the whole stack:
  ```bash
  docker compose stop cloudflared
  ```
