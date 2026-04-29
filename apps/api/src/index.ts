import express from 'express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JOB_UPDATES_CHANNEL, CreateJobRequest } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

const subscriber = new Redis(redisUrl);

const videoQueue = new Queue(QUEUE_NAME, { connection });

app.get('/jobs', async (req, res) => {
  const jobs = await db.listJobs();
  res.json(jobs);
});

app.post('/jobs', async (req, res) => {
  const { userId, parameters } = req.body as CreateJobRequest;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const job = await db.createJob({ userId, parameters });
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters });
    
    // Notify subscribers
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job));
    
    res.status(201).json(job);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/jobs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const handler = (channel: string, message: string) => {
    if (channel === JOB_UPDATES_CHANNEL) {
      res.write(`data: ${message}\n\n`);
    }
  };

  subscriber.subscribe(JOB_UPDATES_CHANNEL);
  subscriber.on('message', handler);

  req.on('close', () => {
    subscriber.off('message', handler);
  });
});

app.get('/jobs/:id', async (req, res) => {
  const job = await db.getJob(req.params.id);
  res.json(job);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
