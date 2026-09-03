/**
 * Launch-video job processor.
 *
 * Runs the initial html-motion-video creation prompt inside the shared worker
 * OpenCode server. Mirrors the API-side flow from
 * apps/api/src/lib/launch-video/opencode.ts, but reports progress through the
 * existing Job row/SSE channel so the frontend can track by jobId instead of
 * polling a project that may never exist.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import { prisma } from '@saas/db'
import { sendJobCompletedEmail, sendJobFailedEmail } from '@saas/email'
import {
  createLogger,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  LAUNCH_VIDEO_LEGACY_CREDIT_COST,
  launchVideoCreditCost,
} from '@saas/shared'
import * as storage from '@saas/storage'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'
import { reportJobPhase } from './job-processor.js'

const logger = createLogger('worker:launch-video')

/** First-turn brief: don't interview, build. */
const FIRST_TURN_BRIEF =
  'The user wants results, not questions. Do NOT interview the user or wait for confirmations ' +
  '— start the full html-motion-video workflow immediately (recon, direction, storyboard, VO, ' +
  'build, mix, render). Make every creative decision yourself, grounded in recon evidence, and ' +
  'briefly narrate your choices as you go. Only stop early if a hard requirement is missing ' +
  '(e.g. you cannot access the product at all).'

function toInternalName(userId: string, publicName: string): string {
  return `${userId}--${publicName}`
}

function projectDir(targetDir: string, userId: string, name: string): string {
  return path.join(targetDir, 'projects', toInternalName(userId, name))
}

/** Best-effort extraction of the session id an event belongs to. */
function getSessionIdFromEvent(event: any): string | undefined {
  const p = event?.properties ?? event?.payload ?? {}
  return (
    p.sessionID ??
    p.info?.sessionID ??
    p.message?.sessionID ??
    p.part?.sessionID ??
    p.status?.sessionID
  )
}

/**
 * Get (or lazily create) the OpenCode session bound to a user's project.
 * Mirrors the API-side session registry so the worker and API agree on the
 * same session for follow-up scene edits.
 */
async function getSessionForProject(
  client: OpencodeClient,
  userId: string,
  name: string,
): Promise<{ id: string; created: boolean }> {
  const internal = toInternalName(userId, name)

  const existingRow = await prisma.launchVideoProject.findUnique({
    where: { userId_name: { userId, name } },
  })

  if (existingRow) {
    try {
      const res = await client.session.get({ path: { id: existingRow.opencodeSessionId } })
      if (res.data) return { id: existingRow.opencodeSessionId, created: false }
    } catch {
      // Session is gone; create a new one below.
    }
  }

  const res = await client.session.create({ body: { title: `video:${internal}` } })
  const id = res.data?.id
  if (!id) {
    throw new Error(`Failed to create OpenCode session: ${JSON.stringify(res.error)}`)
  }

  await prisma.launchVideoProject.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, opencodeSessionId: id },
    update: { opencodeSessionId: id },
  })

  return { id, created: true }
}

function buildSystemPrompt(
  userId: string,
  name: string,
  music?: string,
  resolution?: string,
  narration = true,
): string {
  const internal = toInternalName(userId, name)
  const dir = projectDir(process.cwd(), userId, name)
  const exists = existsSync(dir)
  let system = exists
    ? `The video project lives in projects/${internal}/ (renders go to renders/ with the ${internal}- prefix). `
    : `Create a new video project under projects/${internal}/ following the html-motion-video skill conventions (renders go to renders/ with the ${internal}- prefix). `
  if (music) {
    system +=
      `Background music: the user picked "assets/music/${music}" from the shared music library — ` +
      `copy it into the project's audio/ folder and use it as the music bed in the mix. `
  }
  if (narration === false) {
    // This has to be known BEFORE the storyboard: scene durations normally come
    // from measured TTS clips, and there are none here.
    system +=
      `NARRATION: OFF — this is a music-only film. Skip Phase 3 voiceover entirely (no ` +
      `motion_tts calls, no vo_*.wav, no vo entries in js/timing.js). Derive every scene ` +
      `duration from the storyboard instead of measured VO, and lean harder on on-screen ` +
      `copy since nothing is spoken. Build the mix with motion_mix musicOnly: true, which ` +
      `drops the ducking and the vocal-band carve and lets the bed sit as the primary ` +
      `signal. `
  }
  if (resolution) {
    // The user paid for a specific output tier — the final render must match it.
    // capture.mjs owns the mapping (720p downscales from the 1080p stage, 4K
    // captures at deviceScaleFactor 2); the agent just passes the flag.
    system +=
      `Output resolution: the user selected ${resolution}. The FINAL full-timeline render ` +
      `must pass --out-res=${resolution} to capture.mjs (or resolution: '${resolution}' via ` +
      `motion_render). Do not substitute a different --scale for the deliverable. `
  }
  system += FIRST_TURN_BRIEF
  return system
}

export function detectLaunchVideoPhase(
  toolName: string | undefined,
  context?: string,
): string | null {
  if (!toolName && !context) return null
  const name = (toolName ?? '').toLowerCase()
  const text = `${name} ${context ?? ''}`.toLowerCase()
  if (text.includes('screenshot') || text.includes('recon')) return 'recon'
  if (text.includes('tts')) return 'voiceover'
  if (
    text.includes('motion_render') ||
    text.includes('capture.mjs') ||
    text.includes('/renders/')
  ) {
    return 'rendering'
  }
  if (text.includes('find_audio') || text.includes('mix.wav') || text.includes('mix.sh')) {
    return 'mixing'
  }
  if (
    text.includes('storyboard') ||
    text.includes('direction') ||
    text.includes('brief') ||
    text.includes('creative')
  )
    return 'planning'
  if (
    text.includes('build') ||
    text.includes('scene') ||
    name.includes('write') ||
    name.includes('edit') ||
    name.includes('patch') ||
    name.includes('organize') ||
    name.includes('todo')
  )
    return 'building'
  return null
}

function publishPhase(
  jobId: string,
  userId: string,
  phase: string,
  status: 'running' | 'completed' | 'failed',
  connection: Redis,
) {
  return reportJobPhase(jobId, userId, phase, status, connection).catch(err => {
    logger.warn({ err, jobId, phase, status }, 'Failed to report launch-video phase')
  })
}

export async function markLaunchVideoJobProcessing(
  jobId: string,
  connection: Redis,
): Promise<void> {
  const updatedJob = await db.updateJob(jobId, { status: JobStatus.PROCESSING })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
}

export function isLaunchVideoCompletionEvent(event: any): boolean {
  return (
    event?.type === 'session.idle' ||
    (event?.type === 'session.status' && event?.properties?.status?.type === 'idle')
  )
}

export function isLaunchVideoSessionIdle(
  statuses: Record<string, { type: string }> | undefined,
  sessionId: string,
): boolean {
  const status = statuses?.[sessionId]
  return !status || status.type === 'idle'
}

async function executeLaunchVideoJob(
  job: Job,
  client: OpencodeClient,
  connection: Redis,
  targetDir: string,
) {
  const { jobId, userId, parameters } = job.data as {
    jobId: string
    userId: string
    parameters: {
      projectName: string
      prompt: string
      music?: string
      resolution?: string
      narration?: boolean
    }
  }
  const { projectName, prompt, music, resolution, narration } = parameters
  const jobLogger = logger.child({ jobId, userId, projectName })

  jobLogger.info('Processing launch-video job')

  await markLaunchVideoJobProcessing(jobId, connection)

  await publishPhase(jobId, userId, 'workspace_init', 'running', connection)

  const { id: sessionId, created } = await getSessionForProject(client, userId, projectName)
  jobLogger.info({ sessionId, created }, 'OpenCode session ready')

  await publishPhase(jobId, userId, 'workspace_init', 'completed', connection)
  await publishPhase(jobId, userId, 'processing', 'running', connection)

  const eventAbortController = new AbortController()
  const promptAbortController = new AbortController()

  let completed = false
  let failed = false
  let errorMessage: string | null = null
  let currentPhase: string | null = 'processing'
  const reportedPhases = new Set<string>()

  const events = await client.event.subscribe({
    query: { directory: targetDir },
    signal: eventAbortController.signal,
  })

  const completionPromise = new Promise<void>((resolve, reject) => {
    const streamPromise = (async () => {
      try {
        for await (const event of events.stream as AsyncIterable<any>) {
          const evtSessionId = getSessionIdFromEvent(event)
          if (evtSessionId && evtSessionId !== sessionId) continue

          const type = event.type as string
          const props = event.properties ?? {}

          // Phase detection from tool calls / reasoning.
          let nextPhase: string | null = null
          if (type === 'call' || event.call) {
            const call = event.call || event
            nextPhase = detectLaunchVideoPhase(
              call.name || call.tool,
              JSON.stringify(call.input ?? call.state?.input ?? {}),
            )
          } else if (type === 'message.part.updated' && props.part?.type === 'tool') {
            // Tool parts carry the invoked tool (e.g. motion_tts, motion_render).
            nextPhase = detectLaunchVideoPhase(
              props.part.tool ?? props.part.name,
              JSON.stringify(props.part.state?.input ?? props.part.input ?? {}),
            )
          } else if (type === 'message.part.updated' && props.part?.type === 'reasoning') {
            nextPhase = detectLaunchVideoPhase(undefined, props.part.text)
          }
          if (nextPhase && nextPhase !== currentPhase) {
            if (currentPhase && !reportedPhases.has(currentPhase)) {
              await publishPhase(jobId, userId, currentPhase, 'completed', connection)
              reportedPhases.add(currentPhase)
            }
            currentPhase = nextPhase
            await publishPhase(jobId, userId, currentPhase, 'running', connection)
          }

          // Detect completion / failure.
          if (isLaunchVideoCompletionEvent(event)) {
            completed = true
            return
          }
          if (type === 'session.error') {
            failed = true
            errorMessage = props.error ?? 'OpenCode session error'
            return
          }
        }
      } catch (e: any) {
        if (e.name === 'AbortError' || eventAbortController.signal.aborted) {
          jobLogger.debug('Event stream aborted')
          return
        }
        jobLogger.error({ err: e }, 'Event stream error')
        failed = true
        errorMessage = e.message ?? 'Event stream error'
      }
    })()

    streamPromise.then(() => resolve(), reject)
  })

  // Send the creation prompt.
  const system = buildSystemPrompt(userId, projectName, music, resolution, narration)
  const promptResponse = await client.session.prompt({
    path: { id: sessionId },
    query: { directory: targetDir },
    body: {
      agent: 'html-video',
      system,
      parts: [{ type: 'text', text: prompt }],
    },
    signal: promptAbortController.signal,
  })

  if (promptResponse.error) {
    eventAbortController.abort()
    throw new Error(`OpenCode prompt failed: ${JSON.stringify(promptResponse.error)}`)
  }

  // `session.prompt` returns after the assistant finishes. Some OpenCode
  // versions do not deliver the terminal idle event to a directory-filtered
  // event subscription. Confirm the authoritative session status so a
  // successfully rendered job cannot hang forever waiting for a missed event.
  if (!completed && !failed) {
    try {
      const response = await client.session.status({ query: { directory: targetDir } })
      if (isLaunchVideoSessionIdle(response.data, sessionId)) {
        completed = true
        eventAbortController.abort()
      }
    } catch (error) {
      jobLogger.warn({ err: error }, 'Could not confirm OpenCode session status after prompt')
    }
  }

  // Wait for the agent to finish.
  try {
    if (!completed && !failed) await completionPromise
  } finally {
    eventAbortController.abort()
  }

  if (failed) {
    throw new Error(errorMessage ?? 'Launch-video job failed')
  }

  // Mark final phase completed.
  if (currentPhase) {
    await publishPhase(jobId, userId, currentPhase, 'completed', connection)
  }

  // Locate the rendered file on disk.
  const internal = toInternalName(userId, projectName)
  const launchFile = path.join(targetDir, 'renders', `${internal}-launch.mp4`)
  const draftFile = path.join(targetDir, 'renders', `${internal}-draft.mp4`)
  const renderFile = existsSync(launchFile) ? launchFile : existsSync(draftFile) ? draftFile : null

  if (!renderFile) {
    throw new Error('Launch video completed but no render file was found')
  }

  // Upload the finished render to object storage so it has a public, shareable
  // URL. The editor previews drafts locally through the API, but the job's
  // videoUrl (used by dashboard share/download) must be a real S3 URL, not a
  // local server path.
  const prefix = `pitch/${userId}/${projectName}/videos`
  const videoUrl = await storage.uploadFile(renderFile, undefined, prefix)
  jobLogger.info({ videoUrl }, 'Launch video uploaded to storage')

  const gitHash = process.env.GIT_HASH || undefined

  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.COMPLETED,
    videoUrl,
    gitHash,
  })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

  const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
  if (userProfile?.email) {
    await sendJobCompletedEmail({
      to: userProfile.email,
      firstName: userProfile.firstName,
      jobId,
      kind: 'launch-video',
      outputUrl: videoUrl,
      title: projectName,
    }).catch(err => logger.warn({ err, jobId }, 'Failed to send launch-video completion email'))
  }

  jobLogger.info({ videoUrl }, 'Launch video rendered')
  return { videoUrl }
}

interface LaunchVideoFailureRecoveryInput {
  jobId: string
  userId: string
  error: unknown
  connection: Redis
}

/**
 * Persist the terminal state before allowing BullMQ to record a launch-video
 * failure. The refund is idempotent because BullMQ can emit/retry failures and
 * operators may safely re-run this recovery for an orphaned PENDING row.
 */
export async function recoverLaunchVideoJobFailure({
  jobId,
  userId,
  error,
  connection,
}: LaunchVideoFailureRecoveryInput): Promise<void> {
  const existingJob = await db.prisma.job.findUnique({ where: { id: jobId } })
  if (!existingJob || existingJob.status === JobStatus.COMPLETED) return

  // Cancellation is already persisted and refunded by the API route.
  if (existingJob.status === JobStatus.FAILED && existingJob.error?.includes('cancelled')) return

  const errorMessage =
    error instanceof Error ? error.message : String(error || 'Launch video failed')
  let phases: Array<Record<string, unknown>> = []
  if (existingJob.phases) {
    try {
      phases = JSON.parse(existingJob.phases as string)
      phases = phases.map(phase =>
        phase.status === 'running'
          ? { ...phase, status: 'failed', completedAt: new Date().toISOString() }
          : phase,
      )
    } catch {
      phases = []
    }
  }

  const failedJob = await db.updateJob(jobId, {
    status: JobStatus.FAILED,
    error: errorMessage,
    ...(phases.length > 0 ? { phases: JSON.stringify(phases) } : {}),
  })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

  // Refund exactly what was charged. The price depends on the resolution tier
  // and whether the film was narrated, so refunding a flat constant would hand
  // back too much for a 720p music-only job and too little for a 4K narrated
  // one. The job's own parameters are the record of what was paid.
  // A job with no `resolution` predates per-resolution pricing and was charged
  // the old flat rate; refunding today's default tier would over-refund it.
  let refund = LAUNCH_VIDEO_LEGACY_CREDIT_COST
  try {
    const params = JSON.parse((existingJob.parameters as string) || '{}')
    if (params.resolution) {
      refund = launchVideoCreditCost(params.resolution, params.narration !== false)
    }
  } catch {
    // Unparseable parameters: still refund rather than leave the user charged
    // for a job that failed.
  }

  await db.addCredits(userId, refund, 'refund', 'Refund: Launch video generation failed', {
    jobId,
    idempotencyKey: `refund:launch-video:${jobId}`,
  })

  const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
  if (userProfile?.email) {
    await sendJobFailedEmail({
      to: userProfile.email,
      firstName: userProfile.firstName,
      jobId,
      kind: 'launch-video',
      error: errorMessage,
      refundedCredits: refund,
    }).catch(err => logger.warn({ err, jobId }, 'Failed to send launch-video failure email'))
  }
}

export async function processLaunchVideoJob(
  job: Job,
  client: OpencodeClient,
  connection: Redis,
  targetDir: string,
) {
  const { jobId, userId } = job.data as { jobId: string; userId: string }
  try {
    return await executeLaunchVideoJob(job, client, connection, targetDir)
  } catch (error) {
    try {
      await recoverLaunchVideoJobFailure({ jobId, userId, error, connection })
    } catch (recoveryError) {
      logger.error(
        { err: recoveryError, jobId, userId },
        'Failed to persist launch-video failure recovery',
      )
    }
    throw error
  }
}
