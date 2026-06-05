import { createLogger } from '@saas/shared';
import * as db from '@saas/db';

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

const MANAGER_BASE_URL = process.env.CLOAK_MANAGER_URL || 'http://127.0.0.1:8080';

async function getManagerProfile(userId: string): Promise<any | null> {
  try {
    const res = await fetch(`${MANAGER_BASE_URL}/api/profiles`);
    if (!res.ok) return null;
    const profiles = await res.json() as any[];
    return profiles.find(p => p.name === userId) || null;
  } catch (err) {
    logger.warn({ err }, 'failed to fetch manager profiles');
    return null;
  }
}

async function createManagerProfile(userId: string): Promise<any> {
  const res = await fetch(`${MANAGER_BASE_URL}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: userId,
      platform: 'windows',
    }),
  });
  if (!res.ok) throw new Error(`Failed to create manager profile: ${await res.text()}`);
  return res.json();
}

async function launchManagerProfile(profileId: string, startUrl?: string | null): Promise<any> {
  const res = await fetch(`${MANAGER_BASE_URL}/api/profiles/${profileId}/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to launch manager profile: ${await res.text()}`);
  const data = await res.json();

  if (startUrl) {
    try {
      const cdpUrl = `ws://127.0.0.1:8080/api/profiles/${profileId}/cdp`;
      const { WebSocket } = await import('ws');
      
      for (let i = 0; i < 5; i++) {
        try {
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(cdpUrl);
            const timeout = setTimeout(() => {
              ws.terminate();
              reject(new Error('CDP navigation timeout'));
            }, 5000);

            ws.on('open', () => {
              // 1. Get existing targets to find the initial blank page
              ws.send(JSON.stringify({
                id: 10,
                method: 'Target.getTargets'
              }));
            });

            ws.on('message', (data) => {
              const msg = JSON.parse(data.toString());
              
              if (msg.id === 10) {
                const targets = msg.result?.targetInfos || [];
                // Find all page targets (usually just one about:blank)
                const initialPageIds = targets
                  .filter((t: any) => t.type === 'page')
                  .map((t: any) => t.targetId);

                // 2. Create the new target with our URL
                ws.send(JSON.stringify({
                  id: 11,
                  method: 'Target.createTarget',
                  params: { url: startUrl },
                  // We'll store the old IDs in a closure-accessible variable
                }));
                
                // Store for the next handler
                (ws as any)._initialPageIds = initialPageIds;
              } 
              else if (msg.id === 11) {
                // 3. New target created, now close the old ones
                const oldIds = (ws as any)._initialPageIds || [];
                for (const targetId of oldIds) {
                  ws.send(JSON.stringify({
                    id: 12,
                    method: 'Target.closeTarget',
                    params: { targetId }
                  }));
                }
                
                setTimeout(() => {
                  ws.close();
                  clearTimeout(timeout);
                  resolve();
                }, 500);
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

async function stopManagerProfile(profileId: string): Promise<void> {
  try {
    await fetch(`${MANAGER_BASE_URL}/api/profiles/${profileId}/stop`, { method: 'POST' });
  } catch (err) {
    logger.warn({ err, profileId }, 'failed to stop manager profile');
  }
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

export async function closeSession(sessionId: string, userId: string): Promise<CloseSessionResult> {
  const session = await db.getBrowserSession(sessionId, { id: userId });
  if (!session) throw new HostError('NOT_FOUND', 'Session not found');
  if (session.userId !== userId) throw new HostError('FORBIDDEN', 'Session belongs to another user');

  if (session.noVncUrl) {
    await stopManagerProfile(session.noVncUrl);
  }

  const updated = await db.updateBrowserSession(sessionId, {
    status: 'CLOSED',
    closedAt: new Date(),
  });

  return {
    sessionId: updated.id,
    status: updated.status as any,
    loggedInOrigins: [],
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
