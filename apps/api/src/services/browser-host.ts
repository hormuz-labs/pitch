import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { downloadStorageState, uploadStorageState } from '@saas/storage'
import {
  type CloakBrowserHandle,
  startCloakBrowser,
  withTimeout,
} from '../render/utils/cloak-browser.js'
import { IS_WORKER, WORKER_TOKEN } from '../worker/config.js'
import { liveWorkers } from '../worker/lease.js'
import { browserHostUrl } from './browser-routing.js'

const logger = createLogger('api:browser-host')
const SESSION_TTL_MS = 30 * 60 * 1000
const sessions = new Map<string, { browser: CloakBrowserHandle; userId: string }>()

export interface StartSessionInput {
  userId: string
  startUrl?: string | null
  signal?: AbortSignal
}

export interface StartSessionResult {
  sessionId: string
  status: db.BrowserSessionStatus
  streamId: string
  profileDir: string
  startedAt: Date
  expiresAt: Date
}

export async function startOwnedSession(input: StartSessionInput): Promise<StartSessionResult> {
  if (input.signal?.aborted) throw new DOMException('Browser session aborted', 'AbortError')
  const profile = await db.getOrCreateBrowserProfile(input.userId)
  const existing = await db.listActiveBrowserSessions(input.userId)
  if (existing.length) {
    throw new HostError(
      'ACTIVE_SESSION_EXISTS',
      `User already has an active browser session (${existing[0].id}). Close it first.`,
    )
  }

  await mkdir(profile.profileDir, { recursive: true })
  const stateFile = path.join(profile.profileDir, 'storage_state.json')
  await downloadStorageState(input.userId, stateFile).catch(err =>
    logger.warn({ err, userId: input.userId }, 'could not restore browser storage state'),
  )
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  let session: db.BrowserSessionPayload
  try {
    session = await db.createBrowserSession({
      userId: input.userId,
      profileId: profile.id,
      startUrl: input.startUrl ?? null,
      hostUrl: browserHostUrl(),
      expiresAt,
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002')
      throw new HostError('ACTIVE_SESSION_EXISTS', 'User already has an active browser session.')
    throw error
  }

  let browser: CloakBrowserHandle | null = null
  try {
    const runtimeProfileDir = path.join(profile.profileDir, session.id)
    browser = await startCloakBrowser({
      streamId: session.id,
      profileDir: runtimeProfileDir,
      storageStatePath: existsSync(stateFile) ? stateFile : undefined,
      fingerprintIdentity: input.userId,
      signal: input.signal,
    })
    if (input.signal?.aborted) throw new DOMException('Browser session aborted', 'AbortError')
    if (input.startUrl)
      await withTimeout('initial navigation', browser.page.goto(input.startUrl), 45_000)
    if (input.signal?.aborted) throw new DOMException('Browser session aborted', 'AbortError')
    sessions.set(session.id, { browser, userId: input.userId })
    browser.onExit(error => {
      if (!sessions.delete(session.id)) return
      void rm(path.join(profile.profileDir, session.id), { recursive: true, force: true })
      void db
        .updateBrowserSession(session.id, {
          status: 'ERROR',
          error: error?.message ?? 'Browser process exited',
          closedAt: new Date(),
        })
        .catch(err => logger.warn({ err, sessionId: session.id }, 'failed to mark browser session'))
    })
    const updated = await db.updateBrowserSession(session.id, {
      status: 'READY',
      streamId: session.id,
      readyAt: new Date(),
    })
    return {
      sessionId: updated.id,
      status: updated.status,
      streamId: updated.streamId!,
      profileDir: profile.profileDir,
      startedAt: updated.startedAt,
      expiresAt: updated.expiresAt,
    }
  } catch (err) {
    await browser?.close().catch(() => {})
    await rm(path.join(profile.profileDir, session.id), { recursive: true, force: true })
    await db.updateBrowserSession(session.id, {
      status: 'ERROR',
      error: (err as Error).message,
      closedAt: new Date(),
    })
    throw err
  }
}

export async function startSession(input: StartSessionInput): Promise<StartSessionResult> {
  if (IS_WORKER) return startOwnedSession(input)
  if (!WORKER_TOKEN) throw new Error('STUDIO_WORKER_TOKEN is required for browser workers')
  const counts = await db.prisma.browserSession.groupBy({
    by: ['hostUrl'],
    where: { status: { in: ['STARTING', 'READY'] } },
    _count: true,
  })
  const countByHost = new Map(counts.map(row => [row.hostUrl, row._count]))
  const worker = (await liveWorkers())
    .filter(candidate => !candidate.draining)
    .sort(
      (a, b) =>
        (countByHost.get(a.url) ?? 0) - (countByHost.get(b.url) ?? 0) || a.id.localeCompare(b.id),
    )[0]
  if (!worker) throw new Error('No browser worker is available')
  const response = await fetch(`${worker.url}/internal/browser/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${WORKER_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      userId: input.userId,
      startUrl: input.startUrl,
    }),
    signal: input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(75_000)])
      : AbortSignal.timeout(75_000),
  })
  if (!response.ok) throw new Error(`Browser worker startup failed: HTTP ${response.status}`)
  const result = (await response.json()) as StartSessionResult
  return {
    ...result,
    startedAt: new Date(result.startedAt),
    expiresAt: new Date(result.expiresAt),
  }
}

export interface CloseSessionResult {
  sessionId: string
  status: db.BrowserSessionStatus
  loggedInOrigins: string[]
}

export async function closeOwnedSession(sessionId: string): Promise<string[]> {
  const owned = sessions.get(sessionId)
  if (!owned) throw new HostError('NOT_FOUND', 'Browser process is not owned by this host')
  sessions.delete(sessionId)
  const profile = await db.getBrowserProfile(owned.userId)
  const stateFile = profile ? path.join(profile.profileDir, 'storage_state.json') : null
  let origins: string[] = []
  try {
    if (stateFile) {
      try {
        const state = await withTimeout(
          'browser state capture',
          owned.browser.context.storageState({ path: stateFile, indexedDB: true }),
          10_000,
        )
        origins = Array.from(
          new Set([
            ...state.origins.map(origin => origin.origin),
            ...state.cookies.map(
              cookie => `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}`,
            ),
          ]),
        ).sort()
      } catch (err) {
        logger.warn({ err, sessionId }, 'could not capture browser storage state')
      }
    }
  } finally {
    await owned.browser.close()
    if (profile)
      await rm(path.join(profile.profileDir, sessionId), { recursive: true, force: true })
  }
  if (stateFile && existsSync(stateFile)) {
    try {
      const key = await uploadStorageState(stateFile, owned.userId)
      await db.recordLoggedInOrigins(owned.userId, origins, { storageStateKey: key })
    } catch (err) {
      logger.warn({ err, sessionId }, 'could not upload browser storage state')
    }
  }
  await db.updateBrowserSession(sessionId, { status: 'CLOSED', closedAt: new Date() })
  return origins
}

export async function closeSession(sessionId: string, userId: string): Promise<CloseSessionResult> {
  const session = await db.getBrowserSession(sessionId, { id: userId })
  if (!session) throw new HostError('NOT_FOUND', 'Session not found')
  if (session.userId !== userId) throw new HostError('FORBIDDEN', 'Session belongs to another user')

  let origins: string[]
  if (session.hostUrl && session.hostUrl !== browserHostUrl()) {
    let response: Response
    try {
      response = await fetch(`${session.hostUrl}/internal/browser/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.STUDIO_WORKER_TOKEN || ''}` },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      await db.updateBrowserSession(sessionId, {
        status: 'ERROR',
        error: 'Browser worker unavailable',
        closedAt: new Date(),
      })
      throw error
    }
    if (!response.ok) {
      await db.updateBrowserSession(sessionId, {
        status: 'ERROR',
        error: `Browser worker unavailable (HTTP ${response.status})`,
        closedAt: new Date(),
      })
      throw new Error(`Browser host close failed: HTTP ${response.status}`)
    }
    origins = ((await response.json()) as { origins: string[] }).origins
  } else {
    origins = await closeOwnedSession(sessionId)
  }
  const updated = await db.updateBrowserSession(sessionId, {
    status: 'CLOSED',
    closedAt: new Date(),
  })
  return { sessionId: updated.id, status: updated.status, loggedInOrigins: origins }
}

export async function shutdownAllSessions(): Promise<void> {
  await Promise.allSettled([...sessions.keys()].map(closeOwnedSession))
}

export async function drainBrowserSessions(_timeoutMs: number): Promise<void> {
  await shutdownAllSessions()
}

export class HostError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'ACTIVE_SESSION_EXISTS' | 'INTERNAL',
    message: string,
  ) {
    super(message)
    this.name = 'HostError'
  }
}

const gc = setInterval(async () => {
  try {
    const now = Date.now()
    const active = await Promise.all([...sessions.keys()].map(id => db.getBrowserSession(id)))
    await Promise.allSettled(
      active.filter(s => s && s.expiresAt.getTime() < now).map(s => closeOwnedSession(s!.id)),
    )
    await db.expireStaleBrowserSessions()
  } catch (err) {
    logger.warn({ err }, 'browser-host GC tick failed')
  }
}, 60_000)
gc.unref()
