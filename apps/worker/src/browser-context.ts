import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createLogger, type Logger } from '@saas/shared';
import { getOrCreateBrowserProfile } from '@saas/db';
import { downloadStorageState } from '@saas/storage';

const logger: Logger = createLogger('worker:browser');

export interface BrowserContextHandle {
  /** Local filesystem path to the user's Chromium profile dir. */
  profileDir: string;
  /** Last time the context was touched; used to apply the idle TTL. */
  lastUsedAt: number;
  /** Release resources (clean up cache entry). */
  shutdown: () => void;
}

const CONTEXT_TTL_MS = Number(process.env.WORKER_BROWSER_CONTEXT_TTL_MS || '300_000'); // 5 min idle

// Per-user warm cache: avoids re-downloading storage_state from S3 for
// back-to-back jobs from the same user. Each entry expires after
// CONTEXT_TTL_MS of inactivity.
const activeContexts = new Map<string, BrowserContextHandle>();

/**
 * Ensure the profile dir exists and contains an up-to-date storage_state.json
 * pulled from S3.
 */
async function syncProfileFromS3(userId: string, profileDir: string): Promise<void> {
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
    logger.info({ userId, profileDir }, 'Created profile dir');
  }

  const destFile = path.join(profileDir, 'storage_state.json');
  try {
    const downloaded = await downloadStorageState(userId, destFile);
    if (downloaded) {
      logger.info({ userId, profileDir }, 'storage_state.json pulled from S3');
    } else {
      logger.info({ userId }, 'No storage_state in S3 yet — starting with fresh profile');
    }
  } catch (e) {
    logger.warn({ err: e, userId }, 'S3 download failed — proceeding with local state (if any)');
  }
}

/**
 * Get (or lazily create) the per-user browser context handle.
 *
 * Pulls the latest storage_state.json from S3 into the local profile dir so
 * the auto-demo engine has access to the user's authenticated sessions. The
 * handle is cached for CONTEXT_TTL_MS; subsequent calls for the same user
 * within that window return the cached handle instantly.
 *
 * NOTE: The worker never uploads storage_state back to S3. That only happens
 * when the user explicitly authenticates via the Browser Sessions tab.
 */
export async function startBrowserContext(userId: string): Promise<BrowserContextHandle> {
  const existing = activeContexts.get(userId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    logger.info({ userId }, 'Reusing cached browser context');
    return existing;
  }

  const profile = await getOrCreateBrowserProfile(userId);
  const profileDir = profile.profileDir;

  await syncProfileFromS3(userId, profileDir);

  const handle: BrowserContextHandle = {
    profileDir,
    lastUsedAt: Date.now(),
    shutdown: () => {
      activeContexts.delete(userId);
    },
  };

  activeContexts.set(userId, handle);
  logger.info({ userId, profileDir }, 'Browser context ready');
  return handle;
}

let gcTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Periodically evict idle browser contexts from the cache.
 * Call once at worker startup.
 */
export function startBrowserContextGC(intervalMs = 30_000) {
  if (gcTimer) return;
  gcTimer = setInterval(async () => {
    const now = Date.now();
    for (const [userId, handle] of activeContexts.entries()) {
      if (now - handle.lastUsedAt > CONTEXT_TTL_MS) {
        logger.info({ userId, idleMs: now - handle.lastUsedAt }, 'Evicting idle browser context');
        handle.shutdown();
      }
    }
  }, intervalMs);
}

export function stopAllBrowserContexts() {
  for (const [userId, handle] of activeContexts.entries()) {
    handle.shutdown();
  }
  activeContexts.clear();
  if (gcTimer) { clearInterval(gcTimer); gcTimer = null; }
}
