# Deploy Pitch on GKE

The launch topology is **one API pod** (`STUDIO_ROLE=all`), with CloakBrowser
and Cloud SQL Auth Proxy alongside it. To add capacity, run the same image as
a `worker` Deployment (one CloakBrowser per pod, its own `projects/` and pi
volumes, `STUDIO_WORKER_URL` set to the pod's cluster address, the shared
`STUDIO_WORKER_TOKEN`) — see `docs/studio-architecture.md` → Scaling. The frontend stays on Vercel. Cloud SQL replaces the local
PostgreSQL container; the existing S3-compatible media service remains external.
`infra/gke` and `scripts/render-gke.mjs` produce the Kubernetes resources.

## Provision once

- Use GKE **Standard**, Kubernetes 1.31+, a VPC-native cluster with Workload
  Identity, the GCE Ingress controller and the Persistent Disk CSI driver.
  Allocate an amd64 Linux node pool large enough for the pod's 3.1 CPU / 6+ GiB
  requests and rendering bursts. Start with e2-standard-16 nodes. Autopilot's
  restricted security policy cannot run the existing bubblewrap sandbox.
- Enable Artifact Registry and create a Docker repository in the cluster's
  region. Give the **node** service account Artifact Registry Reader; image
  pulls do not use the workload's identity.
- Create Cloud SQL PostgreSQL 15 with private IP reachable from the cluster VPC,
  automated backups, PITR and a `pitch` database/user. Enable the SQL Admin API.
  Allow private TCP 3307 from the nodes to Cloud SQL (the proxy uses this port).
- Create a runtime Google service account with `roles/cloudsql.client` on the
  SQL project. Grant `roles/iam.workloadIdentityUser` on it to
  `serviceAccount:PROJECT_ID.svc.id.goog[pitch/pitch]`. The Kubernetes account
  annotation is populated by `GCP_SERVICE_ACCOUNT`.
- Reserve a global external address for the GCE Ingress. Set its resource name
  as `GKE_STATIC_IP_NAME`; point the API hostname's A record at that address.
  Managed TLS provisioning requires the hostname to resolve to the load balancer.
- Configure production S3/MinIO with durable storage/backups and HTTPS. Preserve
  the current public media hostname so saved output URLs continue to work.
  The current storage package is S3-compatible, **not a native GCS client**;
  do not point `MINIO_ENDPOINT` at the GCS JSON API. Media is public in the
  current contract; the browser profile bucket must remain private.

The API container needs `SYS_ADMIN` and unconfined seccomp/AppArmor for the
existing bubblewrap sandbox. Restrict this exception to the Pitch node pool
and namespace, and run the shipped sandbox check on the chosen node image.
The manager has no public Service; only the API is exposed. The manager uses
loopback inside the pod, including CDP and preview requests.

## Runtime secrets

Create the `pitch` namespace (`kubectl apply -f infra/gke/namespace.yaml`) and
the `pitch-runtime` Secret there before the first deployment. Provision it
through your secret-management system; never commit values or an exported
Secret manifest. Use `.env.example` as the full capability inventory.

Required keys:

| Key | Value/meaning |
| --- | --- |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@127.0.0.1:5432/pitch?schema=public&connect_timeout=3&pool_timeout=3` (URL-encode credentials) |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Production Clerk application |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Production webhook endpoint |
| `GEMINI_API_KEY` | Default studio model and media generation |
| `PREVIEW_COOKIE_SECRET` | Stable random signing key across restarts |
| `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` | Existing S3-compatible service |
| `IP_SALT` | Stable random value |

Add ElevenLabs, Dodo (including `DODO_ENVIRONMENT=live_mode`), Resend and other
capability keys used by your deployment. Keep optional unfinished services off
until their credentials/webhooks are configured. Cloud SQL uses Workload
Identity, so no Google service-account JSON key is needed. The database
password still authenticates the PostgreSQL user through the proxy.

## State and migration

The retained 200 GiB PVC contains `projects/`, `pi/`, `browser/`, and `whisper/`.
Size it against current usage plus rendering headroom; enable scheduled disk
snapshots/Backup for GKE and rehearse restoring it with a matching SQL backup.
`Retain` prevents PV deletion from destroying the disk; it is not a backup.

1. Stop incoming work and wait for active sessions/exports to finish on the old
   host. This deployment is intentionally singleton and uses `Recreate`.
2. Back up PostgreSQL, `projects/`, `docker-data/pi/`, the CloakBrowser `/data`
   volume and the whisper model. Restore SQL to Cloud SQL.
3. Before the first API start, populate the PVC using a temporary maintenance
   pod mounting `pitch-state` at `/state`. Copy the directories into their
   matching subdirectories. Do not copy only published media: workspaces and
   pi transcripts are the source of truth.
4. Preserve `/app/projects`, `/root/.pi/agent` and browser `/data` paths. Stored
   `Project.sessionFile` paths must resolve after migration. Native-host source
   installs may need an explicit DB path rewrite after validating the copied
   transcript files.
5. Place a verified whisper.cpp `ggml-base.en.bin` in `whisper/`. Obtain the
   model from the whisper.cpp project's published model source and verify its
   published SHA-256 before copying. Models are deliberately not baked into
   the application image.
6. Remove the maintenance pod before starting the API. The main command runs
   `prisma migrate deploy` once on the sole API instance, then `exec`s Bun.
   A failed migration prevents readiness and rollout completion. Take backups
   before schema changes; an image rollback does not roll back SQL migrations.

To stage a new install, populate the empty PVC and model before enabling the
production workflow. Initial storage provisioning may require the maintenance
pod to schedule because the storage class uses `WaitForFirstConsumer`.

## Render and release

Build `Dockerfile.base` and `apps/api/Dockerfile` for **linux/amd64**, publish to
Artifact Registry, and supply the base digest as the API's `RUNTIME_IMAGE`
build argument. API and manager images are required to use digests. Choose a
tested amd64 CloakBrowser manager release and record its digest.

Set these non-secret environment variables before rendering:

```text
API_IMAGE=REGION-docker.pkg.dev/PROJECT/REPOSITORY/pitch-api@sha256:DIGEST
CLOAK_IMAGE=cloakhq/cloakbrowser-manager@sha256:DIGEST
API_HOST=api.example.com
APP_URL=https://app.example.com
MEDIA_PUBLIC_URL=https://media.example.com
GCP_SERVICE_ACCOUNT=pitch-runtime@PROJECT.iam.gserviceaccount.com
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
GKE_STATIC_IP_NAME=pitch-api-ip
```

`node scripts/render-gke.mjs` writes manifests to stdout using `kubectl
kustomize`. If standalone Kustomize is installed, set `KUSTOMIZE_BIN=kustomize`.
The renderer validates inputs and substitutes **before** hashing the ConfigMap,
so config changes trigger a new pod. Review the rendered output, then use
`kubectl apply --dry-run=server` and `kubectl apply`; watch
`kubectl rollout status deployment/pitch -n pitch --timeout=900s`.

The `Deploy GKE` workflow automates tests, builds, server-side validation and
rollout. Configure a GitHub OIDC Workload Identity Federation provider restricted
to this repository and its `production-gke` environment. Grant its deploy
service account Artifact Registry Writer, cluster credential access and
Kubernetes RBAC for the supplied resources. Namespace/StorageClass management
is cluster-scoped and may instead be pre-provisioned by your platform admin.
For private control planes, run this job on a runner with cluster connectivity.

GitHub configuration:

- **Repository** variable `DEPLOY_TARGET=gke` selects this workflow and disables
  the legacy Compose deploy. Set this only at cutover. Before that, use the
  manual render/apply procedure against staging.
- `production-gke` environment variables: `GCP_PROJECT_ID`, `GCP_REGION`,
  `GCP_ARTIFACT_REPOSITORY`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `GKE_DEPLOY_SERVICE_ACCOUNT`, `GKE_RUNTIME_SERVICE_ACCOUNT`, `GKE_CLUSTER`,
  `GKE_LOCATION`, `CLOUD_SQL_CONNECTION_NAME`, `GKE_STATIC_IP_NAME`,
  `GKE_API_HOST`, `GKE_APP_URL`, `GKE_MEDIA_PUBLIC_URL`, `CLOAK_IMAGE`.
- Set Vercel `VITE_API_URL` to the final HTTPS API origin and redeploy the web app.
  Update Clerk/Dodo webhook destinations and allowed origins/redirects.

## Verify before DNS cutover

- `/health/live` returns 200 without dependency checks. `/health/ready` verifies
  SQL and real writes on project/session volumes; it returns 503 while draining
  or when checks fail. The browser and SQL proxy have independent pod probes.
- Run `kubectl exec -n pitch deployment/pitch -c api -- node scripts/sandbox-check.mjs`.
  Verify its isolation results; never fall back to `STUDIO_SANDBOX=none`.
- Create a project, send a prompt, reconnect its SSE stream, restart the pod,
  and verify both workspace and chat history persist. Confirm the whisper model
  is readable and run a short transcription/render.
- Exercise uploads (including a large recording), public output URLs, thumbnail
  rendering, and browser/VNC interaction through HTTPS. The backend timeout is
  one hour for SSE/WebSockets/uploads; clients must still reconnect normally.
- Check logs in Cloud Logging, alerts for pod restarts/disk usage/SQL errors,
  production payment webhooks and credit metering.
- Confirm a full SQL + PVC restore and an application image rollback in staging.

## Rollback and operations

Roll back to the previous API/manager image digests through the same render
procedure, or `kubectl rollout undo deployment/pitch -n pitch` for a pod-template
rollback. Keep previous ConfigMaps, images and backups until the release is
verified. Review schema compatibility first. Wait for active work before every
release; SIGTERM stops new HTTP requests, aborts sessions, closes resources and
disconnects Prisma with a bounded deadline.

Do not add replicas or HPA: session ownership, billing timers, event streams,
exports and browser recording handles are process-local. Sticky sessions and
a shared disk alone do not make this application multi-replica safe. Node
maintenance and rollouts currently have a brief outage; horizontal availability
requires a separate session-ownership and distributed-events design.
