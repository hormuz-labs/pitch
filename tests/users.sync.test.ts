/**
 * Security regression tests for POST /users/sync in
 * apps/api/src/routes/users.ts.
 *
 * Pins the fix for the privilege-escalation bug where a body-supplied email
 * was written verbatim to UserProfile.email, letting any user claim an admin
 * address and pass requireAdmin. The route must now ignore body email and use
 * the verified primary email from Clerk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock requireAuth at the middleware path users.ts imports.
let _userId: string | null = 'user_attacker';
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!_userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return _userId;
  },
}));

// Mock the thin Clerk wrapper so we control the verified profile.
let _verifiedProfile: any = null;
vi.mock('../apps/api/src/lib/clerk.js', () => ({
  getVerifiedClerkProfile: vi.fn(async (_id: string) => {
    if (!_verifiedProfile) throw new Error('No verified profile configured in test');
    return _verifiedProfile;
  }),
}));

vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: vi.fn() },
    creditTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }) },
  },
  upsertUser:  vi.fn(),
  addCredits:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  sendTelegramMessage: vi.fn(() => Promise.resolve()),
  JOB_CANCELLATIONS_CHANNEL: 'cancel',
  JOB_UPDATES_CHANNEL: 'updates',
}));

// admin.ts pulls bullmq/redis from config.js — stub them so the router can mount.
vi.mock('../apps/api/src/config.js', () => ({
  videoQueue: {
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }),
    getWorkers:   vi.fn().mockResolvedValue([]),
    isPaused:     vi.fn().mockResolvedValue(false),
    pause:        vi.fn(),
    resume:       vi.fn(),
    getJob:       vi.fn().mockResolvedValue(null),
  },
  connection: { publish: vi.fn().mockResolvedValue(1) },
  subscriber: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

import * as db from '@saas/db';
import { getVerifiedClerkProfile } from '../apps/api/src/lib/clerk.js';
import { router as usersRouter } from '../apps/api/src/routes/users.js';
import { router as adminRouter } from '../apps/api/src/routes/admin.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', usersRouter);
  return app;
}

let app: express.Express;

beforeEach(() => {
  vi.clearAllMocks();
  _userId = 'user_attacker';
  _verifiedProfile = null;
  vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue(null);
  vi.mocked((db as any).upsertUser).mockImplementation(async (input: any) => input);
  app = buildApp();
});

describe('POST /users/sync', () => {
  it('ignores body-supplied email and uses the Clerk-verified primary email', async () => {
    _verifiedProfile = {
      email: 'real-user@example.com',
      firstName: 'Real',
      lastName: 'User',
      imageUrl: 'https://img/real.png',
    };

    const res = await request(app)
      .post('/users/sync')
      .send({
        email: 'admin@trypitch.co',       // attacker tries to overwrite
        firstName: 'Spoofed',
        lastName: 'Spoofed',
      });

    expect(res.status).toBe(200);

    // upsertUser must be called with the Clerk-verified email, NOT the body email.
    expect(db.upsertUser).toHaveBeenCalledTimes(1);
    const call = vi.mocked(db.upsertUser).mock.calls[0][0];
    expect(call.email).toBe('real-user@example.com');
    expect(call.email).not.toBe('admin@trypitch.co');
    expect(call.id).toBe('user_attacker');

    // The verified-profile helper must have been invoked with the auth'd user id.
    expect(getVerifiedClerkProfile).toHaveBeenCalledWith('user_attacker');
  });

  it('cannot escalate to admin by passing an admin email in the body', async () => {
    // Body claims an admin address; Clerk says the user's verified email is a non-admin one.
    process.env.ADMIN_EMAILS = 'admin@trypitch.co';
    _verifiedProfile = {
      email: 'attacker@evil.example',
      firstName: 'Mal',
      lastName: 'Lory',
    };

    // Shared in-memory profile store so users.sync writes are visible to admin.findUnique.
    const profileStore = new Map<string, any>();
    vi.mocked((db as any).upsertUser).mockImplementation(async (input: any) => {
      profileStore.set(input.id, { id: input.id, email: input.email });
      return profileStore.get(input.id);
    });
    vi.mocked((db as any).prisma.userProfile.findUnique).mockImplementation(
      async ({ where }: any) => profileStore.get(where.id) ?? null
    );

    const combined = express();
    combined.use(express.json());
    combined.use('/users', usersRouter);
    combined.use('/admin', adminRouter);

    // 1) Attacker tries to overwrite their stored email with an admin address.
    const sync = await request(combined)
      .post('/users/sync')
      .send({ email: 'admin@trypitch.co' });
    expect(sync.status).toBe(200);

    // The stored email must be the Clerk-verified one, not the body-supplied one.
    expect(profileStore.get('user_attacker').email).toBe('attacker@evil.example');

    // 2) Subsequent admin request must be rejected.
    const admin = await request(combined).get('/admin/dashboard');
    expect(admin.status).toBe(403);
  });
});
