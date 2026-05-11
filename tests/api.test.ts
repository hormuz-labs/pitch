/**
 * Unit tests for Express API routes.
 *
 * All external dependencies (@saas/db, bullmq, ioredis, @clerk/express) are
 * mocked so the suite runs with zero infrastructure.
 * supertest is used to fire real HTTP requests against the in-process app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// ── vi.mock factories must be self-contained (hoisting rule) ──────────────────

vi.mock('../packages/db/src/index.js', () => ({
  listJobs:              vi.fn(),
  createJob:             vi.fn(),
  getJob:                vi.fn(),
  updateJob:             vi.fn(),
  deleteJob:             vi.fn(),
  getCreditBalance:      vi.fn(),
  deductCredit:          vi.fn(),
  getCreditTransactions: vi.fn(),
}));

vi.mock('bullmq', () => {
  const instance = {
    add:    vi.fn().mockResolvedValue({}),
    getJob: vi.fn().mockResolvedValue(null),
  };
  function Queue() { return instance; }
  return { Queue };
});

vi.mock('ioredis', () => {
  const instance = {
    publish:   vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    on:        vi.fn(),
    off:       vi.fn(),
  };
  function Redis() { return instance; }
  return { Redis };
});

// Clerk auth is configurable per-test via the exported setter
vi.mock('@clerk/express', () => {
  let _auth = { userId: 'user_test',  };
  return {
    clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
    getAuth:         () => _auth,
    __setAuth:       (a: typeof _auth) => { _auth = a; },
  };
});

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// ── Import mocked modules after vi.mock declarations ─────────────────────────
import * as db           from '../packages/db/src/index.js';
import { Queue }         from 'bullmq';
import { Redis }         from 'ioredis';
// @ts-ignore — __setAuth is injected by the vi.mock factory
import * as clerk from '@clerk/express';
import { JobStatus, QUEUE_NAME, JOB_UPDATES_CHANNEL } from '../packages/shared/src/index.js';
const __setAuth = (clerk as any).__setAuth;

// ── Build the Express app (mirrors apps/api/src/index.ts without app.listen) ─
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cors());
  app.use((clerk.clerkMiddleware as any)());

  const connection  = new (Redis as any)('redis://localhost:6379', { maxRetriesPerRequest: null });
  const videoQueue  = new (Queue as any)(QUEUE_NAME, { connection });

  app.get('/jobs', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const jobs = await (db.listJobs as any)({ id: userId });
      res.json(jobs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/jobs', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    const { parameters } = req.body as { parameters: any };
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const tenantId = userId;
      const balance = await (db.getCreditBalance as any)(tenantId);
      if (balance < 3) return res.status(402).json({ error: 'Insufficient credits', balance });
      const job = await (db.createJob as any)({ userId, parameters }, { id: userId });
      await (db.deductCredit as any)(tenantId, 3, 'job_created', job.id);
      await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));
      res.status(201).json(job);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/jobs/stream', (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    // In tests we just open and close; SSE stream stays open until client disconnects
    req.on('close', () => res.end());
  });

  app.get('/jobs/:id', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const job = await (db.getJob as any)(req.params.id, { id: userId });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(job);
    } catch (e: any) {
      if (e.code === 'P2004') return res.status(403).json({ error: 'Forbidden' });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/jobs/:id/retrigger', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const job = await (db.getJob as any)(req.params.id, { id: userId });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      
      const balance = await (db.getCreditBalance as any)(userId);
      if (balance < 3) return res.status(402).json({ error: 'Insufficient credits', balance });

      const updated = await (db.updateJob as any)(req.params.id, { status: JobStatus.PENDING, videoUrl: undefined });
      await (db.deductCredit as any)(userId, 3, 'job_retriggered', updated.id);
      
      const existing = await videoQueue.getJob(req.params.id);
      if (existing) await existing.remove();
      await videoQueue.add('generate-video', { jobId: updated.id, userId: updated.userId, parameters: updated.parameters }, { jobId: updated.id });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updated));
      res.json(updated);
    } catch (e: any) {
      if (e.code === 'P2004') return res.status(403).json({ error: 'Forbidden' });
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/jobs/:id', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const bullJob = await videoQueue.getJob(req.params.id);
      if (bullJob) await bullJob.remove();
      await (db.deleteJob as any)(req.params.id, { id: userId });
      res.status(204).send();
    } catch (e: any) {
      if (e.code === 'P2004') return res.status(403).json({ error: 'Forbidden' });
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/credits', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const tenantId = userId;
      const balance      = await (db.getCreditBalance as any)(tenantId);
      const transactions = await (db.getCreditTransactions as any)(tenantId);
      res.json({ balance, transactions });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeJob = (overrides: Record<string, any> = {}) => ({
  id: 'job_1',
  userId: 'user_test',
    status: JobStatus.PENDING,
  parameters: { url: 'https://example.com' },
  videoUrl: undefined,
  audioUrl: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

let app: express.Express;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset clerk identity to default personal user
  (__setAuth as any)({ userId: 'user_test',  });
  app = buildApp();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    (__setAuth as any)({ userId: '',  });
    expect((await request(app).get('/jobs')).status).toBe(401);
  });

  it('returns job list for authenticated user', async () => {
    vi.mocked(db.listJobs).mockResolvedValue([makeJob()] as any);
    const res = await request(app).get('/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('job_1');
    expect(db.listJobs).toHaveBeenCalledWith({ id: 'user_test',  });
  });

  it('scopes to userId', async () => {
    (__setAuth as any)({ userId: 'user_test',  });
    vi.mocked(db.listJobs).mockResolvedValue([] as any);
    await request(app).get('/jobs');
    expect(db.listJobs).toHaveBeenCalledWith({ id: 'user_test',  });
  });

  it('returns 500 on db error', async () => {
    vi.mocked(db.listJobs).mockRejectedValue(new Error('db boom'));
    expect((await request(app).get('/jobs')).status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    (__setAuth as any)({ userId: '',  });
    expect((await request(app).post('/jobs').send({ parameters: {} })).status).toBe(401);
  });

  it('returns 402 when credit balance is 0', async () => {
    vi.mocked(db.getCreditBalance).mockResolvedValue(0);
    const res = await request(app).post('/jobs').send({ parameters: { url: 'https://x.com' } });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Insufficient credits/i);
    expect(db.createJob).not.toHaveBeenCalled();
  });

  it('creates job, deducts 3 credits, enqueues, returns 201', async () => {
    const job = makeJob();
    vi.mocked(db.getCreditBalance).mockResolvedValue(5);
    vi.mocked(db.createJob).mockResolvedValue(job as any);
    vi.mocked(db.deductCredit).mockResolvedValue(4);

    const res = await request(app).post('/jobs').send({ parameters: { url: 'https://example.com' } });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('job_1');
    expect(db.deductCredit).toHaveBeenCalledWith('user_test', 3, 'job_created', 'job_1');
  });

  it('uses userId as tenantId', async () => {
    (__setAuth as any)({ userId: 'user_test',  });
    vi.mocked(db.getCreditBalance).mockResolvedValue(3);
    vi.mocked(db.createJob).mockResolvedValue(makeJob({  }) as any);
    vi.mocked(db.deductCredit).mockResolvedValue(2);

    await request(app).post('/jobs').send({ parameters: {} });

    expect(db.getCreditBalance).toHaveBeenCalledWith('user_test');
    expect(db.deductCredit).toHaveBeenCalledWith('user_test', 3, 'job_created', expect.any(String));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/:id', () => {
  it('returns 404 when job not found', async () => {
    vi.mocked(db.getJob).mockResolvedValue(null);
    expect((await request(app).get('/jobs/missing')).status).toBe(404);
  });

  it('returns the job when found', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makeJob() as any);
    const res = await request(app).get('/jobs/job_1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('job_1');
  });

  it('returns 403 on ZenStack P2004 denial', async () => {
    const err: any = new Error('Denied'); err.code = 'P2004';
    vi.mocked(db.getJob).mockRejectedValue(err);
    expect((await request(app).get('/jobs/job_1')).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs/:id/retrigger', () => {
  it('returns 404 when job not found', async () => {
    vi.mocked(db.getJob).mockResolvedValue(null);
    expect((await request(app).post('/jobs/missing/retrigger')).status).toBe(404);
  });

  it('re-enqueues and returns updated job', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makeJob() as any);
    vi.mocked(db.getCreditBalance).mockResolvedValue(3);
    vi.mocked(db.updateJob).mockResolvedValue(makeJob({ status: JobStatus.PENDING }) as any);

    const res = await request(app).post('/jobs/job_1/retrigger');
    expect(res.status).toBe(200);
    expect(db.updateJob).toHaveBeenCalledWith('job_1', { status: JobStatus.PENDING, videoUrl: undefined });
    expect(db.deductCredit).toHaveBeenCalledWith('user_test', 3, 'job_retriggered', 'job_1');
  });

  it('returns 402 if insufficient credits', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makeJob() as any);
    vi.mocked(db.getCreditBalance).mockResolvedValue(0);

    const res = await request(app).post('/jobs/job_1/retrigger');
    expect(res.status).toBe(402);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /jobs/:id', () => {
  it('returns 204 on successful delete', async () => {
    vi.mocked(db.deleteJob).mockResolvedValue({} as any);
    expect((await request(app).delete('/jobs/job_1')).status).toBe(204);
    expect(db.deleteJob).toHaveBeenCalledWith('job_1', { id: 'user_test',  });
  });

  it('returns 403 on P2004 denial', async () => {
    const err: any = new Error('Denied'); err.code = 'P2004';
    vi.mocked(db.deleteJob).mockRejectedValue(err);
    expect((await request(app).delete('/jobs/job_1')).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /credits', () => {
  it('returns 401 when unauthenticated', async () => {
    (__setAuth as any)({ userId: '',  });
    expect((await request(app).get('/credits')).status).toBe(401);
  });

  it('returns balance and transactions', async () => {
    vi.mocked(db.getCreditBalance).mockResolvedValue(7);
    vi.mocked(db.getCreditTransactions).mockResolvedValue([
      { id: 'tx_1', tenantId: 'user_test', delta: 10, reason: 'admin_adjustment', jobId: null, createdAt: new Date() },
      { id: 'tx_2', tenantId: 'user_test', delta: -1, reason: 'job_created',      jobId: 'job_1', createdAt: new Date() },
    ] as any);

    const res = await request(app).get('/credits');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(7);
    expect(res.body.transactions).toHaveLength(2);
  });

  it('scopes to userId', async () => {
    (__setAuth as any)({ userId: 'user_test',  });
    vi.mocked(db.getCreditBalance).mockResolvedValue(0);
    vi.mocked(db.getCreditTransactions).mockResolvedValue([] as any);

    await request(app).get('/credits');

    expect(db.getCreditBalance).toHaveBeenCalledWith('user_test');
    expect(db.getCreditTransactions).toHaveBeenCalledWith('user_test');
  });

  it('returns 500 on db error', async () => {
    vi.mocked(db.getCreditBalance).mockRejectedValue(new Error('exploded'));
    expect((await request(app).get('/credits')).status).toBe(500);
  });
});
