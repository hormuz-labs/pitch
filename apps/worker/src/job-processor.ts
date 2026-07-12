import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { promisify } from 'node:util'
import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail } from '@saas/email'
import {
  createLogger,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  type JobPhaseEvent,
  JobStatus,
  PHASE_LABELS,
  PHASE_WEIGHTS,
  type PhaseUpdate,
  sendDiscordMessage,
} from '@saas/shared'
import * as storage from '@saas/storage'
import type { Job } from 'bullmq'
import { Redis } from 'ioredis'
import * as os from 'os'
import { getSessionIdFromEvent } from './opencode.js'
import { resolveBackgroundAsset, shapeRadius } from './utils/background.js'
import { buildGlidingCursorChain } from './utils/cursor-fx.js'
import { nvencAvailable, videoEncodeArgs } from './utils/encoder.js'
import { addIntroOutro } from './utils/intro-outro.js'
import { jobAlreadyTerminal } from './utils/job-guard.js'
import { type ManagerBrowserHandle, startManagerBrowser } from './utils/manager-browser.js'
import { processVideo } from './utils/smart_trim.js'
import { buildContinuousZoomFilter } from './utils/zoom-filter.js'

const execAsync = promisify(exec)
const logger = createLogger('worker:job')

// Tracks the active OpenCode session ID for each in-flight job so the
// cancellation handler can abort it immediately.
export const activeSessionsByJobId = new Map<string, string>()

/**
 * Start a Redis subscriber that listens on JOB_CANCELLATIONS_CHANNEL.
 * When a cancellation message arrives for a job that is currently being
 * processed, the running OpenCode session is aborted and then deleted so
 * that no further LLM/tool calls are made on behalf of the deleted job.
 */
export function startCancellationListener(
  redisUrl: string,
  getClient: () => OpencodeClient | undefined,
  _targetDir: string,
) {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null })
  const cancelLogger = createLogger('worker:cancel')

  subscriber.subscribe(JOB_CANCELLATIONS_CHANNEL, err => {
    if (err) {
      cancelLogger.error({ err }, 'Failed to subscribe to job-cancellations channel')
    } else {
      cancelLogger.info('Subscribed to job-cancellations channel')
    }
  })

  subscriber.on('message', async (_channel: string, message: string) => {
    let jobId: string
    try {
      ;({ jobId } = JSON.parse(message))
    } catch {
      return
    }

    const sessionId = activeSessionsByJobId.get(jobId)
    if (!sessionId) {
      // Job is not currently being processed on this worker — nothing to do.
      return
    }

    cancelLogger.info({ jobId, sessionId }, 'Cancellation received — aborting OpenCode session')
    const client = getClient()
    if (!client) {
      cancelLogger.warn(
        { jobId, sessionId },
        'Cancellation received but no OpenCode server is running; nothing to abort',
      )
      return
    }

    try {
      await client.session.abort({ path: { id: sessionId } })
      cancelLogger.info({ jobId, sessionId }, 'OpenCode session aborted')
    } catch (e: any) {
      cancelLogger.warn(
        { err: e, jobId, sessionId },
        'Failed to abort OpenCode session (may have already finished)',
      )
    }

    try {
      await client.session.delete({ path: { id: sessionId } })
      cancelLogger.info({ jobId, sessionId }, 'OpenCode session deleted after cancellation')
    } catch (e: any) {
      cancelLogger.warn(
        { err: e, jobId, sessionId },
        'Failed to delete OpenCode session after cancellation',
      )
    }
  })

  return subscriber
}

/**
 * Direct in-process phase reporting. Updates database and publishes progress updates to SSE subscribers.
 */
export async function reportJobPhase(
  jobId: string,
  userId: string,
  phaseKey: string,
  status: 'running' | 'completed' | 'failed',
  connection: Redis,
) {
  try {
    const job = await db.prisma.job.findUnique({ where: { id: jobId } })
    if (!job) {
      logger.error({ jobId }, 'Job not found in database for phase reporting')
      return
    }

    const currentPhases: PhaseUpdate[] = job.phases ? JSON.parse(job.phases as string) : []
    const existingIdx = currentPhases.findIndex(p => p.phase === phaseKey)
    const existingPhase = existingIdx >= 0 ? currentPhases[existingIdx] : null

    if (existingPhase?.status === 'completed') {
      logger.debug({ jobId, phaseKey }, 'Phase already completed. Skipping update.')
      return
    }

    let newRetryDuration = existingPhase?.retryDurationMs || 0
    let newRetryCount = existingPhase?.retryCount || 0
    const failedAttempts = existingPhase?.failedAttempts || []
    if (status === 'failed') {
      newRetryCount += 1
      if (existingPhase?.startedAt) {
        const endedAt = new Date().toISOString()
        const durationMs = new Date(endedAt).getTime() - new Date(existingPhase.startedAt).getTime()
        newRetryDuration += durationMs
        failedAttempts.push({
          startedAt: existingPhase.startedAt,
          endedAt,
          durationMs,
          status: 'failed',
        })
      }
    }

    const now = new Date().toISOString()
    const startedAt =
      status === 'running' ? existingPhase?.startedAt || now : existingPhase?.startedAt
    const completedAt = status === 'completed' ? now : existingPhase?.completedAt

    let computedDurationMs = existingPhase?.durationMs
    if (status === 'completed' && startedAt) {
      computedDurationMs = new Date(completedAt!).getTime() - new Date(startedAt).getTime()
    }

    const updatedPhase: PhaseUpdate = {
      phase: phaseKey,
      label: PHASE_LABELS[phaseKey] ?? phaseKey,
      status: status as PhaseUpdate['status'],
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(computedDurationMs !== undefined ? { durationMs: computedDurationMs } : {}),
      ...(newRetryDuration > 0 ? { retryDurationMs: newRetryDuration } : {}),
      ...(newRetryCount > 0 ? { retryCount: newRetryCount } : {}),
      ...(failedAttempts.length > 0 ? { failedAttempts } : {}),
    }

    const newPhases: PhaseUpdate[] =
      existingIdx >= 0
        ? currentPhases.map((p, i) => (i === existingIdx ? updatedPhase : p))
        : [...currentPhases, updatedPhase]

    const progress = newPhases
      .filter(p => p.status === 'completed')
      .reduce((acc, p) => acc + (PHASE_WEIGHTS[p.phase] ?? 0), 0)

    await db.prisma.job.update({
      where: { id: jobId },
      data: { phases: JSON.stringify(newPhases) },
    })

    const event: JobPhaseEvent = {
      type: 'phase_update',
      jobId,
      userId,
      phase: updatedPhase,
      allPhases: newPhases,
      progress,
    }
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(event))
    logger.info({ jobId, phaseKey, status, progress }, 'Phase update published')
  } catch (err: any) {
    logger.warn({ err, jobId, phaseKey, status }, 'Failed to report phase progress')
  }
}

/**
 * Resolve the current git commit hash. Tries GIT_HASH env var first,
 * then falls back to running git rev-parse.
 */
async function getGitHash(): Promise<string | undefined> {
  if (process.env.GIT_HASH) return process.env.GIT_HASH
  try {
    const { stdout } = await execAsync('git rev-parse HEAD')
    return stdout.trim()
  } catch {
    return undefined
  }
}

/**
 * Detect when the real page first appears in the recording. The browser opens on a
 * blank white about:blank page and the agent only navigates after it cold-starts
 * (often 20-40s in), so the recording begins with a long blank-white stretch. That
 * blank page is near-pure white (luma ~235 everywhere); a real page has dark pixels
 * (text, logos), so its per-frame YMIN drops sharply. We sample luma YMIN a few
 * times a second and return the timestamp of the first frame whose YMIN falls below
 * a content threshold — i.e. the moment the page paints. Returns seconds in the webm
 * timeline, or 0 if content was on screen from the start or detection is
 * inconclusive. Best-effort: any failure returns 0, so we just skip the extra trim.
 * The scan is capped so we don't decode the whole video.
 */
async function detectFirstContentSec(webmPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffmpeg -hide_banner -nostats -t 150 -i "${webmPath}" ` +
        `-vf "fps=4,signalstats,metadata=print:key=lavfi.signalstats.YMIN" -f null - 2>&1 | ` +
        `awk '/pts_time/{t=$0; sub(/.*pts_time:/,"",t); sub(/ .*/,"",t)} ` +
        `/YMIN/{v=$0; sub(/.*YMIN=/,"",v); if(v+0<100){print t; exit}}'`,
    )
    const t = parseFloat((stdout || '').trim())
    // t<=1: content on screen from the start (no blank opening). t>120: implausible.
    if (!Number.isFinite(t) || t <= 1 || t > 120) return 0
    return t
  } catch {
    return 0
  }
}

/**
 * Direct in-process result pushing. Uploads final video, notifies via Discord and email.
 */
export async function pushJobResult(
  jobId: string,
  userId: string,
  filePath: string,
  rawFilePath: string,
  connection: Redis,
  parameters: any,
) {
  logger.info({ jobId, userId }, 'Pushing video result directly from worker')

  const rawUrl = parameters?.url || 'untitled'
  const projectName = rawUrl
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/[^a-zA-Z0-9-]/g, '_')
  const prefix = `pitch/${userId}/${projectName}/videos`

  const gitHash = await getGitHash()
  if (gitHash) {
    logger.info({ gitHash }, 'Resolved git commit hash')
  }

  // 1. Upload raw video to GCS
  let rawVideoUrl: string | undefined
  try {
    rawVideoUrl = await storage.uploadFile(rawFilePath, undefined, prefix)
    logger.info({ rawVideoUrl }, 'Raw video successfully uploaded to GCS')
  } catch (err: any) {
    logger.warn({ err }, 'Failed to upload raw video')
  }

  // 2. Upload final (trimmed) video to GCS
  const videoUrl = await storage.uploadFile(filePath, undefined, prefix)
  logger.info({ videoUrl }, 'Final video successfully uploaded to GCS')

  // 3. Update DB
  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.COMPLETED,
    videoUrl,
    rawVideoUrl: rawVideoUrl ?? undefined,
    gitHash,
  })

  // 4. Broadcast completion to SSE channels
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
  logger.info({ jobId }, 'Job completion broadcasted')

  // 5. Send Discord and email notifications
  try {
    const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const email = userProfile?.email || userId
    const urlParam = parameters?.url || 'N/A'
    const isEditJob = parameters?.jobType === 'edit-recording'
    const instructions = parameters?.instructions ? `\nPrompt: *${parameters.instructions}*` : ''

    await sendDiscordMessage(
      `✅ **${isEditJob ? 'Recording Edit Completed' : 'Video Creation Completed'}**\nJob ID: \`${jobId}\`\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nOutput Video: ${videoUrl}\nGit Hash: \`${gitHash || 'N/A'}\`${rawVideoUrl ? `\nRaw Video: ${rawVideoUrl}` : ''}`,
    )

    const userEmail = await getClerkUserEmail(userId)
    if (userEmail && videoUrl) {
      // Edit-recording jobs may carry a bare file name in parameters.url instead
      // of a real URL — fall back to the product/file name instead of crashing.
      let videoTitle = 'pitch.com'
      if (urlParam !== 'N/A') {
        try {
          videoTitle = new URL(urlParam).hostname
        } catch {
          videoTitle = parameters?.productName || parameters?.originalFileName || 'pitch.com'
        }
      }
      await sendJobCompleteEmail({ to: userEmail, jobId, videoUrl, videoTitle })
    }
  } catch (err: any) {
    logger.warn({ err, jobId }, 'Notifications or email failed')
  }
}

async function getMediaDurationSec(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    )
    const d = parseFloat(stdout.trim())
    return Number.isFinite(d) && d > 0 ? d : 0
  } catch {
    return 0
  }
}

async function getSourceFps(webmPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${webmPath}"`,
    )
    const rate = stdout.trim()
    const [num, den] = rate.split('/').map(s => parseInt(s.trim(), 10))
    if (num && den && den !== 0) {
      const fps = num / den
      if (Number.isFinite(fps) && fps > 0) return Math.round(fps)
    }
  } catch (e) {
    logger.warn({ err: e, webmPath }, 'Could not detect source fps, using default 30')
  }
  return 30
}

async function getVideoBirthTimeMs(webmPath: string): Promise<number | null> {
  try {
    const stat = fs.statSync(webmPath)
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${webmPath}"`,
    )
    const durationSec = parseFloat(stdout.trim())
    if (!Number.isFinite(durationSec)) return null
    return Math.round(stat.mtimeMs - durationSec * 1000)
  } catch (e) {
    logger.warn({ err: e, webmPath }, 'Could not determine video birth time')
    return null
  }
}

/**
 * Locate and combine recorded WebM file(s).
 * If multiple .webm files exist in the search directory, we chronologically combine them.
 */
async function resolveAndCombineWebmFiles(
  expectedPath: string,
  searchDir: string,
  logger: any,
): Promise<string> {
  const candidates: string[] = []
  function search(dir: string, depth: number) {
    if (depth > 3) return
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          search(fullPath, depth + 1)
        } else if (entry.name.endsWith('.webm')) {
          candidates.push(fullPath)
        }
      }
    } catch {
      // ignore unreadable directories
    }
  }
  search(searchDir, 0)

  const uniqueCandidates = Array.from(new Set(candidates)).filter(f => {
    try {
      return fs.existsSync(f) && fs.statSync(f).size > 0
    } catch {
      return false
    }
  })

  if (uniqueCandidates.length === 0) {
    if (fs.existsSync(expectedPath)) {
      return expectedPath
    }
    throw new Error(`No WebM video recording found in ${searchDir}`)
  }

  if (uniqueCandidates.length === 1) {
    const singleFile = uniqueCandidates[0]!
    if (singleFile !== expectedPath) {
      logger.info(
        { from: singleFile, to: expectedPath },
        'Moving single WebM file to expected path',
      )
      fs.renameSync(singleFile, expectedPath)
    }
    return expectedPath
  }

  // Sort by birth/modification time ascending so we merge chronologically (oldest first, to newest)
  uniqueCandidates.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)

  logger.info(
    { files: uniqueCandidates },
    `Combining ${uniqueCandidates.length} WebM files into ${expectedPath}`,
  )

  const dir = path.dirname(expectedPath)
  const stamp = Date.now()
  const listFile = path.join(dir, `__concat_${stamp}_list.txt`)
  const tempCombinedPath = path.join(dir, `__combined_${stamp}.webm`)

  try {
    const listContent = uniqueCandidates.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(listFile, listContent)

    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${tempCombinedPath}"`)
    logger.info({ tempCombinedPath }, 'Successfully combined WebM files using concat demuxer')

    // getVideoBirthTimeMs derives the recording start from mtime minus duration; the
    // concat output's natural mtime is "now" (processing time), which would skew every
    // narration/click/zoom offset. Stamp it with the newest source's mtime (≈ when
    // recording actually stopped) before deleting the originals.
    const newestMtimeMs = fs.statSync(uniqueCandidates[uniqueCandidates.length - 1]!).mtimeMs
    fs.utimesSync(tempCombinedPath, new Date(), new Date(newestMtimeMs))

    // Clean up original webm files to avoid clutter
    for (const f of uniqueCandidates) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }

    fs.renameSync(tempCombinedPath, expectedPath)
    return expectedPath
  } catch (err) {
    logger.error(
      { err, files: uniqueCandidates },
      'Failed to combine WebM files via concat demuxer',
    )
    if (fs.existsSync(tempCombinedPath)) {
      try {
        fs.unlinkSync(tempCombinedPath)
      } catch {}
    }
    throw err
  } finally {
    try {
      fs.unlinkSync(listFile)
    } catch {}
  }
}

/**
 * Diagnostic helper: list .webm files under the given directory and return the most
 * recently modified one. Deliberately scoped to that directory only — sweeping
 * cwd/homedir/tmp could pick up a stale recording from another session and upload
 * it as THIS user's demo.
 */
function findWebmCandidates(logger: any, targetDir: string): string | null {
  const candidates: Array<{ path: string; mtimeMs: number }> = []
  const searchRoots = [targetDir]

  for (const root of searchRoots) {
    try {
      function search(dir: string, depth: number) {
        if (depth > 3) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            search(fullPath, depth + 1)
          } else if (entry.name.endsWith('.webm')) {
            candidates.push({ path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs })
          }
        }
      }
      search(root, 0)
    } catch {
      // ignore unreadable roots
    }
  }

  logger.info(
    { candidateCount: candidates.length, candidates: candidates.map(c => c.path) },
    'WebM search diagnostics',
  )

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0].path
}

export function createJobProcessor(connection: Redis, targetDir: string) {
  return async function processJob(job: Job, client: OpencodeClient) {
    const { jobId, userId, parameters } = job.data
    const jobLogger = logger.child({ jobId, userId })

    // Skip requeued duplicates of jobs the original in-flight run already
    // finished (lost BullMQ lock after sleep/stall — see utils/job-guard.ts).
    if (await jobAlreadyTerminal(jobId)) return

    if (parameters?.jobType === 'pdf') {
      const { processPdfJob } = await import('./pdf-job-processor.js')
      return processPdfJob(job, client, connection, targetDir)
    }

    jobLogger.info('Processing job via One-Pass architecture')

    const workerHostname = process.env.HOSTNAME || os.hostname()
    const updatedJob = await db.updateJob(jobId, {
      status: JobStatus.PROCESSING,
      workerId: workerHostname,
    })
    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

    let session: { id: string } | null = null
    let eventAbortController: AbortController | null = null
    let managerBrowser: ManagerBrowserHandle | null = null
    const messageCosts = new Map<string, number>()
    let currentCost = 0
    let budgetLimitBreached = false
    let timeoutExceeded = false
    const promptAbortController = new AbortController()

    const timeout = setTimeout(
      () => {
        timeoutExceeded = true
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
      // Recreate the recordings/ folder and its subfolders to start clean
      const recordingsDir = path.join(targetDir, 'recordings')
      if (fs.existsSync(recordingsDir)) {
        fs.rmSync(recordingsDir, { recursive: true, force: true })
      }
      fs.mkdirSync(recordingsDir, { recursive: true })
      fs.mkdirSync(path.join(recordingsDir, 'audio'), { recursive: true })
      fs.mkdirSync(path.join(recordingsDir, 'videos'), { recursive: true })

      // Create OpenCode Session first so we have session.id for recording paths
      const sessionResponse = await client.session.create({
        query: { directory: targetDir },
        body: { title: `Job ${jobId} for user ${userId} (One-Pass)` },
      })
      if (sessionResponse.error || !sessionResponse.data) {
        throw new Error(
          `Failed to create OpenCode session: ${JSON.stringify(sessionResponse.error)}`,
        )
      }
      session = sessionResponse.data
      jobLogger.info({ sessionId: session.id }, 'OpenCode session created')

      // Register the session so the cancellation listener can abort it if the
      // job is deleted while processing.
      activeSessionsByJobId.set(jobId, session.id)

      // Determine the directory where the video should be recorded using environment variables
      const recordingDirEnv = process.env.RECORDING_DIR || process.env.VIDEO_DIR
      let videoDir = targetDir
      if (recordingDirEnv) {
        videoDir = path.join(recordingDirEnv, session.id)
      }
      const webmPath = path.join(videoDir, 'demo.webm')

      // Clean up any old demo.webm files in targetDir and videoDir before starting
      for (const dirToClean of [targetDir, videoDir]) {
        try {
          if (fs.existsSync(dirToClean)) {
            for (const f of fs.readdirSync(dirToClean)) {
              if (f.match(/^demo(?:-\d+)?\.webm$/)) {
                try {
                  fs.unlinkSync(path.join(dirToClean, f))
                } catch (_e) {}
              }
            }
          }
        } catch {}
      }

      // Ensure videoDir exists
      fs.mkdirSync(videoDir, { recursive: true })

      // 1. Start CloakBrowser via Manager and establish CDP Proxy
      await reportJobPhase(jobId, userId, 'workspace_init', 'running', connection)
      managerBrowser = await startManagerBrowser(userId)
      await reportJobPhase(jobId, userId, 'workspace_init', 'completed', connection)

      // 2. Attach playwright-cli and start video recording BEFORE prompting the LLM
      await reportJobPhase(jobId, userId, 'video_recording', 'running', connection)
      jobLogger.info({ cdpUrl: managerBrowser.cdpUrl }, 'Attaching playwright-cli to manager CDP')
      // Retry playwright-cli attach with backoff — the WS endpoint may need a moment
      // to become fully ready even after the HTTP /json/version check passes.
      {
        const maxAttempts = 4
        const retryDelayMs = 3000
        let lastAttachError: Error | undefined
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await execAsync(`playwright-cli attach --cdp ${managerBrowser.cdpUrl}`, {
              cwd: targetDir,
            })
            lastAttachError = undefined
            break
          } catch (err) {
            lastAttachError = err instanceof Error ? err : new Error(String(err))
            jobLogger.warn(
              { attempt, maxAttempts, cdpUrl: managerBrowser.cdpUrl, err: lastAttachError.message },
              'playwright-cli attach failed, retrying...',
            )
            if (attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, retryDelayMs))
            }
          }
        }
        if (lastAttachError) {
          throw lastAttachError
        }
      }

      // Resize browser viewport to match recording size (fixes grey bar on production)
      logger.info('Resizing browser viewport to 1920x1080...')
      const resizeResult = await execAsync(`playwright-cli resize 1920 1080`, { cwd: targetDir })
      logger.info(
        { stdout: resizeResult.stdout, stderr: resizeResult.stderr },
        'playwright-cli resize output',
      )

      logger.info({ webmPath }, 'Starting video recording...')
      const videoStartResult = await execAsync(
        `playwright-cli video-start "${webmPath}" --size=1920x1080`,
        { cwd: targetDir },
      )
      logger.info(
        { stdout: videoStartResult.stdout, stderr: videoStartResult.stderr },
        'playwright-cli video-start output',
      )

      const startTime = Date.now()
      logger.info(`startTime captured: ${new Date(startTime).toISOString()}`)

      // Write config so the demo-generator tools know the startTime (event clock
      // anchor) and which TTS voice to use. Skills are NOT bound here anymore —
      // opencode discovers them natively per agent.
      const configPath = path.join(recordingsDir, 'demo-config.json')
      const voiceName = (parameters?.voice || 'Puck').toString().replace(/\.mp3$/i, '')
      fs.writeFileSync(configPath, JSON.stringify({ startTime, voiceName }, null, 2))

      // 4. Subscribe to global events and filter by session ID.
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

            // ── Stream human-readable logs for debugging ──────────────────────
            const evt = event as any

            if (evt.type === 'message.part.updated' || evt.type === 'message.updated') {
              const info = evt.properties?.info || evt.properties
              if (info?.role === 'assistant') {
                const text =
                  info?.content?.[0]?.text || info?.text || evt.properties?.part?.text || ''
                if (text) {
                  jobLogger.info({ text: text.slice(0, 200) }, 'LLM output')
                }
              }
            }

            if (evt.type === 'call' || evt.call) {
              const call = evt.call || evt
              const toolName: string = call.name || call.tool || 'unknown'
              jobLogger.info({ tool: toolName }, 'Tool call started')
            }

            if (evt.type === 'tool.result' || evt.result) {
              const call = evt.call || evt
              const toolName: string = call.name || call.tool || 'unknown'
              const result = evt.result || evt
              const preview =
                typeof result === 'string'
                  ? result.slice(0, 300)
                  : JSON.stringify(result).slice(0, 300)
              jobLogger.info({ tool: toolName, preview }, 'Tool result')
            }

            // Track cost if it's a message update
            if (event.type === 'message.updated' && event.properties.info.role === 'assistant') {
              const msg = event.properties.info as any
              if (msg.cost !== undefined) {
                messageCosts.set(msg.id, msg.cost)
                currentCost = Array.from(messageCosts.values()).reduce((sum, cost) => sum + cost, 0)
                jobLogger.info({ currentCost }, 'Cost updated')
              }

              // Check if cost exceeded the $4.00 budget limit
              if (currentCost >= 4.0) {
                budgetLimitBreached = true
                jobLogger.error(
                  { currentCost },
                  'Budget limit of $4.00 exceeded. Aborting session immediately.',
                )

                // Abort the session on the OpenCode server to stop the LLM instantly
                if (session) {
                  client.session.abort({ path: { id: session.id } }).catch(err => {
                    jobLogger.warn({ err }, 'Failed to abort OpenCode session')
                  })
                }

                // Abort the local event subscriber stream
                eventAbortController?.abort()

                // Abort the prompt request to make it reject immediately (in case OpenCode is frozen)
                promptAbortController.abort()
              }
            }

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

      // 5. Send Prompt — the behavioral spec (camera grammar, pacing, logo
      // capture) lives in the demo-generator agent definition; this message only
      // carries the per-job inputs.
      const targetUrl = parameters?.url || ''
      const promptInstructions = parameters?.instructions || ''
      const promptScript = (parameters?.script || '').toString().trim()

      // If the user supplied a voiceover script, the narration must follow it.
      const scriptBlock = promptScript
        ? `

VOICEOVER SCRIPT (provided by the user — THIS IS THE SOURCE OF TRUTH FOR THE NARRATION):
"""
${promptScript}
"""
`
        : ''

      const promptText = `Record a cinematic product demo.

Go to ${targetUrl}. ${promptInstructions}${scriptBlock}`

      const promptResponse = await client.session.prompt({
        path: { id: session.id },
        query: { directory: targetDir },
        body: {
          agent: 'demo-generator',
          parts: [{ type: 'text', text: promptText }],
        },
        signal: promptAbortController.signal,
      })

      if (promptResponse.error) {
        throw new Error(`OpenCode prompt failed: ${JSON.stringify(promptResponse.error)}`)
      }

      jobLogger.info('OpenCode prompt completed')

      // 6. Fetch final session messages to get ground-truth cost before aborting/draining
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

      // 7. Stop listening to events and drain the stream
      eventAbortController.abort()
      await streamPromise

      // Update final cost
      if (currentCost > 0) {
        await db.updateJob(jobId, { cost: currentCost })
        jobLogger.info({ cost: currentCost }, 'Job cost updated')
      }

      // 8. Gracefully close browser and stop recording
      await reportJobPhase(jobId, userId, 'video_recording', 'completed', connection)
      await reportJobPhase(jobId, userId, 'ffmpeg_postprocessing', 'running', connection)

      jobLogger.info('Stopping video recording and playwright session...')
      try {
        const videoStopResult = await execAsync('playwright-cli video-stop', { cwd: targetDir })
        jobLogger.info(
          { stdout: videoStopResult.stdout, stderr: videoStopResult.stderr },
          'playwright-cli video-stop output',
        )
      } catch (e) {
        jobLogger.warn({ err: e }, 'Failed to stop video recording gracefully')
      }

      // Diagnostic dump of the recording directory after recording stopped
      try {
        const { stdout: lsStdout } = await execAsync(
          `find "${videoDir}" -maxdepth 3 -type f \\( -name "*.webm" -o -name "*.mp4" \\) -printf "%T@ %p\\n" | sort -n`,
          { cwd: videoDir },
        )
        jobLogger.info({ files: lsStdout.trim() }, 'Video files in recording directory after stop')
      } catch (e) {
        jobLogger.warn({ err: e }, 'Failed to list workspace files')
      }
      try {
        await execAsync('playwright-cli close', { cwd: targetDir })
      } catch (_e) {}

      // Clean up CDP Proxy and stop the manager profile
      if (managerBrowser) {
        await managerBrowser.close()
      }

      // 9. Post-Process Video & Audio using Zoom-Filter & Smart-Trim
      const statePath = path.join(recordingsDir, 'demo-state.json')
      let state: any
      if (fs.existsSync(statePath)) {
        state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      } else {
        state = {
          startTime,
          audioClips: [],
          zoomEvents: [],
          clickEvents: [],
          tabEvents: [{ tabId: 0, wallSec: 0 }],
          tabCreationTimes: { 0: 0 },
          currentTabId: 0,
          lastTargetCoords: null,
        }
      }

      let foundWebmPath: string
      try {
        foundWebmPath = await resolveAndCombineWebmFiles(webmPath, videoDir, jobLogger)
      } catch (err: any) {
        jobLogger.warn(
          { err },
          'resolveAndCombineWebmFiles failed, trying findWebmCandidates fallback',
        )
        const candidate =
          findWebmCandidates(jobLogger, videoDir) || findWebmCandidates(jobLogger, targetDir)
        if (!candidate) {
          throw new Error('demo.webm video recording was not found')
        }
        foundWebmPath = candidate
      }

      const sourceFps = await getSourceFps(foundWebmPath)
      logger.info({ sourceFps }, 'Detected source frame rate')

      const cursorPath = path.join(targetDir, 'assets', 'icons', 'cursor.png')
      const rawVideo = path.join(recordingsDir, 'raw_demo.mp4')
      const trimmedVideo = path.join(recordingsDir, 'final_demo.mp4')
      const finalVideo = path.join(recordingsDir, 'final_with_cards.mp4')

      // Align video timebase with wall-clock startTime
      const videoBirthTimeMs = await getVideoBirthTimeMs(foundWebmPath)
      const trimSec = videoBirthTimeMs ? Math.max(0, (startTime - videoBirthTimeMs) / 1000) : 0
      if (trimSec > 0) {
        logger.info({ trimSec }, 'Applying timeline shift to align with prompt startTime')
      }

      // When the page first paints (webm timeline). The agent greets while the page
      // is still the blank white about:blank, so without this the demo opens on a
      // blank screen. We use this to (a) hold every narration until the page is
      // actually visible and (b) trim the whole blank opening below.
      const firstContentSec = await detectFirstContentSec(foundWebmPath)
      const firstContentMs = firstContentSec * 1000
      if (firstContentSec > 0) {
        logger.info(
          { firstContentSec },
          'Detected blank opening; narration and leading trim will start at first page paint',
        )
      }

      let videoInputs = `-i "${foundWebmPath}" -i "${cursorPath}"`
      let filterComplex = ''
      let currentVLabel = '[0:v]'

      // Animated cursor: one pointer that glides between click targets and dips
      // on each click, instead of a static cursor popping in at every point.
      const cursorChain = buildGlidingCursorChain(
        state.clickEvents,
        trimSec,
        1, // [1:v] is the cursor icon
        currentVLabel,
        '[v_cursor]',
      )
      if (cursorChain) {
        filterComplex += cursorChain
        currentVLabel = '[v_cursor]'
      }

      // Build zoom pan filter
      filterComplex += buildContinuousZoomFilter(
        state.zoomEvents,
        trimSec,
        currentVLabel,
        sourceFps,
      )

      // Audio narration clips
      let validClips = 0
      let audioInputIndex = 2 // 0 is webm, 1 is cursor icon
      const audioLabels: string[] = []
      const trimMs = trimSec * 1000
      let firstNarrationDelayMs = Number.POSITIVE_INFINITY
      // Where each clip lands on the output timeline — we mixed the audio ourselves,
      // so the smart trimmer can derive silence analytically from these spans instead
      // of decoding the whole track with silencedetect.
      const clipSpans: Array<{ startSec: number; filePath: string; durationSec?: number }> = []
      state.audioClips.forEach((clip: any) => {
        if (!fs.existsSync(clip.filePath)) {
          logger.warn({ filePath: clip.filePath }, 'Audio clip file not found on disk — skipping')
          return
        }
        // Place audio on the raw WebM timeline (which begins trimSec before the
        // prompt startTime), mirroring how the click/zoom overlays add trimSec.
        // Without this the narration drifts out of sync with the visuals it
        // describes. Clamp to firstContentMs so any early narration (spoken while
        // the page is still blank) is held until the page actually paints,
        // instead of playing over a blank screen.
        const delayMs = Math.max(
          firstContentMs,
          Math.max(0, clip.absoluteTimestamp - startTime + trimMs),
        )
        // Track the first *narration* clip (not the click/keyboard sound effects)
        // so we can trim the silent setup that precedes it.
        const isSfx = /(click|keyboard)\.mp3$/i.test(clip.filePath)
        if (!isSfx && delayMs < firstNarrationDelayMs) {
          firstNarrationDelayMs = delayMs
        }
        // Optional per-clip trim: SFX like the keyboard sound are clipped to the
        // exact duration of the action (e.g. how long typing took) so they start
        // and end in sync with the visible typing, not before or after.
        const atrim =
          typeof clip.durationSec === 'number' && clip.durationSec > 0
            ? `atrim=0:${clip.durationSec.toFixed(2)},`
            : ''
        videoInputs += ` -i "${clip.filePath}"`
        filterComplex += `[${audioInputIndex}:a]${atrim}adelay=${Math.round(delayMs)}|${Math.round(delayMs)}[a${validClips}];`
        audioLabels.push(`[a${validClips}]`)
        clipSpans.push({
          startSec: delayMs / 1000,
          filePath: clip.filePath,
          durationSec:
            typeof clip.durationSec === 'number' && clip.durationSec > 0
              ? clip.durationSec
              : undefined,
        })
        audioInputIndex++
        validClips++
      })

      if (validClips > 0) {
        // normalize=0 keeps narration at full level (amix's normalization would pump
        // the volume as adelayed clips come and go); the limiter guards the rare
        // narration+SFX overlap from clipping instead.
        filterComplex += `${audioLabels.join('')}amix=inputs=${validClips}:duration=longest:normalize=0,alimiter=limit=0.95[outa]`
      }

      logger.info(
        { totalClips: state.audioClips.length, validClips },
        'Audio clips prepared for mixing',
      )

      // Quality 18: this is the source every later stage re-encodes from, so it gets
      // the highest quality of the chain — generational loss lands on text sharpness
      // first. Audio matches the profile used everywhere downstream (24kHz mono AAC).
      const renderVideoArgs = await videoEncodeArgs({ quality: 18, cpuPreset: 'veryfast' })
      const ffmpegCmd =
        `ffmpeg -y ${videoInputs} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map "[zoomedv]" ${validClips > 0 ? '-map "[outa]"' : ''} ` +
        `${renderVideoArgs} ${validClips > 0 ? '-c:a aac -ar 24000 -ac 1' : ''} "${rawVideo}"`

      logger.info(
        { encoder: (await nvencAvailable()) ? 'h264_nvenc (GPU)' : 'libx264 (CPU)' },
        'Assembling and rendering raw video with zoom pans + overlays',
      )
      const renderT0 = Date.now()
      await execAsync(ffmpegCmd)
      logger.info(
        { sec: ((Date.now() - renderT0) / 1000).toFixed(1) },
        'TIMING: main render (zoom+overlays+audio) done',
      )

      // The agent spends the first several seconds setting up (navigation, first
      // snapshot, LLM reasoning) before its first narration, so the recording opens
      // with no voiceover. Drop that leading silent gap so the demo starts on the
      // first spoken word and has audio throughout. We also trim at least up to the
      // first page paint (firstContentSec) so the long blank white about:blank
      // opening is removed entirely — early narration was clamped to that same point,
      // so the demo opens on the real page with narration over it.
      const FIRST_WORD_LEAD_IN = 0.4
      const leadingTrimSec = Number.isFinite(firstNarrationDelayMs)
        ? Math.max(0, firstNarrationDelayMs / 1000 - FIRST_WORD_LEAD_IN, firstContentSec)
        : Math.max(0, firstContentSec)
      if (leadingTrimSec > 0) {
        logger.info(
          { leadingTrimSec, firstContentSec },
          'Trimming silent/blank setup before first narration so audio starts at the opening',
        )
      }

      // Resolve each mixed clip's span on the output timeline so the trimmer can
      // compute silence analytically instead of decoding the track with silencedetect.
      // If any clip's duration can't be read, fall back to detection to be safe —
      // a zero-length span would mark real narration as silence.
      let speechSegments: Array<{ start: number; end: number }> | undefined
      if (validClips > 0) {
        const spans = await Promise.all(
          clipSpans.map(async c => {
            const dur = c.durationSec ?? (await getMediaDurationSec(c.filePath))
            return dur > 0 ? { start: c.startSec, end: c.startSec + dur } : null
          }),
        )
        if (spans.every((s): s is { start: number; end: number } => s !== null)) {
          speechSegments = spans
        } else {
          logger.warn('Could not resolve all clip durations — trimmer will use silencedetect')
        }
      }

      logger.info('Applying smart trim to remove dead air segments')
      const trimT0 = Date.now()
      try {
        await processVideo(rawVideo, trimmedVideo, undefined, {
          forceLeadingTrimSec: leadingTrimSec,
          speechSegments,
        })
        logger.info({ sec: ((Date.now() - trimT0) / 1000).toFixed(1) }, 'TIMING: smart trim done')
      } catch (trimErr: any) {
        logger.warn({ err: trimErr }, 'Smart trim failed — falling back to raw video')
        fs.copyFileSync(rawVideo, trimmedVideo)
      }

      // 9. Final assembly: intro/outro cards, watermark and the optional decorative
      // background are all composited in ONE encode pass — the full assembled video
      // (intro + demo + outro) sits on the same backdrop, and the content only goes
      // through a single generation here. No background => the video stays full-screen.
      const bgId = (parameters?.background?.id || parameters?.background || '').toString().trim()
      const bgAsset =
        bgId && bgId !== 'none'
          ? resolveBackgroundAsset(path.join(targetDir, 'assets', 'backgrounds'), bgId)
          : null
      if (bgId && bgId !== 'none' && !bgAsset) {
        logger.warn({ bgId }, 'Background asset not found — keeping full-screen')
      }

      await reportJobPhase(jobId, userId, 'intro_outro', 'running', connection)
      logger.info({ bgId: bgAsset ? bgId : 'none' }, 'Adding intro/outro cards (+ background)')
      try {
        const productDomain = (parameters?.url || '').replace(/^https?:\/\//, '').split('/')[0]
        const productName =
          productDomain
            .replace(/\.[a-z]+$/, '')
            .replace(/[^a-zA-Z0-9]/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Demo'
        const productLogoPath = path.join(recordingsDir, 'product_logo.png')
        const inset = Number.parseFloat((parameters?.inset ?? '0.87').toString())

        const cardsT0 = Date.now()
        await addIntroOutro(
          trimmedVideo,
          finalVideo,
          {
            productName,
            productLogoPath: fs.existsSync(productLogoPath) ? productLogoPath : undefined,
            duration: 2.5,
            fps: sourceFps,
            width: 1920,
            height: 1080,
            outputPath: finalVideo,
            productUrl: productDomain || undefined,
          },
          bgAsset
            ? {
                asset: bgAsset,
                radius: shapeRadius((parameters?.shape || 'rounded').toString()),
                inset: Number.isFinite(inset) ? inset : 0.87,
              }
            : undefined,
        )
        logger.info(
          { sec: ((Date.now() - cardsT0) / 1000).toFixed(1) },
          'TIMING: final assembly (cards + watermark + background) done',
        )
      } catch (cardErr: any) {
        logger.warn({ err: cardErr }, 'Final assembly failed — using trimmed video as final')
        fs.copyFileSync(trimmedVideo, finalVideo)
      }
      await reportJobPhase(jobId, userId, 'intro_outro', 'completed', connection)

      // 10. Direct Push (GCS upload + database update + email & discord notifications)
      await pushJobResult(jobId, userId, finalVideo, rawVideo, connection, parameters)

      // Recordings are wiped at the start of the NEXT job, but the intermediates are
      // large enough to matter on a busy worker — drop them once the upload landed.
      for (const f of [rawVideo, trimmedVideo]) {
        try {
          fs.unlinkSync(f)
        } catch {}
      }

      await reportJobPhase(jobId, userId, 'ffmpeg_postprocessing', 'completed', connection)
      logger.info('Video creation successfully complete!')
    } catch (error: any) {
      jobLogger.error({ err: error }, 'Job processing failed')

      let errorMessage = error.message || 'Worker processing failed unexpectedly'
      if (budgetLimitBreached) {
        errorMessage = 'OpenCode budget limit of $4.00 was exceeded.'
      } else if (timeoutExceeded) {
        errorMessage = 'Execution timeout of 50 minutes was exceeded.'
      }

      // Check if job was cancelled/aborted (so it was already handled and refunded by the API)
      let isAlreadyCancelled = false
      let existingJob: any = null
      try {
        existingJob = await db.prisma.job.findUnique({ where: { id: jobId } })
        if (
          existingJob &&
          existingJob.status === JobStatus.FAILED &&
          existingJob.error?.includes('cancelled')
        ) {
          isAlreadyCancelled = true
        }
      } catch (_dbErr) {
        // ignore
      }

      if (!isAlreadyCancelled) {
        // Don't try to update a job that has already been deleted from the DB.
        try {
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
            error: errorMessage,
            ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
          })
          await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

          // Ensure refund is given if the worker errors out directly
          try {
            const isPdf = parameters?.jobType === 'pdf'
            const refundCredits = isPdf ? 1 : 3
            await db.addCredits(
              userId,
              refundCredits,
              'refund',
              `Refund: ${isPdf ? 'PDF' : 'video'} generation failed`,
              { jobId },
            )
            jobLogger.info(`Refunded ${refundCredits} credits due to worker error`)
          } catch (refundError: any) {
            jobLogger.warn(
              { err: refundError },
              'Failed to issue refund during worker error handling',
            )
          }

          const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
          const email = userProfile?.email || userId
          const urlParam = parameters?.url || 'N/A'
          const instructions = parameters?.instructions
            ? `\nPrompt: <i>${parameters.instructions}</i>`
            : ''

          await sendDiscordMessage(
            `❌ **Video Creation Failed** (Worker error)\nJob ID: \`${jobId}\`\nUser: ${email}\nTarget URL: ${urlParam}${instructions}\nError: ${errorMessage}`,
          )
        } catch (updateErr: any) {
          jobLogger.warn(
            { err: updateErr },
            'Could not update job status after failure (job may have been deleted)',
          )
        }
      } else {
        jobLogger.info(
          'Job was already aborted/cancelled and refunded by the API route. Skipping worker refund.',
        )
      }

      // Ensure cost is still logged even on failure, fetching final session messages if possible
      try {
        if (session) {
          const msgsRes = await client.session
            .messages({
              path: { id: session.id },
              query: { directory: targetDir },
            })
            .catch(() => null)
          if (msgsRes?.data) {
            const apiCost = msgsRes.data
              .filter((m: any) => m.info?.role === 'assistant' && m.info?.cost !== undefined)
              .reduce((sum: number, m: any) => sum + m.info.cost, 0)
            if (apiCost > 0) {
              currentCost = apiCost
            }
          }
        }
      } catch (_e) {
        // ignore
      }

      if (currentCost > 0) {
        try {
          await db.updateJob(jobId, { cost: currentCost })
        } catch (_e) {
          // ignore
        }
      }

      throw error
    } finally {
      clearTimeout(timeout)

      // Remove from the active-session registry so cancellation messages for
      // this job are ignored from now on.
      activeSessionsByJobId.delete(jobId)

      // Shut down the CDP Proxy and stop the manager profile
      if (managerBrowser) {
        try {
          await managerBrowser.close()
        } catch (_e) {}
      }

      // Clean up per-job resources
      if (eventAbortController && !eventAbortController.signal.aborted) {
        eventAbortController.abort()
      }
    }
  }
}
