import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { JobStatus, JOB_UPDATES_CHANNEL, createLogger, sendTelegramMessage } from '@saas/shared';
import * as db from '@saas/db';
import { getSessionIdFromEvent } from './opencode.js';

const logger = createLogger('worker:job');

export function createJobProcessor(connection: Redis, targetDir: string) {
  return async function processJob(job: Job, client: OpencodeClient) {
    const { jobId, userId, parameters } = job.data;
    const jobLogger = logger.child({ jobId, userId });

    jobLogger.info('Processing job');

    const updatedJob = await db.updateJob(jobId, { status: JobStatus.PROCESSING });
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    let session: { id: string } | null = null;
    let eventAbortController: AbortController | null = null;

    try {
      // 1. Create a new session for this job
      const sessionResponse = await client.session.create({
        query: { directory: targetDir },
        body: { title: `Job ${jobId} for user ${userId}` },
      });
      if (sessionResponse.error || !sessionResponse.data) {
        throw new Error('Failed to create OpenCode session: ' + JSON.stringify(sessionResponse.error));
      }
      session = sessionResponse.data;
      jobLogger.info({ sessionId: session.id }, 'OpenCode session created');

      // 2. Subscribe to global events and filter by session ID.
      // The /event stream is global; we only forward events that belong to
      // this job's session so concurrent jobs (if concurrency is ever raised)
      // do not leak events to one another.
      eventAbortController = new AbortController();
      const events = await client.event.subscribe({
        query: { directory: targetDir },
        signal: eventAbortController.signal,
      });

      const streamPromise = (async () => {
        try {
          for await (const event of events.stream) {
            const eventSessionId = getSessionIdFromEvent(event);
            if (eventSessionId && eventSessionId !== session!.id) {
              continue;
            }
            await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify({
              type: 'LOG',
              jobId,
              userId,
              event,
            }));
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || eventAbortController?.signal.aborted) {
            jobLogger.debug('Event stream aborted');
          } else {
            jobLogger.error({ err: e }, 'Event stream error');
          }
        }
      })();

      // 3. Send prompt
      const promptText = `
Please execute the following video generation task for Job ${jobId}.
Parameters:
${JSON.stringify(parameters, null, 2)}

IMPORTANT: Once the ENTIRE video generation pipeline is complete (including the final FFmpeg concatenation of the intro and the main video), you MUST run the job-cli to complete the job and upload the final concatenated results. Do NOT push incomplete or un-stitched videos.
If an audio/voiceover file was generated separately, include it with the --audio flag.
Command: bun apps/job-cli/src/index.ts push --job-id ${jobId} --file <PATH_TO_GENERATED_VIDEO> [--audio <PATH_TO_GENERATED_AUDIO>]
`;

      const promptResponse = await client.session.prompt({
        path: { id: session.id },
        query: { directory: targetDir },
        body: {
          parts: [{ type: 'text', text: promptText }],
        },
      });

      if (promptResponse.error) {
        throw new Error('OpenCode prompt failed: ' + JSON.stringify(promptResponse.error));
      }

      jobLogger.info('OpenCode prompt completed');

      // 4. Stop listening to events and drain the stream
      eventAbortController.abort();
      await streamPromise;

    } catch (error: any) {
      jobLogger.error({ err: error }, 'Job processing failed');

      const failedJob = await db.updateJob(jobId, { status: JobStatus.FAILED });
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));

      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
      const email = userProfile?.email || userId;
      const urlParam = parameters?.url || 'N/A';
      const instructions = parameters?.instructions ? `\nPrompt: <i>${parameters.instructions}</i>` : '';

      await sendTelegramMessage(
        `❌ <b>Video Creation Failed</b> (Worker error)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nError: ${error.message}`
      );

      throw error;
    } finally {
      // Clean up per-job resources
      if (eventAbortController && !eventAbortController.signal.aborted) {
        eventAbortController.abort();
      }

      if (session) {
        try {
          await client.session.delete({ path: { id: session.id } });
          jobLogger.info({ sessionId: session.id }, 'OpenCode session deleted');
        } catch (e: any) {
          jobLogger.warn({ err: e, sessionId: session.id }, 'Failed to delete OpenCode session');
        }
      }
    }
  };
}
