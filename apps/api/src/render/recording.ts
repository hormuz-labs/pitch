/**
 * recording — the browser recording lifecycle for demo-video projects.
 *
 * Lifted from steps 1–3 (and the stop half of step 8) of the old worker
 * (apps/worker/src/job-processor.ts): start the user's CloakBrowser profile
 * through the manager, attach playwright-cli to its CDP endpoint, resize the
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
import type { Logger, VideoStoryboard } from '@saas/shared'
import { createLogger } from '@saas/shared'
import { execAsync } from './media.js'
import { type AssetInput, type AssetManifest, prepareAssets } from './utils/assets.js'
import { type ManagerBrowserHandle, startManagerBrowser } from './utils/manager-browser.js'

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
  /** TTS voice for the demo tools (demo-config.json voiceName); default "Puck". */
  voice?: string
  /** Manifest written by prepareDemoAssets, when the project has PDFs/images. */
  assetsManifestPath?: string
  /** Approved storyboard supplying persistent slide overlays. */
  storyboard?: VideoStoryboard
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
  profileId: string
  cdpUrl: string
  /** Stops the screencast, closes the playwright session and the manager browser. */
  stop: () => Promise<void>
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

  // Clean up any old demo.webm files in the workspace and videoDir before starting
  for (const dirToClean of [workspaceDir, videoDir]) {
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

  // Close any pre-existing session under this name to ensure a fresh session
  await execAsync(`${cli} close`, { cwd: workspaceDir }).catch(() => {})

  // 1. Start CloakBrowser via Manager and establish CDP Proxy
  const managerBrowser: ManagerBrowserHandle = await startManagerBrowser(userId)

  try {
    // 2. Attach playwright-cli and start video recording BEFORE prompting the LLM
    logger.info(
      { cdpUrl: managerBrowser.cdpUrl, session },
      'Attaching playwright-cli to manager CDP',
    )
    // Retry playwright-cli attach with backoff — the WS endpoint may need a moment
    // to become fully ready even after the HTTP /json/version check passes.
    {
      const maxAttempts = 4
      const retryDelayMs = 3000
      let lastAttachError: Error | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await execAsync(`${cli} attach --cdp ${managerBrowser.cdpUrl}`, { cwd: workspaceDir })
          lastAttachError = undefined
          break
        } catch (err) {
          lastAttachError = err instanceof Error ? err : new Error(String(err))
          logger.warn(
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
    const resizeResult = await execAsync(`${cli} resize 1920 1080`, { cwd: workspaceDir })
    logger.info(
      { stdout: resizeResult.stdout, stderr: resizeResult.stderr },
      'playwright-cli resize output',
    )

    logger.info({ webmPath }, 'Starting video recording...')
    // Remember when this project's recording began so the post-run WebM sweep
    // can ignore stale chunks left behind by earlier (failed) attempts.
    const startedAtMs = Date.now()
    const videoStartResult = await execAsync(`${cli} video-start "${webmPath}" --size=1920x1080`, {
      cwd: workspaceDir,
    })
    logger.info(
      { stdout: videoStartResult.stdout, stderr: videoStartResult.stderr },
      'playwright-cli video-start output',
    )

    const startTime = Date.now()
    logger.info(`startTime captured: ${new Date(startTime).toISOString()}`)

    // Write config so the demo-generator tools know the startTime (event clock
    // anchor) and which TTS voice to use. Skills are NOT bound here anymore —
    // the agent reads them itself (they are listed in its system prompt).
    const configPath = path.join(recDir, 'demo-config.json')
    const voiceName = (input.voice || 'Puck').toString().replace(/\.mp3$/i, '')
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          startTime,
          voiceName,
          assetsManifestPath: input.assetsManifestPath,
          storyboard: input.storyboard,
        },
        null,
        2,
      ),
    )

    // 8. Gracefully close browser and stop recording
    const stopRecording = async () => {
      logger.info('Stopping video recording and playwright session...')
      try {
        const videoStopResult = await execAsync(`${cli} video-stop`, { cwd: workspaceDir })
        logger.info(
          { stdout: videoStopResult.stdout, stderr: videoStopResult.stderr },
          'playwright-cli video-stop output',
        )
      } catch (e) {
        logger.warn({ err: e }, 'Failed to stop video recording gracefully')
      }

      // Diagnostic dump of the recording directory after recording stopped
      try {
        const { stdout: lsStdout } = await execAsync(
          `find "${videoDir}" -maxdepth 3 -type f \\( -name "*.webm" -o -name "*.mp4" \\) -printf "%T@ %p\\n" | sort -n`,
          { cwd: videoDir },
        )
        logger.info({ files: lsStdout.trim() }, 'Video files in recording directory after stop')
      } catch (e) {
        logger.warn({ err: e }, 'Failed to list workspace files')
      }
      try {
        await execAsync(`${cli} close`, { cwd: workspaceDir })
      } catch (_e) {}

      // Clean up CDP Proxy and stop the manager profile
      try {
        await managerBrowser.close()
      } catch (_e) {}
    }

    let stopped: Promise<void> | null = null
    const stop = () => {
      // Idempotent: a second stop() (e.g. from an error path after a normal stop)
      // shares the first one's work instead of re-issuing the commands.
      if (!stopped) stopped = stopRecording()
      return stopped
    }

    return {
      startTime,
      startedAtMs,
      webmPath,
      videoDir,
      session,
      profileId: managerBrowser.profileId,
      cdpUrl: managerBrowser.cdpUrl,
      stop,
    }
  } catch (err) {
    // Attach/resize/video-start failed: shut down the CDP proxy and stop the
    // manager profile so the user's browser isn't left running.
    try {
      await execAsync(`${cli} close`, { cwd: workspaceDir })
    } catch (_e) {}
    try {
      await managerBrowser.close()
    } catch (_e) {}
    throw err
  }
}
