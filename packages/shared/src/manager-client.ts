/** Read env lazily so callers that load .env at startup see the correct value. */
export function getManagerBaseUrl(): string {
  return process.env.CLOAK_MANAGER_URL || 'http://127.0.0.1:8080'
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
