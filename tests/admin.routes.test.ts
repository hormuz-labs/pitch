/**
 * Security regression tests for `requireAdmin` middleware in
 * apps/api/src/routes/admin.ts. Mounts the REAL router (not a reimplementation)
 * so the tests actually exercise the production code path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks (factories must be self-contained) ─────────────────────────────────

// Mock requireAuth at the middleware path admin.ts imports — sidesteps the
// @clerk/express package-mock issue under bun's workspace symlinking. The
// thing under test is requireAdmin's authorization logic, not auth itself.
let _userId: string | null = 'user_test';
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: any, res: any) => {
    if (!_userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return _userId;
  },
}));
const __setUserId = (u: string | null) => { _userId = u; };

vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: vi.fn() },
    creditTransaction: { groupBy: vi.fn().mockResolvedValue([]) },
    job: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  JOB_CANCELLATIONS_CHANNEL: 'cancel',
  JOB_UPDATES_CHANNEL: 'updates',
  sendTelegramMessage: vi.fn(() => Promise.resolve()),
}));

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

// ── Imports (after mocks) ────────────────────────────────────────────────────
import * as db from '@saas/db';
import { router as adminRouter } from '../apps/api/src/routes/admin.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

let app: express.Express;

beforeEach(() => {
  vi.clearAllMocks();
  __setUserId('user_test');
  delete process.env.ADMIN_EMAILS;
  app = buildApp();
});

describe('requireAdmin middleware', () => {
  it('fails closed with 503 when ADMIN_EMAILS is not configured', async () => {
    delete process.env.ADMIN_EMAILS;
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({
      id: 'user_test',
      email: 'someone@example.com',
    });

    const res = await request(app).get('/admin/dashboard');

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it('returns 403 when the authenticated user is not in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'admin@trypitch.co';
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({
      id: 'user_test',
      email: 'someone-else@example.com',
    });

    const res = await request(app).get('/admin/dashboard');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });
});
