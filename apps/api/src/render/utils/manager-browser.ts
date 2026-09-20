import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createLogger,
  createManagerProfile,
  getManagerHeaders,
  getManagerProfile,
  launchManagerProfile,
  managerCdpHttpUrl,
  stopManagerProfile,
} from '@saas/shared'
import type { Browser, BrowserContext, Page } from 'playwright'

const logger = createLogger('worker:manager-browser')

export interface ManagerBrowserHandle {
  profileId: string
  /** Manager CDP HTTP URL for playwright-cli attach --cdp */
  cdpUrl: string
  close: () => Promise<void>
}

async function waitForCdpReady(
  profileId: string,
  timeoutMs = 45000,
  intervalMs = 1500,
): Promise<void> {
  const versionUrl = `${managerCdpHttpUrl(profileId)}/json/version`
  const wsUrl = `${managerCdpHttpUrl(profileId).replace(/^http/, 'ws')}`
  const deadline = Date.now() + timeoutMs
  let lastError: Error | undefined

  // Phase 1: wait for HTTP /json/version to respond
  while (Date.now() < deadline) {
    try {
      const res = await fetch(versionUrl, { headers: getManagerHeaders() })
      if (res.ok) {
        logger.info({ versionUrl }, 'Manager CDP HTTP endpoint is ready')
        break
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const remaining = deadline - Date.now()
      logger.debug(
        { versionUrl, remainingMs: Math.max(0, remaining), err: lastError },
        'Manager CDP HTTP endpoint not ready yet, retrying...',
      )
      if (Date.now() + intervalMs < deadline) {
        await new Promise(r => setTimeout(r, intervalMs))
      } else {
        throw new Error(
          `Manager CDP endpoint ${versionUrl} did not become ready within ${timeoutMs}ms. ` +
            `Last error: ${lastError?.message || 'unknown'}`,
        )
      }
    }
  }

  // Phase 2: verify WebSocket connectivity before returning
  await new Promise<void>((resolve, reject) => {
    const wsDeadline = Math.max(0, deadline - Date.now())
    const timer = setTimeout(
      () => reject(new Error(`CDP WebSocket ${wsUrl} did not become ready within timeout`)),
      wsDeadline,
    )
    let resolved = false
    const tryWs = () => {
      if (Date.now() >= deadline) {
        clearTimeout(timer)
        reject(new Error(`CDP WebSocket ${wsUrl} did not become ready within timeout`))
        return
      }
      const ws = new (globalThis as any).WebSocket(wsUrl, {
        headers: getManagerHeaders(),
      } as any)
      ws.onopen = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          ws.close()
          logger.info({ wsUrl }, 'Manager CDP WebSocket is ready')
          resolve()
        }
      }
      ws.onerror = () => {
        ws.close()
        if (!resolved && Date.now() < deadline) {
          setTimeout(tryWs, intervalMs)
        }
      }
      ws.onclose = (ev: any) => {
        if (!resolved && ev.code !== 1000 && Date.now() < deadline) {
          setTimeout(tryWs, intervalMs)
        }
      }
    }
    tryWs()
  }).catch(err => {
    // WS check failed — log a warning but don't hard-fail; the HTTP endpoint is up
    // and playwright-cli attach has its own retry loop.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'CDP WebSocket readiness check did not confirm; proceeding anyway',
    )
  })
}

/**
 * Ensures the CloakBrowser Manager profile for the user is running and
 * returns the manager CDP URL. The manager runs without auth inside the
 * private Docker network, so no token is needed.
 */
export async function startManagerBrowser(userId: string): Promise<ManagerBrowserHandle> {
  const explicit = process.env.STUDIO_CDP_URL?.trim()
  if (explicit) {
    logger.info({ userId, explicit }, 'Using explicit STUDIO_CDP_URL for browser recording')
    return {
      profileId: userId,
      cdpUrl: explicit,
      close: async () => {},
    }
  }

  logger.info({ userId }, 'Ensuring CloakBrowser profile is running')

  let profile = await getManagerProfile(userId)
  if (!profile) {
    logger.info({ userId }, 'Creating new CloakBrowser profile')
    profile = await createManagerProfile(userId)
  }

  if (profile.status === 'running') {
    logger.info(
      { userId, profileId: profile.id },
      'Stopping already running CloakBrowser profile to ensure a fresh session',
    )
    try {
      await stopManagerProfile(profile.id)
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch (err) {
      logger.warn({ err }, 'Failed to stop already running CloakBrowser profile, proceeding anyway')
    }
  }

  logger.info({ userId, profileId: profile.id }, 'Launching CloakBrowser profile')
  await launchManagerProfile(profile.id)

  logger.info({ profileId: profile.id }, 'Waiting for manager CDP endpoint to be ready')
  await waitForCdpReady(profile.id)

  const cdpUrl = managerCdpHttpUrl(profile.id)
  logger.info({ userId, profileId: profile.id, cdpUrl }, 'CloakBrowser profile ready')

  return {
    profileId: profile.id,
    cdpUrl,
    close: async () => {
      logger.info({ userId, profileId: profile.id }, 'Stopping CloakBrowser profile')
      try {
        await stopManagerProfile(profile.id)
      } catch (err) {
        logger.warn({ err }, 'Failed to stop CloakBrowser profile')
      }
    },
  }
}

// ── The studio's shared browser ───────────────────────────────────────────────
//
// startManagerBrowser above is for a recording: it drives the USER's own
// profile and deliberately restarts it for a clean session. Everything else
// that needs a page — deck renders, project thumbnails — wants a warm,
// long-lived browser that is nobody's session, so it gets a named shared
// profile instead and never stops it.
//
// There is no Chromium in this image (Dockerfile.base sets
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1), so this is the only browser there is.
// It also cannot see this container's filesystem, which is why local pages are
// served into it by request interception rather than loaded over file://.

/** Synthetic origin the workspace is served under. Never resolved by DNS. */
export const STUDIO_LOCAL_ORIGIN = 'http://studio.local'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
}

export function contentTypeFor(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return (
    (dot === -1 ? undefined : MIME[filePath.slice(dot).toLowerCase()]) ?? 'application/octet-stream'
  )
}

/**
 * URL for a local page. The path component IS the absolute filesystem path, so
 * a relative reference inside the page (`../../engine/js/x.js`) resolves to the
 * right file without any base-href rewriting.
 */
export function localPageUrl(filePath: string, query = ''): string {
  const abs = path.resolve(filePath)
  const suffix = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  return `${STUDIO_LOCAL_ORIGIN}${abs.split('/').map(encodeURIComponent).join('/')}${suffix}`
}

/** The filesystem path a studio.local URL points at, or null if it is not ours. */
export function localPathFromUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (`${u.protocol}//${u.host}` !== STUDIO_LOCAL_ORIGIN) return null
  const p = decodeURIComponent(u.pathname)
  return p.startsWith('/') ? p : null
}

/**
 * Serve http://studio.local/<abs-path> out of the local filesystem. The route
 * is scoped to the synthetic origin so a page's real network requests — Google
 * Fonts, a chart CDN — are never routed through interception.
 */
export async function serveLocalFiles(target: BrowserContext | Page): Promise<void> {
  await target.route(`${STUDIO_LOCAL_ORIGIN}/**`, async route => {
    const p = localPathFromUrl(route.request().url())
    if (p === null) return route.continue()
    try {
      return await route.fulfill({
        status: 200,
        contentType: contentTypeFor(p),
        body: await readFile(p),
      })
    } catch (err) {
      return route.fulfill({
        status: (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? 404 : 500,
        contentType: 'text/plain; charset=utf-8',
        body: `${(err as NodeJS.ErrnoException)?.code ?? 'ERROR'} ${p}`,
      })
    }
  })
}

function sharedProfileName(): string {
  return process.env.STUDIO_CDP_PROFILE || 'studio-motion'
}

/**
 * Ensure the shared CloakBrowser profile is running and return its CDP URL.
 * Unlike startManagerBrowser this never stops a running profile — several
 * thumbnails and a deck render share one warm browser, isolated by context.
 */
export async function ensureSharedProfile(name = sharedProfileName()): Promise<string> {
  let profile = await getManagerProfile(name)
  if (!profile) profile = await createManagerProfile(name)
  if (profile.status !== 'running') {
    logger.info({ name, profileId: profile.id }, 'launching the shared CloakBrowser profile')
    await launchManagerProfile(profile.id)
  }
  const url = managerCdpHttpUrl(profile.id)
  const deadline = Date.now() + 60_000
  let lastError = 'no response'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/json/version`, { headers: getManagerHeaders() })
      if (res.ok) return url
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Shared CloakBrowser profile ${name} exposed no CDP endpoint (${lastError})`)
}

/**
 * Connect to the shared CloakBrowser. Closing the returned Browser only drops
 * this connection — the manager owns the process and keeps it warm.
 */
export async function connectStudioBrowser(name = sharedProfileName()): Promise<Browser> {
  const endpoint = await ensureSharedProfile(name)
  const { chromium } = await import('playwright')
  logger.info({ endpoint }, 'connecting to the shared CloakBrowser over CDP')
  return chromium.connectOverCDP(endpoint, { timeout: 4000 })
}
