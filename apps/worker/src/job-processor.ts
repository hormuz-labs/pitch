import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { JobStatus, JOB_UPDATES_CHANNEL, JOB_CANCELLATIONS_CHANNEL, createLogger, sendTelegramMessage } from '@saas/shared';
import * as db from '@saas/db';
import { getSessionIdFromEvent } from './opencode.js';
import * as os from 'os';

const logger = createLogger('worker:job');

// Tracks the active OpenCode session ID for each in-flight job so the
// cancellation handler can abort it immediately.
const activeSessionsByJobId = new Map<string, string>();

/**
 * Start a Redis subscriber that listens on JOB_CANCELLATIONS_CHANNEL.
 * When a cancellation message arrives for a job that is currently being
 * processed, the running OpenCode session is aborted and then deleted so
 * that no further LLM/tool calls are made on behalf of the deleted job.
 */
export function startCancellationListener(redisUrl: string, getClient: () => OpencodeClient, targetDir: string) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const cancelLogger = createLogger('worker:cancel');

  subscriber.subscribe(JOB_CANCELLATIONS_CHANNEL, (err) => {
    if (err) {
      cancelLogger.error({ err }, 'Failed to subscribe to job-cancellations channel');
    } else {
      cancelLogger.info('Subscribed to job-cancellations channel');
    }
  });

  subscriber.on('message', async (_channel: string, message: string) => {
    let jobId: string;
    try {
      ({ jobId } = JSON.parse(message));
    } catch {
      return;
    }

    const sessionId = activeSessionsByJobId.get(jobId);
    if (!sessionId) {
      // Job is not currently being processed on this worker — nothing to do.
      return;
    }

    cancelLogger.info({ jobId, sessionId }, 'Cancellation received — aborting OpenCode session');
    const client = getClient();

    try {
      await client.session.abort({ path: { id: sessionId } });
      cancelLogger.info({ jobId, sessionId }, 'OpenCode session aborted');
    } catch (e: any) {
      cancelLogger.warn({ err: e, jobId, sessionId }, 'Failed to abort OpenCode session (may have already finished)');
    }

    try {
      await client.session.delete({ path: { id: sessionId } });
      cancelLogger.info({ jobId, sessionId }, 'OpenCode session deleted after cancellation');
    } catch (e: any) {
      cancelLogger.warn({ err: e, jobId, sessionId }, 'Failed to delete OpenCode session after cancellation');
    }
  });

  return subscriber;
}

export function createJobProcessor(connection: Redis, targetDir: string) {
  return async function processJob(job: Job, client: OpencodeClient) {
    const { jobId, userId, parameters } = job.data;
    const jobLogger = logger.child({ jobId, userId });

    jobLogger.info('Processing job');

    const workerHostname = process.env.HOSTNAME || os.hostname();
    const updatedJob = await db.updateJob(jobId, { status: JobStatus.PROCESSING, workerId: workerHostname });
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob));

    let session: { id: string } | null = null;
    let eventAbortController: AbortController | null = null;
    const messageCosts = new Map<string, number>();
    let currentCost = 0;

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

      // Register the session so the cancellation listener can abort it if the
      // job is deleted while processing.
      activeSessionsByJobId.set(jobId, session.id);

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

            // Track cost if it's a message update
            if (event.type === 'message.updated' && event.properties.info.role === 'assistant') {
              const msg = event.properties.info as any;
              if (msg.cost !== undefined) {
                messageCosts.set(msg.id, msg.cost);
                currentCost = Array.from(messageCosts.values()).reduce((sum, cost) => sum + cost, 0);
              }
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
## MANDATORY: Read These Skills First
Before doing anything else, you MUST read the following skills:
1. agent-browser skill
2. playwright-cli skill (including playwright gotchas)
3. auto-demo-generator skill

Do NOT proceed until all three skills have been read.

Please execute the following video generation task for Job ${jobId}.
Parameters:
${JSON.stringify(parameters, null, 2)}

## MANDATORY: Phase Progress Reporting
You MUST report the status of each pipeline phase using the job-cli. Call this at the START and END of each phase.
IMPORTANT: These commands are FIRE-AND-FORGET — even if they fail, do NOT stop the pipeline. Always continue.

Phase reporting command format:
  bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase <PHASE_KEY> --status <running|completed|failed>

Phase keys (call in this order):
  1. workspace_init        — Phase 0.1: Creating demo workspace folder and copying files
  2. selector_collection   — Phase 0.2: Agent-browser navigating website and collecting selectors
  3. intro_sequence        — Phase 0.5: Generating the cinematic intro sequence
  4. flow_validation       — Phase 1: Playwright dry-run validating all selectors
  5. voiceover_generation  — Phase 2+2.5: Generating voiceover and mapping timeline
  6. video_recording       — Phase 3: Recording the final video with Playwright
  7. ffmpeg_postprocessing — Phase 4: FFmpeg post-processing and stitching

Example usage:
  bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase workspace_init --status running
  # ... do the work ...
  bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase workspace_init --status completed

## MANDATORY: Final Push
Once the ENTIRE video generation pipeline is complete (including the final FFmpeg concatenation of the intro and the main video), you MUST run the job-cli to complete the job and upload the final concatenated results. Do NOT push incomplete or un-stitched videos.
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

      // 4. Fetch final session messages to get ground-truth cost before aborting/draining
      try {
        const msgsRes = await client.session.messages({
          path: { id: session.id },
          query: { directory: targetDir }
        });
        if (msgsRes.data) {
          const apiCost = msgsRes.data
            .filter((m: any) => m.info?.role === 'assistant' && m.info?.cost !== undefined)
            .reduce((sum: number, m: any) => sum + m.info.cost, 0);
          if (apiCost > 0) {
            currentCost = apiCost;
          }
        }
      } catch (err: any) {
        jobLogger.warn({ err }, 'Failed to fetch final session messages for cost tracking');
      }

      // 5. Stop listening to events and drain the stream
      eventAbortController.abort();
      await streamPromise;

      // Update final cost
      if (currentCost > 0) {
        await db.updateJob(jobId, { cost: currentCost });
        jobLogger.info({ cost: currentCost }, 'Job cost updated');
      }

    } catch (error: any) {
      jobLogger.error({ err: error }, 'Job processing failed');

      // Don't try to update a job that has already been deleted from the DB.
      try {
        const failedJob = await db.updateJob(jobId, { 
          status: JobStatus.FAILED,
          error: error.message || 'Worker processing failed unexpectedly'
        });
        await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob));
        
        // Ensure refund is given if the worker errors out directly
        try {
          await db.addCredits(userId, 3, 'refund', 'Refund: video generation failed', { jobId });
          jobLogger.info('Refunded 3 credits due to worker error');
        } catch (refundError: any) {
          jobLogger.warn({ err: refundError }, 'Failed to issue refund during worker error handling');
        }

        const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
        const email = userProfile?.email || userId;
        const urlParam = parameters?.url || 'N/A';
        const instructions = parameters?.instructions ? `\nPrompt: <i>${parameters.instructions}</i>` : '';

        await sendTelegramMessage(
          `❌ <b>Video Creation Failed</b> (Worker error)\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nError: ${error.message}`
        );
      } catch (updateErr: any) {
        jobLogger.warn({ err: updateErr }, 'Could not update job status after failure (job may have been deleted)');
      }

      // Ensure cost is still logged even on failure, fetching final session messages if possible
      try {
        if (session) {
          const msgsRes = await client.session.messages({
            path: { id: session.id },
            query: { directory: targetDir }
          }).catch(() => null);
          if (msgsRes?.data) {
            const apiCost = msgsRes.data
              .filter((m: any) => m.info?.role === 'assistant' && m.info?.cost !== undefined)
              .reduce((sum: number, m: any) => sum + m.info.cost, 0);
            if (apiCost > 0) {
              currentCost = apiCost;
            }
          }
        }
      } catch (e) {
        // ignore
      }

      if (currentCost > 0) {
        try {
          await db.updateJob(jobId, { cost: currentCost });
        } catch (e) {
          // ignore
        }
      }

      throw error;
    } finally {
      // Remove from the active-session registry so cancellation messages for
      // this job are ignored from now on.
      activeSessionsByJobId.delete(jobId);

      // Clean up per-job resources
      if (eventAbortController && !eventAbortController.signal.aborted) {
        eventAbortController.abort();
      }

      if (session) {
        // Commented out so the session is not deleted upon completion/failure
        // try {
        //   await client.session.delete({ path: { id: session.id } });
        //   jobLogger.info({ sessionId: session.id }, 'OpenCode session deleted');
        // } catch (e: any) {
        //   jobLogger.warn({ err: e, sessionId: session.id }, 'Failed to delete OpenCode session');
        // }
      }
    }
  };
}
