import { 
  createLogger,
  getManagerProfile,
  createManagerProfile,
  stopManagerProfile,
  getManagerHeaders,
  managerCdpUrl,
  MANAGER_BASE_URL
} from '@saas/shared';
import * as db from '@saas/db';
import { uploadStorageState } from '@saas/storage';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Use the ws client (not the global WebSocket): the global one can't send the
// Authorization header or expose `.on`, so every CDP call (navigation + storage
// capture) was failing silently — leaving sessions on about:blank and saving
// nothing on close.
import { WebSocket } from 'ws';

const logger = createLogger('api:browser-host');

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle timeout

export interface StartSessionInput {
  userId: string;
  startUrl?: string | null;
  headless?: boolean;
}

export interface StartSessionResult {
  sessionId: string;
  status: db.BrowserSessionStatus;
  cdpPort: number;
  noVncUrl: string | null;
  profileDir: string;
  startedAt: Date;
  expiresAt: Date;
}

async function launchManagerProfile(profileId: string, startUrl?: string | null): Promise<any> {
  const res = await fetch(`${MANAGER_BASE_URL}/api/profiles/${profileId}/launch`, {
    method: 'POST',
    headers: getManagerHeaders({ 'Content-Type': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to launch manager profile: ${await res.text()}`);
  const data = await res.json();

  if (startUrl) {
    try {
      const cdpUrl = managerCdpUrl(profileId);
      
      for (let i = 0; i < 5; i++) {
        try {
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(cdpUrl, {
              headers: getManagerHeaders(),
            } as any);
            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('CDP navigation timeout'));
            }, 5000);

            const finish = () => {
              setTimeout(() => {
                ws.close();
                clearTimeout(timeout);
                resolve();
              }, 500);
            };

            ws.on('open', () => {
              ws.send(JSON.stringify({ id: 10, method: 'Target.getTargets' }));
            });

            ws.on('message', (data) => {
              const msg = JSON.parse(data.toString());

              if (msg.id === 10) {
                // Navigate the tab the user is already looking at, in place.
                // Opening a new tab and closing the old one is racy and can
                // leave the browser's default about:blank tab focused in VNC.
                const pages = (msg.result?.targetInfos || []).filter((t: any) => t.type === 'page');
                const target = pages[0];
                if (target) {
                  ws.send(JSON.stringify({ id: 11, method: 'Target.activateTarget', params: { targetId: target.targetId } }));
                  ws.send(JSON.stringify({ id: 12, method: 'Target.attachToTarget', params: { targetId: target.targetId, flatten: true } }));
                } else {
                  // Browser hasn't opened a page yet — open one at the start URL.
                  ws.send(JSON.stringify({ id: 13, method: 'Target.createTarget', params: { url: startUrl } }));
                }
              } else if (msg.id === 12) {
                const sessionId = msg.result?.sessionId;
                if (sessionId) {
                  ws.send(JSON.stringify({ sessionId, id: 14, method: 'Page.navigate', params: { url: startUrl } }));
                } else {
                  ws.send(JSON.stringify({ id: 13, method: 'Target.createTarget', params: { url: startUrl } }));
                }
              } else if (msg.id === 13 || msg.id === 14) {
                finish();
              }
            });

            ws.on('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
          break; 
        } catch (err) {
          if (i === 4) throw err;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } catch (err) {
      logger.warn({ err, startUrl }, 'Failed to navigate via CDP');
    }
  }

  return data;
}

export async function startSession(input: StartSessionInput): Promise<StartSessionResult> {
  const profile = await db.getOrCreateBrowserProfile(input.userId);

  const existing = await db.listActiveBrowserSessions(input.userId);
  if (existing.length > 0) {
    throw new HostError(
      'ACTIVE_SESSION_EXISTS',
      `User already has an active browser session (${existing[0].id}). Close it first.`,
    );
  }

  // Ensure manager profile exists and is stopped
  let managerProfile = await getManagerProfile(input.userId);
  if (!managerProfile) {
    managerProfile = await createManagerProfile(input.userId);
  } else if (managerProfile.status === 'running') {
    logger.info({ userId: input.userId, managerProfileId: managerProfile.id }, 'stopping already running profile before restart');
    await stopManagerProfile(managerProfile.id);
    // Give it a moment to release ports/resources
    await new Promise(r => setTimeout(r, 1000));
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await db.createBrowserSession({
    userId: input.userId,
    profileId: profile.id,
    startUrl: input.startUrl ?? null,
    expiresAt,
  });

  logger.info({ sessionId: session.id, managerProfileId: managerProfile.id }, 'launching via manager');

  try {
    await launchManagerProfile(managerProfile.id, input.startUrl);
    
    const updated = await db.updateBrowserSession(session.id, {
      status: 'READY',
      noVncUrl: managerProfile.id, // We use this field to store the manager's profile ID
      readyAt: new Date(),
    });

    return {
      sessionId: updated.id,
      status: updated.status as any,
      cdpPort: 0, 
      noVncUrl: updated.noVncUrl,
      profileDir: profile.profileDir,
      startedAt: updated.startedAt,
      expiresAt: updated.expiresAt,
    };
  } catch (err) {
    await db.updateBrowserSession(session.id, {
      status: 'ERROR',
      error: (err as Error).message,
      closedAt: new Date(),
    });
    throw err;
  }
}

export interface CloseSessionResult {
  sessionId: string;
  status: db.BrowserSessionStatus;
  loggedInOrigins: string[];
}

interface CdpStorageResult {
  origins: string[];
  storageStatePath: string | null;
}

/**
 * Connect to the browser via CDP proxy while it's healthy, capture all cookies,
 * write them as a Playwright-compatible storage_state.json, and return the
 * list of origins that have cookies.
 */
async function captureStorageStateViaManagerCdp(profileId: string, profileDir: string): Promise<CdpStorageResult> {
  const stateFile = path.join(profileDir, 'storage_state.json');
  const cdpUrl = managerCdpUrl(profileId);

  return new Promise<CdpStorageResult>((resolve) => {
    const ws = new WebSocket(cdpUrl, {
      headers: getManagerHeaders(),
    } as any);
    const origins = new Set<string>();
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ origins: Array.from(origins).sort(), storageStatePath: null });
    }, 10_000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 100, method: 'Storage.getCookies' }));
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === 100 && msg.result?.cookies) {
          const cookies = msg.result.cookies as Array<{
            name: string;
            value: string;
            domain: string;
            path: string;
            expires?: number;
            httpOnly?: boolean;
            secure?: boolean;
            sameSite?: string;
          }>;

          // Build the Playwright-compatible storage_state.json
          const cookiesOut = cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires ?? -1,
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? false,
            sameSite: (c.sameSite ?? 'None') as 'Strict' | 'Lax' | 'None',
          }));

          const state = { cookies: cookiesOut, origins: [] };
          
          await mkdir(profileDir, { recursive: true });
          await writeFile(stateFile, JSON.stringify(state, null, 2));
          
          logger.info({ path: stateFile, count: cookies.length }, 'storage_state.json saved via Manager CDP');

          // Extract origins from cookie domains
          for (const c of cookies) {
            if (!c.domain) continue;
            const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
            origins.add(`https://${host}`);
          }

          clearTimeout(timeout);
          ws.close();
          resolve({ origins: Array.from(origins).sort(), storageStatePath: stateFile });
        }
      } catch (err) {
        logger.warn({ err }, 'failed to parse CDP message during storage capture');
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ origins: [], storageStatePath: null });
    });
  });
}

export async function closeSession(sessionId: string, userId: string): Promise<CloseSessionResult> {
  const session = await db.getBrowserSession(sessionId, { id: userId });
  if (!session) throw new HostError('NOT_FOUND', 'Session not found');
  if (session.userId !== userId) throw new HostError('FORBIDDEN', 'Session belongs to another user');

  const profile = await db.getBrowserProfile(userId);
  let capturedOrigins: string[] = [];
  let storageStatePath: string | null = null;

  if (session.noVncUrl && profile) {
    // Capture state before stopping
    try {
      const result = await captureStorageStateViaManagerCdp(session.noVncUrl, profile.profileDir);
      capturedOrigins = result.origins;
      storageStatePath = result.storageStatePath;
    } catch (err) {
      logger.warn({ err, sessionId }, 'failed to capture storage state via Manager CDP');
    }

    await stopManagerProfile(session.noVncUrl);
  }

  const updated = await db.updateBrowserSession(sessionId, {
    status: 'CLOSED',
    closedAt: new Date(),
  });

  if (capturedOrigins.length > 0) {
    let s3Key: string | null = null;
    if (storageStatePath && existsSync(storageStatePath)) {
      try {
        s3Key = await uploadStorageState(storageStatePath, userId);
        logger.info({ userId, s3Key }, 'storage_state.json pushed to S3 after session close');
      } catch (err) {
        logger.warn({ err, userId }, 'failed to upload storage_state to S3');
      }
    }
    await db.recordLoggedInOrigins(userId, capturedOrigins, {
      storageStateKey: s3Key,
    });
  }

  return {
    sessionId: updated.id,
    status: updated.status as any,
    loggedInOrigins: capturedOrigins,
  };
}

export function listActiveInMemory(): any[] {
  return []; // No longer tracking in memory in this process
}

export async function shutdownAllSessions(): Promise<void> {
  // Global shutdown not easily supported via manager API without listing all
}

export class HostError extends Error {
  constructor(public code: 'NOT_FOUND' | 'FORBIDDEN' | 'ACTIVE_SESSION_EXISTS' | 'INTERNAL', message: string) {
    super(message);
    this.name = 'HostError';
  }
}

// Periodic GC: expire sessions past TTL
setInterval(async () => {
  try {
    const expiredCount = await db.expireStaleBrowserSessions();
    if (expiredCount > 0) logger.info({ expiredCount }, 'expired stale browser sessions');
    
    // Note: We don't have a list of manager profiles to stop here easily
    // without fetching them all. We rely on the manager's own auto-cleanup 
    // if implemented, or we could fetch active sessions from DB and stop them.
  } catch (err) {
    logger.warn({ err }, 'browser-host GC tick failed');
  }
}, 60_000).unref();
