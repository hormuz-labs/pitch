/**
 * media — small ffprobe/ffmpeg helpers shared by the render pipelines.
 *
 * Lifted verbatim from the old worker (job-processor.ts / edit-job-processor.ts)
 * so the demo and recording-edit renders keep their exact behaviour. Pure
 * filesystem + ffmpeg; no queue, DB or storage access.
 */

import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
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
export async function detectFirstContentSec(webmPath: string): Promise<number> {
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
 * Locate and combine recorded WebM file(s).
 * If multiple .webm files exist in the search directory, we chronologically combine them.
 */
export async function resolveAndCombineWebmFiles(
  expectedPath: string,
  searchDir: string,
  logger: Logger,
  recordingStartedAtMs?: number,
): Promise<string> {
  const candidates: string[] = []
  function search(dir: string, depth: number) {
    if (depth > 3) return
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // Never descend into hidden dirs: .playwright-cli/traces holds the
          // CLI's OWN screencast of the session, and combining it with the
          // video-start recording duplicates the whole demo in one webm.
          if (entry.name.startsWith('.')) continue
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

  // Only files modified after this job's recording started can belong to the
  // current session — anything older is a stale chunk from an earlier (failed)
  // attempt that never got cleaned up. Combining those in shifts the timeline
  // (and the mtime-derived birth time) and desyncs every overlay and clip.
  const minMtimeMs = recordingStartedAtMs ? recordingStartedAtMs - 30_000 : 0
  const uniqueCandidates = Array.from(new Set(candidates)).filter(f => {
    try {
      const st = fs.statSync(f)
      if (st.size <= 0) return false
      if (st.mtimeMs < minMtimeMs) {
        logger.info(
          { file: f, mtime: new Date(st.mtimeMs).toISOString() },
          'Skipping stale WebM chunk from an earlier run',
        )
        return false
      }
      return true
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
export function findWebmCandidates(logger: Logger, targetDir: string): string | null {
  const candidates: Array<{ path: string; mtimeMs: number }> = []
  const searchRoots = [targetDir]

  for (const root of searchRoots) {
    try {
      function search(dir: string, depth: number) {
        if (depth > 3) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            // Skip hidden dirs — see resolveAndCombineWebmFiles (the
            // .playwright-cli/traces screencast must never be picked up).
            if (entry.name.startsWith('.')) continue
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
  return candidates[0]!.path
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
