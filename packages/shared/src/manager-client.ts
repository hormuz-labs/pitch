export const MANAGER_BASE_URL = process.env.CLOAK_MANAGER_URL || 'http://127.0.0.1:8080';
export const MANAGER_AUTH_TOKEN = process.env.CLOAK_MANAGER_AUTH_TOKEN;

export function getManagerHeaders(headers: Record<string, string> = {}) {
  const h = { ...headers };
  if (MANAGER_AUTH_TOKEN) {
    h['Authorization'] = `Bearer ${MANAGER_AUTH_TOKEN}`;
  }
  return h;
}

/** WebSocket URL for direct CDP connections (e.g. from browser-host.ts). */
export function managerCdpUrl(profileId: string): string {
  return `${MANAGER_BASE_URL.replace(/^http/, 'ws')}/api/profiles/${profileId}/cdp`;
}

/** HTTP URL for Playwright connectOverCDP / playwright-cli attach. */
export function managerCdpHttpUrl(profileId: string): string {
  return `${MANAGER_BASE_URL}/api/profiles/${profileId}/cdp`;
}

export async function getManagerProfile(userId: string): Promise<any | null> {
  try {
    const res = await fetch(`${MANAGER_BASE_URL}/api/profiles`, {
      headers: getManagerHeaders(),
    });
    if (!res.ok) return null;
    const profiles = await res.json() as any[];
    return profiles.find(p => p.name === userId) || null;
  } catch (err) {
    return null;
  }
}

export async function createManagerProfile(userId: string): Promise<any> {
  const res = await fetch(`${MANAGER_BASE_URL}/api/profiles`, {
    method: 'POST',
    headers: getManagerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name: userId,
      platform: 'windows',
    }),
  });
  if (!res.ok) throw new Error(`Failed to create manager profile: ${await res.text()}`);
  return res.json();
}

export async function launchManagerProfile(profileId: string): Promise<any> {
  const res = await fetch(`${MANAGER_BASE_URL}/api/profiles/${profileId}/launch`, {
    method: 'POST',
    headers: getManagerHeaders({ 'Content-Type': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to launch manager profile: ${await res.text()}`);
  return res.json();
}

export async function stopManagerProfile(profileId: string): Promise<void> {
  try {
    await fetch(`${MANAGER_BASE_URL}/api/profiles/${profileId}/stop`, { 
      method: 'POST',
      headers: getManagerHeaders(),
    });
  } catch {
    // ignore
  }
}
