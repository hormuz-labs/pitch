/**
 * media — small ffprobe/ffmpeg helpers shared by the render pipelines.
 *
 * Filesystem + ffmpeg; no queue, DB or storage access.
 */

import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import { promisify } from 'node:util'
import { createLogger, type Logger } from '@saas/shared'
import { hostActionSignal } from '../studio/host-actions.js'

const runExec = promisify(exec)
export const execAsync = (command: string, options: Record<string, any> = {}) =>
  runExec(command, { ...options, signal: options.signal ?? hostActionSignal() })
const moduleLogger = createLogger('studio:render:media')

export async function getMediaDurationSec(file: string): Promise<number> {
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

/** Frame rates a render can be asked for. */
export const RENDER_FPS = [30, 60] as const

/**
 * The frame rate a render is encoded at. The default is the recording's own;
 * asking for 60 makes the zoom/pan camera and the title cards move at 60
 * (the source frames are repeated), which is what "60fps" means for a screen
 * recording that was captured at 30.
 */
export function outputFps(requested: unknown, source: number): number {
  const n = Number(requested)
  return (RENDER_FPS as readonly number[]).includes(n) ? n : source
}

export async function getSourceFps(
  webmPath: string,
  logger: Logger = moduleLogger,
): Promise<number> {
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

export async function getVideoBirthTimeMs(
  webmPath: string,
  logger: Logger = moduleLogger,
): Promise<number | null> {
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

export async function probeVideo(
  file: string,
): Promise<{ fps: number; width: number; height: number }> {
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
