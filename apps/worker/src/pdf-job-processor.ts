import * as fs from 'node:fs'
import * as path from 'node:path'
import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email'
import {
  createLogger,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  sendDiscordMessage,
} from '@saas/shared'
import * as storage from '@saas/storage'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'
import * as os from 'os'
import { activeSessionsByJobId, reportJobPhase } from './job-processor.js'
import { getSessionIdFromEvent } from './opencode.js'

const logger = createLogger('worker:pdf')

async function pushPdfResult(
  jobId: string,
  userId: string,
  pdfPath: string,
  htmlPath: string | null,
  connection: Redis,
  parameters: any,
) {
  logger.info({ jobId, userId, pdfPath, htmlPath }, 'Pushing PDF result directly from worker')

  const topic = parameters?.topic || 'untitled'
  const topicSlug = topic
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .slice(0, 40)
  const prefix = `pitch/${userId}/pdfs/${topicSlug}`

  const pdfUrl = await storage.uploadFile(pdfPath, undefined, prefix)
  logger.info({ pdfUrl }, 'PDF uploaded to storage')

  let htmlUrl: string | undefined
  if (htmlPath && fs.existsSync(htmlPath)) {
    htmlUrl = await storage.uploadFile(htmlPath, undefined, prefix)
    logger.info({ htmlUrl }, 'HTML uploaded to storage')
  }

  const updatedParams = {
    ...parameters,
    htmlUrl,
    jobType: 'pdf',
  }
  await db.prisma.job.update({
    where: { id: jobId },
    data: { parameters: JSON.stringify(updatedParams) },
  })

  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.COMPLETED,
    pdfUrl,
  })

  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
  logger.info({ jobId }, 'PDF job completion broadcasted')

  try {
    const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const email = userProfile?.email || userId

    await sendDiscordMessage(
      `✅ **PDF Presentation Completed**\nJob ID: \`${jobId}\`\nUser: ${email}\nTopic: ${topic}\nOutput PDF: ${pdfUrl}`,
    )

    const userEmail = await getClerkUserEmail(userId)
    if (userEmail && pdfUrl) {
      await sendJobCompleteEmail({
        to: userEmail,
        jobId,
        videoUrl: pdfUrl,
        videoTitle: topic || 'Presentation',
      })
    }
  } catch (err: any) {
    logger.warn({ err, jobId }, 'Notifications or email failed')
  }
}

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

    // Phase tracking for real-time progress updates via SSE
    // Advances through: pdf_research → pdf_writing → pdf_images → pdf_build → pdf_qa
    const PDF_PHASES = ['pdf_research', 'pdf_writing', 'pdf_images', 'pdf_build', 'pdf_qa'] as const
    let currentPhaseIdx = 0
    let buildRunCount = 0

    const streamPromise = (async () => {
      try {
        for await (const event of events.stream) {
          const eventSessionId = getSessionIdFromEvent(event)
          if (eventSessionId && eventSessionId !== session!.id) {
            continue
          }

          // ── Phase detection from tool calls ──────────────────────────────────
          // Watch for specific tool calls that indicate the AI has moved to a new
          // phase. This gives users real-time visibility into PDF generation progress.
          // OpenCode events are a discriminated union; tool-call events carry a
          // .call property (and often .type === 'call') at runtime.
          const evt = event as any
          if (currentPhaseIdx < PDF_PHASES.length - 1) {
            const callEvent = evt.call || (evt.type === 'call' ? evt : null)
            if (callEvent) {
              const toolName: string = callEvent.name || ''
              const args: Record<string, any> = callEvent.arguments || {}

              // pdf_research → pdf_writing: first write_file signals AI is producing content
              if (
                currentPhaseIdx === 0 &&
                toolName === 'write_file'
              ) {
                await reportJobPhase(jobId, userId, 'pdf_research', 'completed', connection)
                currentPhaseIdx = 1
                await reportJobPhase(jobId, userId, 'pdf_writing', 'running', connection)
              }
              // pdf_writing → pdf_images: scraping images
              else if (
                currentPhaseIdx === 1 &&
                toolName === 'run_shell_command'
              ) {
                const cmd: string = args.command || ''
                if (cmd.includes('scrape_images')) {
                  await reportJobPhase(jobId, userId, 'pdf_writing', 'completed', connection)
                  currentPhaseIdx = 2
                  await reportJobPhase(jobId, userId, 'pdf_images', 'running', connection)
                }
              }
              // pdf_images → pdf_build: running pdf-builder.js (also handles writing→build if scraping skipped)
              if (
                (currentPhaseIdx === 2 || currentPhaseIdx === 1) &&
                toolName === 'run_shell_command'
              ) {
                const cmd: string = args.command || ''
                if (cmd.includes('pdf-builder.js')) {
                  if (currentPhaseIdx === 2) {
                    await reportJobPhase(jobId, userId, 'pdf_images', 'completed', connection)
                  } else if (currentPhaseIdx === 1) {
                    await reportJobPhase(jobId, userId, 'pdf_writing', 'completed', connection)
                  }
                  currentPhaseIdx = 3
                  buildRunCount++
                  await reportJobPhase(jobId, userId, 'pdf_build', 'running', connection)
                }
              }
              // pdf_build → pdf_qa: reading QA renders
              if (
                currentPhaseIdx === 3 &&
                (toolName === 'read_file' || toolName === 'read')
              ) {
                const filePath: string = args.file_path || args.path || ''
                if (filePath.includes('qa-renders')) {
                  await reportJobPhase(jobId, userId, 'pdf_build', 'completed', connection)
                  currentPhaseIdx = 4
                  await reportJobPhase(jobId, userId, 'pdf_qa', 'running', connection)
                }
              }
              // Re-running pdf-builder.js during QA loop (back to build for fixes)
              if (
                currentPhaseIdx === 4 &&
                toolName === 'run_shell_command'
              ) {
                const cmd: string = args.command || ''
                if (cmd.includes('pdf-builder.js')) {
                  await reportJobPhase(jobId, userId, 'pdf_qa', 'completed', connection)
                  currentPhaseIdx = 3
                  buildRunCount++
                  await reportJobPhase(jobId, userId, 'pdf_build', 'running', connection)
                }
              }
            }
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

    const buildDir = `/tmp/ppt-${jobId}`
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
   - Create a build directory at \`${buildDir}/\` and copy \`.opencode/skills/ppt-generator/pdf-builder-template.js\` there as \`pdf-builder.js\`.
   - Populate the \`CONFIG\` object inside \`pdf-builder.js\` with your written slides, colors, font imports, base64-encoded local images, and set the \`jobId\` property to "${jobId}".
   - Navigate into the build directory: \`cd ${buildDir}\` then run \`node pdf-builder.js\` to generate the PDF and QA renders. This ensures \`output.pdf\` and \`output.html\` are written to \`${buildDir}/\`.
   - Perform Visual QA check on the PNG renders in \`qa-renders/\` and apply targeted template updates/fixes if there are any visual alignment/overflow defects. Re-run \`node pdf-builder.js\` from inside \`${buildDir}\` after each fix.
3. When finished and QA is fully passed, confirm the final files exist at:
   - \`${buildDir}/output.pdf\`
   - \`${buildDir}/output.html\`
    The worker will handle uploading and marking the job complete automatically.`

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

    // 6. Mark all LLM phases as completed
    const pdfPhases = ['pdf_research', 'pdf_writing', 'pdf_images', 'pdf_build', 'pdf_qa']
    for (const phase of pdfPhases) {
      await reportJobPhase(jobId, userId, phase, 'completed', connection)
    }

    // 7. Find and upload the built PDF + HTML
    await reportJobPhase(jobId, userId, 'pdf_upload', 'running', connection)

    const expectedPdfPath = path.join(buildDir, 'output.pdf')
    const expectedHtmlPath = path.join(buildDir, 'output.html')

    let pdfPath: string | null = null
    let htmlPath: string | null = null

    if (fs.existsSync(expectedPdfPath)) {
      pdfPath = expectedPdfPath
    } else {
      // Fallback: try workspace-relative paths
      const workspacePdfPath = path.join(targetDir, 'pptx', `ppt-${jobId}`, 'output.pdf')
      if (fs.existsSync(workspacePdfPath)) {
        pdfPath = workspacePdfPath
      }
    }

    if (fs.existsSync(expectedHtmlPath)) {
      htmlPath = expectedHtmlPath
    } else {
      const workspaceHtmlPath = path.join(targetDir, 'pptx', `ppt-${jobId}`, 'output.html')
      if (fs.existsSync(workspaceHtmlPath)) {
        htmlPath = workspaceHtmlPath
      }
    }

    if (!pdfPath) {
      throw new Error(
        `PDF not found after generation. Looked in: ${expectedPdfPath} and workspace pptx/`,
      )
    }

    jobLogger.info({ pdfPath, htmlPath }, 'Found generated files, uploading directly from worker')
    await pushPdfResult(jobId, userId, pdfPath, htmlPath, connection, parameters)
    await reportJobPhase(jobId, userId, 'pdf_upload', 'completed', connection)
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
      await sendDiscordMessage(
        `❌ **PDF Presentation Failed**\nJob ID: \`${jobId}\`\nUser: ${email}\nTopic: ${topic}\nError: ${error.message}`,
      )
    } catch (refundError: any) {
      jobLogger.error({ err: refundError }, 'Failed to handle PDF job failure cleanup')
    }
  } finally {
    clearTimeout(timeout)
    activeSessionsByJobId.delete(jobId)
  }
}
