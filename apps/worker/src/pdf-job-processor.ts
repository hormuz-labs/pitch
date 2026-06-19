import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import {
  createLogger,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  sendTelegramMessage,
} from '@saas/shared'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'
import * as os from 'os'
import { activeSessionsByJobId, reportJobPhase } from './job-processor.js'
import { getSessionIdFromEvent } from './opencode.js'

const logger = createLogger('worker:pdf')

export async function processPdfJob(
  job: Job,
  client: OpencodeClient,
  connection: Redis,
  targetDir: string,
) {
  const { jobId, userId, parameters } = job.data
  const jobLogger = logger.child({ jobId, userId })

  jobLogger.info('Processing PDF job via ppt-generator skill')

  const workerHostname = process.env.HOSTNAME || os.hostname()
  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.PROCESSING,
    workerId: workerHostname,
  })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

  let session: { id: string } | null = null
  let eventAbortController: AbortController | null = null
  const messageCosts = new Map<string, number>()
  let currentCost = 0
  let _budgetLimitBreached = false
  let _timeoutExceeded = false
  const promptAbortController = new AbortController()

  const timeout = setTimeout(
    () => {
      _timeoutExceeded = true
      jobLogger.error('Execution timeout of 50 minutes exceeded. Aborting session.')
      if (session) {
        client.session.abort({ path: { id: session.id } }).catch(err => {
          jobLogger.warn({ err }, 'Failed to abort OpenCode session on timeout')
        })
      }
      eventAbortController?.abort()
      promptAbortController.abort()
    },
    50 * 60 * 1000,
  )

  try {
    // 1. Create OpenCode Session
    const sessionResponse = await client.session.create({
      query: { directory: targetDir },
      body: { title: `PDF Job ${jobId} for user ${userId}` },
    })
    if (sessionResponse.error || !sessionResponse.data) {
      throw new Error(`Failed to create OpenCode session: ${JSON.stringify(sessionResponse.error)}`)
    }
    session = sessionResponse.data
    jobLogger.info({ sessionId: session.id }, 'OpenCode session created')

    // Register active session for cancellation
    activeSessionsByJobId.set(jobId, session.id)

    // 2. Subscribe to global events and filter by session ID.
    eventAbortController = new AbortController()
    const events = await client.event.subscribe({
      query: { directory: targetDir },
      signal: eventAbortController.signal,
    })

    const streamPromise = (async () => {
      try {
        for await (const event of events.stream) {
          const eventSessionId = getSessionIdFromEvent(event)
          if (eventSessionId && eventSessionId !== session!.id) {
            continue
          }

          // Track cost if it's a message update
          if (event.type === 'message.updated' && event.properties.info.role === 'assistant') {
            const msg = event.properties.info as any
            if (msg.cost !== undefined) {
              messageCosts.set(msg.id, msg.cost)
              currentCost = Array.from(messageCosts.values()).reduce((sum, cost) => sum + cost, 0)
            }

            // Check if cost exceeded the $4.00 budget limit
            if (currentCost >= 4.0) {
              _budgetLimitBreached = true
              jobLogger.error(
                { currentCost },
                'Budget limit of $4.00 exceeded. Aborting session immediately.',
              )

              // Abort session
              if (session) {
                client.session.abort({ path: { id: session.id } }).catch(err => {
                  jobLogger.warn({ err }, 'Failed to abort OpenCode session')
                })
              }
              eventAbortController?.abort()
              promptAbortController.abort()
            }
          }

          // Forward log events to client via Redis updates
          await connection.publish(
            JOB_UPDATES_CHANNEL,
            JSON.stringify({
              type: 'LOG',
              jobId,
              userId,
              event,
            }),
          )
        }
      } catch (e: any) {
        if (e.name === 'AbortError' || eventAbortController?.signal.aborted) {
          jobLogger.debug('Event stream aborted')
        } else {
          jobLogger.error({ err: e }, 'Event stream error')
        }
      }
    })()

    // 3. Construct and send prompt using ppt-generator skill instructions
    const topic = parameters?.topic || 'Generic Topic'
    const slideCount = parameters?.slideCount || 10
    const headings = parameters?.slideHeadings || []

    const headingsPrompt =
      headings.length > 0
        ? `Slide headings (preferred per slide): ${JSON.stringify(headings)}`
        : 'Slide headings: Select automatically based on the topic structure.'

    const promptText = `You are a professional PDF presentation generator agent. Your task is to build a high-fidelity PDF presentation based on the user's requirements and the specialized \`ppt-generator\` skill.

Job ID: "${jobId}"
Topic: "${topic}"
Number of slides requested: ${slideCount}
${headingsPrompt}

Please perform the following actions:
1. Load the \`ppt-generator\` skill using the \`load_skill\` tool. The skill is located at \`.opencode/skills/ppt-generator/SKILL.md\`.
2. Follow the instructions in the skill EXACTLY. Specifically:
   - Perform Web Search grounding for factual stats/sources.
   - Choose a brand design palette from the design library \`.opencode/skills/ppt-generator/design-library.md\`.
   - Write slide content and generate search queries for Unsplash.
   - Scrape Unsplash images using Playwright via the provided script \`node .opencode/skills/ppt-generator/reference/scrape_images.js\`.
   - Create a build directory at \`/tmp/ppt-${jobId}/\` and copy \`.opencode/skills/ppt-generator/pdf-builder-template.js\` there as \`pdf-builder.js\`.
   - Populate the \`CONFIG\` object inside \`pdf-builder.js\` with your written slides, colors, font imports, base64-encoded local images, and set the \`jobId\` property to "${jobId}".
   - Run \`node /tmp/ppt-${jobId}/pdf-builder.js\` to generate the PDF and QA renders. Note that this script automatically copies both generated files (PDF & HTML) into the workspace directory \`pptx/ppt-${jobId}/\` under the names \`output.pdf\` and \`output.html\`.
   - Perform Visual QA check on the PNG renders in \`qa-renders/\` and apply targeted template updates/fixes if there are any visual alignment/overflow defects.
3. At each step, report progress by executing the CLI:
   - Research: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_research --status running\` (and \`completed\`)
   - Writing: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_writing --status running\` (and \`completed\`)
   - Images: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_images --status running\` (and \`completed\`)
   - Build: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_build --status running\` (and \`completed\`)
   - QA: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_qa --status running\` (and \`completed\`)
   - Upload: \`bun apps/job-cli/src/index.ts phase --job-id ${jobId} --phase pdf_upload --status running\`
4. When finished and QA is fully passed, publish and upload the final result to GCS and complete the job by running:
   \`bun apps/job-cli/src/index.ts push-pdf --job-id ${jobId} --file pptx/ppt-${jobId}/output.pdf --html pptx/ppt-${jobId}/output.html\`

Ensure that you call the CLI commands above exactly as written. Make sure the job is completed successfully.`

    jobLogger.info({ promptText }, 'Sending prompt to OpenCode')

    // Report start of first phase
    await reportJobPhase(jobId, userId, 'pdf_research', 'running', connection)

    const promptResponse = await client.session.prompt({
      path: { id: session.id },
      query: { directory: targetDir },
      body: {
        parts: [{ type: 'text', text: promptText }],
      },
      signal: promptAbortController.signal,
    })

    if (promptResponse.error) {
      throw new Error(`OpenCode prompt failed: ${JSON.stringify(promptResponse.error)}`)
    }

    jobLogger.info('OpenCode prompt completed')

    // 4. Fetch final messages for final cost
    try {
      const msgsRes = await client.session.messages({
        path: { id: session.id },
        query: { directory: targetDir },
      })
      if (msgsRes.data) {
        const apiCost = msgsRes.data
          .filter((m: any) => m.info?.role === 'assistant' && m.info?.cost !== undefined)
          .reduce((sum: number, m: any) => sum + m.info.cost, 0)
        if (apiCost > 0) {
          currentCost = apiCost
        }
      }
    } catch (err: any) {
      jobLogger.warn({ err }, 'Failed to fetch final session messages for cost tracking')
    }

    // 5. Cleanup session subscriber
    eventAbortController.abort()
    await streamPromise

    if (currentCost > 0) {
      await db.updateJob(jobId, { cost: currentCost })
      jobLogger.info({ cost: currentCost }, 'Job cost updated')
    }

    // Since the LLM execution runs `push-pdf` command at the end inside the session workspace,
    // the job status is marked as COMPLETED by the job-cli command. We can verify if it was completed.
    const finalJob = await db.prisma.job.findUnique({ where: { id: jobId } })
    if (finalJob?.status !== JobStatus.COMPLETED && finalJob?.status !== JobStatus.FAILED) {
      // If it completed prompt but status is not updated, something went wrong/exited early
      throw new Error(
        'OpenCode session finished, but job status was not updated to COMPLETED by push-pdf',
      )
    }
  } catch (error: any) {
    jobLogger.error({ err: error }, 'Failed to process PDF job')
    clearTimeout(timeout)

    // Abort OpenCode session if running
    if (session) {
      try {
        await client.session.abort({ path: { id: session.id } })
      } catch {}
    }

    // Mark job as FAILED and refund credit
    try {
      const existingJob = await db.prisma.job.findUnique({ where: { id: jobId } })
      let newPhases: PhaseUpdate[] = []
      if (existingJob?.phases) {
        const parsedPhases: PhaseUpdate[] = JSON.parse(existingJob.phases as string)
        newPhases = parsedPhases.map(p => {
          if (p.status === 'running') {
            return { ...p, status: 'failed', completedAt: new Date().toISOString() }
          }
          return p
        })
      }

      const failedJob = await db.updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error.message || 'PDF generation failed',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      const tenantId = userId
      await db.addCredits(tenantId, 1, 'refund', 'Refund: PDF generation failed', { jobId })

      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
      const email = userProfile?.email || userId
      const topic = parameters?.topic || 'N/A'
      await sendTelegramMessage(
        `❌ <b>PDF Presentation Failed</b>\nJob ID: <code>${jobId}</code>\nUser: ${email}\nTopic: ${topic}\nError: ${error.message}`,
      )
    } catch (refundError: any) {
      jobLogger.error({ err: refundError }, 'Failed to handle PDF job failure cleanup')
    }
  } finally {
    clearTimeout(timeout)
    activeSessionsByJobId.delete(jobId)
  }
}
