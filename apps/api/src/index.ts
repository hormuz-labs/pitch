import express from 'express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JOB_UPDATES_CHANNEL, CreateJobRequest, JobStatus, createLogger } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { pinoHttp, type Options as PinoHttpOptions } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const logger = createLogger('api');

const app = express();
app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

// Structured HTTP request logging — every request logged with method, url, status, responseTime
app.use(pinoHttp({
  logger,
  // Don't log SSE stream endpoint on every keepalive tick
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/jobs/stream',
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req: IncomingMessage) {
      return { method: (req as any).method, url: (req as any).url };
    },
    res(res: ServerResponse) {
      return { statusCode: res.statusCode };
    },
  },
} as PinoHttpOptions));

// Serve the demo directory as static
app.use('/demo', express.static(path.join(rootDir, 'demo')));

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

const subscriber = new Redis(redisUrl);

const videoQueue = new Queue(QUEUE_NAME, { connection });

app.get('/jobs', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const jobs = await db.listJobs({ id: userId, orgId });
    res.json(jobs);
  } catch (error: any) {
    logger.error({ err: error, userId, orgId }, 'Failed to list jobs');
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  const { parameters } = req.body as { parameters: any };
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tenantId = orgId || userId;

    // Check credit balance — hard block if 0
    const balance = await db.getCreditBalance(tenantId);
    if (balance < 1) {
      logger.warn({ userId, tenantId, balance }, 'Job creation blocked: insufficient credits');
      return res.status(402).json({ error: 'Insufficient credits', balance });
    }

    const job = await db.createJob({ userId, orgId: tenantId, parameters }, { id: userId, orgId });

    // Deduct 1 credit atomically
    await db.deductCredit(tenantId, 1, 'job_created', job.id);
    
    // IMPORTANT: we explicitly set the bullmq jobId to match our db job.id
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));

    logger.info({ jobId: job.id, userId, tenantId }, 'Job created and queued');
    res.status(201).json(job);
  } catch (error: any) {
    logger.error({ err: error, userId, orgId }, 'Failed to create job');
    res.status(500).json({ error: error.message });
  }
});

app.get('/jobs/stream', (req, res) => {
  const { orgId, userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const currentTenantId = orgId || userId;
  logger.info({ userId, tenantId: currentTenantId }, 'SSE stream connected');

  const handler = (channel: string, message: string) => {
    if (channel === JOB_UPDATES_CHANNEL) {
      try {
        const data = JSON.parse(message);
        // Only broadcast if the job belongs to the current tenant (org or user)
        if (data.orgId === currentTenantId || data.userId === userId || data.job?.orgId === currentTenantId) {
          res.write(`data: ${message}\n\n`);
        }
      } catch (e) {
        logger.error({ err: e, userId }, 'Failed to parse SSE message');
      }
    }
  };

  subscriber.subscribe(JOB_UPDATES_CHANNEL);
  subscriber.on('message', handler);

  req.on('close', () => {
    subscriber.off('message', handler);
    logger.info({ userId, tenantId: currentTenantId }, 'SSE stream disconnected');
  });
});

app.get('/jobs/:id', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const job = await db.getJob(req.params.id, { id: userId, orgId });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: req.params.id, userId }, 'Failed to get job');
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs/:id/retrigger', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  
  try {
    // getJob will use ZenStack to verify the user has access
    const job = await db.getJob(id, { id: userId, orgId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updatedJob = await db.updateJob(id, { status: JobStatus.PENDING, videoUrl: undefined });
    
    // Ensure we remove the old job from queue if it's there (e.g. failed state)
    const existingJob = await videoQueue.getJob(id);
    if (existingJob) {
      await existingJob.remove();
      logger.info({ jobId: id, userId }, 'Removed stale BullMQ job before retrigger');
    }

    await videoQueue.add('generate-video', { jobId: updatedJob.id, userId: updatedJob.userId, parameters: updatedJob.parameters }, { jobId: updatedJob.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    logger.info({ jobId: id, userId }, 'Job retriggered');
    res.json(updatedJob);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to retrigger job');
    res.status(500).json({ error: error.message });
  }
});

app.delete('/jobs/:id', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  try {
    // Attempt to remove from BullMQ first
    const bullJob = await videoQueue.getJob(id);
    if (bullJob) {
      await bullJob.remove();
      logger.info({ jobId: id, userId }, 'Removed job from BullMQ queue');
    }

    // ZenStack will automatically throw a P2004 error if unauthorized to delete
    await db.deleteJob(id, { id: userId, orgId });
    logger.info({ jobId: id, userId }, 'Job deleted');
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.error({ err: error, jobId: id, userId }, 'Failed to delete job');
    res.status(500).json({ error: error.message });
  }
});

app.get('/credits', async (req, res) => {
  const { orgId, userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const tenantId = orgId || userId;
    const balance = await db.getCreditBalance(tenantId);
    const transactions = await db.getCreditTransactions(tenantId);
    res.json({ balance, transactions });
  } catch (error: any) {
    logger.error({ err: error, userId, orgId }, 'Failed to fetch credits');
    res.status(500).json({ error: error.message });
  }
});

// Upsert the authenticated user's profile — called from the frontend on sign-in
app.post('/users/sync', async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { email, firstName, lastName, imageUrl } = req.body as {
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  };

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl });
    logger.info({ userId }, 'User profile synced');
    res.json(profile);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to sync user profile');
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started');
});
