import express from 'express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, CreateJobRequest } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const videoQueue = new Queue(QUEUE_NAME, { connection });

app.post('/jobs', async (req, res) => {
  const { userId, parameters } = req.body as CreateJobRequest;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // 1. Save to DB
    const job = await db.createJob({ userId, parameters });
    
    // 2. Add to Queue
    await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters });
    
    res.status(201).json(job);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/jobs/:id', async (req, res) => {
  const job = await db.getJob(req.params.id);
  res.json(job);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
