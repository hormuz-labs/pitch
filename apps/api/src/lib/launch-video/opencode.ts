import { type ChildProcess, spawn } from 'node:child_process'
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { prisma } from '@saas/db'
import { createLogger } from '@saas/shared'
import { ROOT_DIR, toInternalName } from './paths.js'

const logger = createLogger('api:launch-video')

// Port 0 = random free port (the API is the only consumer, via baseUrl).
const OPENCODE_PORT = Number(process.env.OPENCODE_PORT ?? 0)
const OPENCODE_START_TIMEOUT_MS = 15_000

/**
 * Spawn `opencode serve` ourselves (instead of the SDK's createOpencodeServer)
 * because the SDK gives no cwd control: the server must run with the REPO ROOT
 * as its working directory so the html-motion-video skill's relative-path
 * conventions (projects/<name>/, ../../renders/, $SKILL=../../.opencode/...)
 * resolve where the skill expects. With the API's cwd (apps/api) the agent
 * scatters project files under apps/api/.
 */
function startOpencodeServer(): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('opencode', ['serve', '--hostname=127.0.0.1', `--port=${OPENCODE_PORT}`], {
      cwd: ROOT_DIR,
    })
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`opencode server did not start within ${OPENCODE_START_TIMEOUT_MS}ms`))
    }, OPENCODE_START_TIMEOUT_MS)

    let output = ''
    let settled = false
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return
      output += chunk.toString()
      const match = output.match(/opencode server listening on\s+(https?:\/\/\S+)/)
      if (match) {
        settled = true
        clearTimeout(timer)
        resolve({ url: match[1], proc })
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on('exit', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`opencode server exited with code ${code}: ${output.trim()}`))
    })
    proc.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}

let client: OpencodeClient | null = null
let closeServer: (() => void) | null = null
/** internal name (<userId>--<project>) -> opencode session id (cache; DB is truth) */
const sessions = new Map<string, string>()
/** in-flight session creations, deduped per internal name */
const pendingCreates = new Map<string, Promise<string>>()

interface OpencodeAuthEnv {
  OPENCODE_SERVER_USERNAME?: string
  OPENCODE_SERVER_PASSWORD?: string
}

/** The spawned server inherits these credentials, so its SDK client must use
 * the same Basic header. Without it every session call returns 401. */
export function opencodeClientOptions(baseUrl: string, env: OpencodeAuthEnv = process.env) {
  const password = env.OPENCODE_SERVER_PASSWORD
  if (!password) return { baseUrl }
  const username = env.OPENCODE_SERVER_USERNAME || 'opencode'
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')
  return { baseUrl, headers: { Authorization: `Basic ${credentials}` } }
}

/** Remember the session binding in the DB so it survives API restarts. */
async function persistSession(userId: string, name: string, sessionId: string): Promise<void> {
  sessions.set(toInternalName(userId, name), sessionId)
  await prisma.launchVideoProject.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, opencodeSessionId: sessionId },
    update: { opencodeSessionId: sessionId },
  })
}

/** Look up which user owns an opencode session (for authorizing raw session reads). */
export async function getSessionOwnerId(sessionId: string): Promise<string | null> {
  const row = await prisma.launchVideoProject.findUnique({
    where: { opencodeSessionId: sessionId },
    select: { userId: true },
  })
  return row?.userId ?? null
}

/**
 * Read the session already bound to a project without starting OpenCode or
 * validating the session against a server. Viewing a rendered project must be
 * independent from editor-agent availability; the event route uses this only
 * when an actual edit session is requested.
 */
export async function getBoundSessionForProject(
  userId: string,
  name: string,
): Promise<string | null> {
  const row = await prisma.launchVideoProject.findUnique({
    where: { userId_name: { userId, name } },
    select: { opencodeSessionId: true },
  })
  return row?.opencodeSessionId ?? null
}

async function init(): Promise<void> {
  const server = await startOpencodeServer()
  logger.info({ url: server.url, cwd: ROOT_DIR }, 'opencode server listening')
  closeServer = () => server.proc.kill()
  client = createOpencodeClient(opencodeClientOptions(server.url))

  // Warm the cache from the DB.
  try {
    const rows = await prisma.launchVideoProject.findMany({
      select: { userId: true, name: true, opencodeSessionId: true },
    })
    for (const row of rows) {
      sessions.set(toInternalName(row.userId, row.name), row.opencodeSessionId)
    }
  } catch {
    logger.warn('could not load launch-video session registry from DB, starting fresh')
  }
}

let initPromise: Promise<void> | null = null

/**
 * Lazily start the opencode server on first use so the API doesn't spawn one
 * unless the launch-video studio is actually touched.
 */
export function ensureOpencode(): Promise<void> {
  if (!initPromise) {
    initPromise = init().catch(err => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

/** Stop the opencode child process (API shutdown hook). No-op if never started. */
export function closeOpencode(): void {
  closeServer?.()
  closeServer = null
  client = null
  initPromise = null
}

/** Get (or lazily create) the opencode session bound to a user's project. */
export async function getSessionForProject(
  userId: string,
  name: string,
): Promise<{ id: string; created: boolean }> {
  await ensureOpencode()
  const internal = toInternalName(userId, name)
  let existing = sessions.get(internal)
  if (!existing) {
    // Cold cache (e.g. row written by another API instance) — check the DB.
    const row = await prisma.launchVideoProject.findUnique({
      where: { userId_name: { userId, name } },
    })
    if (row) {
      sessions.set(internal, row.opencodeSessionId)
      existing = row.opencodeSessionId
    }
  }
  if (existing) {
    try {
      const res = await client!.session.get({
        path: { id: existing },
        query: { directory: ROOT_DIR },
      })
      if (res.data) return { id: existing, created: false }
    } catch {
      // fall through and create a new one
    }
  }
  // Dedupe concurrent creates (SSE connect + first prompt race).
  const pending = pendingCreates.get(internal)
  if (pending) return { id: await pending, created: false }

  const create = (async () => {
    const res = await client!.session.create({
      body: { title: `video:${internal}` },
      query: { directory: ROOT_DIR },
    })
    const id = res.data?.id
    if (!id) {
      throw new Error(`OpenCode session creation failed: ${JSON.stringify(res.error ?? res)}`)
    }
    await persistSession(userId, name, id)
    return id
  })()
  pendingCreates.set(internal, create)
  try {
    return { id: await create, created: true }
  } finally {
    pendingCreates.delete(internal)
  }
}

export async function getMessages(sessionId: string) {
  await ensureOpencode()
  const res = await client!.session.messages({
    path: { id: sessionId },
    query: { directory: ROOT_DIR },
  })
  if (res.error) throw new Error(`OpenCode messages failed: ${JSON.stringify(res.error)}`)
  return res.data ?? []
}

type SessionMessage = Awaited<ReturnType<typeof getMessages>>[number]

/**
 * OpenCode's status endpoint can be empty while an async prompt is running.
 * The persisted message timeline is a more reliable recovery signal: a queued
 * user message or an assistant message without a completion timestamp means
 * the session still has work in flight.
 */
export function sessionBusyFromMessages(messages: readonly SessionMessage[]): boolean {
  const last = messages.at(-1)
  if (!last) return false
  if (last.info.role === 'user') return true
  return last.info.role === 'assistant' && last.info.time?.completed == null
}

export function sessionActivityFromMessages(messages: readonly SessionMessage[]): string | null {
  if (!sessionBusyFromMessages(messages)) return null
  const last = messages.at(-1)
  if (!last || last.info.role === 'user') return 'Starting the scene update…'

  const tool = [...last.parts].reverse().find(part => part.type === 'tool') as any
  if (!tool) return 'Planning the scene update…'

  const name = String(tool.tool ?? '')
  const command = String(tool.state?.input?.command ?? '')
  if (command.includes('capture.mjs')) {
    return command.includes('--from=')
      ? 'Rendering the scene preview…'
      : 'Rendering the full video…'
  }
  if (command.includes('ffmpeg')) return 'Encoding the updated video…'
  if (command.includes('get-font')) return 'Checking the original website font…'
  if (name === 'edit' || name === 'write' || name === 'patch') return 'Updating scene files…'
  if (name === 'read' || name === 'glob' || name === 'grep') return 'Inspecting the scene…'
  if (name === 'bash') return 'Verifying the scene update…'
  return `Running ${name || 'the next step'}…`
}

export async function getSessionState(
  sessionId: string,
): Promise<{ busy: boolean; activity: string | null }> {
  const messages = await getMessages(sessionId)
  return {
    busy: sessionBusyFromMessages(messages),
    activity: sessionActivityFromMessages(messages),
  }
}

/** Fire-and-forget prompt to the html-video agent. */
export async function prompt(sessionId: string, text: string, system?: string): Promise<void> {
  await ensureOpencode()
  const res = await client!.session.promptAsync({
    path: { id: sessionId },
    query: { directory: ROOT_DIR },
    body: {
      agent: 'html-video',
      system,
      parts: [{ type: 'text', text }],
    },
  })
  if (res.error) throw new Error(JSON.stringify(res.error))
}

export type OpencodeEvent = { type: string; properties?: Record<string, unknown> }

/** Best-effort extraction of the session id an event belongs to. */
export function eventSessionId(ev: OpencodeEvent): string | undefined {
  const p = (ev.properties ?? {}) as Record<string, any>
  return (
    p.sessionID ??
    p.info?.sessionID ??
    p.message?.sessionID ??
    p.part?.sessionID ??
    p.status?.sessionID
  )
}

/** Global event stream; one subscription shared by all SSE clients. */
let streamPromise: Promise<AsyncGenerator<OpencodeEvent>> | null = null
export async function eventStream(): Promise<AsyncGenerator<OpencodeEvent>> {
  await ensureOpencode()
  if (!streamPromise) {
    streamPromise = client!.event.subscribe().then(r => r.stream as AsyncGenerator<OpencodeEvent>)
    // A failed subscribe must not poison future attempts.
    streamPromise.catch(() => {
      streamPromise = null
    })
  }
  return streamPromise
}

/** Drop the cached stream so the pump can re-subscribe. */
export function resetEventStream(): void {
  streamPromise = null
}
