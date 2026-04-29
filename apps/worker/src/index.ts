import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import axios from 'axios';
import { QUEUE_NAME, JobStatus, JOB_UPDATES_CHANNEL } from '@saas/shared';
import * as db from '@saas/db';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { jobId, userId, parameters } = job.data;
    console.log(`[Worker] Processing job ${jobId} for user ${userId}`);

    // Update status to PROCESSING
    const updatedJob = await db.updateJob(jobId, { status: JobStatus.PROCESSING });
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    const opencodeUrl = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096/generate';
    
    try {
      // Delegate to OpenCode Server
      const response = await axios.post(opencodeUrl, { jobId, userId, parameters });
      console.log(`[Worker] OpenCode response for ${jobId}:`, response.status);
    } catch (error: any) {
      console.error(`[Worker] Failed to delegate job ${jobId}:`, error.message);
      
      const failedJob = await db.updateJob(jobId, { status: JobStatus.FAILED });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
      
      throw error;
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

console.log('Worker started, listening for jobs...');
