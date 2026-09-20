/**
 * demo — the post-recording ffmpeg pipeline for demo videos.
 *
 * Reproduces step "9. Post-Process Video & Audio" through the intro/outro
 * assembly of the old worker (apps/worker/src/job-processor.ts) as a pure
 * function: resolve/combine the WebM, gliding cursor overlay, continuous zoom
 * filter, narration/SFX mix, raw render, leading-silence trim, smart trim,
 * decorative background, title cards, dynamic browser-chrome header segments,
 * final assembly, cleanup of intermediates. No queue/DB/storage — the caller
 * uploads `finalPath` and deletes `rawPath` afterwards.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Logger, VideoStoryboard } from '@saas/shared'
import {
  detectFirstContentSec,
  execAsync,
  findWebmCandidates,
  getMediaDurationSec,
  getMediaStreamDurations,
  getSourceFps,
  getVideoBirthTimeMs,
  outputFps,
  resolveAndCombineWebmFiles,
} from './media.js'
import { resolveBackgroundAsset, shapeRadius } from './utils/background.js'
import type { Beat } from './utils/beats.js'
import { type BrowserHeaderMode, renderBrowserChromePng } from './utils/browser-chrome.js'
import { buildGlidingCursorChain, type ClickEvent } from './utils/cursor-fx.js'
import { appendEncoderFilter, videoEncodePlan } from './utils/encoder.js'
import {
  addIntroOutro,
  type BrowserChromeSegment,
  type CardConfig,
  findProductLogo,
  normalizeBrowserHeaderMode,
  planTitleCards,
} from './utils/intro-outro.js'
import { mapThroughKeptSegments, processVideo, type Segment } from './utils/smart_trim.js'
import { buildContinuousZoomFilter, type ZoomEvent } from './utils/zoom-filter.js'

/** One narration/SFX clip emitted by the demo tools into demo-state.json. */
export interface DemoAudioClip {
  filePath: string
  /** Wall-clock ms when the clip should start (same clock as `startTime`). */
  absoluteTimestamp: number
  /** Optional per-clip trim (SFX clipped to the exact duration of the action). */
  durationSec?: number
  /** What was said, for narration clips — the label of the beat in the studio. */
  text?: string
  [key: string]: unknown
}

/** Parsed <workspaceDir>/recording/demo-state.json. */
export interface DemoState {
  startTime?: number
  audioClips?: DemoAudioClip[]
  zoomEvents?: ZoomEvent[]
  clickEvents?: ClickEvent[]
  annotationEvents?: unknown[]
  /** Last page URL the agent was on (browser header fallback). */
  pageUrl?: string
  /** Every navigation the agent recorded, on the raw (untrimmed) output timeline. */
  pageUrlEvents?: Array<{ videoTimeSec: number; url: string }>
  [key: string]: unknown
}

export interface RenderDemoOptions {
  url?: string
  background?: string
  shape?: string
  inset?: number | string
  browserHeader?: 'light' | 'dark' | 'none'
  storyboard?: VideoStoryboard
  productName?: string
  /** 30 or 60; default the recording's own frame rate. */
  fps?: number | string
}

export interface RenderDemoInput {
  /** The project workspace; recordings live in <workspaceDir>/recording/. */
  workspaceDir: string
  /** Expected recording path (may be missing/chunked → resolveAndCombineWebmFiles). */
  webmPath: string
  /** Where playwright-cli wrote chunks. */
  videoDir: string
  /** When video-start ran (for the stale-chunk sweep). */
  recordingStartedAtMs: number
  /** Parsed demo-state.json. */
  state: DemoState
  /** The event clock anchor (demo-config.json). */
  startTime: number
  /** Repo assets/ (icons/cursor.png, icons/hand-pointer.png, backgrounds/). */
  assetsDir: string
  options: RenderDemoOptions
  /** <workspaceDir>/renders */
  outDir: string
  watermark?: boolean
}

export interface RenderDemoResult {
  finalPath: string
  rawPath: string
  durationSec: number
  leadingTrimSec: number
  /** Narration beats on the FINAL timeline, so the studio can address moments. */
  beats: Beat[]
}

export async function renderDemo(
  input: RenderDemoInput,
  logger: Logger,
): Promise<RenderDemoResult> {
  const { workspaceDir, webmPath, videoDir, recordingStartedAtMs, startTime, assetsDir, outDir } =
    input
  const options = input.options ?? {}
  const recordingDir = path.join(workspaceDir, 'recording')
  fs.mkdirSync(outDir, { recursive: true })

  // Tolerate a partial demo-state.json (the agent may have crashed before
  // emitting anything) — the old worker synthesised an empty state in that case.
  const state = {
    ...input.state,
    audioClips: Array.isArray(input.state?.audioClips) ? input.state.audioClips : [],
    zoomEvents: Array.isArray(input.state?.zoomEvents) ? input.state.zoomEvents : [],
    clickEvents: Array.isArray(input.state?.clickEvents) ? input.state.clickEvents : [],
    annotationEvents: Array.isArray(input.state?.annotationEvents)
      ? input.state.annotationEvents
      : [],
  }

  // 9. Post-Process Video & Audio using Zoom-Filter & Smart-Trim
  let foundWebmPath: string
  try {
    foundWebmPath = await resolveAndCombineWebmFiles(
      webmPath,
      videoDir,
      logger,
      recordingStartedAtMs,
    )
  } catch (err: any) {
    logger.warn({ err }, 'resolveAndCombineWebmFiles failed, trying findWebmCandidates fallback')
    const candidate =
      findWebmCandidates(logger, videoDir) ||
      (videoDir !== recordingDir ? findWebmCandidates(logger, recordingDir) : null)
    if (!candidate) {
      throw new Error('demo.webm video recording was not found')
    }
    foundWebmPath = candidate
  }

  const sourceFps = await getSourceFps(foundWebmPath, logger)
  const fps = outputFps(options.fps, sourceFps)
  logger.info({ sourceFps, fps }, 'Detected source frame rate')

  const cursorPath = path.join(assetsDir, 'icons', 'cursor.png')
  const handCursorPath = path.join(assetsDir, 'icons', 'hand-pointer.png')
  const stamp = Date.now()
  const compactedSource = path.join(outDir, `__source_cut_${stamp}.mp4`)
  const rawVideo = path.join(outDir, 'raw.mp4')
  const finalVideo = path.join(outDir, `demo-${stamp}.mp4`)

  // Align video timebase with wall-clock startTime
  const videoBirthTimeMs = await getVideoBirthTimeMs(foundWebmPath, logger)
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

  // Resolve narration and SFX positions on the aligned recording timeline.
  const trimMs = trimSec * 1000
  let firstNarrationDelayMs = Number.POSITIVE_INFINITY
  // Where each clip lands on the output timeline — we mixed the audio ourselves,
  // so the smart trimmer can derive silence analytically from these spans instead
  // of decoding the whole track with silencedetect.
  const clipSpans: Array<{ startSec: number; filePath: string; durationSec?: number }> = []
  // Narration only (no click/keyboard SFX): these become the studio's beats.
  const narrationSpans: Array<{ startSec: number; filePath: string; text?: string }> = []
  for (const clip of state.audioClips) {
    if (!fs.existsSync(clip.filePath)) {
      logger.warn({ filePath: clip.filePath }, 'Audio clip file not found on disk — skipping')
      continue
    }
    // The click/zoom overlays add trimSec because they are applied BEFORE
    // the trim=start=trimSec cut, i.e. on the raw WebM timeline. The mixed
    // audio track is never trimmed, so it must sit on the POST-trim output
    // timeline: compute the WebM-timeline position (the firstContent clamp
    // holds early narration until the page actually paints instead of
    // playing over a blank screen), then shift it back by trimSec. Keeping
    // +trimMs in the adelay itself would delay every clip by trimSec and
    // desync the whole soundtrack from the trimmed video.
    const delayMs = Math.max(
      0,
      Math.max(firstContentMs, Math.max(0, clip.absoluteTimestamp - startTime + trimMs)) - trimMs,
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
    clipSpans.push({
      startSec: delayMs / 1000,
      filePath: clip.filePath,
      durationSec:
        typeof clip.durationSec === 'number' && clip.durationSec > 0 ? clip.durationSec : undefined,
    })
    if (!isSfx)
      narrationSpans.push({
        startSec: delayMs / 1000,
        filePath: clip.filePath,
        text: typeof clip.text === 'string' ? clip.text : undefined,
      })
  }

  // The agent spends the first several seconds setting up (navigation, first
  // snapshot, LLM reasoning) before its first narration, so the recording opens
  // with no voiceover. Drop that leading silent gap so the demo starts on the
  // first spoken word and has audio throughout. We also trim at least up to the
  // first page paint (firstContentSec) so the long blank white about:blank
  // opening is removed entirely — early narration was clamped to that same point,
  // so the demo opens on the real page with narration over it.
  const FIRST_WORD_LEAD_IN = 0.4
  // firstContentSec is measured on the raw WebM timeline; the rendered
  // video is already trimmed by trimSec, so shift it onto the output
  // timeline before comparing with (post-trim) narration delays.
  const firstContentOutSec = Math.max(0, firstContentSec - trimSec)
  const leadingTrimSec = Number.isFinite(firstNarrationDelayMs)
    ? Math.max(0, firstNarrationDelayMs / 1000 - FIRST_WORD_LEAD_IN, firstContentOutSec)
    : Math.max(0, firstContentOutSec)
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
  if (clipSpans.length > 0) {
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

  const sourceDurationSec = await getMediaDurationSec(foundWebmPath)
  const requiredSourceEndSec = Math.max(
    0,
    ...(speechSegments ?? []).map(segment => segment.end + trimSec),
    ...state.clickEvents.map(event => event.videoTimeSec + trimSec),
    ...state.zoomEvents.map(event => event.videoTimeSec + trimSec),
  )
  if (sourceDurationSec + 0.75 < requiredSourceEndSec) {
    throw new Error(
      `Recording is incomplete: video ends at ${sourceDurationSec.toFixed(2)}s but tracked content reaches ${requiredSourceEndSec.toFixed(2)}s. Please record a fresh take.`,
    )
  }

  logger.info('Compacting the source before applying expensive camera and cursor effects')
  const trimT0 = Date.now()
  // The spans the trim kept, so narration beats can be placed on the final cut.
  let keptSpans: Segment[] = []
  try {
    keptSpans = await processVideo(foundWebmPath, compactedSource, foundWebmPath, {
      forceLeadingTrimSec: leadingTrimSec + trimSec,
      speechSegments: speechSegments?.map(segment => ({
        start: segment.start + trimSec,
        end: segment.end + trimSec,
      })),
      clickEvents: state.clickEvents.map(event => ({
        ...event,
        videoTimeSec: event.videoTimeSec + trimSec,
      })),
      zoomEvents: state.zoomEvents.map(event => ({
        ...event,
        videoTimeSec: event.videoTimeSec + trimSec,
      })),
      annotationEvents: state.annotationEvents
        .filter((event): event is { videoTimeSec: number } =>
          Number.isFinite((event as { videoTimeSec?: number })?.videoTimeSec),
        )
        .map(event => ({
          ...event,
          videoTimeSec: event.videoTimeSec + trimSec,
        })),
    })
    logger.info({ sec: ((Date.now() - trimT0) / 1000).toFixed(1) }, 'TIMING: smart trim done')
  } catch (trimErr: any) {
    logger.warn({ err: trimErr }, 'Smart trim failed — falling back to the aligned source')
    keptSpans = [{ start: trimSec, end: sourceDurationSec }]
    await execAsync(
      `ffmpeg -y -ss ${trimSec.toFixed(3)} -i "${foundWebmPath}" -c:v libx264 -preset veryfast -crf 19 -an "${compactedSource}"`,
    )
  }

  const compactTime = (alignedTimeSec: number) =>
    mapThroughKeptSegments(alignedTimeSec + trimSec, keptSpans)
  const mappedClicks = state.clickEvents.map(event => ({
    ...event,
    videoTimeSec: compactTime(event.videoTimeSec),
  }))
  const mappedZooms = state.zoomEvents.map(event => ({
    ...event,
    videoTimeSec: compactTime(event.videoTimeSec),
  }))

  let videoInputs = `-i "${compactedSource}" -i "${cursorPath}" -i "${handCursorPath}"`
  let filterComplex = ''
  let currentVLabel = '[0:v]'
  const cursorChain = buildGlidingCursorChain(mappedClicks, 0, 1, 2, currentVLabel, '[v_cursor]')
  if (cursorChain) {
    filterComplex += cursorChain
    currentVLabel = '[v_cursor]'
  }
  filterComplex += buildContinuousZoomFilter(mappedZooms, 0, currentVLabel, fps)

  const audioLabels: string[] = []
  let validClips = 0
  let audioInputIndex = 3
  for (const clip of clipSpans) {
    const delayMs = Math.round(compactTime(clip.startSec) * 1000)
    const atrim = clip.durationSec ? `atrim=0:${clip.durationSec.toFixed(2)},` : ''
    videoInputs += ` -i "${clip.filePath}"`
    filterComplex += `[${audioInputIndex}:a]${atrim}adelay=${delayMs}|${delayMs}[a${validClips}];`
    audioLabels.push(`[a${validClips}]`)
    audioInputIndex++
    validClips++
  }
  if (validClips > 0) {
    filterComplex += `${audioLabels.join('')}amix=inputs=${validClips}:duration=longest:normalize=0,alimiter=limit=0.95[outa]`
  }

  const encodePlan = await videoEncodePlan({ quality: 18, cpuPreset: 'veryfast' })
  const encodedVideo = appendEncoderFilter(filterComplex, '[zoomedv]', encodePlan)
  filterComplex = encodedVideo.graph
  const ffmpegCmd =
    `ffmpeg -y ${encodePlan.inputArgs} ${videoInputs} ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "${encodedVideo.outputLabel}" ${validClips > 0 ? '-map "[outa]"' : ''} ` +
    `${encodePlan.outputArgs} ${validClips > 0 ? '-c:a aac -ar 24000 -ac 1' : ''} "${rawVideo}"`
  logger.info(
    { encoder: encodePlan.label },
    'Rendering compacted demo with camera and cursor effects',
  )
  const renderT0 = Date.now()
  await execAsync(ffmpegCmd)
  logger.info(
    { sec: ((Date.now() - renderT0) / 1000).toFixed(1) },
    'TIMING: compact render (zoom+overlays+audio) done',
  )

  // 9. Final assembly: intro/outro cards, watermark and the optional decorative
  // background are all composited in ONE encode pass — the full assembled video
  // (intro + demo + outro) sits on the same backdrop, and the content only goes
  // through a single generation here. No background => the video stays full-screen.
  const bgId = (options.background || '').toString().trim()
  const bgAsset =
    bgId && bgId !== 'none'
      ? resolveBackgroundAsset(path.join(assetsDir, 'backgrounds'), bgId)
      : null
  if (bgId && bgId !== 'none' && !bgAsset) {
    logger.warn({ bgId }, 'Background asset not found — keeping full-screen')
  }

  logger.info({ bgId: bgAsset ? bgId : 'none' }, 'Adding intro/outro cards (+ background)')
  // Where the demo content starts in the finished file (0 with no intro card).
  let contentStartSec = 0
  let browserChromeSegments: BrowserChromeSegment[] | undefined
  try {
    const productDomain = (options.url || '')
      .replace(/^https?:\/\//, '')
      .split('/')[0]!
      .replace(/^(www|m)\./i, '')
    const productName =
      options.productName?.trim() ||
      productDomain
        .replace(/\.[a-z]+$/i, '')
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
      'Demo'
    const productLogoPath = findProductLogo(recordingDir)
    const inset = Number.parseFloat((options.inset ?? '0.87').toString())
    const reviewedStoryboard = options.storyboard
    const cardConfig: CardConfig = {
      productName,
      productLogoPath,
      duration: 2.5,
      fps,
      width: 1920,
      height: 1080,
      outputPath: finalVideo,
      productUrl: productDomain || undefined,
      titleCards: reviewedStoryboard
        ? (reviewedStoryboard.titleCards ?? {
            intro: { enabled: false, title: '', subtitle: '' },
            outro: { enabled: false, title: '', subtitle: '' },
          })
        : undefined,
      watermark: input.watermark,
    }
    const cardPlan = planTitleCards(cardConfig)
    contentStartSec = cardPlan.contentStartSec

    // Optional Safari-style browser header. We generate one PNG per distinct
    // page URL the agent navigated to, then overlay each segment only during
    // the time the demo was on that URL. Falls back to a single static header
    // when no navigation events were recorded.
    const headerMode: BrowserHeaderMode | 'none' = normalizeBrowserHeaderMode(options.browserHeader)
    const headerUrl = state.pageUrl || options.url
    if (headerMode !== 'none' && headerUrl) {
      try {
        const contentDur = await getMediaDurationSec(rawVideo)
        const contentStart = cardPlan.contentStartSec
        const events = state.pageUrlEvents
        const sorted = (events || []).slice().sort((a, b) => a.videoTimeSec - b.videoTimeSec)
        const segs: BrowserChromeSegment[] = []

        if (sorted.length > 0) {
          // Initial URL (the first recorded value) from the start of the content
          // until the first navigation event.
          const firstStart = compactTime(sorted[0]!.videoTimeSec)
          if (firstStart > 0) {
            const png = path.join(outDir, `__browser_chrome_${stamp}_0.png`)
            renderBrowserChromePng(sorted[0]!.url, png, 1920, 56, headerMode)
            segs.push({ png, startSec: contentStart, endSec: contentStart + firstStart })
          }
          for (let i = 0; i < sorted.length; i++) {
            const start = compactTime(sorted[i]!.videoTimeSec)
            const end =
              i + 1 < sorted.length ? compactTime(sorted[i + 1]!.videoTimeSec) : contentDur
            const png = path.join(outDir, `__browser_chrome_${stamp}_${i + 1}.png`)
            renderBrowserChromePng(sorted[i]!.url, png, 1920, 56, headerMode)
            segs.push({
              png,
              startSec: contentStart + Math.min(start, contentDur),
              endSec: contentStart + Math.min(end, contentDur),
            })
          }
        } else {
          const png = path.join(outDir, `__browser_chrome_${stamp}.png`)
          renderBrowserChromePng(headerUrl, png, 1920, 56, headerMode)
          segs.push({ png, startSec: contentStart, endSec: contentStart + contentDur })
        }

        browserChromeSegments = segs
        logger.info(
          { mode: headerMode, segments: segs.length },
          'Generated dynamic browser header chrome',
        )
      } catch (chromeErr) {
        browserChromeSegments = undefined
        logger.warn({ err: chromeErr }, 'Browser chrome failed — continuing with title cards')
      }
    }

    const cardsT0 = Date.now()
    await addIntroOutro(
      rawVideo,
      finalVideo,
      cardConfig,
      bgAsset
        ? {
            asset: bgAsset,
            radius: shapeRadius((options.shape || 'rounded').toString()),
            inset: Number.isFinite(inset) ? inset : 0.87,
          }
        : undefined,
      browserChromeSegments,
    )
    logger.info(
      { sec: ((Date.now() - cardsT0) / 1000).toFixed(1) },
      'TIMING: final assembly (cards + watermark + background + browser header) done',
    )
  } finally {
    if (browserChromeSegments) {
      for (const seg of browserChromeSegments) {
        try {
          fs.unlinkSync(seg.png)
        } catch {}
      }
    }
  }

  // The source-only compacted cut is no longer needed. raw.mp4 stays for the
  // caller and is deleted after the final upload lands.
  try {
    fs.unlinkSync(compactedSource)
  } catch {}

  const durationSec = await getMediaDurationSec(finalVideo)
  const streamDurations = await getMediaStreamDurations(finalVideo)
  if (
    streamDurations.video <= 0 ||
    (streamDurations.audio > 0 && streamDurations.audio - streamDurations.video > 0.75)
  ) {
    throw new Error(
      `Rendered demo is incomplete: video ${streamDurations.video.toFixed(2)}s, audio ${streamDurations.audio.toFixed(2)}s.`,
    )
  }

  // Place every narration line on the finished timeline: mix position → the
  // trim's kept spans → plus the intro card. Clips whose audio was dropped by
  // the trimmer collapse onto the cut, which is where the viewer sees them.
  const beats: Beat[] = []
  for (const span of narrationSpans) {
    const clipDur = await getMediaDurationSec(span.filePath).catch(() => 0)
    beats.push({
      start: contentStartSec + compactTime(span.startSec),
      dur: clipDur,
      text: span.text,
      type: 'narration',
    })
  }
  logger.info(
    { finalVideo, durationSec, beats: beats.length },
    'Video creation successfully complete!',
  )

  return { finalPath: finalVideo, rawPath: rawVideo, durationSec, leadingTrimSec, beats }
}
