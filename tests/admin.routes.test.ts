/**
 * Security regression tests for `requireAdmin` middleware in
 * apps/api/src/routes/admin.ts. Mounts the REAL router (not a reimplementation)
 * so the tests exercise the production authorization path.
 *
 * Authorization is role-based: a request is allowed only when the caller's
 * UserProfile has role === 'admin'. To test the gate in isolation (decoupled
 * from any specific admin handler's data needs), requests hit an unknown admin
 * path — a blocked request is rejected by requireAdmin (401/403) and never
 * reaches routing, while an allowed request passes the middleware and falls
 * through to a 404.
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

// An admin path with no matching handler — used to observe ONLY the gate:
// reaching it (404) proves requireAdmin called next(); a 401/403 proves it blocked.
const GATE_PROBE = '/admin/__gate_probe__';

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
  app = buildApp();
});

describe('requireAdmin middleware', () => {
  it('returns 401 when the request is unauthenticated', async () => {
    __setUserId(null);

    const res = await request(app).get(GATE_PROBE);

    expect(res.status).toBe(401);
    expect(db.prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no profile', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue(null);

    const res = await request(app).get(GATE_PROBE);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/profile not found/i);
  });

  it('returns 403 when the user is not an admin', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({
      id: 'user_test',
      email: 'someone@example.com',
      role: 'user',
    });

    const res = await request(app).get(GATE_PROBE);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it('passes the gate when the user role is admin', async () => {
    vi.mocked((db as any).prisma.userProfile.findUnique).mockResolvedValue({
      id: 'user_test',
      email: 'admin@example.com',
      role: 'admin',
    });

    const res = await request(app).get(GATE_PROBE);

    // requireAdmin called next() → no handler for this path → 404 (NOT 401/403).
    expect(res.status).toBe(404);
  });
});
