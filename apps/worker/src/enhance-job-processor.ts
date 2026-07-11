import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import * as path from 'node:path'
import { promisify } from 'node:util'
import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email'
import {
  createLogger,
  ENHANCE_PHASE_LABELS,
  JOB_CANCELLATIONS_CHANNEL,
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

const logger = createLogger('worker:enhance')
const execAsync = promisify(exec)

// ── Phase definitions ─────────────────────────────────────────────────────────
const ENHANCE_PHASES = [
  'enhance_parse',
  'enhance_research',
  'enhance_write',
  'enhance_images',
  'enhance_build',
  'enhance_qa',
] as const

// ── File download helper ──────────────────────────────────────────────────────
/**
 * Downloads a file from a URL (http or https) to a local destination path.
 * Handles redirects (up to 5 hops).
 */
async function downloadFile(url: string, destPath: string, hops = 0): Promise<void> {
  if (hops > 5) throw new Error(`Too many redirects downloading: ${url}`)
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib
      .get(url, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          downloadFile(res.headers.location, destPath, hops + 1).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`))
          return
        }
        const out = fs.createWriteStream(destPath)
        res.pipe(out)
        out.on('finish', () => out.close(() => resolve()))
        out.on('error', reject)
      })
      .on('error', reject)
  })
}

// ── Result uploader ───────────────────────────────────────────────────────────
async function pushEnhancedResult(
  jobId: string,
  userId: string,
  pdfPath: string,
  htmlPath: string | null,
  connection: Redis,
  parameters: any,
) {
  logger.info({ jobId, userId, pdfPath }, 'Pushing enhanced PDF result from worker')

  const fileName = parameters?.originalFileName || 'enhanced'
  const slug = fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, '') // strip extension
    .replace(/[^a-z0-9-]/g, '_')
    .slice(0, 40)
  const prefix = `pitch/${userId}/enhanced/${slug}`

  const pdfUrl = await storage.uploadFile(pdfPath, undefined, prefix)
  logger.info({ pdfUrl }, 'Enhanced PDF uploaded to storage')

  let htmlUrl: string | undefined
  if (htmlPath && fs.existsSync(htmlPath)) {
    htmlUrl = await storage.uploadFile(htmlPath, undefined, prefix)
    logger.info({ htmlUrl }, 'Enhanced HTML uploaded to storage')
  }

  let gitHash: string | undefined
  try {
    const { stdout } = await execAsync('git rev-parse HEAD')
    gitHash = stdout.trim()
  } catch {}

  const updatedParams = { ...parameters, htmlUrl, jobType: 'enhance' }
  await db.prisma.job.update({
    where: { id: jobId },
    data: { parameters: JSON.stringify(updatedParams) },
  })

  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.COMPLETED,
    pdfUrl,
    gitHash,
  })

  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
  logger.info({ jobId }, 'Enhanced PDF job completion broadcasted')

  // Notifications
  try {
    const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const email = userProfile?.email || userId
    const mode = parameters?.enhanceMode || 'N/A'
    await sendDiscordMessage(
      `✅ **Presentation Enhanced**\nJob ID: \`${jobId}\`\nUser: ${email}\nMode: ${mode}\nFile: ${fileName}\nOutput: ${pdfUrl}`,
    )
    const userEmail = await getClerkUserEmail(userId)
    if (userEmail && pdfUrl) {
      await sendJobCompleteEmail({
        to: userEmail,
        jobId,
        videoUrl: pdfUrl,
        videoTitle: `Enhanced: ${fileName}`,
      })
    }
  } catch (err: any) {
    logger.warn({ err, jobId }, 'Notifications or email failed')
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildEnhancePrompt(params: {
  jobId: string
  buildDir: string
  parsedSlidesPath: string
  inputFilePath: string
  enhanceMode: 'recreate' | 'preserve'
  enhancePrompt: string
  originalFileName: string
  extractedImagesDir?: string
}): string {
  const {
    jobId,
    buildDir,
    parsedSlidesPath,
    inputFilePath,
    enhanceMode,
    enhancePrompt,
    originalFileName,
    extractedImagesDir,
  } = params

  const preserveSection =
    enhanceMode === 'preserve' && extractedImagesDir
      ? `Extracted images directory (for preserve mode): \`${extractedImagesDir}\``
      : ''

  return `You are a professional presentation enhancement agent. Your task is to take an existing presentation and produce an enhanced, high-fidelity PDF using the \`ppt-enhancer\` skill.

Job ID: "${jobId}"
Original file: "${originalFileName}"
Enhancement mode: "${enhanceMode}"
User's enhancement prompt: "${enhancePrompt}"

Parsed slides JSON path: \`${parsedSlidesPath}\`
${preserveSection}
Build directory: \`${buildDir}\`

Please perform the following actions:
1. Load the \`ppt-enhancer\` skill using the native \`skill\` tool (skill({ name: "ppt-enhancer" })). The skill is located at \`.opencode/skills/ppt-enhancer/SKILL.md\`.
2. Follow the skill instructions EXACTLY for the "${enhanceMode}" mode:
   ${enhanceMode === 'recreate' ? `
   RECREATE mode:
   - Read the parsed slides JSON at \`${parsedSlidesPath}\` to understand the original structure.
   - Perform web search grounding for the presentation topic.
   - Choose a premium brand palette from \`.opencode/skills/ppt-generator/design-library.md\`.
   - Rewrite and enhance all slide content using the enhancement prompt tone.
   - Generate Unsplash keywords per slide and scrape fresh images using \`node .opencode/skills/ppt-generator/reference/scrape_images.js\`.
   - Map scraped images to slides (always verify file existence before assigning).` : `
   PRESERVE mode:
   - Read the parsed slides JSON at \`${parsedSlidesPath}\` to understand the original structure.
   - Read the extracted images from \`${extractedImagesDir}\` — list files with \`ls\` first.
   - Map extracted images to their original slides using the extractedImages fields in the JSON.
   - For slides with no usable extracted image (missing, < 5KB, or .emf/.wmf), scrape Unsplash for a supplementary image.
   - Keep the original slide count and section headings intact.
   - Choose a neutral/harmonious brand palette from \`.opencode/skills/ppt-generator/design-library.md\`.
   - Polish bullet content and titles using the enhancement prompt.`}
3. Common steps for both modes:
   - Copy \`.opencode/skills/ppt-generator/pdf-builder-template.js\` to \`${buildDir}/pdf-builder.js\`.
   - Populate the \`CONFIG\` object with your enhanced slides, chosen color theme, font imports, and base64-encoded images. Set \`jobId\` to "${jobId}".
   - Navigate into \`${buildDir}\` and run \`node pdf-builder.js\`.
   - Run the Visual QA loop on \`${buildDir}/qa-renders/\`. Patch and re-run until all slides pass.
4. When QA is fully passed, confirm the final files exist at:
   - \`${buildDir}/output.pdf\`
   - \`${buildDir}/output.html\`
   The worker will handle uploading and marking the job complete automatically.`
}

// ── Main processor ────────────────────────────────────────────────────────────
export async function processEnhanceJob(
  job: Job,
  client: OpencodeClient,
  connection: Redis,
  targetDir: string,
) {
  const { jobId, userId, parameters } = job.data
  const jobLogger = logger.child({ jobId, userId })

  jobLogger.info({ enhanceMode: parameters?.enhanceMode }, 'Processing enhance job')

  const workerHostname = process.env.HOSTNAME || os.hostname()
  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.PROCESSING,
    workerId: workerHostname,
  })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

  const buildDir = `/tmp/ppt-${jobId}`
  let session: { id: string } | null = null
  let eventAbortController: AbortController | null = null
  const messageCosts = new Map<string, number>()
  let currentCost = 0
  const promptAbortController = new AbortController()

  const jobTimeoutMs = Number(process.env.ENHANCE_JOB_TIMEOUT_MS || 50 * 60 * 1000)
  const budgetUsd = Number(process.env.ENHANCE_JOB_BUDGET_USD || 4.0)

  const timeout = setTimeout(() => {
    jobLogger.error('Enhance job timeout exceeded. Aborting session.')
    client.session.abort({ path: { id: session!.id } }).catch(() => {})
    eventAbortController?.abort()
    promptAbortController.abort()
  }, jobTimeoutMs)

  try {
    // ── 1. Prepare build directory ────────────────────────────────────────────
    fs.mkdirSync(buildDir, { recursive: true })

    // ── 2. Download input file ────────────────────────────────────────────────
    const inputFileUrl: string = parameters?.inputFileUrl
    if (!inputFileUrl) throw new Error('Missing inputFileUrl in job parameters')

    const originalFileName: string = parameters?.originalFileName || 'input.pdf'
    const ext = path.extname(originalFileName).toLowerCase() || '.pdf'
    const inputFilePath = path.join(buildDir, `input${ext}`)

    jobLogger.info({ inputFileUrl, inputFilePath }, 'Downloading input file')
    await reportJobPhase(jobId, userId, 'enhance_parse', 'running', connection)
    await downloadFile(inputFileUrl, inputFilePath)
    jobLogger.info({ size: fs.statSync(inputFilePath).size }, 'Input file downloaded')

    // ── 3. Parse the presentation ─────────────────────────────────────────────
    const enhanceMode: 'recreate' | 'preserve' = parameters?.enhanceMode || 'recreate'
    const parseScript = path.join(targetDir, '.opencode/skills/ppt-enhancer/scripts/parse_presentation.js')

    jobLogger.info({ parseScript, enhanceMode }, 'Running parse_presentation.js')
    const { stdout: parseOut, stderr: parseErr } = await execAsync(
      `node "${parseScript}" --input "${inputFilePath}" --jobId "${jobId}" --mode ${enhanceMode}`,
      { cwd: targetDir, env: { ...process.env, NODE_PATH: path.join(targetDir, 'node_modules') } },
    )
    if (parseOut) jobLogger.info({ out: parseOut.slice(0, 500) }, 'Parser output')
    if (parseErr) jobLogger.warn({ err: parseErr.slice(0, 500) }, 'Parser stderr')

    const parsedSlidesPath = path.join(buildDir, 'parsed-slides.json')
    if (!fs.existsSync(parsedSlidesPath)) {
      throw new Error(`Parser did not produce parsed-slides.json at ${parsedSlidesPath}`)
    }

    const parsedSlides = JSON.parse(fs.readFileSync(parsedSlidesPath, 'utf-8'))
    jobLogger.info({ slideCount: parsedSlides.length }, 'Parsed slides')
    await reportJobPhase(jobId, userId, 'enhance_parse', 'completed', connection)

    // ── 4. Create OpenCode session ────────────────────────────────────────────
    const sessionResponse = await client.session.create({
      query: { directory: targetDir },
      body: { title: `Enhance Job ${jobId} for user ${userId}` },
    })
    if (sessionResponse.error || !sessionResponse.data) {
      throw new Error(`Failed to create OpenCode session: ${JSON.stringify(sessionResponse.error)}`)
    }
    session = sessionResponse.data
    jobLogger.info({ sessionId: session.id }, 'OpenCode session created')
    activeSessionsByJobId.set(jobId, session.id)

    // ── 5. Subscribe to events ────────────────────────────────────────────────
    eventAbortController = new AbortController()
    const events = await client.event.subscribe({
      query: { directory: targetDir },
      signal: eventAbortController.signal,
    })

    // Phase detection from tool-call events
    let currentPhaseIdx = 0

    const streamPromise = (async () => {
      try {
        for await (const event of events.stream) {
          const eventSessionId = getSessionIdFromEvent(event)
          if (eventSessionId && eventSessionId !== session!.id) continue

          const evt = event as any

          // Human-readable debug logs
          if (evt.type === 'message.part.updated' || evt.type === 'message.updated') {
            const info = evt.properties?.info || evt.properties
            if (info?.role === 'assistant') {
              const text = info?.content?.[0]?.text || info?.text || evt.properties?.part?.text || ''
              if (text) jobLogger.info({ text: text.slice(0, 200) }, 'LLM output')
            }
          }

          // Phase advancement via tool-call sniffing
          if (evt.type === 'call' || evt.call) {
            const call = evt.call || evt
            const toolName: string = call.name || call.tool || 'unknown'
            const args: Record<string, any> = call.arguments || {}
            jobLogger.info({ tool: toolName }, 'Tool call started')

            // enhance_research phase starts on first web_search tool call
            if (currentPhaseIdx === 0 && toolName === 'web_search') {
              await reportJobPhase(jobId, userId, 'enhance_research', 'running', connection)
              currentPhaseIdx = 1
            }
            // enhance_write phase starts on first write_file call
            if (currentPhaseIdx <= 1 && toolName === 'write_file') {
              if (currentPhaseIdx === 1)
                await reportJobPhase(jobId, userId, 'enhance_research', 'completed', connection)
              await reportJobPhase(jobId, userId, 'enhance_write', 'running', connection)
              currentPhaseIdx = 2
            }
            // enhance_images phase starts when scrape_images script is invoked
            if (currentPhaseIdx <= 2 && toolName === 'run_shell_command') {
              const cmd: string = args.command || ''
              if (cmd.includes('scrape_images')) {
                if (currentPhaseIdx === 2)
                  await reportJobPhase(jobId, userId, 'enhance_write', 'completed', connection)
                await reportJobPhase(jobId, userId, 'enhance_images', 'running', connection)
                currentPhaseIdx = 3
              }
              // enhance_build when pdf-builder.js is invoked
              if (cmd.includes('pdf-builder.js') && currentPhaseIdx <= 3) {
                if (currentPhaseIdx === 3)
                  await reportJobPhase(jobId, userId, 'enhance_images', 'completed', connection)
                else if (currentPhaseIdx === 2)
                  await reportJobPhase(jobId, userId, 'enhance_write', 'completed', connection)
                await reportJobPhase(jobId, userId, 'enhance_build', 'running', connection)
                currentPhaseIdx = 4
              }
            }
            // enhance_qa when qa-renders are read
            if (currentPhaseIdx === 4 && (toolName === 'read_file' || toolName === 'read')) {
              const filePath: string = args.file_path || args.path || ''
              if (filePath.includes('qa-renders')) {
                await reportJobPhase(jobId, userId, 'enhance_build', 'completed', connection)
                await reportJobPhase(jobId, userId, 'enhance_qa', 'running', connection)
                currentPhaseIdx = 5
              }
            }
          }

          // Budget tracking
          if (event.type === 'message.updated' && event.properties.info.role === 'assistant') {
            const msg = event.properties.info as any
            if (msg.cost !== undefined) {
              messageCosts.set(msg.id, msg.cost)
              currentCost = Array.from(messageCosts.values()).reduce((s, c) => s + c, 0)
            }
            if (currentCost >= budgetUsd) {
              jobLogger.error({ currentCost }, `Budget of $${budgetUsd} exceeded. Aborting.`)
              client.session.abort({ path: { id: session!.id } }).catch(() => {})
              eventAbortController?.abort()
              promptAbortController.abort()
            }
          }

          // Forward to SSE subscribers
          await connection.publish(
            JOB_UPDATES_CHANNEL,
            JSON.stringify({ type: 'LOG', jobId, userId, event }),
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

    // ── 6. Send prompt to OpenCode ────────────────────────────────────────────
    const extractedImagesDir =
      enhanceMode === 'preserve' ? path.join(buildDir, 'input-images') : undefined

    const promptText = buildEnhancePrompt({
      jobId,
      buildDir,
      parsedSlidesPath,
      inputFilePath,
      enhanceMode,
      enhancePrompt: parameters?.enhancePrompt || 'Enhance and modernize this presentation.',
      originalFileName,
      extractedImagesDir,
    })

    jobLogger.info('Sending enhance prompt to OpenCode')
    await reportJobPhase(jobId, userId, 'enhance_research', 'running', connection)

    const promptResponse = await client.session.prompt({
      path: { id: session.id },
      query: { directory: targetDir },
      body: { parts: [{ type: 'text', text: promptText }] },
      signal: promptAbortController.signal,
    })

    if (promptResponse.error) {
      throw new Error(`OpenCode prompt failed: ${JSON.stringify(promptResponse.error)}`)
    }
    jobLogger.info('OpenCode prompt completed')

    // ── 7. Final cost tracking ────────────────────────────────────────────────
    try {
      const msgsRes = await client.session.messages({
        path: { id: session.id },
        query: { directory: targetDir },
      })
      if (msgsRes.data) {
        const apiCost = msgsRes.data
          .filter((m: any) => m.info?.role === 'assistant' && m.info?.cost !== undefined)
          .reduce((sum: number, m: any) => sum + m.info.cost, 0)
        if (apiCost > 0) currentCost = apiCost
      }
    } catch (err: any) {
      jobLogger.warn({ err }, 'Failed to fetch final session messages for cost tracking')
    }

    eventAbortController.abort()
    await streamPromise

    if (currentCost > 0) {
      await db.updateJob(jobId, { cost: currentCost })
      jobLogger.info({ cost: currentCost }, 'Job cost updated')
    }

    // ── 8. Mark all LLM phases complete ──────────────────────────────────────
    for (const phase of ENHANCE_PHASES) {
      await reportJobPhase(jobId, userId, phase, 'completed', connection)
    }

    // ── 9. Find and upload output files ──────────────────────────────────────
    await reportJobPhase(jobId, userId, 'enhance_upload', 'running', connection)

    const expectedPdfPath = path.join(buildDir, 'output.pdf')
    const expectedHtmlPath = path.join(buildDir, 'output.html')

    if (!fs.existsSync(expectedPdfPath)) {
      throw new Error(`Enhanced PDF not found at ${expectedPdfPath}`)
    }

    const pdfPath = expectedPdfPath
    const htmlPath = fs.existsSync(expectedHtmlPath) ? expectedHtmlPath : null

    jobLogger.info({ pdfPath, htmlPath }, 'Found enhanced files — uploading')
    await pushEnhancedResult(jobId, userId, pdfPath, htmlPath, connection, parameters)
    await reportJobPhase(jobId, userId, 'enhance_upload', 'completed', connection)
  } catch (error: any) {
    jobLogger.error({ err: error }, 'Failed to process enhance job')
    clearTimeout(timeout)

    if (session) {
      try {
        await client.session.abort({ path: { id: session.id } })
      } catch {}
    }

    try {
      const existingJob = await db.prisma.job.findUnique({ where: { id: jobId } })
      let newPhases: PhaseUpdate[] = []
      if (existingJob?.phases) {
        const parsedPhases: PhaseUpdate[] = JSON.parse(existingJob.phases as string)
        newPhases = parsedPhases.map(p =>
          p.status === 'running' ? { ...p, status: 'failed', completedAt: new Date().toISOString() } : p,
        )
      }

      const failedJob = await db.updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error.message || 'Presentation enhancement failed',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      // Refund 1 credit
      await db.addCredits(userId, 1, 'refund', 'Refund: Presentation enhancement failed', { jobId })

      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
      const email = userProfile?.email || userId
      await sendDiscordMessage(
        `❌ **Presentation Enhancement Failed**\nJob ID: \`${jobId}\`\nUser: ${email}\nError: ${error.message}`,
      )
    } catch (refundError: any) {
      jobLogger.error({ err: refundError }, 'Failed to handle enhance job failure cleanup')
    }
  } finally {
    clearTimeout(timeout)
    activeSessionsByJobId.delete(jobId)
    // Best-effort cleanup of job build directory to free disk
    try {
      fs.rmSync(buildDir, { recursive: true, force: true })
      jobLogger.info({ buildDir }, 'Build directory cleaned up')
    } catch {}
  }
}
