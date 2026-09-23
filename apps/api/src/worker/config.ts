/**
 * How this process takes part in the studio.
 *
 * One image, four roles:
 *
 *   all      the API and a worker in one process — the single-box layout, and
 *            what `make dev` runs. Nothing changes for it, except that the
 *            process registers itself as a worker and can place projects on
 *            other worker nodes when they exist. Heavy work runs in-process.
 *   api      stateless: routes, auth, credits, placement. Holds no session,
 *            touches no workspace; every project operation is proxied to the
 *            worker that owns the project.
 *   worker   owns projects: pi sessions, host tools, the hot workspace copy
 *            on local disk, the file watcher. A worker is light — a session
 *            is mostly a model wait and file writes — so one holds many.
 *            Anything that burns CPU (a capture, an encode, a transcription)
 *            is handed to the render tier as a RenderJob (worker/remote.ts).
 *   render   holds nothing. Claims RenderJobs from Postgres, restores the
 *            workspace checkpoint they name, runs the host action, ships
 *            the files it produced back through the bucket (renderer/).
 *
 * Coordination state lives in Postgres (StudioWorker rows, the lease
 * columns on Project, and RenderJob rows), so any number of `api` replicas,
 * `worker` nodes and `render` pods find each other without a leader or a
 * message bus. Sessions are never queued; only renders are.
 */
import { hostname } from 'node:os'

export type StudioRole = 'all' | 'api' | 'worker' | 'render'

function roleFromEnv(): StudioRole {
  const v = (process.env.STUDIO_ROLE || 'all').trim().toLowerCase()
  if (v === 'api' || v === 'worker' || v === 'all' || v === 'render') return v
  throw new Error(`STUDIO_ROLE must be all, api, worker or render (got "${v}")`)
}

export const ROLE: StudioRole = roleFromEnv()
export const IS_WORKER = ROLE === 'all' || ROLE === 'worker'
export const IS_API = ROLE === 'all' || ROLE === 'api'
export const IS_RENDER = ROLE === 'render'

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

/**
 * Concurrent projects a worker holds. A held project is a pi session, a
 * watcher and a warm directory — memory, not CPU — so the number is high;
 * the CPU-bound work is not on the worker at all (see STUDIO_RENDER).
 */
export const WORKER_SLOTS = Math.max(1, Number(process.env.STUDIO_WORKER_SLOTS || 16))

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

/**
 * On SIGTERM a worker with a drain window keeps serving the projects it
 * holds and lets each go as its turn ends, so a scale-down or a rollout
 * loses nothing; what is still mid-turn when the window closes is released
 * anyway. 0 (the default, and what a plain stop wants) releases everything
 * at once, losing the turns in flight. Kubernetes must allow at least this
 * plus SHUTDOWN_GRACE_MS as the pod's terminationGracePeriodSeconds.
 */
export const DRAIN_MS = Math.max(0, Number(process.env.STUDIO_DRAIN_MS || 0))
/** After draining, shutdown waits this long for checkpoints and open streams before exiting anyway. */
export const SHUTDOWN_GRACE_MS = Math.max(
  5000,
  Number(process.env.STUDIO_SHUTDOWN_GRACE_MS || 60_000),
)

/**
 * Where heavy host actions run. `remote` queues them as RenderJobs for the
 * render tier and waits; `local` runs them in this process (the single box,
 * `make dev`, tests). A worker with checkpoints defaults to remote — the
 * render pod restores the checkpoint, so nothing else could work — and
 * everything else to local.
 */
export type RenderMode = 'local' | 'remote'
function renderModeFromEnv(): RenderMode {
  const v = (process.env.STUDIO_RENDER || '').trim().toLowerCase()
  if (v === 'local' || v === 'remote') return v
  if (v) throw new Error(`STUDIO_RENDER must be local or remote (got "${v}")`)
  return ROLE === 'worker' && CHECKPOINTS_ENABLED ? 'remote' : 'local'
}
export const RENDER_MODE: RenderMode = renderModeFromEnv()

/** Stable per render pod; what a claimed RenderJob records as its renderer. */
export const RENDER_ID = (process.env.STUDIO_RENDER_ID || hostname()).trim()
/** Jobs one render pod runs at once. One: a capture already uses every core. */
export const RENDER_CONCURRENCY = Math.max(1, Number(process.env.STUDIO_RENDER_CONCURRENCY || 1))
/** A running job whose renderer has not heartbeat for this long is retried elsewhere. */
export const RENDER_STALE_MS = Math.max(
  30_000,
  Number(process.env.STUDIO_RENDER_STALE_MS || 90_000),
)
/** Times a job is claimed before it is failed for good. */
export const RENDER_ATTEMPTS = Math.max(1, Number(process.env.STUDIO_RENDER_ATTEMPTS || 3))
/** How long a worker waits on a RenderJob before giving up on it. */
export const RENDER_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.STUDIO_RENDER_TIMEOUT_MS || 45 * 60_000),
)

/**
 * Free slots the fleet keeps in reserve. The autoscaler reads
 * /internal/scale, which asks for enough workers to hold every leased
 * project plus this many empty slots, so a new project never waits for a
 * node to come up.
 */
export const SCALE_HEADROOM = Math.max(0, Number(process.env.STUDIO_SCALE_HEADROOM || 2))
/**
 * Which workers the autoscaler adds and removes: those whose id starts with
 * this (the StatefulSet's pods). Any other live worker — a machine that
 * joined over Tailscale — is fixed capacity: its slots are counted before
 * elastic ones are asked for.
 */
export const SCALE_GROUP = (process.env.STUDIO_SCALE_GROUP ?? 'pitch-worker-').trim()
