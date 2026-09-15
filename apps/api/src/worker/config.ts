/**
 * How this process takes part in the studio (docs/studio-architecture.md →
 * Scaling).
 *
 * One image, three roles:
 *
 *   all      the API and a worker in one process — the single-box layout, and
 *            what `make dev` runs. Nothing changes for it, except that the
 *            process registers itself as a worker and can place projects on
 *            other worker nodes when they exist.
 *   api      stateless: routes, auth, credits, placement. Holds no session,
 *            touches no workspace; every project operation is proxied to the
 *            worker that owns the project.
 *   worker   owns projects: pi sessions, host tools, the hot workspace copy
 *            on local disk, the file watcher, a CloakBrowser beside it.
 *
 * Coordination state lives in Postgres (StudioWorker rows and the lease
 * columns on Project), so any number of `api` replicas and `worker` nodes
 * find each other without a leader, a queue, or a message bus.
 */
import { hostname } from 'node:os'

export type StudioRole = 'all' | 'api' | 'worker'

function roleFromEnv(): StudioRole {
  const v = (process.env.STUDIO_ROLE || 'all').trim().toLowerCase()
  if (v === 'api' || v === 'worker' || v === 'all') return v
  throw new Error(`STUDIO_ROLE must be all, api or worker (got "${v}")`)
}

export const ROLE: StudioRole = roleFromEnv()
export const IS_WORKER = ROLE !== 'api'
export const IS_API = ROLE !== 'worker'

const PORT = Number(process.env.PORT || 3000)

/** Stable per worker process; a restart keeps it and bumps the epoch. */
export const WORKER_ID = (process.env.STUDIO_WORKER_ID || hostname()).trim()

/**
 * Where other processes reach this worker. Configuration only — never a
 * browser-supplied host — because API replicas proxy authenticated traffic
 * to whatever this says.
 */
export const WORKER_URL = (process.env.STUDIO_WORKER_URL || `http://${hostname()}:${PORT}`).replace(
  /\/$/,
  '',
)

/** Concurrent projects a worker holds; a node with four of these is four slots. */
export const WORKER_SLOTS = Math.max(1, Number(process.env.STUDIO_WORKER_SLOTS || 4))

/**
 * Shared secret for the worker contract (/internal/worker). Required for any
 * cross-process call; a process that lacks it can only own projects itself.
 */
export const WORKER_TOKEN = (process.env.STUDIO_WORKER_TOKEN || '').trim()

export const HEARTBEAT_MS = Math.max(1000, Number(process.env.STUDIO_HEARTBEAT_MS || 5000))
/** A worker whose heartbeat is older than this is dead; its leases are void. */
export const LEASE_TTL_MS = Math.max(
  HEARTBEAT_MS * 2,
  Number(process.env.STUDIO_LEASE_TTL_MS || 15000),
)
/** An owned project nobody has touched for this long is checkpointed and let go. */
export const IDLE_RELEASE_MS = Math.max(
  60_000,
  Number(process.env.STUDIO_IDLE_RELEASE_MS || 30 * 60_000),
)
/** How long a quiet, dirty workspace waits before it is checkpointed. */
export const CHECKPOINT_SETTLE_MS = Math.max(
  1000,
  Number(process.env.STUDIO_CHECKPOINT_SETTLE_MS || 15_000),
)

/** Private bucket for workspace checkpoints; empty disables checkpoints (local disk is the only copy). */
export const WORKSPACE_BUCKET =
  process.env.STUDIO_WORKSPACE_BUCKET === undefined
    ? 'pitch-workspaces'
    : process.env.STUDIO_WORKSPACE_BUCKET.trim()
export const CHECKPOINTS_ENABLED = WORKSPACE_BUCKET.length > 0

/** Shutdown waits this long for checkpoints and open streams before exiting anyway. */
export const SHUTDOWN_GRACE_MS = Math.max(
  5000,
  Number(process.env.STUDIO_SHUTDOWN_GRACE_MS || 60_000),
)
