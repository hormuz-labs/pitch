import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { appendEncoderFilter, videoEncodePlan } from './encoder.js'

const execAsync = promisify(exec)

async function getDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    )
    return parseFloat(stdout.trim())
  } catch (_e) {
    return 0
  }
}

/**
 * Decide the audio duration from ffprobe's audio-stream list. Per-stream
 * durations are optional metadata — browser-recorded webm and some .mov files
 * omit them (ffprobe reports N/A) even when audio is present — so only a
 * genuinely absent stream means "no audio track". A stream with a missing
 * duration falls back to the container duration.
 */
export function resolveAudioDuration(
  streams: Array<{ duration?: string | number }> | undefined,
  fallbackDuration: number,
): number {
  if (!Array.isArray(streams) || streams.length === 0) return 0
  const raw = streams[0].duration
  const d = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  return Number.isFinite(d) ? d : fallbackDuration
}

async function getAudioDuration(file: string, fallbackDuration: number): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of json "${file}"`,
    )
    return resolveAudioDuration(JSON.parse(stdout).streams, fallbackDuration)
  } catch (_e) {
    return 0
  }
}

export interface Segment {
  start: number
  end: number
}

interface SignalFrame {
  ptsTime: number
  yMin: number
  yMax: number
  satAvg: number
}

interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
}

interface ZoomInEvent {
  type: 'in'
  videoTimeSec: number
  x: number
  y: number
  zoom: number
}

interface ZoomOutEvent {
  type: 'out'
  videoTimeSec: number
}

type ZoomEvent = ZoomInEvent | ZoomOutEvent

interface AnnotationEvent {
  videoTimeSec: number
}

export function annotationProtectionSegments(
  events: AnnotationEvent[],
  duration: number,
): Segment[] {
  const leadSec = 0.5
  const trailSec = 2.5
  return events.map(event => ({
    start: Math.max(0, event.videoTimeSec - leadSec),
    end: Math.min(duration, event.videoTimeSec + trailSec),
  }))
}

function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const merged: Segment[] = []
  for (const seg of sorted) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push(seg)
    } else if (seg.start <= last.end + 0.1) {
      last.end = Math.max(last.end, seg.end)
    } else {
      merged.push(seg)
    }
  }
  return merged
}

function getIntersections(a: Segment[], b: Segment[]): Segment[] {
  const intersections: Segment[] = []
  for (const segA of a) {
    for (const segB of b) {
      const start = Math.max(segA.start, segB.start)
      const end = Math.min(segA.end, segB.end)
      if (start < end) {
        intersections.push({ start, end })
      }
    }
  }

  return mergeSegments(intersections)
}

function getDifference(a: Segment[], b: Segment[]): Segment[] {
  const mergedB = mergeSegments(b)
  const diff: Segment[] = []
  for (const segA of a) {
    let fragments = [segA]
    for (const segB of mergedB) {
      const next: Segment[] = []
      for (const frag of fragments) {
        if (frag.end <= segB.start || frag.start >= segB.end) {
          next.push(frag)
        } else {
          if (frag.start < segB.start) {
            next.push({ start: frag.start, end: segB.start })
          }
          if (frag.end > segB.end) {
            next.push({ start: segB.end, end: frag.end })
          }
        }
      }
      fragments = next
    }
    diff.push(...fragments)
  }
  return mergeSegments(diff)
}

function isInitialBlankFrame(frame: SignalFrame): boolean {
  const lumaRange = frame.yMax - frame.yMin
  const nearWhite = frame.yMin >= 232 && frame.yMax >= 232
  const nearBlack = frame.yMin <= 18 && frame.yMax <= 24
  return frame.satAvg <= 2 && lumaRange <= 4 && (nearWhite || nearBlack)
}

function parseSignalFrames(signalLog: string): SignalFrame[] {
  const frames: SignalFrame[] = []
  let current: Partial<SignalFrame> | null = null

  for (const line of signalLog.split(/\r?\n/)) {
    const frameMatch = line.match(/(?:^|\]\s*)frame:\s*\d+.*pts_time:([-\d.]+)/)
    if (frameMatch) {
      if (
        current &&
        Number.isFinite(current.ptsTime) &&
        Number.isFinite(current.yMin) &&
        Number.isFinite(current.yMax) &&
        Number.isFinite(current.satAvg)
      ) {
        frames.push(current as SignalFrame)
      }
      current = { ptsTime: Number(frameMatch[1]) }
      continue
    }

    if (!current) continue

    const statMatch = line.match(/(?:^|\]\s*)lavfi\.signalstats\.(YMIN|YMAX|SATAVG)=([-\d.]+)/)
    if (!statMatch) continue

    const value = Number(statMatch[2])
    if (statMatch[1] === 'YMIN') current.yMin = value
    if (statMatch[1] === 'YMAX') current.yMax = value
    if (statMatch[1] === 'SATAVG') current.satAvg = value
  }

  if (
    current &&
    Number.isFinite(current.ptsTime) &&
    Number.isFinite(current.yMin) &&
    Number.isFinite(current.yMax) &&
    Number.isFinite(current.satAvg)
  ) {
    frames.push(current as SignalFrame)
  }

  return frames
}

export function findInitialBlankSegmentFromSignalStats(signalLog: string): Segment | null {
  const frames = parseSignalFrames(signalLog)
  if (frames.length === 0 || !isInitialBlankFrame(frames[0]!)) return null

  const firstNonBlank = frames.find(frame => !isInitialBlankFrame(frame))
  if (!firstNonBlank || firstNonBlank.ptsTime < 1) return null

  return { start: 0, end: firstNonBlank.ptsTime }
}

async function findInitialBlankSegment(input: string): Promise<Segment | null> {
  try {
    const { stdout } = await execAsync(
      `ffmpeg -hide_banner -t 90 -i "${input}" -vf fps=2,signalstats,metadata=print:file=- -an -f null -`,
      { maxBuffer: 1024 * 1024 * 100 },
    )
    return findInitialBlankSegmentFromSignalStats(stdout)
  } catch (err) {
    console.warn(
      `Initial blank-screen analysis failed; continuing without blank trim: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

function loadClickEvents(input: string): ClickEvent[] {
  const statePath = path.join(path.dirname(input), 'demo-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw)
    return Array.isArray(state.clickEvents) ? state.clickEvents : []
  } catch {
    return []
  }
}

function loadZoomEvents(input: string): ZoomEvent[] {
  const statePath = path.join(path.dirname(input), 'demo-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw)
    return Array.isArray(state.zoomEvents) ? state.zoomEvents : []
  } catch {
    return []
  }
}

function loadAnnotationEvents(input: string): AnnotationEvent[] {
  const statePath = path.join(path.dirname(input), 'demo-state.json')
  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw)
    return Array.isArray(state.annotationEvents) ? state.annotationEvents : []
  } catch {
    return []
  }
}

// Per-frame motion threshold (YAVG of the frame-to-frame difference). Static holds and
// Ken-Burns drift sit near ~0; a page SCROLL or camera PAN spikes well above this.
// Calibrated against real recordings: holds median ≈ 0.01, motion peaks ≈ 12.
const MOTION_YAVG_THRESHOLD = 2.0
// Amplitude alone can't tell a scroll from ambient in-page animation: an animated
// hero gradient / spinner / carousel flickers YAVG to 2–4 every few frames, chaining
// motion protection across a whole silent hold (observed: a 12s dead pocket kept
// because a glow animation ticked just above threshold). A real scroll moves the
// WHOLE viewport, so additionally require that a meaningful FRACTION of pixels
// changed noticeably. Calibrated: hero-glow flicker < 8% area; real scrolls on a
// sparse dark page ≥ 17%; carousel/page transitions ≥ 13%.
const MOTION_AREA_FRACTION = 0.12
const MOTION_PIXEL_DELTA = 24 // per-pixel luma delta that counts as "changed"
const MOTION_SAMPLE_FPS = 4
const MOTION_PAD = 0.4 // keep a little on each side of detected motion
// Backstop for content BOTH thresholds can't classify: a full-viewport autoplaying
// hero video / particle animation registers as continuous whole-frame motion and
// would protect unbounded silence. Real protected travel (a scroll or pan between
// narrated moments) lasts ~1–2s, so cap each motion island well above that; anything
// longer is ambient playback, and only its head is kept as a transition beat.
const MOTION_PROTECT_MAX_SEC = 6

function parseMetadataYavg(log: string): Map<number, number> {
  const rows = new Map<number, number>()
  let t: number | null = null
  for (const line of log.split(/\r?\n/)) {
    const tm = line.match(/pts_time:\s*([\d.]+)/)
    if (tm) {
      t = parseFloat(tm[1]!)
      continue
    }
    const ym = line.match(/YAVG=\s*([\d.eE+-]+)/)
    if (ym && t !== null) rows.set(t, parseFloat(ym[1]!))
  }
  return rows
}

/**
 * Find the time ranges that contain real visual MOTION (a page scroll or camera pan),
 * as opposed to a static hold. These must never be trimmed even when silent — cutting
 * the silent travel between two narrated moments is exactly what turns a smooth scroll
 * into a jarring teleport. Returns merged [start,end] segments. Best-effort: on any
 * failure it returns [] (motion just isn't specially protected).
 *
 * Two metrics per sample, computed in one decode: the mean frame difference
 * (amplitude) and the fraction of pixels whose difference exceeds
 * MOTION_PIXEL_DELTA (area). Only samples that clear BOTH thresholds count as
 * motion — see MOTION_AREA_FRACTION for why.
 */
async function analyzeMotion(input: string, duration: number): Promise<Segment[]> {
  const dir = path.dirname(input)
  const stamp = Date.now()
  const ampLog = path.join(dir, `__motion_amp_${stamp}.log`)
  const areaLog = path.join(dir, `__motion_area_${stamp}.log`)
  try {
    await execAsync(
      `ffmpeg -hide_banner -nostats -i "${input}" ` +
        `-filter_complex "[0:v]fps=${MOTION_SAMPLE_FPS},tblend=all_mode=difference,split=2[amp][area];` +
        `[amp]signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${ampLog}[ao];` +
        `[area]lutyuv=y='if(gt(val,${MOTION_PIXEL_DELTA}),255,0)',signalstats,` +
        `metadata=print:key=lavfi.signalstats.YAVG:file=${areaLog}[bo];` +
        `[ao][bo]hstack" -an -f null -`,
      { maxBuffer: 1024 * 1024 * 200 },
    )
    const amp = parseMetadataYavg(fs.readFileSync(ampLog, 'utf8'))
    const area = parseMetadataYavg(fs.readFileSync(areaLog, 'utf8'))
    const segs: Segment[] = []
    for (const [t, ampVal] of amp) {
      const areaFraction = (area.get(t) ?? 0) / 255
      if (ampVal > MOTION_YAVG_THRESHOLD && areaFraction > MOTION_AREA_FRACTION) {
        segs.push({
          start: Math.max(0, t - 1 / MOTION_SAMPLE_FPS - MOTION_PAD),
          end: Math.min(duration, t + MOTION_PAD),
        })
      }
    }
    const merged = mergeSegments(segs)
    for (const seg of merged) {
      if (seg.end - seg.start > MOTION_PROTECT_MAX_SEC) {
        console.log(
          `Motion island ${seg.start.toFixed(1)}s → ${seg.end.toFixed(1)}s exceeds ${MOTION_PROTECT_MAX_SEC}s — ` +
            `treating as ambient playback, protecting only its head.`,
        )
        seg.end = seg.start + MOTION_PROTECT_MAX_SEC
      }
    }
    return merged
  } catch {
    return []
  } finally {
    for (const f of [ampLog, areaLog]) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
  }
}

// Match silencedetect's calibration (noise=-50dB:d=0.8): analytically-derived gaps
// shorter than this were never silence candidates before, so keep it that way.
const SILENCE_MIN_SEC = 0.8

/**
 * Silence segments of the mixed audio. When the caller already knows where every
 * narration/SFX clip was placed (it built the amix graph itself), silence is just
 * the complement of those spans — no audio decode needed. Otherwise fall back to
 * a silencedetect pass.
 */
async function detectSilences(
  input: string,
  speechSegments: Segment[] | undefined,
  duration: number,
): Promise<Segment[]> {
  if (speechSegments) {
    return getDifference([{ start: 0, end: duration }], speechSegments).filter(
      g => g.end - g.start >= SILENCE_MIN_SEC,
    )
  }

  const { stdout: silenceLog } = await execAsync(
    `ffmpeg -i "${input}" -af silencedetect=noise=-50dB:d=${SILENCE_MIN_SEC} -f null - 2>&1`,
    { maxBuffer: 1024 * 1024 * 100 },
  )
  const silences: Segment[] = []
  const silenceStarts = [...silenceLog.matchAll(/silence_start:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  const silenceEnds = [...silenceLog.matchAll(/silence_end:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  for (let i = 0; i < silenceStarts.length; i++) {
    silences.push({ start: silenceStarts[i]!, end: silenceEnds[i] ?? 999999 })
  }
  return silences
}

// Freeze detection on the processed video — during zoom hold phases frames
// are stable so freezes are detectable. d=1.0 catches short 1s+ static pauses.
// n=0.05 noise tolerance accounts for compression artifacts.
async function detectFreezes(input: string): Promise<Segment[]> {
  const { stdout: freezeLog } = await execAsync(
    `ffmpeg -i "${input}" -vf freezedetect=n=0.05:d=1.0 -f null - 2>&1`,
    { maxBuffer: 1024 * 1024 * 100 },
  )
  const freezes: Segment[] = []
  const freezeStarts = [...freezeLog.matchAll(/freeze_start:\s+([\d.]+)/g)].map(m =>
    parseFloat(m[1]!),
  )
  const freezeEnds = [...freezeLog.matchAll(/freeze_end:\s+([\d.]+)/g)].map(m => parseFloat(m[1]!))
  for (let i = 0; i < freezeStarts.length; i++) {
    freezes.push({ start: freezeStarts[i]!, end: freezeEnds[i] ?? 999999 })
  }
  return freezes
}

/**
 * Trims dead air out of `input`. Returns the spans of the INPUT timeline that
 * survive into `output`, in order — callers map a time on the input timeline
 * onto the output with `mapThroughKeptSegments`, which is how the studio knows
 * where a narration beat ended up in the finished video.
 */
export async function processVideo(
  input: string,
  output: string,
  detectionInput?: string,
  opts?: {
    forceLeadingTrimSec?: number
    /**
     * Exact spans (on the input's timeline) where narration/SFX audio was placed.
     * Provided by the renderer that mixed the audio, so silence can be derived
     * analytically instead of decoding the whole track with silencedetect.
     */
    speechSegments?: Segment[]
    clickEvents?: ClickEvent[]
    zoomEvents?: ZoomEvent[]
    annotationEvents?: AnnotationEvent[]
  },
): Promise<Segment[]> {
  const analyzeInput = detectionInput || input

  // Diagnostic A/B switch: skip ALL dead-air removal and keep the full recording so we
  // can see the demo with every scroll/pan/hold intact (set DISABLE_SMART_TRIM=1).
  if (process.env.DISABLE_SMART_TRIM === '1' || process.env.DISABLE_SMART_TRIM === 'true') {
    console.log('DISABLE_SMART_TRIM set — copying full video, no dead-air removal.')
    fs.copyFileSync(input, output)
    return [{ start: 0, end: (await getDuration(input)) || 0 }]
  }

  const clickEvents = opts?.clickEvents ?? loadClickEvents(analyzeInput)
  if (clickEvents.length > 0) {
    console.log(`Found ${clickEvents.length} click event(s) to protect during trimming.`)
  }

  const zoomEvents = opts?.zoomEvents ?? loadZoomEvents(analyzeInput)
  if (zoomEvents.length > 0) {
    console.log(`Found ${zoomEvents.length} zoom event(s) to protect during trimming.`)
  }

  const annotationEvents = opts?.annotationEvents ?? loadAnnotationEvents(analyzeInput)
  if (annotationEvents.length > 0) {
    console.log(`Found ${annotationEvents.length} annotation event(s) to protect during trimming.`)
  }

  const duration = await getDuration(analyzeInput)
  if (!duration) throw new Error('Could not determine video duration')
  const audioDuration = await getAudioDuration(analyzeInput, duration)

  // The four analyses each decode the video/audio independently — run them
  // concurrently so the analysis phase costs one decode of wall-clock, not four.
  console.log('Analyzing silence, freezes, blank opening and motion (in parallel)...')
  const [silences, freezes, initialBlank, motionProtected] = await Promise.all([
    detectSilences(analyzeInput, opts?.speechSegments, duration),
    detectFreezes(analyzeInput),
    findInitialBlankSegment(analyzeInput),
    analyzeMotion(analyzeInput, duration),
  ])

  console.log(
    `Found ${silences.length} silence segment(s) and ${freezes.length} freeze segment(s).`,
  )
  if (!opts?.speechSegments?.length) {
    if (audioDuration > 0 && audioDuration < duration - 0.5) {
      console.log(
        `Audio stream ends early at ${audioDuration.toFixed(2)}s (video is ${duration.toFixed(2)}s). Adding trailing silence.`,
      )
      silences.push({ start: audioDuration, end: duration })
    } else if (audioDuration === 0) {
      console.log(
        'No audio track detected — treating entire video as silent for freeze-based trimming.',
      )
      silences.push({ start: 0, end: duration })
    }
  }

  silences.forEach(s => {
    s.end = Math.min(s.end, duration)
  })
  freezes.forEach(f => {
    f.end = Math.min(f.end, duration)
  })

  const dropSegments: Segment[] = []

  const initialBlankEnd =
    initialBlank && initialBlank.end < duration - 0.5 ? initialBlank.end : undefined

  if (initialBlankEnd !== undefined) {
    console.log(
      `Initial blank screen detected (0 → ${initialBlankEnd.toFixed(2)}s) — adding as drop segment.`,
    )
    dropSegments.push({ start: 0, end: initialBlankEnd })
  }

  // 1. Segments where the screen is BOTH frozen AND silent — always drop these.
  dropSegments.push(...getIntersections(silences, freezes))

  // 2. Pure silence segments (not covered by a freeze) that are long enough
  //    are also dead air — the screen may have minor visual changes (loading
  //    animations, zoom holds, rendering) that prevent the freeze detector
  //    from firing, but without narration the viewer sees nothing meaningful.
  const PURE_SILENCE_MIN_SEC = 1.5
  const pureSilence = getDifference(silences, freezes)
  for (const seg of pureSilence) {
    if (seg.end - seg.start >= PURE_SILENCE_MIN_SEC) {
      console.log(
        `Pure silence segment (${seg.start.toFixed(2)}s → ${seg.end.toFixed(2)}s, ${(seg.end - seg.start).toFixed(2)}s) without freeze — adding as drop.`,
      )
      dropSegments.push(seg)
    }
  }

  // 3. Force-trim initial silence even without a corresponding freeze.
  // When the page is loading (animations, rendering) the freeze detector won't
  // fire, so the opening dead-air is never removed.  If the first silence
  // starts at the very beginning we add it as an extra drop segment so the
  // trimmed video starts when actual content (audio or motion) begins.
  const firstSilence = mergeSegments(silences).find(s => s.start <= 0.15)
  if (firstSilence && firstSilence.end > 0.6 && firstSilence.end < duration - 0.5) {
    const coveredByFreeze = freezes.some(f => f.start <= 0.15 && f.end >= firstSilence.end - 0.1)
    if (!coveredByFreeze) {
      console.log(
        `Initial silence detected (0 → ${firstSilence.end.toFixed(2)}s) without freeze — adding as extra drop segment.`,
      )
      dropSegments.push({ start: 0, end: firstSilence.end })
    }
  }

  // Where narration first starts. Used to keep the initial-freeze force-drop from
  // swallowing spoken audio: with analytic spans it's exact, otherwise derive it
  // from the end of an opening silence (no opening silence => speech from ~0).
  const firstSpeechStart = opts?.speechSegments?.length
    ? Math.min(...opts.speechSegments.map(s => s.start))
    : (mergeSegments(silences).find(s => s.start <= 0.15)?.end ?? 0)

  // Force-trim the initial freeze even when voiceover has started.
  // A blank/loading screen that hasn't rendered meaningful content yet is
  // useless even with voiceover — the viewer sees nothing.  If there's a
  // freeze starting at t≈0, extend the initial drop to cover it entirely.
  // But NEVER past the first spoken word: a fully-rendered page where the agent
  // simply pauses before acting also reads as one giant opening "freeze", and
  // extending the drop through it would delete the first narration line.
  const initialFreeze = freezes.find(f => f.start <= 0.15)
  if (initialFreeze && initialFreeze.end > 1 && initialFreeze.end < duration - 0.5) {
    const freezeDropEnd = Math.min(initialFreeze.end, firstSpeechStart)
    const mergedDrop = mergeSegments(dropSegments)
    const coveredTo = mergedDrop.find(d => d.start <= 0.15)?.end ?? 0
    if (freezeDropEnd > coveredTo + 0.5) {
      console.log(
        `Initial freeze extends to ${initialFreeze.end.toFixed(2)}s — dropping opening up to ${freezeDropEnd.toFixed(2)}s (clamped to first narration).`,
      )
      dropSegments.push({ start: 0, end: freezeDropEnd })
    }
  }

  console.log(
    `Found ${dropSegments.length} raw dead-air segment(s) (incl. pure silence + intersections).`,
  )

  // Shrink drop segments to leave breathing room on both sides of the kept segments
  // to prevent cutting into the tail of voiceover audio.  Don't add left padding
  // at the very start or right padding at the very end — there's nothing to preserve
  // there, and we want the video to start/end at actual content.
  const breathingRoom = 0.15
  const adjustedDropSegments: Segment[] = []
  for (const drop of mergeSegments(dropSegments)) {
    const leftPad = drop.start > 0 ? breathingRoom : 0
    const rightPad = drop.end < duration ? breathingRoom : 0
    if (drop.end - drop.start > leftPad + rightPad) {
      adjustedDropSegments.push({
        start: drop.start + leftPad,
        end: drop.end - rightPad,
      })
    }
  }
  adjustedDropSegments.sort((a, b) => a.start - b.start)
  console.log(
    `After leaving ${breathingRoom}s breathing room, we have ${adjustedDropSegments.length} segment(s) to trim.`,
  )

  // Invert to get the segments we KEEP.
  const keepSegments: Segment[] = []
  let cursor = 0
  for (const drop of adjustedDropSegments) {
    if (drop.start - cursor > 0.1) keepSegments.push({ start: cursor, end: drop.start })
    cursor = drop.end
  }
  if (duration - cursor > 0.1) keepSegments.push({ start: cursor, end: duration })

  if (keepSegments.length === 0) {
    console.log('Entire video is dead air — copying original.')
    fs.copyFileSync(input, output)
    return [{ start: 0, end: duration }]
  }

  // Protect a window around each click so the cursor's glide-in AND the click stay
  // visible. The lead retains the cursor approach before the click
  // so the motion isn't trimmed away, leaving the cursor to just "appear".
  const clickProtected: Segment[] = clickEvents.map(c => ({
    start: Math.max(0, c.videoTimeSec - 1.0),
    end: Math.min(duration, c.videoTimeSec + 1.5),
  }))

  // Protect only the zoom ramp transitions, NOT the hold.  The hold can be
  // long and static — that should still be trimmed.  We just need to make
  // sure the zoom-in animation leading into the hold and the zoom-out
  // animation leading out of it are never truncated.
  // Must cover the cinematic zoom ramp (see ZOOM_IN/OUT_DURATION in zoom-filter.ts)
  // so the eased transitions are never truncated by silence/freeze trimming.
  const ZOOM_RAMP = 0.6
  const ZOOM_PAD = 0.15
  // A zoom_in is preceded by smoothScrollIntoView (the page scroll that travels to the
  // target), which finishes just before the event is recorded. Protect that lead too,
  // otherwise the start of the scroll gets dropped as silence and the travel looks like
  // a teleport.
  const SCROLL_LEAD = 1.2
  const zoomProtected: Segment[] = []
  // Mirror planCameraMoves (zoom-filter.ts): a zoom_out with no active zoom is a
  // visual no-op there, so protecting footage around it would just keep dead air.
  let zoomActive = false
  for (let i = 0; i < zoomEvents.length; i++) {
    const ev = zoomEvents[i]!
    if (ev.type === 'in') {
      zoomActive = true
      zoomProtected.push({
        start: Math.max(0, ev.videoTimeSec - SCROLL_LEAD - ZOOM_RAMP - ZOOM_PAD),
        end: Math.min(duration, ev.videoTimeSec + ZOOM_PAD),
      })
    } else if (ev.type === 'out') {
      if (!zoomActive) continue
      zoomActive = false
      zoomProtected.push({
        start: Math.max(0, ev.videoTimeSec - ZOOM_PAD),
        end: Math.min(duration, ev.videoTimeSec + ZOOM_RAMP + ZOOM_PAD),
      })
    }
  }

  // Protect a window around each annotation (circle/box/highlighter/etc.) so the
  // draw-on animation and the brief hold that follows survive trimming — a static
  // slideshow page with a call-out on it would otherwise read as a frozen/silent
  // hold and be dropped, even though it's a deliberate, meaningful beat.
  const annotationProtected = annotationProtectionSegments(annotationEvents, duration)

  // Protect every stretch with real visual motion (scroll / pan), even when silent —
  // this is the general guard that keeps camera travel from being trimmed into a
  // teleport, including scrolls from narrate({focus}) that record no zoom/click event.
  if (motionProtected.length > 0) {
    const motionSec = motionProtected.reduce((a, s) => a + (s.end - s.start), 0)
    console.log(
      `Protecting ${motionProtected.length} motion segment(s) (${motionSec.toFixed(1)}s of scroll/pan) from trimming.`,
    )
  }

  // Motion protection exists to keep camera TRAVEL attached to content the viewer
  // will actually see (narrated stretches, clicks, zooms). A motion island floating
  // alone inside dropped silence connects nothing — the cuts on either side are
  // already teleports, so a lone second of unexplained movement between them just
  // reads as a glitchy silent montage. Keep only motion islands that touch (or
  // chain, island-to-island, into) an anchor segment.
  const MOTION_ANCHOR_GAP = 1.0
  const touches = (a: Segment, b: Segment) =>
    a.start <= b.end + MOTION_ANCHOR_GAP && b.start <= a.end + MOTION_ANCHOR_GAP
  const anchors = mergeSegments([
    ...keepSegments,
    ...clickProtected,
    ...zoomProtected,
    ...annotationProtected,
  ])
  const pool = [...motionProtected]
  const anchoredMotion: Segment[] = []
  let grew = true
  while (grew) {
    grew = false
    for (let i = pool.length - 1; i >= 0; i--) {
      const m = pool[i]!
      if (anchors.some(a => touches(m, a)) || anchoredMotion.some(a => touches(m, a))) {
        anchoredMotion.push(m)
        pool.splice(i, 1)
        grew = true
      }
    }
  }
  if (pool.length > 0) {
    const droppedSec = pool.reduce((s, m) => s + (m.end - m.start), 0)
    console.log(
      `Dropping ${pool.length} unanchored motion island(s) (${droppedSec.toFixed(1)}s) — ambient movement inside dead air, not travel.`,
    )
  }

  let finalKeepSegments = mergeSegments([
    ...keepSegments,
    ...clickProtected,
    ...zoomProtected,
    ...annotationProtected,
    ...anchoredMotion,
  ])

  // Enforce a hard leading trim that survives the click/zoom protection above.
  // The opening of the recording (before the first narration) is silent setup the
  // viewer shouldn't see, but protected click/zoom windows from that region can
  // otherwise re-introduce it. Clip everything before forceLeadingTrimSec.
  let leadCut = Math.max(opts?.forceLeadingTrimSec ?? 0, initialBlankEnd ?? 0)
  // Never let the lead cut reach into narration: the blank-screen detector here and
  // the first-paint detector upstream can disagree by a sample, and that overshoot
  // would clip the opening of the first spoken word.
  if (firstSpeechStart > 0) leadCut = Math.min(leadCut, firstSpeechStart)
  if (leadCut > 0 && leadCut < duration - 0.5) {
    finalKeepSegments = finalKeepSegments
      .map(s => ({ start: Math.max(s.start, leadCut), end: s.end }))
      .filter(s => s.end - s.start > 0.1)
    if (finalKeepSegments.length === 0) {
      finalKeepSegments = [{ start: leadCut, end: duration }]
    }
    console.log(`Forced leading trim: dropping everything before ${leadCut.toFixed(2)}s.`)
  }

  console.log(
    `Keeping ${finalKeepSegments.length} segment(s), trimming ${dropSegments.length} gap(s).`,
  )

  // ── Single-pass trim ────────────────────────────────────────────────────────
  // Drop the dead air with select/aselect in ONE decode+encode instead of writing
  // each keep-segment to its own file and concatenating. Besides being faster,
  // this avoids the per-segment AAC priming samples (~43ms each at 24kHz) that
  // used to accumulate into audible A/V drift across many joins.
  for (let i = 0; i < finalKeepSegments.length; i++) {
    const seg = finalKeepSegments[i]!
    console.log(
      `  Segment ${i + 1}/${finalKeepSegments.length}: ${seg.start.toFixed(3)}s → ${seg.end.toFixed(3)}s (${(seg.end - seg.start).toFixed(3)}s)`,
    )
  }

  const keepExpr = finalKeepSegments
    .map(s => `between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})`)
    .join('+')
  const hasAudio = audioDuration > 0
  let filter = hasAudio
    ? `[0:v]select='${keepExpr}',setpts=N/FRAME_RATE/TB[v];` +
      `[0:a]aselect='${keepExpr}',asetpts=N/SR/TB[a]`
    : `[0:v]select='${keepExpr}',setpts=N/FRAME_RATE/TB[v]`
  const encodePlan = await videoEncodePlan({ quality: 19, cpuPreset: 'veryfast' })
  const encodedVideo = appendEncoderFilter(filter, '[v]', encodePlan)
  filter = encodedVideo.graph

  await execAsync(
    `ffmpeg -y ${encodePlan.inputArgs} -i "${input}" -filter_complex "${filter}" ` +
      `-map "${encodedVideo.outputLabel}" ${hasAudio ? '-map "[a]" -c:a aac -ar 24000 -ac 1 ' : ''}` +
      `${encodePlan.outputArgs} "${output}"`,
    { maxBuffer: 1024 * 1024 * 100 },
  )

  console.log(`Done! Smart-trimmed video saved to ${output}`)
  return finalKeepSegments
}

/**
 * Where a time on the pre-trim timeline lands after the trim. Times inside a
 * dropped span snap to the cut, so a beat never points past its own content.
 */
export function mapThroughKeptSegments(t: number, kept: Segment[]): number {
  let elapsed = 0
  for (const seg of kept) {
    if (t < seg.start) return elapsed
    if (t <= seg.end) return elapsed + (t - seg.start)
    elapsed += seg.end - seg.start
  }
  return elapsed
}

/** Map a raw recording timestamp through source alignment and smart-trim cuts. */
export function mapEventTimeThroughTrim(
  rawTimeSec: number,
  sourceTrimSec: number,
  kept: Segment[],
): number {
  return mapThroughKeptSegments(Math.max(0, rawTimeSec - sourceTrimSec), kept)
}
