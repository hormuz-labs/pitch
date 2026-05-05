import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JobStatus, JOB_UPDATES_CHANNEL } from '@saas/shared';
import * as db from '@saas/db';
import { createOpencode } from '@opencode-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname is apps/worker/src
const rootDir = path.resolve(__dirname, '../../..');

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

    const targetDir = process.env.WORKSPACE_DIR || rootDir;

    let opencode;
    try {
      // 1. Start OpenCode server and get client (dynamic port)
      console.log(`[Worker] Starting OpenCode server for job ${jobId} in ${targetDir}...`);
      opencode = await createOpencode({ timeout: 60000 });
      const { client, server } = opencode;

      // 2. Create session associated with this job
      const sessionResponse = await client.session.create({
        query: { directory: targetDir },
        body: { title: `Job ${jobId} for user ${userId}` }
      });
      if (sessionResponse.error || !sessionResponse.data) {
        throw new Error("Failed to create OpenCode session: " + JSON.stringify(sessionResponse.error));
      }
      const session = sessionResponse.data;
      console.log(`[Worker] Created session ${session.id} for job ${jobId}`);

      // 3. Subscribe to events and stream to Redis
      const events = await client.event.subscribe({
        query: { directory: targetDir }
      });
      
      const streamPromise = (async () => {
        try {
          for await (const event of events.stream) {
            await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify({
              type: 'LOG',
              jobId,
              userId, // Added userId here
              event
            }));
          }
        } catch (e: any) {
          console.error(`[Worker] Stream error for job ${jobId}:`, e.message);
        }
      })();

      // 4. Send prompt to OpenCode
      // We instruct OpenCode to process the parameters, and then use the job-cli to complete the job.
      const promptText = `
Please execute the following video generation task for Job ${jobId}.
Parameters:
${JSON.stringify(parameters, null, 2)}

IMPORTANT: Once the video is generated, you MUST run the job-cli to complete the job and upload the results.
If an audio/voiceover file was generated separately, include it with the --audio flag.
Command: bun apps/job-cli/src/index.ts push --job-id ${jobId} --file <PATH_TO_GENERATED_VIDEO> [--audio <PATH_TO_GENERATED_AUDIO>]
`;

      const promptResponse = await client.session.prompt({
        path: { id: session.id },
        query: { directory: targetDir },
        body: {
          parts: [{ type: 'text', text: promptText }]
        }
      });
      
      if (promptResponse.error) {
        throw new Error("OpenCode prompt failed: " + JSON.stringify(promptResponse.error));
      }
      
      console.log(`[Worker] OpenCode completed prompt for job ${jobId}`);
      
      // Stop the server once done
      server.close();
      await streamPromise;

    } catch (error: any) {
      console.error(`[Worker] Failed to process job ${jobId} via OpenCode:`, error.message);
      
      const failedJob = await db.updateJob(jobId, { status: JobStatus.FAILED });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
      
      if (opencode?.server) {
        opencode.server.close();
      }
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

