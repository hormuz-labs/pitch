import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, type Logger } from '@saas/shared';
import { getBrowserProfile } from '@saas/db';

const logger: Logger = createLogger('worker:browser');

export interface BrowserContextHandle {
  cdpUrl: string;
  cdpPort: number;
  profileDir: string;
  pid: number | null;
  // Last time the context was touched; used to apply the idle TTL.
  lastUsedAt: number;
  shutdown: () => Promise<void>;
}

const CONTEXT_TTL_MS = Number(process.env.WORKER_BROWSER_CONTEXT_TTL_MS || '300_000'); // 5 min idle
const READY_TIMEOUT_MS = Number(process.env.WROWSER_BROWSER_CONTEXT_READY_TIMEOUT_MS || '60_000');

const PORT_RANGE_MIN = 9400;
const PORT_RANGE_MAX = 9499;
const usedPorts = new Set<number>();

// Per-user warm cache: avoids re-launching the same stealth browser for
// back-to-back jobs from the same user. Each entry expires after
// CONTEXT_TTL_MS of inactivity.
const activeContexts = new Map<string, BrowserContextHandle>();

function allocatePort(): number {
  for (let p = PORT_RANGE_MIN; p <= PORT_RANGE_MAX; p++) {
    if (!usedPorts.has(p)) {
      usedPorts.add(p);
      return p;
    }
  }
  throw new Error(`No free ports in worker browser range ${PORT_RANGE_MIN}-${PORT_RANGE_MAX}`);
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

function launcherPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // apps/worker/src/browser-context.ts → apps/api/scripts/cloak-launch.mjs
  return path.resolve(__dirname, '..', '..', 'api', 'scripts', 'cloak-launch.mjs');
}

async function waitForReady(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(`Launcher did not signal ready within ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: { type?: string; url?: string; error?: string } | null = null;
        try { evt = JSON.parse(line); } catch { continue; }
        if (!resolved && evt?.type === 'ready' && evt.url) {
          resolved = true;
          cleanup();
          resolve();
        } else if (!resolved && evt?.type === 'error') {
          resolved = true;
          cleanup();
          reject(new Error(`Launcher reported error: ${evt.error ?? 'unknown'}`));
        }
      }
    };
    const onExit = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(`Launcher exited before ready (code=${code})`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
    };
    if (!child.stdout) {
      cleanup();
      reject(new Error('Launcher stdout is not piped'));
      return;
    }
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

/**
 * Launch a headless stealth Chromium with the user's profile dir, returning
 * a handle that exposes the CDP URL the agent should connect to.
 *
 * Returns null when the user has no profile yet — caller should fall back to
 * the default (non-authenticated) browser flow.
 */
export async function startBrowserContext(userId: string): Promise<BrowserContextHandle | null> {
  const existing = activeContexts.get(userId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing;
  }

  let profile;
  try {
    profile = await getBrowserProfile(userId);
  } catch (e) {
    logger.warn({ err: e, userId }, 'Failed to load browser profile; running job without stealth context');
    return null;
  }
  if (!profile) {
    logger.info({ userId }, 'No browser profile for user; running job without stealth context');
    return null;
  }
  if (!existsSync(profile.profileDir)) {
    logger.warn({ userId, profileDir: profile.profileDir }, 'Profile dir missing; user has not logged in yet');
    return null;
  }

  const launcher = launcherPath();
  if (!existsSync(launcher)) {
    logger.error({ launcher }, 'Cloak launcher script missing — cannot start worker browser context');
    return null;
  }

  const port = allocatePort();
  const child = spawn('bun', [launcher, '--profile-dir', profile.profileDir, '--port', String(port), '--headless'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stderr.on('data', (chunk) => {
    const msg = chunk.toString('utf8').trim();
    if (msg) logger.debug({ userId, port, msg }, 'launcher stderr');
  });

  try {
    await waitForReady(child, READY_TIMEOUT_MS);
  } catch (e) {
    logger.error({ err: e, userId, port }, 'Stealth browser failed to become ready');
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    releasePort(port);
    return null;
  }

  const handle: BrowserContextHandle = {
    cdpUrl: `http://127.0.0.1:${port}`,
    cdpPort: port,
    profileDir: profile.profileDir,
    pid: child.pid ?? null,
    lastUsedAt: Date.now(),
    shutdown: async () => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      releasePort(port);
      activeContexts.delete(userId);
    },
  };
  activeContexts.set(userId, handle);
  child.once('exit', () => {
    releasePort(port);
    if (activeContexts.get(userId) === handle) activeContexts.delete(userId);
    logger.info({ userId, port }, 'Worker stealth browser exited');
  });
  logger.info({ userId, port, profileDir: profile.profileDir }, 'Stealth browser context ready');
  return handle;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Periodically close idle browser contexts so they don't accumulate.
 * Call once at worker startup.
 */
export function startBrowserContextGC(intervalMs = 30_000) {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, handle] of activeContexts.entries()) {
      if (now - handle.lastUsedAt > CONTEXT_TTL_MS) {
        logger.info({ userId, idleMs: now - handle.lastUsedAt }, 'Closing idle worker browser context');
        void handle.shutdown();
      }
    }
  }, intervalMs);
}

export function stopAllBrowserContexts() {
  for (const handle of activeContexts.values()) {
    try { void handle.shutdown(); } catch { /* ignore */ }
  }
  activeContexts.clear();
  if (gcTimer) { clearInterval(gcTimer); gcTimer = null; }
}
