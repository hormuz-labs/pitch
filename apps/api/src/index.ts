import express from 'express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JOB_UPDATES_CHANNEL, CreateJobRequest, JobStatus } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { clerkMiddleware, getAuth } from '@clerk/express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const app = express();
app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());

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
    const job = await db.createJob({ userId, orgId: tenantId, parameters }, { id: userId, orgId });
    
    // IMPORTANT: we explicitly set the bullmq jobId to match our db job.id
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));
    
    res.status(201).json(job);
  } catch (error: any) {
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

  const handler = (channel: string, message: string) => {
    if (channel === JOB_UPDATES_CHANNEL) {
      try {
        const data = JSON.parse(message);
        // Only broadcast if the job belongs to the current tenant (org or user)
        // Check for Job objects or Log objects that have an orgId/userId
        if (data.orgId === currentTenantId || data.userId === userId || data.job?.orgId === currentTenantId) {
          res.write(`data: ${message}\n\n`);
        }
      } catch (e) {
        console.error('Failed to parse SSE message', e);
      }
    }
  };

  subscriber.subscribe(JOB_UPDATES_CHANNEL);
  subscriber.on('message', handler);

  req.on('close', () => {
    subscriber.off('message', handler);
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
    }

    await videoQueue.add('generate-video', { jobId: updatedJob.id, userId: updatedJob.userId, parameters: updatedJob.parameters }, { jobId: updatedJob.id });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));
    
    res.json(updatedJob);
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
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
      console.log(`[Queue] Removed job ${id} from BullMQ`);
    }

    // ZenStack will automatically throw a P2004 error if unauthorized to delete
    await db.deleteJob(id, { id: userId, orgId });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2004' || error.name === 'PrismaClientKnownRequestError') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
