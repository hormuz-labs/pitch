import crypto from 'node:crypto'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { createLogger } from '@saas/shared'

const logger = createLogger('worker:opencode')

export interface OpencodeServer {
  url: string
  close(): void
  authHeader: string
}

function ensureAuthCredentials() {
  if (!process.env.OPENCODE_SERVER_PASSWORD) {
    process.env.OPENCODE_SERVER_PASSWORD = crypto.randomBytes(32).toString('hex')
  }
  if (!process.env.OPENCODE_SERVER_USERNAME) {
    process.env.OPENCODE_SERVER_USERNAME = 'opencode'
  }
  return `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`
}

export async function startServer(
  targetDir: string,
): Promise<{ server: OpencodeServer; client: OpencodeClient }> {
  logger.info({ targetDir }, 'Starting OpenCode server')

  const authHeader = ensureAuthCredentials()

  const { url, close } = await createOpencodeServer({
    port: 4098,
    timeout: 60000,
    // Server default model; per-job/per-request override is applied in
    // job-processor's session.prompt call (see resolveModel). Override the
    // default here with OPENCODE_MODEL ("providerID/modelID").
    config: { model: process.env.OPENCODE_MODEL || 'google/gemini-3.7-flash' },
  })

  const client = createOpencodeClient({
    baseUrl: url,
    headers: { Authorization: authHeader },
  })
  logger.info({ url }, 'OpenCode server ready')
  return { server: { url, close, authHeader }, client }
}

export async function checkServerHealth(
  server: OpencodeServer,
  timeoutMs: number = 5000,
): Promise<boolean> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    const res = await fetch(`${server.url}/path`, {
      signal: abortController.signal,
      headers: { Authorization: server.authHeader },
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    clearTimeout(timeout)
    return false
  }
}

export function getSessionIdFromEvent(event: any): string | undefined {
  const payload = event?.payload ?? event
  const props = payload?.properties
  if (!props) return undefined
  return props.sessionID ?? props.info?.sessionID ?? props.part?.sessionID
}

// ── Lazy, ref-counted server manager ─────────────────────────────────────────
// One OpenCode server is shared by every in-flight job (video + enhance + pdf).
// We keep a counter of running jobs: the server starts on the 0 -> 1 edge and
// stops on the 1 -> 0 edge, so an idle worker runs NO OpenCode process. A
// chained-promise gate serializes the counter and the single start/stop so
// concurrent jobs can never double-start (port 4098 is fixed) or miscount.

interface ActiveServer {
  server: OpencodeServer
  client: OpencodeClient
  count: number
}

let active: ActiveServer | null = null
let gate: Promise<void> = Promise.resolve()

const ACQUIRE_HEALTHCHECK_TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || '5000')

// Run `fn` after every previous critical section has settled, regardless of
// whether it threw. The returned promise still propagates `fn`'s result/error to
// the caller, while the shared gate always resolves so a failure never poisons
// the next caller.
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = gate.then(fn, fn)
  gate = next.then(
    () => {},
    () => {},
  )
  return next
}

export interface AcquiredOpencode {
  server: OpencodeServer
  client: OpencodeClient
  release: () => Promise<void>
}

/**
 * Acquire the shared OpenCode server, starting it if this is the first running
 * job. Always pair with `await handle.release()` in a `finally` block.
 */
export async function acquireOpencode(targetDir: string): Promise<AcquiredOpencode> {
  return runExclusive(async () => {
    if (active) {
      const healthy = await checkServerHealth(active.server, ACQUIRE_HEALTHCHECK_TIMEOUT_MS)
      if (!healthy) {
        logger.warn('OpenCode server unhealthy at acquire; recycling before job')
        try {
          active.server.close()
        } catch {}
        active = null
      }
    }

    if (!active) {
      const { server, client } = await startServer(targetDir)
      active = { server, client, count: 0 }
    }

    active.count++
    logger.info({ runningJobs: active.count }, 'OpenCode server acquired for job')

    let released = false
    const handle: AcquiredOpencode = {
      server: active.server,
      client: active.client,
      release: async () => {
        if (released) return
        released = true
        await releaseOpencode()
      },
    }
    return handle
  })
}

async function releaseOpencode(): Promise<void> {
  return runExclusive(async () => {
    if (!active) return
    active.count--
    if (active.count <= 0) {
      const closing = active
      active = null
      try {
        closing.server.close()
      } catch {}
      logger.info('No running jobs — OpenCode server stopped (idle)')
    } else {
      logger.info({ runningJobs: active.count }, 'Job released OpenCode server; still in use')
    }
  })
}

/** Current client, or undefined when no server is running (idle). */
export function currentClient(): OpencodeClient | undefined {
  return active?.client
}

/** Force-close the server regardless of the counter (used on process shutdown). */
export async function forceCloseOpencode(): Promise<void> {
  return runExclusive(async () => {
    if (!active) return
    const closing = active
    active = null
    try {
      closing.server.close()
    } catch {}
  })
}
