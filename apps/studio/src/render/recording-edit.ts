/**
 * recording-edit — render an "edit my recording" project.
 *
 * The user uploads a narrated screen recording; the recording-editor agent
 * reconstructs demo-state.json from it (zoom + click events), and this renders
 * the result through the SAME ffmpeg chain the live demo flow uses
 * (zoom/pan → smart trim → intro/outro), with two differences:
 *
 *   1. No trimSec — agent events are already in the uploaded video's own timeline.
 *   2. The source audio (the user's narration) is kept and re-encoded to the house
 *      profile instead of being replaced by a TTS mix. Dead-air trimming falls
 *      back to silencedetect since there are no analytic narration spans.
 *
 * Reproduces steps 4–6 of the old worker (apps/worker/src/edit-job-processor.ts)
 * as a pure function; the caller uploads `finalPath` and deletes `rawPath`.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Logger } from '@saas/shared'
import { execAsync, getMediaDurationSec, probeVideo } from './media.js'
import type { Beat } from './utils/beats.js'
import type { ClickEvent } from './utils/cursor-fx.js'
import { nvencAvailable, videoEncodeArgs } from './utils/encoder.js'
import { addIntroOutro, planTitleCards } from './utils/intro-outro.js'
import { mapThroughKeptSegments, processVideo, type Segment } from './utils/smart_trim.js'
import { buildContinuousZoomFilter, type ZoomEvent } from './utils/zoom-filter.js'

/** Parsed demo-state.json as reconstructed by the recording-editor agent. */
export interface RecordingEditState {
  zoomEvents?: ZoomEvent[]
  clickEvents?: ClickEvent[]
  [key: string]: unknown
}

export interface RenderRecordingEditInput {
  workspaceDir: string
  /** The uploaded recording on disk (any container ffmpeg can read). */
  uploadPath: string
  state: RecordingEditState
  options: { productName?: string; productUrl?: string }
  /** <workspaceDir>/renders */
  outDir: string
  /**
   * Narration spans on the UPLOAD's timeline (whisper transcript segments).
   * They come back mapped onto the finished cut so the studio can address them.
   */
  narration?: Array<{ start: number; dur: number; text?: string }>
}

export interface RenderRecordingEditResult {
  finalPath: string
  rawPath: string
  durationSec: number
  /** Narration beats on the FINAL timeline (empty without a transcript). */
  beats: Beat[]
}

export async function renderRecordingEdit(
  input: RenderRecordingEditInput,
  logger: Logger,
): Promise<RenderRecordingEditResult> {
  const { uploadPath, outDir } = input
  const options = input.options ?? {}
  fs.mkdirSync(outDir, { recursive: true })

  const zoomEvents = Array.isArray(input.state?.zoomEvents) ? input.state.zoomEvents : []
  const clickEvents = Array.isArray(input.state?.clickEvents) ? input.state.clickEvents : []
  logger.info(
    { zoomEvents: zoomEvents.length, clickEvents: clickEvents.length },
    'Rendering reconstructed events over the uploaded recording',
  )

  // ── 4. Render: zoom/pan, source audio kept ─────────────────────────────────
  const { fps: sourceFps, width: srcW, height: srcH } = await probeVideo(uploadPath)
  logger.info({ sourceFps, srcW, srcH }, 'Probed uploaded recording')

  const stamp = Date.now()
  const rawVideo = path.join(outDir, 'raw.mp4')
  const trimmedVideo = path.join(outDir, `__trimmed_${stamp}.mp4`)
  const finalVideo = path.join(outDir, `edit-${stamp}.mp4`)

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

  logger.info(
    { encoder: (await nvencAvailable()) ? 'h264_nvenc (GPU)' : 'libx264 (CPU)' },
    'Rendering camera moves + cursor over uploaded recording',
  )
  const renderT0 = Date.now()
  await execAsync(ffmpegCmd)
  logger.info({ sec: ((Date.now() - renderT0) / 1000).toFixed(1) }, 'TIMING: edit render done')

  // ── 5. Smart trim (silencedetect fallback — no analytic narration spans) ───
  const trimT0 = Date.now()
  // The spans the trim kept, so narration beats can be placed on the final cut.
  let keptSpans: Segment[] = []
  try {
    keptSpans = await processVideo(rawVideo, trimmedVideo)
    logger.info({ sec: ((Date.now() - trimT0) / 1000).toFixed(1) }, 'TIMING: smart trim done')
  } catch (trimErr: any) {
    logger.warn({ err: trimErr }, 'Smart trim failed — falling back to raw render')
    fs.copyFileSync(rawVideo, trimmedVideo)
    keptSpans = [{ start: 0, end: await getMediaDurationSec(rawVideo) }]
  }

  // ── 6. Intro/outro cards ───────────────────────────────────────────────────
  // Where the recording starts in the finished file (0 with no intro card).
  let contentStartSec = 0
  try {
    const productUrl = options.productUrl || ''
    const productDomain = productUrl.replace(/^https?:\/\//, '').split('/')[0]!
    const ext = path.extname(uploadPath)
    const productName =
      options.productName ||
      productDomain
        .replace(/\.[a-z]+$/, '')
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
      path.basename(uploadPath, ext) ||
      'Demo'

    const cardConfig = {
      productName,
      duration: 2.5,
      fps: sourceFps,
      width: 1920,
      height: 1080,
      outputPath: finalVideo,
      productUrl: productDomain || undefined,
    }
    contentStartSec = planTitleCards(cardConfig).contentStartSec
    await addIntroOutro(trimmedVideo, finalVideo, cardConfig)
  } catch (cardErr: any) {
    logger.warn({ err: cardErr }, 'Final assembly failed — using trimmed video as final')
    fs.copyFileSync(trimmedVideo, finalVideo)
  }

  // Drop the trimmed intermediate; raw.mp4 stays for the caller to upload/delete.
  try {
    fs.unlinkSync(trimmedVideo)
  } catch {}

  const durationSec = await getMediaDurationSec(finalVideo)

  // The transcript is on the upload's timeline, which the zoom/pan pass leaves
  // untouched; only the trim and the intro card move things, so map through both.
  const beats: Beat[] = (input.narration ?? []).map(n => ({
    start: contentStartSec + mapThroughKeptSegments(n.start, keptSpans),
    dur: n.dur,
    text: n.text,
    type: 'narration',
  }))
  logger.info(
    { finalVideo, durationSec, beats: beats.length },
    'Edit-recording render successfully complete!',
  )

  return { finalPath: finalVideo, rawPath: rawVideo, durationSec, beats }
}
