import path from 'path';
import os from 'os';
import { prisma, getEnhancedPrisma, type AuthUser } from './index.js';

export type BrowserSessionStatus = 'STARTING' | 'READY' | 'CLOSED' | 'ERROR' | 'EXPIRED';

export interface BrowserProfilePayload {
  id: string;
  userId: string;
  profileDir: string;
  storageStateKey: string | null;
  loggedInOrigins: string[];
  lastSyncedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrowserSessionPayload {
  id: string;
  userId: string;
  profileId: string;
  status: BrowserSessionStatus;
  startUrl: string | null;
  cdpPort: number | null;
  noVncUrl: string | null;
  pid: number | null;
  error: string | null;
  startedAt: Date;
  readyAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date;
}

const PROFILE_ROOT = process.env.CLOAK_PROFILE_ROOT
  || path.join(os.homedir(), '.cloak-profiles');

export function defaultProfileDirForUser(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PROFILE_ROOT, `user-${safe}`);
}

function shapeProfile(row: any): BrowserProfilePayload {
  return {
    id: row.id,
    userId: row.userId,
    profileDir: row.profileDir,
    storageStateKey: row.storageStateKey ?? null,
    loggedInOrigins: (() => {
      try {
        return JSON.parse(row.loggedInOrigins ?? '[]');
      } catch {
        return [];
      }
    })(),
    lastSyncedAt: row.lastSyncedAt ?? null,
    version: row.version ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function shapeSession(row: any): BrowserSessionPayload {
  return {
    id: row.id,
    userId: row.userId,
    profileId: row.profileId,
    status: row.status as BrowserSessionStatus,
    startUrl: row.startUrl ?? null,
    cdpPort: row.cdpPort ?? null,
    noVncUrl: row.noVncUrl ?? null,
    pid: row.pid ?? null,
    error: row.error ?? null,
    startedAt: row.startedAt,
    readyAt: row.readyAt ?? null,
    closedAt: row.closedAt ?? null,
    expiresAt: row.expiresAt,
  };
}

export async function getOrCreateBrowserProfile(userId: string, user?: AuthUser): Promise<BrowserProfilePayload> {
  const client = getEnhancedPrisma(user ?? { id: userId });
  const existing = await client.browserProfile.findUnique({ where: { userId } });
  if (existing) return shapeProfile(existing);
  const created = await client.browserProfile.create({
    data: {
      userId,
      profileDir: defaultProfileDirForUser(userId),
    },
  });
  return shapeProfile(created);
}

export async function getBrowserProfile(userId: string, user?: AuthUser): Promise<BrowserProfilePayload | null> {
  const client = getEnhancedPrisma(user ?? { id: userId });
  const row = await client.browserProfile.findUnique({ where: { userId } });
  return row ? shapeProfile(row) : null;
}

export async function recordLoggedInOrigins(
  userId: string,
  newOrigins: string[],
  opts?: { storageStateKey?: string | null },
): Promise<BrowserProfilePayload> {
  const profile = await getOrCreateBrowserProfile(userId);
  const merged = Array.from(new Set([...profile.loggedInOrigins, ...newOrigins])).sort();
  const row = await prisma.browserProfile.update({
    where: { userId },
    data: {
      loggedInOrigins: JSON.stringify(merged),
      lastSyncedAt: new Date(),
      version: { increment: 1 },
      ...(opts?.storageStateKey !== undefined ? { storageStateKey: opts.storageStateKey } : {}),
    },
  });
  return shapeProfile(row);
}

export async function createBrowserSession(data: {
  userId: string;
  profileId: string;
  startUrl?: string | null;
  cdpPort?: number | null;
  expiresAt: Date;
}, user?: AuthUser): Promise<BrowserSessionPayload> {
  const client = getEnhancedPrisma(user ?? { id: data.userId });
  const row = await client.browserSession.create({
    data: {
      userId: data.userId,
      profileId: data.profileId,
      startUrl: data.startUrl ?? null,
      cdpPort: data.cdpPort ?? null,
      expiresAt: data.expiresAt,
    },
  });
  return shapeSession(row);
}

export async function updateBrowserSession(id: string, data: {
  status?: BrowserSessionStatus;
  cdpPort?: number | null;
  noVncUrl?: string | null;
  pid?: number | null;
  error?: string | null;
  readyAt?: Date | null;
  closedAt?: Date | null;
}): Promise<BrowserSessionPayload> {
  const row = await prisma.browserSession.update({
    where: { id },
    data,
  });
  return shapeSession(row);
}

export async function getBrowserSession(id: string, user?: AuthUser): Promise<BrowserSessionPayload | null> {
  const client = getEnhancedPrisma(user);
  const row = await client.browserSession.findUnique({ where: { id } });
  return row ? shapeSession(row) : null;
}

export async function listActiveBrowserSessions(userId: string, user?: AuthUser): Promise<BrowserSessionPayload[]> {
  const client = getEnhancedPrisma(user ?? { id: userId });
  const rows = await client.browserSession.findMany({
    where: { userId, status: { in: ['STARTING', 'READY'] } },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(shapeSession);
}

export async function expireStaleBrowserSessions(): Promise<number> {
  const result = await prisma.browserSession.updateMany({
    where: {
      status: { in: ['STARTING', 'READY'] },
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'EXPIRED',
      closedAt: new Date(),
    },
  });
  return result.count;
}

/**
 * Persist the S3 key for the user's latest storage_state.json.
 * Called by the worker after a successful S3 upload so the DB stays in sync.
 */
export async function updateStorageStateKey(
  userId: string,
  storageStateKey: string,
): Promise<BrowserProfilePayload> {
  const row = await prisma.browserProfile.update({
    where: { userId },
    data: {
      storageStateKey,
      lastSyncedAt: new Date(),
      version: { increment: 1 },
    },
  });
  return shapeProfile(row);
}
