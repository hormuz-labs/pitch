import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, JobStatus, JOB_UPDATES_CHANNEL, createLogger, sendTelegramMessage } from '@saas/shared';
import * as db from '@saas/db';
import { createOpencode } from '@opencode-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname is apps/worker/src
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(rootDir, '.env') });

const logger = createLogger('worker');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { jobId, userId, parameters } = job.data;
    const jobLogger = logger.child({ jobId, userId });

    jobLogger.info('Processing job');

    // Update status to PROCESSING
    const updatedJob = await db.updateJob(jobId, { status: JobStatus.PROCESSING });
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    const targetDir = process.env.WORKSPACE_DIR || rootDir;

    let opencode: any;
    try {
      // 1. Start OpenCode server and get client (dynamic port)
      jobLogger.info({ targetDir }, 'Starting OpenCode server');
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
      jobLogger.info({ sessionId: session.id }, 'OpenCode session created');

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
              userId,
              event
            }));
          }
        } catch (e: any) {
          jobLogger.error({ err: e }, 'Event stream error');
        }
      })();

      // 4. Send prompt to OpenCode
      const promptText = `
Please execute the following video generation task for Job ${jobId}.
Parameters:
${JSON.stringify(parameters, null, 2)}

IMPORTANT: Once the ENTIRE video generation pipeline is complete (including the final FFmpeg concatenation of the intro and the main video), you MUST run the job-cli to complete the job and upload the final concatenated results. Do NOT push incomplete or un-stitched videos.
If an audio/voiceover file was generated separately, include it with the --audio flag.
Command: bun apps/job-cli/src/index.ts push --job-id ${jobId} --file <PATH_TO_GENERATED_VIDEO> [--audio <PATH_TO_GENERATED_AUDIO>]
`;

      let isAborted = false;
      const checkInterval = setInterval(async () => {
        const jobExists = await db.prisma.job.findUnique({ where: { id: jobId } });
        if (!jobExists) {
           jobLogger.info("Job deleted from DB, aborting worker...");
           isAborted = true;
           if (opencode?.server) opencode.server.close();
           clearInterval(checkInterval);
        }
      }, 5000);

      try {
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
      } finally {
        clearInterval(checkInterval);
      }
      
      jobLogger.info('OpenCode prompt completed');
      
      // Stop the server once done
      server.close();
      await streamPromise;

    } catch (error: any) {
      jobLogger.error({ err: error }, 'Job processing failed');
      
      const jobExists = await db.prisma.job.findUnique({ where: { id: jobId } });
      if (jobExists) {
        const failedJob = await db.updateJob(jobId, { status: JobStatus.FAILED });
        await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
        
        const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
        const email = userProfile?.email || userId;
        const urlParam = parameters?.url || 'N/A';
        const instructions = parameters?.instructions ? `\nPrompt: <i>${parameters.instructions}</i>` : '';

        await sendTelegramMessage(`❌ <b>Video Creation Failed</b> (Worker error)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nError: ${error.message}`);
      } else {
        jobLogger.info('Job was deleted from DB, skipping failure update and telegram alert');
      }
      
      if (opencode?.server) {
        opencode.server.close();
      }
      throw error;
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
});

logger.info('Worker started, listening for jobs');
