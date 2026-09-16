# Deploy Pitch on GKE

The cluster runs the studio as a fleet (`docs/studio-architecture.md` →
Scaling): stateless **API** pods behind the Ingress, **worker** pods that own
projects, one shared **browser manager** for user browser sessions. Workers
scale on demand and drain gently when load drops. Cloud SQL is the database;
Cloud Storage holds media, browser profiles and workspace checkpoints, spoken
to through its S3-compatible endpoint so the storage code (and a later move
to another cloud) stays the same as with MinIO. The frontend stays on Vercel.
`infra/gke` and `scripts/render-gke.mjs` produce the Kubernetes resources.

The production deployment is named **silverfish** throughout GCP (cluster,
Cloud SQL instance, buckets `silverfish-*`, registry, service account, static
IP) in project `your-gcp-project`, region `asia-southeast1`; the
Kubernetes namespace stays `pitch`. It answers on `api-v2.trypitch.co` until
the Compose host is retired and `api.trypitch.co` is pointed at it.

**Portability.** Credits on this project run out at the end of 2026 and the
fleet may move to Azure then. Postgres, the S3 API, plain Kubernetes and KEDA
carry over. The GKE-specific pieces are deliberately few and in their own
places: `ingress.yaml` (GCE Ingress, ManagedCertificate, BackendConfig),
`storage.yaml` (PD storage class), `service-account.yaml` (Workload Identity)
and the `cloud-sql-proxy` sidecar in `api.yaml`, `worker.yaml` and
`migrate.yaml`. Swapping those for AKS equivalents is a manifest change.

```
                 Ingress (GCE, managed TLS)
                        │
                  Service pitch ──── Deployment pitch      STUDIO_ROLE=api   HPA on CPU, 2–6
                                          │ /internal/worker (STUDIO_WORKER_TOKEN)
                                          ▼
                 StatefulSet pitch-worker  STUDIO_ROLE=worker KEDA on slots, 1–8
                   pitch-worker-0  ┐  each: worker + CloakBrowser + cloud-sql-proxy,
                   pitch-worker-1  │        its own disk (warm workspaces),
                   …               ┘        STUDIO_WORKER_URL = pod IP
                 Deployment pitch-browser  the manager API pods share for /browser
                 Job pitch-migrate-<release>  prisma migrate deploy, before each rollout
```

| Resource | File | Notes |
| --- | --- | --- |
| Deployment `pitch` + HPA + PDB | `api.yaml` | no disk, no sandbox privileges |
| StatefulSet `pitch-worker` + headless Service + PDB | `worker.yaml` | one PVC per ordinal, `terminationGracePeriodSeconds: 1900` |
| ScaledObject + TriggerAuthentication | `autoscaling.yaml` | KEDA `metrics-api` on `GET /internal/scale` |
| Deployment `pitch-browser` + Service + PVC | `browser.yaml` | |
| Job `pitch-migrate-<RELEASE>` | `migrate.yaml` | rendered separately, applied first |
| Connector, egress Service | `tailscale/` | optional; see Tailscale below |

## Provision once

- Use GKE **Standard**, Kubernetes 1.31+, a VPC-native cluster with Workload
  Identity, the GCE Ingress controller and the Persistent Disk CSI driver.
  Autopilot's restricted security policy cannot run the bubblewrap sandbox.
- Two node pools, both amd64 Linux, both with the **cluster autoscaler** on:
  a small pool for the API and browser manager (e2-standard-4, min 2), and a
  worker pool sized for a worker pod's 3.6 CPU / 7+ GiB requests and
  rendering bursts (e2-standard-8 fits two, min 1, max = the ScaledObject's
  `maxReplicaCount`). Turn on **image streaming** for the worker pool: a new
  worker is a new node plus a multi-gigabyte pull, and that is the scale-up
  latency the headroom is there to hide.
- Restrict the bubblewrap exception (`SYS_ADMIN`, unconfined seccomp/AppArmor)
  to the worker pool and the `pitch` namespace, and run the shipped sandbox
  check on the chosen node image.
- Enable Artifact Registry and create a Docker repository in the cluster's
  region. Give the **node** service account Artifact Registry Reader; image
  pulls do not use the workload's identity.
- Create Cloud SQL PostgreSQL 15 with private IP reachable from the cluster VPC,
  automated backups, PITR and a `pitch` database/user. Enable the SQL Admin API.
  Allow private TCP 3307 from the nodes to Cloud SQL (the proxy uses this port).
- Create three Cloud Storage buckets in the cluster's region, names of your
  choosing (they are global): **media** — public, `allUsers` gets
  `roles/storage.objectViewer`, uniform bucket-level access; **profiles** and
  **workspaces** — private. Enable Object Versioning on the workspaces
  bucket; a checkpoint is the durable copy of every workspace. The S3 API
  cannot create buckets on GCS, so they must exist before the first pod. If
  media should be served from your own hostname, put a load balancer or CDN
  in front of the media bucket and set `GKE_MEDIA_PUBLIC_URL` to it;
  otherwise `https://storage.googleapis.com`.
- Create a runtime Google service account with `roles/cloudsql.client` on the
  SQL project and `roles/storage.objectAdmin` on the three buckets. Grant
  `roles/iam.workloadIdentityUser` on it to
  `serviceAccount:PROJECT_ID.svc.id.goog[pitch/pitch]` (Cloud SQL uses
  Workload Identity). Create an **HMAC key** for the same service account
  (`gcloud storage hmac create SA_EMAIL`); its access id and secret are the
  `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in the runtime Secret, and are
  how storage is reached.
- Install **KEDA** (`helm install keda kedacore/keda -n keda --create-namespace`).
  The worker ScaledObject needs its CRDs; `kubectl apply --dry-run=server`
  fails before anything is touched if they are missing.
- Reserve a global external address for the GCE Ingress. Set its resource name
  as `GKE_STATIC_IP_NAME`; point the API hostname's A record at that address.
  Managed TLS provisioning requires the hostname to resolve to the load balancer.

The manager has no public Service; only the API is exposed. Workers are
reached by pod IP inside the VPC, never through the Ingress.

## Runtime secrets

Create the `pitch` namespace (`kubectl apply -f infra/gke/namespace.yaml`) and
the `pitch-runtime` Secret there before the first deployment. Provision it
through your secret-management system; never commit values or an exported
Secret manifest. Use `.env.example` as the full capability inventory.

Required keys:

| Key | Value/meaning |
| --- | --- |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@127.0.0.1:5432/pitch?schema=public&connect_timeout=3&pool_timeout=3` (URL-encode credentials) |
| `STUDIO_WORKER_TOKEN` | Long random value; every process's credential for the worker contract, and what KEDA presents to `/internal/scale` |
| `PREVIEW_COOKIE_SECRET` | Stable random signing key, the same on every pod |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Production Clerk application |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Production webhook endpoint |
| `GEMINI_API_KEY` | Default studio model and media generation |
| `IP_SALT` | Stable random value |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | The runtime service account's HMAC access id and secret |

Add ElevenLabs, Dodo (including `DODO_ENVIRONMENT=live_mode`), Resend and other
capability keys used by your deployment. Keep optional unfinished services off
until their credentials/webhooks are configured. Cloud SQL uses Workload
Identity; storage uses the HMAC key; no Google key file anywhere.

Storage, buckets and every studio knob come from the ConfigMap the
kustomization generates (`STORAGE_DRIVER=s3` against
`MINIO_ENDPOINT=https://storage.googleapis.com`, `STORAGE_BUCKET`,
`STORAGE_PROFILES_BUCKET`, `STUDIO_WORKSPACE_BUCKET`, `STUDIO_WORKER_SLOTS`,
`STUDIO_SCALE_HEADROOM`, the whisper model) and are rendered from the
variables below.

## Render and release

Build `Dockerfile.base`, `apps/api/Dockerfile` and `apps/discord-bot/Dockerfile`
for **linux/amd64**, publish to Artifact Registry, and supply the base digest as
the API's `RUNTIME_IMAGE` build argument. Every image is required to use a
digest. Choose a tested amd64 CloakBrowser manager release and record its digest.

The Discord bot (`infra/gke/discord-bot.yaml`) is one replica of a stateless
adapter: it reaches the API at `http://pitch` inside the cluster and gets only
its own `DISCORD_*` keys from `pitch-runtime` — the same values the API uses.
Never run a second copy (the Compose host's `discord` profile, a laptop): the
same token in two places answers every `/video` twice.

Set these non-secret environment variables before rendering:

```text
API_IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/pitch-api@sha256:DIGEST
BOT_IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/pitch-discord-bot@sha256:DIGEST
CLOAK_IMAGE=cloakhq/cloakbrowser-manager@sha256:DIGEST
API_HOST=api.example.com
APP_URL=https://app.example.com
MEDIA_PUBLIC_URL=https://storage.googleapis.com
GCP_SERVICE_ACCOUNT=pitch-runtime@PROJECT.iam.gserviceaccount.com
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
GKE_STATIC_IP_NAME=pitch-api-ip
MEDIA_BUCKET=example-pitch-media
PROFILES_BUCKET=example-pitch-profiles
WORKSPACE_BUCKET=example-pitch-workspaces
```

A release is two applies:

```bash
RELEASE=$(git rev-parse --short HEAD) node scripts/render-gke.mjs migrate | kubectl apply -f -
kubectl wait -n pitch --for=condition=complete job/pitch-migrate-$RELEASE --timeout=900s
node scripts/render-gke.mjs | kubectl apply --dry-run=server -f - && node scripts/render-gke.mjs | kubectl apply -f -
kubectl rollout status deployment/pitch -n pitch --timeout=900s
kubectl rollout status statefulset/pitch-worker -n pitch --timeout=5h
```

The migration runs once per release as a Job, ahead of the rollout; the
containers themselves start straight into Bun. A failed migration stops the
release before any pod changes. Take backups before schema changes; an image
rollback does not roll back SQL migrations.

`node scripts/render-gke.mjs` writes manifests to stdout using `kubectl
kustomize` (set `KUSTOMIZE_BIN=kustomize` for standalone Kustomize). It
validates inputs and substitutes **before** hashing the ConfigMap, so config
changes trigger a new rollout. Neither the Deployment nor the StatefulSet
carries a `replicas` field: the HPA and the ScaledObject own those, and a
value in the manifest would undo them on every apply.

Workers roll one ordinal at a time, highest first, and each one **drains
gently** before its replacement starts: placement stops sending it projects,
it keeps serving the ones it holds until their turn ends, checkpoints each and
lets it go (`STUDIO_DRAIN_MS`, 30 minutes; whatever is still running then is
cut). A rollout therefore takes as long as the longest active turn per
worker, and the workflow allows five hours for it. Users on a draining worker
see a reconnect, not a loss.

The `Deploy GKE` workflow automates tests, builds, the migration, server-side
validation and the rollout. Configure a GitHub OIDC Workload Identity
Federation provider restricted to this repository and its `production-gke`
environment. Grant its deploy service account Artifact Registry Writer,
cluster credential access and Kubernetes RBAC for the supplied resources.
Namespace/StorageClass management is cluster-scoped and may instead be
pre-provisioned by your platform admin. For private control planes, run this
job on a runner with cluster connectivity (or through the Tailscale API
server proxy, below).

GitHub configuration:

- **Repository** variable `DEPLOY_TARGET`: `both` runs this workflow *and*
  the legacy Compose deploy on every push to `main` (the transition, while
  `api.trypitch.co` is still the Compose host and `api-v2` is the cluster);
  `gke` runs only this one. Unset, only the Compose deploy runs.
- `production-gke` environment variables, as set for silverfish (run with a
  `gh` login that can administer `hormuz-labs/pitch`):

  ```bash
  gh api -X PUT repos/hormuz-labs/pitch/environments/production-gke >/dev/null
  gh variable set DEPLOY_TARGET --body both
  while IFS='=' read -r k v; do gh variable set "$k" --env production-gke --body "$v"; done <<'EOF'
  GCP_PROJECT_ID=your-gcp-project
  GCP_REGION=asia-southeast1
  GCP_ARTIFACT_REPOSITORY=silverfish
  GCP_WORKLOAD_IDENTITY_PROVIDER=projects/343322085368/locations/global/workloadIdentityPools/github/providers/github
  GKE_DEPLOY_SERVICE_ACCOUNT=silverfish-deploy@your-gcp-project.iam.gserviceaccount.com
  GKE_RUNTIME_SERVICE_ACCOUNT=silverfish-runtime@your-gcp-project.iam.gserviceaccount.com
  GKE_CLUSTER=silverfish
  GKE_LOCATION=asia-southeast1-b
  CLOUD_SQL_CONNECTION_NAME=your-gcp-project:asia-southeast1:silverfish
  GKE_STATIC_IP_NAME=silverfish-api
  GKE_API_HOST=api-v2.trypitch.co
  GKE_API_EXTRA_HOSTS=            # later: api.trypitch.co, see the DNS cutover below
  GKE_APP_URL=https://app.trypitch.co
  GKE_MEDIA_PUBLIC_URL=https://storage.googleapis.com
  GKE_MEDIA_BUCKET=silverfish-media
  GKE_PROFILES_BUCKET=silverfish-profiles
  GKE_WORKSPACE_BUCKET=silverfish-workspaces
  CLOAK_IMAGE=cloakhq/cloakbrowser-manager@sha256:eaa08b54f7d30f3512e1f8faa1e457fe340e868af9f76b5f6bad282b3bd7ae2d
  EOF
  ```

  The deploy service account authenticates through the `github` Workload
  Identity pool, restricted to `assertion.repository == 'hormuz-labs/pitch'`;
  no key is stored in GitHub.
- Set Vercel `VITE_API_URL` to the final HTTPS API origin and redeploy the web app.
  Update Clerk/Dodo webhook destinations and allowed origins/redirects.

## Autoscaling

**Workers scale on slots, not CPU.** A worker mid-turn is mostly waiting on a
model; CPU says nothing about whether the next project has somewhere to go.
The API answers `GET /internal/scale` (behind `STUDIO_WORKER_TOKEN`) with

```json
{ "workers": 2, "slots": 8, "held": 5, "wanted": 2 }
```

where `wanted` is the number of workers it takes to hold every leased
project and still keep `STUDIO_SCALE_HEADROOM` (2) slots free, at
`STUDIO_WORKER_SLOTS` (4) per worker. KEDA polls it every 15 s and sets the
StatefulSet to `wanted`, between 1 and 8. A draining worker still counts its
projects but not its slots, so its replacement is asked for before it is gone.

**Up is quick, down is slow.** Scale-up has no stabilisation window and adds
up to two pods a minute; the cluster autoscaler brings the node, the pod
pulls the image, registers, and is placed on within about a minute of
becoming ready. That takes minutes end to end, which is why the headroom
exists: a new project lands in a free slot now, and the fleet grows behind
it. Scale-down waits for thirty minutes of stability and removes one pod
every ten minutes, because every removal is a gentle drain (above) and a
short dip is not worth paying that for.

**Which pod goes.** Placement packs projects onto the lowest-numbered worker
with a free slot (`worker/lease.ts`), so the highest ordinal — the one a
StatefulSet removes — is the one with the least on it, usually nothing. Its
PersistentVolumeClaim stays; when load returns, `pitch-worker-N` comes back
with its warm copies on disk and placement prefers it for the projects it
last held.

**The API scales on CPU** (60%, 2–6 pods): it is request-bound and holds
nothing. Its PodDisruptionBudget keeps one pod up through node maintenance;
the workers' allows one eviction at a time.

Watch it: `kubectl get scaledobject,hpa -n pitch` shows the current number
and the HPA KEDA manages; `curl -H "Authorization: Bearer $STUDIO_WORKER_TOKEN" http://pitch.pitch.svc/internal/scale`
from inside the cluster shows the raw figures; `StudioWorker` rows in the
database show who is live and who is draining.

## Tailscale

Optional. The fleet does not need it — pods reach each other by VPC address —
but it is how a machine outside the cluster joins: a laptop that wants Cloud
SQL and the pods, a GPU box in a rack, a worker on another cloud. Install the
[Tailscale Kubernetes operator](https://tailscale.com/kb/1236/kubernetes-operator)
once (an OAuth client with the `k8s-operator` tag; `helm install tailscale-operator tailscale/tailscale-operator -n tailscale --create-namespace --set-string oauth.clientId=… --set-string oauth.clientSecret=…`).

**The cluster on the tailnet.** A subnet router advertising the VPC ranges the
fleet lives on — the node/pod/Service CIDRs of the cluster and the private
services range Cloud SQL sits in:

```bash
TAILSCALE_ROUTES=10.10.0.0/20,10.20.0.0/24 node scripts/render-gke.mjs tailscale | kubectl apply -f -
```

Approve the routes in the admin console (or with `autoApprovers` in the
tailnet policy). Any tailnet machine running `tailscale up --accept-routes`
then reaches Cloud SQL's private address, the `pitch` Service and every pod.
The operator can also expose the Kubernetes API server itself
(`apiServerProxyConfig.mode=true` in the Helm values) so `kubectl` and the
deploy runner reach a private control plane without a bastion.

**A worker node anywhere.** Pods have no route onto the tailnet, so a machine
that joins gets a name inside the cluster instead: an egress Service the
operator proxies to that machine's tailnet address. On the cluster side, once
per machine:

```bash
NODE_NAME=gpu-1 NODE_TAILNET_FQDN=gpu-1.tail1234.ts.net node scripts/render-gke.mjs node | kubectl apply -f -
```

On the machine: Docker, Tailscale (`tailscale up --accept-routes`), the
and `docker-compose.node.yml`:

```bash
cp .env.example .env.node   # DATABASE_URL at Cloud SQL's private address (sslmode=require),
                            # the MINIO_* endpoint and HMAC key, the three bucket names,
                            # STUDIO_WORKER_TOKEN, PREVIEW_COOKIE_SECRET, the model keys —
                            # the cluster's values
API_IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/pitch-api@sha256:DIGEST \
NODE_NAME=gpu-1 TAILSCALE_IP=$(tailscale ip -4) \
docker compose -f docker-compose.node.yml --env-file .env.node up -d
```

The worker registers as `node-gpu-1` at
`http://node-gpu-1.pitch.svc.cluster.local:3000`, heartbeats through Cloud
SQL, and is placed on like any other. It listens only on its tailnet address.
It is not part of the StatefulSet, so the autoscaler neither adds nor removes
it — it is fixed capacity, and `/internal/scale` counts its slots before
asking for elastic ones (`STUDIO_SCALE_GROUP`, the id prefix of the workers
KEDA owns, is `pitch-worker-`). Placement packs by id and `node-…` sorts
before `pitch-worker-…`, so the machine you already pay for fills first and
the cluster's workers take the overflow. Stop it with `docker compose down`,
which drains it gently. Pull the model once with `make whisper-model` (or copy it
into `docker-data/whisper`).

## Verify before DNS cutover

- `/health/live` returns 200 without dependency checks. `/health/ready` verifies
  SQL (and, on workers, real writes on the project volume); it returns 503
  while draining or when checks fail. The browser and SQL proxy have
  independent pod probes.
- Run `kubectl exec -n pitch pitch-worker-0 -c worker -- node scripts/sandbox-check.mjs`.
  Verify its isolation results; never fall back to `STUDIO_SANDBOX=none`.
- Create a project, send a prompt, reconnect its SSE stream, then
  `kubectl delete pod pitch-worker-0` mid-turn: the turn finishes on the old
  pod (watch its logs say `draining: waiting for turns to finish`), the
  project is checkpointed, and the next prompt lands on the new pod with
  the workspace and chat history intact.
- Scale by hand once — `kubectl scale statefulset/pitch-worker -n pitch --replicas=2`
  — and confirm the second worker's row appears in `StudioWorker` and new
  projects land on `pitch-worker-0` first. Then let KEDA own it again (it
  will, on its next poll).
- Confirm the whisper model is readable on a worker and run a short
  transcription/render.
- Exercise uploads (including a large recording), public output URLs, thumbnail
  rendering, and browser/VNC interaction through HTTPS. The backend timeout is
  one hour for SSE/WebSockets/uploads; clients must still reconnect normally.
- Check logs in Cloud Logging, alerts for pod restarts/disk usage/SQL errors,
  production payment webhooks and credit metering.
- Confirm a full SQL restore and an application image rollback in staging.

## DNS cutover

`api.trypitch.co` is baked into users' MCP configs, `openapi.json` and the
web app's `/r/` and `/d/` rewrites, so the real go-live is moving that A
record to the static IP, not changing `VITE_API_URL`. Every host gets its own
`ManagedCertificate` (`API_EXTRA_HOSTS`, comma-separated), because Google
issues one only after that host's DNS resolves to the load balancer — a host
still waiting on its DNS must not hold back the ones already serving. Order:

1. Finish the data move below.
2. Set `GKE_API_EXTRA_HOSTS=api.trypitch.co` and deploy: the `pitch-2`
   certificate sits in `FailedNotVisible` until DNS moves.
3. Point the `api` A record at `34.120.181.8` (DNS-only). HTTPS on `api` is
   broken for 15–60 minutes while the certificate is issued — do it at a
   quiet hour. Watch `kubectl -n pitch get managedcertificate`.
4. Retire the Compose host and set `DEPLOY_TARGET=gke`.

## Migrating from the Compose host

Workspaces and pi transcripts on the Compose host are the source of truth for
projects that predate checkpoints (`workspaceVersion = 0`); a worker opening
one with no local copy would start it empty. So:

1. Stop incoming work and wait for active sessions/exports to finish on the
   old host. Back up PostgreSQL, `projects/`, `docker-data/pi/`, the
   CloakBrowser `/data` volume. Restore SQL to Cloud SQL.
2. Media is not copied: the old MinIO stays reachable at its public URL,
   so existing output links keep working while new renders land in Cloud
   Storage. (If MinIO is ever retired, `mc mirror` the bucket across and
   rewrite `Project.outputs` to the new origin.)
3. Before the first rollout, mount `state-pitch-worker-0` in a maintenance
   pod (create the PVC by that name with the worker's storage class and
   size so the StatefulSet adopts it) and copy `projects/` and `pi/` into
   its `projects` and `pi` subdirectories, and the manager's `/data` into
   `pitch-browser-data`. Stored `Project.sessionFile` paths must resolve
   after the move.
4. Once `pitch-worker-0` has opened each project it will be checkpointed on
   its first change; from then on the disk is a cache and any worker can
   take the project.

Placing the old data on ordinal 0 matters: placement packs there first, and
it is the worker that never scales away.

## Rollback and operations

Roll back to the previous API/manager image digests through the same render
procedure, or `kubectl rollout undo` on the Deployment/StatefulSet for a
pod-template rollback. Keep previous ConfigMaps, images and backups until
the release is verified. Review schema compatibility first.

Node maintenance evicts one worker at a time and each eviction drains gently;
the API keeps one pod up throughout. A worker that dies outright loses the
turn in flight since its last checkpoint and any live browser recording;
its projects are re-placed on the next request. Scheduled disk snapshots of
the worker PVCs are a convenience for warm caches, not a backup: the
workspaces bucket is.
