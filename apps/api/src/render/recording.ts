/**
 * recording — the browser recording lifecycle for demo-video projects.
 *
 * Lifted from steps 1–3 (and the stop half of step 8) of the old worker
 * (apps/worker/src/job-processor.ts): start the user's CloakBrowser profile,
 * attach playwright-cli to its local CDP endpoint, resize the
 * viewport, start the WebM screencast and write demo-config.json — the handoff
 * contract the demo tools read (`{ startTime, voiceName, assetsManifestPath?,
 * storyboard? }`).
 *
 * Every playwright-cli invocation is session-scoped (`-s=<session>`, the
 * project's workspace basename) so several projects can record concurrently,
 * and runs with `cwd: workspaceDir` so demo.webm, snapshots and traces land in
 * the workspace rather than the studio process cwd. The demo tools use the same
 * session name (PLAYWRIGHT_CLI_SESSION) for every command they issue.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as db from '@saas/db'
import type { Logger, VideoStoryboard } from '@saas/shared'
import { createLogger } from '@saas/shared'
import { downloadStorageState, uploadStorageState } from '@saas/storage'
import { assertBrowserCommandSucceeded } from '../../../../.pi/lib/demo-timing.ts'
import { execAsync, getMediaDurationSec } from './media.js'
import { type AssetInput, type AssetManifest, prepareAssets } from './utils/assets.js'
import { type CloakBrowserHandle, startCloakBrowser, withTimeout } from './utils/cloak-browser.js'

const moduleLogger = createLogger('studio:render:recording')

/** playwright-cli session names: what .pi/cli/demo.ts accepts in PLAYWRIGHT_CLI_SESSION. */
const SESSION_NAME_RE = /^[a-zA-Z0-9_.-]+$/

export function sanitizeSessionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export interface StartRecordingInput {
  userId: string
  workspaceDir: string
  /** playwright-cli session name; defaults to the workspace basename. */
  session?: string
  /** TTS voice for the demo tools (demo-config.json voiceName); default "Charon". */
  voice?: string
  /** Manifest written by prepareDemoAssets, when the project has PDFs/images. */
  assetsManifestPath?: string
  /** Approved storyboard supplying persistent slide overlays. */
  storyboard?: VideoStoryboard
  /** Stable public stream id, normally the owning project id. */
  streamId: string
  signal?: AbortSignal
  /** Open a rehearsal browser; startCapture begins the take in this same session. */
  deferCapture?: boolean
}

export interface RecordingHandle {
  /** The event clock anchor every demo-tools timestamp is measured against. */
  startTime: number
  /** When video-start ran (for the post-run stale-chunk sweep). */
  startedAtMs: number
  /** Expected recording path: <workspaceDir>/recording/demo.webm */
  webmPath: string
  /** Where playwright-cli writes chunks (the recording dir). */
  videoDir: string
  /** The playwright-cli session name used for every command. */
  session: string
  streamId: string
  cdpUrl: string
  recording: boolean
  startCapture: (
    config?: Pick<StartRecordingInput, 'voice' | 'assetsManifestPath' | 'storyboard'>,
  ) => Promise<void>
  /** Stops the screencast, closes the playwright session and its browser. */
  stop: () => Promise<void>
}

const RECORDING_STOP_TIMEOUT_MS = 60_000

export function recoverRecordingArtifact(
  workspaceDir: string,
  expectedPath: string,
  startedAtMs: number,
): string {
  if (fs.existsSync(expectedPath) && fs.statSync(expectedPath).size > 0) return expectedPath

  const tracesDir = path.join(workspaceDir, '.playwright-cli', 'traces')
  const candidates = fs.existsSync(tracesDir)
    ? fs
        .readdirSync(tracesDir)
        .filter(name => name.endsWith('.webm'))
        .map(name => path.join(tracesDir, name))
        .filter(file => {
          const stat = fs.statSync(file)
          return stat.size > 0 && stat.mtimeMs >= startedAtMs
        })
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : []

  if (candidates.length !== 1) {
    throw new Error(
      `Recording did not produce ${expectedPath}; found ${candidates.length} current trace candidate(s).`,
    )
  }
  fs.copyFileSync(candidates[0]!, expectedPath)
  if (fs.statSync(expectedPath).size <= 0) throw new Error('Recovered recording is empty.')
  return expectedPath
}

export function assertRecordingCoversTimeline(
  durationSec: number,
  startTimeMs: number,
  endTimeMs: number,
): void {
  const expectedSec = Math.max(0, (endTimeMs - startTimeMs) / 1000)
  const toleranceSec = Math.max(5, expectedSec * 0.05)
  if (!(durationSec > 0) || durationSec + toleranceSec < expectedSec) {
    throw new Error(
      `Recording is incomplete: captured ${durationSec.toFixed(1)}s of ${expectedSec.toFixed(1)}s. Please record a fresh take.`,
    )
  }
}

export function recordingDir(workspaceDir: string): string {
  return path.join(workspaceDir, 'recording')
}

/**
 * Prepare PDFs/images before the browser starts recording. The manifest
 * (<workspaceDir>/recording/assets/assets.json) is the only handoff to the
 * agent tools; pass its path to startRecording so demo-config.json carries it.
 */
export async function prepareDemoAssets(
  workspaceDir: string,
  assets: AssetInput[],
): Promise<{ manifest: AssetManifest; manifestPath: string }> {
  const assetsDir = path.join(recordingDir(workspaceDir), 'assets')
  const manifest = await prepareAssets(path.basename(workspaceDir), assets, assetsDir)
  return { manifest, manifestPath: path.join(assetsDir, 'assets.json') }
}

export async function startRecording(
  input: StartRecordingInput,
  logger: Logger = moduleLogger,
): Promise<RecordingHandle> {
  const { userId, workspaceDir } = input
  const rawSession = input.session ?? path.basename(workspaceDir)
  const session = sanitizeSessionName(rawSession)
  if (!session || !SESSION_NAME_RE.test(session)) {
    throw new Error(`Invalid playwright-cli session name: ${rawSession}`)
  }
  const cli = `playwright-cli -s=${session}`

  const recDir = recordingDir(workspaceDir)
  fs.mkdirSync(recDir, { recursive: true })
  fs.mkdirSync(path.join(recDir, 'audio'), { recursive: true })

  // Determine the directory where the video should be recorded
  const videoDir = recDir
  const webmPath = path.join(videoDir, 'demo.webm')

  // Close any pre-existing session under this name to ensure a fresh session
  await execAsync(`${cli} close`, { cwd: workspaceDir }).catch(() => {})

  // Start a headed CloakBrowser on an isolated Xvfb display. Its CDP and VNC
  // ports stay on loopback; the API exposes only the authenticated RFB bridge.
  const profile = await db.getOrCreateBrowserProfile(userId)
  await fs.promises.mkdir(profile.profileDir, { recursive: true })
  const storageStatePath = path.join(profile.profileDir, 'storage_state.json')
  await downloadStorageState(userId, storageStatePath).catch(() => false)
  const cloakBrowser: CloakBrowserHandle = await startCloakBrowser({
    streamId: input.streamId,
    profileDir: path.join(profile.profileDir, input.streamId),
    storageStatePath: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
    fingerprintIdentity: userId,
    signal: input.signal,
  })
  let statePersisted = false
  const persistBrowserState = async () => {
    if (statePersisted) return
    const state = await withTimeout(
      'browser state capture',
      cloakBrowser.context.storageState({ path: storageStatePath, indexedDB: true }),
      10_000,
    )
    const origins = Array.from(
      new Set([
        ...state.origins.map(origin => origin.origin),
        ...state.cookies.map(
          cookie => `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}`,
        ),
      ]),
    )
    const key = await uploadStorageState(storageStatePath, userId)
    await db.recordLoggedInOrigins(userId, origins, { storageStateKey: key })
    statePersisted = true
  }
  const closeBrowser = async () => {
    await persistBrowserState().catch(err =>
      logger.warn({ err, userId }, 'Failed to persist browser authentication state'),
    )
    await cloakBrowser.close()
    await fs.promises.rm(path.join(profile.profileDir, input.streamId), {
      recursive: true,
      force: true,
    })
  }
  try {
    // 2. Attach playwright-cli and start video recording BEFORE prompting the LLM
    logger.info(
      { cdpUrl: cloakBrowser.cdpUrl, session },
      'Attaching playwright-cli to local CloakBrowser CDP',
    )
    // Retry playwright-cli attach with backoff — the WS endpoint may need a moment
    // to become fully ready even after the HTTP /json/version check passes.
    {
      const maxAttempts = 4
      const retryDelayMs = 3000
      let lastAttachError: Error | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await execAsync(`${cli} attach --cdp ${cloakBrowser.cdpUrl}`, { cwd: workspaceDir })
          lastAttachError = undefined
          break
        } catch (err) {
          lastAttachError = err instanceof Error ? err : new Error(String(err))
          logger.warn(
            { attempt, maxAttempts, cdpUrl: cloakBrowser.cdpUrl, err: lastAttachError.message },
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
    const resizeResult = assertBrowserCommandSucceeded(
      await execAsync(`${cli} resize 1920 1080`, { cwd: workspaceDir }),
    )
    logger.info(
      { stdout: resizeResult.stdout, stderr: resizeResult.stderr },
      'playwright-cli resize output',
    )

    let startedAtMs = 0
    let startTime = 0
    let recording = false
    const startCapture: RecordingHandle['startCapture'] = async config => {
      if (recording) return
      Object.assign(input, config)
      // Keep the previous take and its events. Audio clips have unique names and
      // stay at their original paths, so archived state still resolves them.
      if (fs.existsSync(webmPath)) {
        const archive = path.join(recDir, 'takes', `${Date.now()}`)
        fs.mkdirSync(archive, { recursive: true })
        for (const name of ['demo.webm', 'demo-state.json', 'demo-config.json']) {
          const file = path.join(recDir, name)
          if (fs.existsSync(file)) fs.copyFileSync(file, path.join(archive, name))
        }
        fs.unlinkSync(webmPath)
      }
      logger.info({ webmPath }, 'Starting video recording...')
      startedAtMs = Date.now()
      const result = assertBrowserCommandSucceeded(
        await execAsync(`${cli} video-start "${webmPath}" --size=1920x1080`, { cwd: workspaceDir }),
      )
      logger.info(result, 'playwright-cli video-start output')
      startTime = Date.now()
      recording = true
      for (const name of [
        'demo-state.json',
        'slideshow-progress.json',
        'pending-grounding.json',
        'browser.json',
      ]) {
        fs.rmSync(path.join(recDir, name), { force: true })
      }
      fs.writeFileSync(
        path.join(recDir, 'demo-config.json'),
        JSON.stringify(
          {
            startTime,
            voiceName: (input.voice || 'Charon').toString().replace(/\.mp3$/i, ''),
            assetsManifestPath: input.assetsManifestPath,
            storyboard: input.storyboard,
          },
          null,
          2,
        ),
      )
      logger.info(`startTime captured: ${new Date(startTime).toISOString()}`)
    }
    if (!input.deferCapture) await startCapture()

    // 8. Gracefully close browser and stop recording
    const stopRecording = async () => {
      logger.info('Stopping video recording and playwright session...')
      const stoppedAtMs = Date.now()
      try {
        if (!recording) return
        try {
          const videoStopResult = await execAsync(`${cli} video-stop`, {
            cwd: workspaceDir,
            timeout: RECORDING_STOP_TIMEOUT_MS,
            killSignal: 'SIGKILL',
          })
          logger.info(
            { stdout: videoStopResult.stdout, stderr: videoStopResult.stderr },
            'playwright-cli video-stop output',
          )
        } catch (e) {
          logger.warn({ err: e }, 'Failed to stop video recording gracefully')
        }

        recoverRecordingArtifact(workspaceDir, webmPath, startedAtMs)
        assertRecordingCoversTimeline(await getMediaDurationSec(webmPath), startTime, stoppedAtMs)
      } finally {
        recording = false
        try {
          await execAsync(`${cli} close`, {
            cwd: workspaceDir,
            timeout: 15_000,
            killSignal: 'SIGKILL',
          })
        } catch (_e) {}
        try {
          await closeBrowser()
        } catch (_e) {}
      }
    }

    let stopped: Promise<void> | null = null
    const stop = () => {
      // Idempotent: a second stop() (e.g. from an error path after a normal stop)
      // shares the first one's work instead of re-issuing the commands.
      if (!stopped) stopped = stopRecording()
      return stopped
    }

    return {
      get startTime() {
        return startTime
      },
      get startedAtMs() {
        return startedAtMs
      },
      get recording() {
        return recording
      },
      startCapture,
      webmPath,
      videoDir,
      session,
      streamId: cloakBrowser.streamId,
      cdpUrl: cloakBrowser.cdpUrl,
      stop,
    }
  } catch (err) {
    // Attach/resize/video-start failed: shut down the CDP proxy and stop the
    // browser process so the user's session isn't left running.
    try {
      await execAsync(`${cli} close`, { cwd: workspaceDir })
    } catch (_e) {}
    try {
      await closeBrowser()
    } catch (_e) {}
    throw err
  }
}
