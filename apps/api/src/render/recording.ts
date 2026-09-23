/**
 * recording — the browser recording lifecycle for demo-video projects.
 *
 * Start the user's CloakBrowser profile (1920x1080, headed on its own
 * display), hand the agent a driver for its pages, start the capture and
 * write demo-config.json — the handoff contract the demo tools read
 * (`{ startTime, voiceName, assetsManifestPath?, storyboard? }`).
 *
 * The browser, the capture and the agent's driver share one Playwright
 * context in this process. Several projects record at once; each has its own
 * browser, so nothing is shared between them.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as db from '@saas/db'
import type { Logger, VideoStoryboard } from '@saas/shared'
import { createLogger } from '@saas/shared'
import { downloadStorageState, uploadStorageState } from '@saas/storage'
import { getMediaDurationSec } from './media.js'
import { type AssetInput, type AssetManifest, prepareAssets } from './utils/assets.js'
import { type BrowserCapture, startBrowserCapture } from './utils/browser-capture.js'
import { type BrowserDriver, createBrowserDriver } from './utils/browser-driver.js'
import { type CloakBrowserHandle, startCloakBrowser, withTimeout } from './utils/cloak-browser.js'
import { type CursorRecording, installRecordingCursor } from './utils/recording-cursor.js'

const moduleLogger = createLogger('studio:render:recording')

export interface StartRecordingInput {
  userId: string
  workspaceDir: string
  /** TTS voice for the demo tools (demo-config.json voiceName); default "Charon". */
  voice?: string
  /** Manifest written by prepareDemoAssets, when the project has PDFs/images. */
  assetsManifestPath?: string
  /** Approved storyboard supplying persistent slide overlays. */
  storyboard?: VideoStoryboard
  /** Stable public stream id, normally the owning project id. */
  streamId: string
  signal?: AbortSignal
}

export interface RecordingHandle {
  /** The event clock anchor every demo-tools timestamp is measured against. */
  startTime: number
  streamId: string
  recording: boolean
  /** The agent's hands on this browser (pitch demo browser). */
  driver: BrowserDriver
  startCapture: (
    config?: Pick<StartRecordingInput, 'voice' | 'assetsManifestPath' | 'storyboard'>,
  ) => Promise<void>
  /** Stops the capture and closes the browser. */
  stop: () => Promise<void>
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
  const recDir = recordingDir(workspaceDir)
  fs.mkdirSync(recDir, { recursive: true })
  fs.mkdirSync(path.join(recDir, 'audio'), { recursive: true })
  const videoPath = path.join(recDir, 'demo.mkv')

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
  let capture: BrowserCapture | undefined
  try {
    // Capture actual input without painting into the page. Source assembly
    // composites the cursor later, on the same first-frame clock as narration.
    let cursor: CursorRecording | undefined
    const driver = createBrowserDriver(cloakBrowser.context, workspaceDir)
    let startTime = 0
    let recording = false
    const startCapture: RecordingHandle['startCapture'] = async config => {
      if (recording) return
      Object.assign(input, config)
      // Keep the previous take and its events. Audio clips have unique names and
      // stay at their original paths, so archived state still resolves them.
      const masters = ['demo.mkv', 'demo.mkv.capture.mkv', 'demo.webm']
      if (masters.some(name => fs.existsSync(path.join(recDir, name)))) {
        const archive = path.join(recDir, 'takes', `${Date.now()}`)
        fs.mkdirSync(archive, { recursive: true })
        for (const name of [
          ...masters,
          'demo-state.json',
          'demo-config.json',
          'cursor.json',
          'capture-status.json',
        ]) {
          const file = path.join(recDir, name)
          if (fs.existsSync(file)) fs.copyFileSync(file, path.join(archive, name))
        }
        for (const name of masters) fs.rmSync(path.join(recDir, name), { force: true })
      }
      logger.info({ videoPath }, 'Starting video recording...')
      cursor ??= await installRecordingCursor(cloakBrowser.context)
      capture = await startBrowserCapture(cloakBrowser.context, videoPath, input.signal, {
        recorder: cursor,
        file: path.join(recDir, 'cursor.json'),
      })
      startTime = capture.startTime
      recording = true
      fs.writeFileSync(
        path.join(recDir, 'capture-status.json'),
        JSON.stringify({ state: 'recording', startTime }),
      )
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
            videoStartTime: startTime,
            videoFile: 'recording/demo.mkv',
            cursor: 'recording/cursor.json',
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
    const stopRecording = async () => {
      logger.info('Stopping video recording and closing the browser...')
      const stoppedAtMs = Date.now()
      try {
        if (!recording) return
        await capture!.stop()
        if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size <= 0)
          throw new Error(`Recording did not produce ${videoPath}.`)
        assertRecordingCoversTimeline(await getMediaDurationSec(videoPath), startTime, stoppedAtMs)
        fs.writeFileSync(
          path.join(recDir, 'capture-status.json'),
          JSON.stringify({ state: 'complete', startTime, endTime: stoppedAtMs }),
        )
      } catch (error) {
        fs.writeFileSync(
          path.join(recDir, 'capture-status.json'),
          JSON.stringify({
            state: 'failed',
            startTime,
            endTime: stoppedAtMs,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        throw error
      } finally {
        recording = false
        await closeBrowser().catch(() => {})
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
      get recording() {
        return recording
      },
      startCapture,
      driver,
      streamId: cloakBrowser.streamId,
      stop,
    }
  } catch (err) {
    // Setup failed: stop the browser so the user's session isn't left running.
    await capture?.stop().catch(() => {})
    await closeBrowser().catch(() => {})
    throw err
  }
}
