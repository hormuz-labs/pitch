/**
 * edit-job-processor — "edit my recording" jobs.
 *
 * The user uploads a narrated screen recording; the recording-editor agent
 * (.opencode/agents/recording-editor.md + .opencode/tools/recording-editor.ts)
 * reconstructs recordings/demo-state.json from it (zoom + click events), and this
 * processor renders the result through the SAME ffmpeg chain the live demo flow
 * uses (cursor fx → zoom/pan → smart trim → intro/outro), with two differences:
 *
 *   1. No trimSec — agent events are already in the uploaded video's own timeline.
 *   2. The source audio (the user's narration) is kept and re-encoded to the house
 *      profile instead of being replaced by a TTS mix. Dead-air trimming falls
 *      back to silencedetect since there are no analytic narration spans.
 *
 * NOTE on concurrency: the agent writes to the SHARED recordings/ directory
 * (targetDir/recordings), same as the demo flow. The edit worker therefore runs
 * at concurrency 1 — same constraint the main video worker has.
 */

import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import type { OpencodeClient } from '@opencode-ai/sdk'
import * as db from '@saas/db'
import { sendJobFailedEmail } from '@saas/email'
import {
  createLogger,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
  sendDiscordMessage,
} from '@saas/shared'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'
import { activeSessionsByJobId, pushJobResult, reportJobPhase } from './job-processor.js'
import { getSessionIdFromEvent } from './opencode.js'
import { nvencAvailable, videoEncodeArgs } from './utils/encoder.js'
import { addIntroOutro } from './utils/intro-outro.js'
import { jobAlreadyTerminal } from './utils/job-guard.js'
import { processVideo } from './utils/smart_trim.js'
import { buildContinuousZoomFilter } from './utils/zoom-filter.js'

const logger = createLogger('worker:edit')
const execAsync = promisify(exec)

const EDIT_CREDIT_COST = 2

// ── Helpers ───────────────────────────────────────────────────────────────────
async function downloadFile(url: string, destPath: string, hops = 0): Promise<void> {
  if (hops > 5) throw new Error(`Too many redirects downloading: ${url}`)
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib
      .get(url, res => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, destPath, hops + 1)
            .then(resolve)
            .catch(reject)
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

async function probeVideo(file: string): Promise<{ fps: number; width: number; height: number }> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of json "${file}"`,
  )
  const s = JSON.parse(stdout).streams?.[0] || {}
  const [num, den] = String(s.r_frame_rate || '30/1')
    .split('/')
    .map(Number)
  return {
    fps: den ? num! / den : num! || 30,
    width: s.width || 1920,
    height: s.height || 1080,
  }
}

function buildEditPrompt(params: {
  videoFile: string
  productName?: string
  productUrl?: string
  instructions?: string
}): string {
  return `Edit the uploaded screen recording into a cinematic product demo.

Video file: \`${params.videoFile}\` (relative to the working directory)
${params.productName ? `Product name: "${params.productName}"` : ''}
${params.productUrl ? `Product URL: ${params.productUrl}` : ''}
${params.instructions ? `User instructions: "${params.instructions}"` : ''}

Run your standard workflow end to end:
1. probe_video, then transcribe_video (narration is your primary prior) and detect_key_moments (visual prior).
2. Correlate narration with the footage into padded action windows.
3. inspect_frames each window to verify the action, its on-screen region, and its exact time.
4. Emit the camera plan with record_zoom_in / record_zoom_out / record_click into recordings/demo-state.json.

The worker renders the final video from recordings/demo-state.json automatically — when you're done, just reply with the event summary.`
}

// ── Main processor ────────────────────────────────────────────────────────────
export async function processEditJob(
  job: Job,
  client: OpencodeClient,
  connection: Redis,
  targetDir: string,
) {
  const { jobId, userId, parameters } = job.data
  const jobLogger = logger.child({ jobId, userId })

  // Skip requeued duplicates of jobs the original in-flight run already
  // finished (lost BullMQ lock after sleep/stall — see utils/job-guard.ts).
  if (await jobAlreadyTerminal(jobId)) return

  jobLogger.info(
    { originalFileName: parameters?.originalFileName },
    'Processing edit-recording job',
  )

  const workerHostname = process.env.HOSTNAME || os.hostname()
  const updatedJob = await db.updateJob(jobId, {
    status: JobStatus.PROCESSING,
    workerId: workerHostname,
  })
  await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))

  const recordingsDir = path.join(targetDir, 'recordings')
  fs.mkdirSync(recordingsDir, { recursive: true })

  let session: { id: string } | null = null
  let eventAbortController: AbortController | null = null
  const promptAbortController = new AbortController()
  const messageCosts = new Map<string, number>()
  let currentCost = 0

  const jobTimeoutMs = Number(process.env.EDIT_JOB_TIMEOUT_MS || 30 * 60 * 1000)
  const timeout = setTimeout(() => {
    jobLogger.error('Edit job timeout exceeded. Aborting session.')
    if (session) client.session.abort({ path: { id: session.id } }).catch(() => {})
    eventAbortController?.abort()
    promptAbortController.abort()
  }, jobTimeoutMs)

  try {
    // ── 1. Download the uploaded recording ─────────────────────────────────────
    const inputFileUrl: string = parameters?.inputFileUrl
    if (!inputFileUrl) throw new Error('Missing inputFileUrl in job parameters')

    const originalFileName: string = parameters?.originalFileName || 'recording.mp4'
    const ext = path.extname(originalFileName).toLowerCase() || '.mp4'
    const uploadPath = path.join(recordingsDir, `upload${ext}`)

    jobLogger.info({ inputFileUrl, uploadPath }, 'Downloading uploaded recording')
    await downloadFile(inputFileUrl, uploadPath)
    jobLogger.info({ size: fs.statSync(uploadPath).size }, 'Recording downloaded')

    // Fresh slate: the agent tools only auto-reset when the video path CHANGES,
    // and every edit job reuses this same path — so a stale demo-state.json from
    // a previous job (edit OR live demo) would leak events into this render.
    for (const stale of ['demo-state.json', 'edit-session.json']) {
      try {
        fs.unlinkSync(path.join(recordingsDir, stale))
      } catch {}
    }

    // ── 2. Run the recording-editor agent ──────────────────────────────────────
    await reportJobPhase(jobId, userId, 'edit_analysis', 'running', connection)

    const sessionResponse = await client.session.create({
      query: { directory: targetDir },
      body: { title: `Edit Job ${jobId} for user ${userId}` },
    })
    if (sessionResponse.error || !sessionResponse.data) {
      throw new Error(`Failed to create OpenCode session: ${JSON.stringify(sessionResponse.error)}`)
    }
    session = sessionResponse.data
    activeSessionsByJobId.set(jobId, session.id)
    jobLogger.info({ sessionId: session.id }, 'OpenCode session created')

    eventAbortController = new AbortController()
    const events = await client.event.subscribe({
      query: { directory: targetDir },
      signal: eventAbortController.signal,
    })

    const streamPromise = (async () => {
      try {
        for await (const event of events.stream) {
          const eventSessionId = getSessionIdFromEvent(event)
          if (eventSessionId && eventSessionId !== session!.id) continue

          const evt = event as any
          if (evt.type === 'message.part.updated' || evt.type === 'message.updated') {
            const info = evt.properties?.info || evt.properties
            if (info?.role === 'assistant') {
              const text =
                info?.content?.[0]?.text || info?.text || evt.properties?.part?.text || ''
              if (text) jobLogger.info({ text: text.slice(0, 200) }, 'LLM output')
            }
          }

          if (evt.type === 'call' || evt.call) {
            const call = evt.call || evt
            jobLogger.info({ tool: call.name || call.tool || 'unknown' }, 'Tool call started')
          }

          if (event.type === 'message.updated' && event.properties.info.role === 'assistant') {
            const msg = event.properties.info as any
            if (msg.cost !== undefined) {
              messageCosts.set(msg.id, msg.cost)
              currentCost = Array.from(messageCosts.values()).reduce((s, c) => s + c, 0)
            }
          }

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

    const videoFileForAgent = `recordings/upload${ext}`
    const promptText = buildEditPrompt({
      videoFile: videoFileForAgent,
      productName: parameters?.productName,
      productUrl: parameters?.productUrl,
      instructions: parameters?.instructions,
    })

    jobLogger.info('Sending edit prompt to OpenCode (agent: recording-editor)')
    const promptResponse = await client.session.prompt({
      path: { id: session.id },
      query: { directory: targetDir },
      body: {
        agent: 'recording-editor',
        parts: [{ type: 'text', text: promptText }],
      },
      signal: promptAbortController.signal,
    })

    if (promptResponse.error) {
      throw new Error(`OpenCode prompt failed: ${JSON.stringify(promptResponse.error)}`)
    }
    jobLogger.info('OpenCode prompt completed')

    // Ground-truth cost before draining the stream
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
      jobLogger.warn({ err }, 'Failed to fetch session messages for cost tracking')
    }

    eventAbortController.abort()
    await streamPromise

    if (currentCost > 0) {
      await db.updateJob(jobId, { cost: currentCost })
      jobLogger.info({ cost: currentCost }, 'Job cost updated')
    }

    // ── 3. Load the reconstructed demo-state.json ──────────────────────────────
    const statePath = path.join(recordingsDir, 'demo-state.json')
    if (!fs.existsSync(statePath)) {
      throw new Error('Agent did not produce recordings/demo-state.json')
    }
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    const zoomEvents = Array.isArray(state.zoomEvents) ? state.zoomEvents : []
    const clickEvents = Array.isArray(state.clickEvents) ? state.clickEvents : []
    jobLogger.info(
      { zoomEvents: zoomEvents.length, clickEvents: clickEvents.length },
      'Agent analysis complete — events reconstructed',
    )
    await reportJobPhase(jobId, userId, 'edit_analysis', 'completed', connection)

    // ── 4. Render: cursor fx + zoom/pan, source audio kept ─────────────────────
    await reportJobPhase(jobId, userId, 'edit_render', 'running', connection)

    const { fps: sourceFps, width: srcW, height: srcH } = await probeVideo(uploadPath)
    jobLogger.info({ sourceFps, srcW, srcH }, 'Probed uploaded recording')

    const rawVideo = path.join(recordingsDir, 'raw_edit.mp4')
    const trimmedVideo = path.join(recordingsDir, 'final_edit.mp4')
    const finalVideo = path.join(recordingsDir, 'final_edit_with_cards.mp4')

    // Unlike the AI-demo flow, an uploaded screen recording ALREADY contains the
    // user's real cursor — so we do NOT overlay a synthetic gliding cursor here
    // (that would double the pointer). clickEvents are still used downstream for
    // zoom targeting and to protect action moments from the smart trimmer.
    const videoInputs = `-i "${uploadPath}"`
    let filterComplex = ''
    let currentVLabel = '[0:v]'

    // The zoom math assumes a 1920x1080 frame (agent bboxes are in that space).
    // Letterbox-scale anything else up front so the camera lands right.
    if (srcW !== 1920 || srcH !== 1080) {
      filterComplex +=
        `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
        `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v_scaled];`
      currentVLabel = '[v_scaled]'
    }

    let finalVLabel = currentVLabel
    if (zoomEvents.length > 0) {
      filterComplex += buildContinuousZoomFilter(zoomEvents, 0, currentVLabel, sourceFps)
      finalVLabel = '[zoomedv]'
    }

    // Keep the original narration: re-encode the source track to the house
    // profile (AAC 24kHz mono). `-map 0:a?` tolerates audio-less uploads.
    const renderVideoArgs = await videoEncodeArgs({ quality: 18, cpuPreset: 'veryfast' })
    const ffmpegCmd =
      `ffmpeg -y ${videoInputs} ` +
      (filterComplex ? `-filter_complex "${filterComplex}" -map "${finalVLabel}" ` : `-map 0:v `) +
      `-map 0:a? ${renderVideoArgs} -c:a aac -ar 24000 -ac 1 "${rawVideo}"`

    jobLogger.info(
      { encoder: (await nvencAvailable()) ? 'h264_nvenc (GPU)' : 'libx264 (CPU)' },
      'Rendering camera moves + cursor over uploaded recording',
    )
    const renderT0 = Date.now()
    await execAsync(ffmpegCmd)
    jobLogger.info({ sec: ((Date.now() - renderT0) / 1000).toFixed(1) }, 'TIMING: edit render done')

    // ── 5. Smart trim (silencedetect fallback — no analytic narration spans) ───
    const trimT0 = Date.now()
    try {
      await processVideo(rawVideo, trimmedVideo)
      jobLogger.info({ sec: ((Date.now() - trimT0) / 1000).toFixed(1) }, 'TIMING: smart trim done')
    } catch (trimErr: any) {
      jobLogger.warn({ err: trimErr }, 'Smart trim failed — falling back to raw render')
      fs.copyFileSync(rawVideo, trimmedVideo)
    }
    await reportJobPhase(jobId, userId, 'edit_render', 'completed', connection)

    // ── 6. Intro/outro cards ───────────────────────────────────────────────────
    await reportJobPhase(jobId, userId, 'edit_cards', 'running', connection)
    try {
      const productUrl = parameters?.productUrl || ''
      const productDomain = productUrl.replace(/^https?:\/\//, '').split('/')[0]
      const productName =
        parameters?.productName ||
        productDomain
          .replace(/\.[a-z]+$/, '')
          .replace(/[^a-zA-Z0-9]/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
        path.basename(originalFileName, ext) ||
        'Demo'

      await addIntroOutro(trimmedVideo, finalVideo, {
        productName,
        duration: 2.5,
        fps: sourceFps,
        width: 1920,
        height: 1080,
        outputPath: finalVideo,
        productUrl: productDomain || undefined,
      })
    } catch (cardErr: any) {
      jobLogger.warn({ err: cardErr }, 'Final assembly failed — using trimmed video as final')
      fs.copyFileSync(trimmedVideo, finalVideo)
    }
    await reportJobPhase(jobId, userId, 'edit_cards', 'completed', connection)

    // ── 7. Upload result ───────────────────────────────────────────────────────
    await reportJobPhase(jobId, userId, 'edit_upload', 'running', connection)
    await pushJobResult(jobId, userId, finalVideo, rawVideo, connection, parameters)
    await reportJobPhase(jobId, userId, 'edit_upload', 'completed', connection)

    for (const f of [rawVideo, trimmedVideo]) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
    jobLogger.info('Edit-recording job successfully complete!')
  } catch (error: any) {
    jobLogger.error({ err: error }, 'Failed to process edit job')
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
          p.status === 'running'
            ? { ...p, status: 'failed', completedAt: new Date().toISOString() }
            : p,
        )
      }

      const failedJob = await db.updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error.message || 'Recording edit failed',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      await db.addCredits(userId, EDIT_CREDIT_COST, 'refund', 'Refund: Recording edit failed', {
        jobId,
      })

      const userProfile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
      const email = userProfile?.email || userId
      await sendDiscordMessage(
        `❌ **Recording Edit Failed**\nJob ID: \`${jobId}\`\nUser: ${email}\nError: ${error.message}`,
      )
      if (userProfile?.email) {
        await sendJobFailedEmail({
          to: userProfile.email,
          firstName: userProfile.firstName,
          jobId,
          kind: 'recording-edit',
          error: error.message,
          refundedCredits: EDIT_CREDIT_COST,
        })
      }
    } catch (cleanupErr: any) {
      jobLogger.error({ err: cleanupErr }, 'Failed to handle edit job failure cleanup')
    }
  } finally {
    clearTimeout(timeout)
    activeSessionsByJobId.delete(jobId)
  }
}
