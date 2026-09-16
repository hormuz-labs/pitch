import { promises as dns } from 'node:dns'

/**
 * The browser manager this process talks to.
 *
 * CLOAK_MANAGER_URL names one manager, or a pool: when its host is a
 * headless Service, `pickManager` resolves the pods behind it and pins the
 * process to one — the lowest ordinal with room (CLOAK_MANAGER_CAPACITY
 * running profiles), else the least loaded. Packing onto the lowest
 * ordinals leaves the highest empty, which is the one a StatefulSet's
 * autoscaler removes. A session, once started, records the URL it used
 * (BrowserSession.managerUrl), so scaling the pool never moves it.
 *
 * Read lazily so callers that load .env at startup see the right value.
 */
let pinned: string | null = null

export function getManagerBaseUrl(): string {
  return pinned ?? configuredManagerUrl()
}

export function configuredManagerUrl(): string {
  return (process.env.CLOAK_MANAGER_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')
}

/** Pin every later call to one manager (what pickManager chose); null unpins. */
export function setManagerBaseUrl(url: string | null): void {
  pinned = url ? url.replace(/\/+$/, '') : null
}

export interface ManagerCandidate {
  url: string
  /** Pod ordinal when the pool is a StatefulSet, else the position in the list. */
  ordinal: number
  /** Profiles running there right now; null when it did not answer. */
  running: number | null
}

/**
 * Pure choice, for tests: the lowest ordinal with a free slot, else the
 * least loaded that answered, else the first. Never null on a non-empty list.
 */
export function chooseManager(
  candidates: ManagerCandidate[],
  capacity: number,
): ManagerCandidate | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort((a, b) => a.ordinal - b.ordinal)
  const answered = sorted.filter(c => c.running !== null)
  const free = answered.find(c => (c.running ?? 0) < capacity)
  if (free) return free
  if (answered.length)
    return answered.reduce((best, c) => ((c.running ?? 0) < (best.running ?? 0) ? c : best))
  return sorted[0]
}

/** Running-profile count on one manager, or null when it does not answer in time. */
async function runningOn(base: string, timeoutMs = 2500): Promise<number | null> {
  try {
    const res = await fetch(`${base}/api/profiles`, {
      headers: getManagerHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const profiles = (await res.json()) as Array<{ status?: string }>
    return profiles.filter(p => p.status === 'running').length
  } catch {
    return null
  }
}

/**
 * The pods behind CLOAK_MANAGER_URL. A headless Service has SRV records
 * naming each pod (`pitch-browser-0.pitch-browser…`); a plain host or an
 * IP resolves to itself. Errors mean "just the configured one".
 */
export async function resolveManagerPool(): Promise<Array<{ url: string; ordinal: number }>> {
  const configured = configuredManagerUrl()
  let u: URL
  try {
    u = new URL(configured)
  } catch {
    return [{ url: configured, ordinal: 0 }]
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname === 'localhost')
    return [{ url: configured, ordinal: 0 }]
  const port = u.port || (u.protocol === 'https:' ? '443' : '80')
  try {
    const srv = await dns.resolveSrv(`_manager._tcp.${u.hostname}`)
    if (srv.length) {
      return srv
        .map((r, i) => {
          const m = r.name.match(/-(\d+)\./)
          return {
            url: `${u.protocol}//${r.name}:${r.port || port}`,
            ordinal: m ? Number(m[1]) : i,
          }
        })
        .sort((a, b) => a.ordinal - b.ordinal)
    }
  } catch {
    /* not a headless Service (or no SRV): fall through */
  }
  return [{ url: configured, ordinal: 0 }]
}

/**
 * Choose a manager for this process (or this job) and return its URL. One
 * manager configured means no choice and no network round trip.
 */
export async function pickManager(): Promise<string> {
  const pool = await resolveManagerPool()
  if (pool.length <= 1) return pool[0]?.url ?? configuredManagerUrl()
  const capacity = Math.max(1, Number(process.env.CLOAK_MANAGER_CAPACITY || 4))
  const candidates = await Promise.all(
    pool.map(async p => ({ ...p, running: await runningOn(p.url) })),
  )
  return chooseManager(candidates, capacity)?.url ?? configuredManagerUrl()
}

/** Read env lazily so callers that load .env at startup see the correct value. */
export function getManagerAuthToken(): string | undefined {
  return process.env.CLOAK_MANAGER_AUTH_TOKEN
}

export function getManagerHeaders(headers: Record<string, string> = {}) {
  const h = { ...headers }
  const token = getManagerAuthToken()
  if (token) {
    h.Authorization = `Bearer ${token}`
  }
  return h
}

/** WebSocket URL for direct CDP connections (e.g. from browser-host.ts). */
export function managerCdpUrl(profileId: string): string {
  return `${getManagerBaseUrl().replace(/^http/, 'ws')}/api/profiles/${profileId}/cdp`
}

/** HTTP URL for Playwright connectOverCDP / playwright-cli attach. */
export function managerCdpHttpUrl(profileId: string): string {
  return `${getManagerBaseUrl()}/api/profiles/${profileId}/cdp`
}

export async function getManagerProfile(userId: string): Promise<any | null> {
  try {
    const res = await fetch(`${getManagerBaseUrl()}/api/profiles`, {
      headers: getManagerHeaders(),
    })
    if (!res.ok) return null
    const profiles = (await res.json()) as any[]
    return profiles.find(p => p.name === userId) || null
  } catch (_err) {
    return null
  }
}

export async function createManagerProfile(userId: string): Promise<any> {
  const res = await fetch(`${getManagerBaseUrl()}/api/profiles`, {
    method: 'POST',
    headers: getManagerHeaders({ 'Content-Type': 'application/json' }),
    // Name only: the manager's ProfileCreate rejects unknown fields, and the
    // GKE image no longer has `platform`. Its defaults (1920x1080) are what
    // the studio renders at anyway.
    body: JSON.stringify({ name: userId }),
  })
  if (!res.ok) throw new Error(`Failed to create manager profile: ${await res.text()}`)
  return res.json()
}

export async function launchManagerProfile(profileId: string): Promise<any> {
  const res = await fetch(`${getManagerBaseUrl()}/api/profiles/${profileId}/launch`, {
    method: 'POST',
    headers: getManagerHeaders({ 'Content-Type': 'application/json' }),
  })
  if (!res.ok) throw new Error(`Failed to launch manager profile: ${await res.text()}`)
  return res.json()
}

export async function stopManagerProfile(profileId: string): Promise<void> {
  try {
    await fetch(`${getManagerBaseUrl()}/api/profiles/${profileId}/stop`, {
      method: 'POST',
      headers: getManagerHeaders(),
    })
  } catch {
    // ignore
  }
}
