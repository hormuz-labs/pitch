import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@saas/shared';
import * as db from '@saas/db';
import { uploadStorageState } from '@saas/storage';

type LauncherProc = ChildProcessByStdio<null, Readable, Readable>;

const logger = createLogger('api:browser-host');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAUNCHER_PATH = path.resolve(__dirname, '../../scripts/cloak-launch.mjs');
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle timeout
const READY_TIMEOUT_MS = 60_000;
const PORT_RANGE_START = 9300;
const PORT_RANGE_END = 9399;

interface ActiveSession {
  sessionId: string;
  userId: string;
  port: number;
  pid: number;
  profileDir: string;
  proc: LauncherProc;
  startedAt: number;
}

const active = new Map<string, ActiveSession>();
const portsInUse = new Set<number>();

async function findFreePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (portsInUse.has(port)) continue;
    const ok = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  throw new Error(`No free port in ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

interface ReadyEvent {
  event: 'ready';
  profileDir: string;
  port: number;
  pid: number;
  headless: boolean;
}

function waitForReady(proc: LauncherProc): Promise<ReadyEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Launcher did not become ready within ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.event === 'ready') {
            cleanup();
            resolve(evt);
            return;
          }
          if (evt.event === 'error') {
            cleanup();
            reject(new Error(`Launcher error: ${evt.message}`));
            return;
          }
          logger.debug({ evt }, 'launcher event');
        } catch {
          // not JSON — probably stderr/stdout noise from cloakbrowser
        }
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Launcher exited early with code ${code}`));
    };

    function cleanup() {
      clearTimeout(timeout);
      proc.stdout.off('data', onData);
      proc.off('exit', onExit);
    }

    proc.stdout.on('data', onData);
    proc.once('exit', onExit);
  });
}

export interface StartSessionInput {
  userId: string;
  startUrl?: string | null;
  headless?: boolean;
}

export interface StartSessionResult {
  sessionId: string;
  status: db.BrowserSessionStatus;
  cdpPort: number;
  profileDir: string;
  startedAt: Date;
  expiresAt: Date;
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

  const port = await findFreePort();
  portsInUse.add(port);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await db.createBrowserSession({
    userId: input.userId,
    profileId: profile.id,
    startUrl: input.startUrl ?? null,
    cdpPort: port,
    expiresAt,
  });

  const args = [
    LAUNCHER_PATH,
    '--profile-dir', profile.profileDir,
    '--port', String(port),
  ];
  if (input.startUrl) {
    args.push('--start-url', input.startUrl);
  }
  if (input.headless) {
    args.push('--headless');
  }

  logger.info({ sessionId: session.id, port, profileDir: profile.profileDir }, 'spawning cloak launcher');

  const proc = spawn('bun', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: process.env,
  }) as LauncherProc;

  proc.stderr.on('data', (chunk: Buffer) => {
    logger.debug({ sessionId: session.id, stderr: chunk.toString('utf8').trim() }, 'launcher stderr');
  });

  let ready: ReadyEvent;
  try {
    ready = await waitForReady(proc);
  } catch (err) {
    portsInUse.delete(port);
    try { proc.kill('SIGTERM'); } catch {}
    await db.updateBrowserSession(session.id, {
      status: 'ERROR',
      error: (err as Error).message,
      closedAt: new Date(),
    });
    throw err;
  }

  const handle: ActiveSession = {
    sessionId: session.id,
    userId: input.userId,
    port: ready.port,
    pid: ready.pid,
    profileDir: ready.profileDir,
    proc,
    startedAt: Date.now(),
  };
  active.set(session.id, handle);

  proc.once('exit', (code) => {
    portsInUse.delete(port);
    active.delete(session.id);
    logger.info({ sessionId: session.id, code }, 'launcher exited');
    // Best-effort DB sync; if already CLOSED this is a no-op winner-take-all
    db.updateBrowserSession(session.id, {
      status: 'CLOSED',
      closedAt: new Date(),
    }).catch((err: unknown) => logger.warn({ err }, 'failed to mark session CLOSED after exit'));
  });

  const updated = await db.updateBrowserSession(session.id, {
    status: 'READY',
    cdpPort: ready.port,
    pid: ready.pid,
    readyAt: new Date(),
  });

  return {
    sessionId: updated.id,
    status: updated.status,
    cdpPort: ready.port,
    profileDir: ready.profileDir,
    startedAt: updated.startedAt,
    expiresAt: updated.expiresAt,
  };
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

  const handle = active.get(sessionId);
  let capturedOrigins: string[] = [];

  if (handle) {
    // Capture origins from CDP before shutdown.
    capturedOrigins = await captureOriginsViaCdp(handle.port).catch((err) => {
      logger.warn({ err, sessionId }, 'failed to capture origins via CDP');
      return [];
    });

    handle.proc.kill('SIGTERM');
    // Give the launcher up to 8s to save storage_state and exit gracefully.
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try { handle.proc.kill('SIGKILL'); } catch {}
        resolve();
      }, 8_000);
      handle.proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  const updated = await db.updateBrowserSession(sessionId, {
    status: 'CLOSED',
    closedAt: new Date(),
  });

  if (capturedOrigins.length > 0) {
    const profileDir = handle?.profileDir;
    let s3Key: string | null = null;
    if (profileDir) {
      const stateFile = path.join(profileDir, 'storage_state.json');
      if (existsSync(stateFile)) {
        try {
          s3Key = await uploadStorageState(stateFile, userId);
          logger.info({ userId, s3Key }, 'storage_state.json pushed to S3 after session close');
        } catch (err) {
          logger.warn({ err, userId }, 'failed to upload storage_state to S3');
        }
      }
    }
    await db.recordLoggedInOrigins(userId, capturedOrigins, {
      storageStateKey: s3Key,
    });
  }

  return {
    sessionId: updated.id,
    status: updated.status,
    loggedInOrigins: capturedOrigins,
  };
}

async function captureOriginsViaCdp(port: number): Promise<string[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) return [];
  const { webSocketDebuggerUrl } = await res.json() as { webSocketDebuggerUrl: string };
  if (!webSocketDebuggerUrl) return [];

  return new Promise<string[]>((resolve) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const origins = new Set<string>();
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve(Array.from(origins).sort());
    }, 5_000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }));
    });
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.id === 1 && msg.result?.cookies) {
          for (const c of msg.result.cookies) {
            if (!c.domain) continue;
            const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
            origins.add(`https://${host}`);
          }
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve(Array.from(origins).sort());
        }
      } catch {
        // ignore
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      resolve([]);
    });
  });
}

export function listActiveInMemory(): Array<{ sessionId: string; userId: string; port: number; pid: number; startedAt: number }> {
  return Array.from(active.values()).map((s) => ({
    sessionId: s.sessionId,
    userId: s.userId,
    port: s.port,
    pid: s.pid,
    startedAt: s.startedAt,
  }));
}

export async function shutdownAllSessions(): Promise<void> {
  const handles = Array.from(active.values());
  await Promise.all(
    handles.map(async (h) => {
      try {
        h.proc.kill('SIGTERM');
      } catch {}
    }),
  );
  await new Promise((r) => setTimeout(r, 3_000));
  for (const h of handles) {
    if (!h.proc.killed) {
      try { h.proc.kill('SIGKILL'); } catch {}
    }
  }
  active.clear();
  portsInUse.clear();
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
    const expired = await db.expireStaleBrowserSessions();
    if (expired > 0) logger.info({ expired }, 'expired stale browser sessions');
    const now = Date.now();
    for (const h of active.values()) {
      if (now - h.startedAt > SESSION_TTL_MS) {
        logger.info({ sessionId: h.sessionId }, 'killing TTL-expired session');
        try { h.proc.kill('SIGTERM'); } catch {}
      }
    }
  } catch (err) {
    logger.warn({ err }, 'browser-host GC tick failed');
  }
}, 60_000).unref();
