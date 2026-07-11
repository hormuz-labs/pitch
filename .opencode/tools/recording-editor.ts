/**
 * recording-editor tools
 *
 * Toolset for the "edit my recording" agent (.opencode/agents/recording-editor.md).
 * Given an UPLOADED narrated screen recording, these tools reconstruct the same
 * recordings/demo-state.json that the live auto-demo agent
 * (.opencode/plugins/demo-tools.ts) emits — so the existing render engine
 * (zoom-filter, cursor-fx, smart_trim, intro/outro) consumes it unchanged. Only
 * the EVENT SOURCE differs:
 *
 *   live flow:   playwright agent drives browser ──────────────→ demo-state.json
 *   upload flow: whisper transcript + ffmpeg scene cuts ──→ agent proposes windows
 *                     ──→ Agentic Vision verifies ──→ demo-state.json   (these tools)
 *
 * Tools:
 *   probe_video        duration / resolution / fps / has-audio
 *   transcribe_video   segment/word-level transcript via the local Whisper service
 *   detect_key_moments scene-cut candidates (ffmpeg) — the visual prior
 *   grab_frames        before/during/after frames at a timestamp
 *   inspect_frames     Gemini 3 Flash + code execution (Agentic Vision) verifies an
 *                      action window → { bbox, actionTimeSec, eventType, confidence, label }
 *   record_zoom_in     camera zoom event (auto-fit zoom derived from the verified bbox)
 *   record_zoom_out    camera zoom-out event
 *   record_click       cursor/click event (drives cursor fx downstream)
 *
 * External contracts:
 *   • TRANSCRIPTION_SERVICE_URL (default http://localhost:4000/transcribe):
 *     POST multipart form, field "file" (audio/wav) → whisper verbose_json shape:
 *     { segments: [{ start, end, text, words?: [{ word, start, end }] }] }
 *   • GEMINI_API_KEY — Gemini 3 Flash, called with code execution enabled
 *     (Agentic Vision). Override the model id via GEMINI_VISION_MODEL.
 *
 * Timeline rule: every *Sec value is seconds into the UPLOADED video's own
 * timeline. Nothing here trims; the render stage owns trimming (see the trimSec
 * notes in docs/demo-video-pipeline.md).
 */

import { tool } from '@opencode-ai/plugin'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ── constants ────────────────────────────────────────────────────────────────
const FRAME_W = 1920
const FRAME_H = 1080
// Agentic Vision requires a Gemini 3 Flash variant with code execution enabled.
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3-flash-preview'
const TRANSCRIPTION_URL =
  process.env.TRANSCRIPTION_SERVICE_URL || 'http://localhost:4000/transcribe'
const SCENE_THRESHOLD = 0.3
const DEDUPE_WINDOW_SEC = 1.0
const MAX_KEY_MOMENTS = 80
const BIG_BUFFER = 64 * 1024 * 1024

// ── demo-state (same shape as demo-tools.ts) ─────────────────────────────────
interface ZoomEvent {
  type: 'in' | 'out'
  videoTimeSec: number
  x?: number
  y?: number
  zoom?: number
}
interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
}
interface DemoState {
  startTime: number
  endTime?: number
  voiceName: string
  audioClips: { filePath: string; absoluteTimestamp: number; durationSec?: number }[]
  zoomEvents: ZoomEvent[]
  clickEvents: ClickEvent[]
  tabEvents: { tabId: number; wallSec: number }[]
  tabCreationTimes: Record<number, number>
  currentTabId: number
  lastTargetCoords: { ref: string; x: number; y: number } | null
}

function initialState(): DemoState {
  return {
    startTime: Date.now(),
    voiceName: 'Puck',
    audioClips: [],
    zoomEvents: [],
    clickEvents: [],
    tabEvents: [{ tabId: 0, wallSec: 0 }],
    tabCreationTimes: { 0: 0 },
    currentTabId: 0,
    lastTargetCoords: null,
  }
}

// Simple mutex to serialize state reads/writes across concurrent tool calls.
let stateLock = Promise.resolve()
async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await new Promise<() => void>(resolve => {
    const prev = stateLock
    stateLock = prev.then(() => new Promise<void>(done => resolve(done)))
    prev.then(() => {})
  })
  try {
    return await fn()
  } finally {
    release()
  }
}

// ── path helpers ─────────────────────────────────────────────────────────────
function baseDir(context: any): string {
  return context?.directory || process.cwd()
}
function recordingsDir(base: string): string {
  const dir = path.join(base, 'recordings')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
function statePath(base: string): string {
  return path.join(recordingsDir(base), 'demo-state.json')
}
function resolveVideo(base: string, videoPath: string): string {
  return path.isAbsolute(videoPath) ? videoPath : path.join(base, videoPath)
}

function readState(base: string): DemoState {
  const p = statePath(base)
  if (!fs.existsSync(p)) return initialState()
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeState(base: string, state: DemoState) {
  fs.writeFileSync(statePath(base), JSON.stringify(state, null, 2))
}

// A new upload must not inherit events left over from a previous session. Every
// analysis tool takes the video path, so they reset demo-state.json when the
// video changes (first call for a fresh upload wipes the slate exactly once).
function ensureSessionForVideo(base: string, videoPath: string) {
  const sidecar = path.join(recordingsDir(base), 'edit-session.json')
  let current: { videoPath?: string } | null = null
  try {
    current = JSON.parse(fs.readFileSync(sidecar, 'utf-8'))
  } catch {}
  if (!current || current.videoPath !== videoPath) {
    writeState(base, initialState())
    fs.writeFileSync(
      sidecar,
      JSON.stringify({ videoPath, startedAt: new Date().toISOString() }, null, 2),
    )
  }
}

// ── small utilities ──────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const q = (p: string) => `"${p.replace(/"/g, '\\"')}"`

function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [Math.max(0, +a.toFixed(3))]
  const step = (b - a) / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.max(0, +(a + step * i).toFixed(3)))
}

// Extract one JPEG per timestamp. Past-EOF or unreadable timestamps are skipped
// instead of failing the whole batch (the window edge may overshoot the video).
async function extractFrames(
  video: string,
  times: number[],
  outDir: string,
): Promise<{ timeSec: number; filePath: string }[]> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const out: { timeSec: number; filePath: string }[] = []
  for (const t of times) {
    const filePath = path.join(outDir, `frame_${t.toFixed(3)}.jpg`)
    try {
      await execAsync(`ffmpeg -y -ss ${t} -i ${q(video)} -frames:v 1 -q:v 2 ${q(filePath)}`)
      if (fs.existsSync(filePath)) out.push({ timeSec: t, filePath })
    } catch {}
  }
  return out
}

// ── transcript ───────────────────────────────────────────────────────────────
interface TranscriptSegment {
  start: number
  end: number
  text: string
  words?: { word: string; start: number; end: number }[]
}
function transcriptPath(base: string): string {
  return path.join(recordingsDir(base), 'transcript.json')
}
function readTranscript(base: string): TranscriptSegment[] {
  try {
    return JSON.parse(fs.readFileSync(transcriptPath(base), 'utf-8')).segments || []
  } catch {
    return []
  }
}
// Segments overlapping [start,end] plus one neighbour on each side, so the
// vision model sees what came just before/after the window (referent context).
function transcriptExcerpt(base: string, start: number, end: number): string {
  const segs = readTranscript(base)
  if (!segs.length) return '(no transcript available — transcribe_video has not run)'
  const hits = segs
    .map((s, i) => (s.end >= start && s.start <= end ? i : -1))
    .filter(i => i >= 0)
  if (!hits.length) return '(no narration inside this window)'
  const lo = Math.max(0, hits[0]! - 1)
  const hi = Math.min(segs.length - 1, hits[hits.length - 1]! + 1)
  return segs
    .slice(lo, hi + 1)
    .map(s => `[${s.start.toFixed(1)}s] ${s.text.trim()}`)
    .join('\n')
}

// ── tools ────────────────────────────────────────────────────────────────────

export const probe_video = tool({
  description:
    'Probe an uploaded video: duration, resolution, frame rate, and whether it has an ' +
    'audio track. ALWAYS call this first — it also resets the edit session for a new ' +
    'upload so no stale events leak in.',
  args: {
    videoPath: tool.schema.string().describe('Path to the uploaded video file.'),
  },
  async execute(args, context) {
    try {
      const base = baseDir(context)
      const video = resolveVideo(base, args.videoPath)
      if (!fs.existsSync(video)) return `ERROR: video not found: ${video}`
      ensureSessionForVideo(base, video)
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,r_frame_rate -of json ${q(video)}`,
      )
      const info = JSON.parse(stdout)
      const v = (info.streams || []).find((s: any) => s.codec_type === 'video')
      const a = (info.streams || []).find((s: any) => s.codec_type === 'audio')
      const duration = parseFloat(info.format?.duration || '0')
      return JSON.stringify({
        videoPath: video,
        durationSec: +duration.toFixed(2),
        width: v?.width ?? null,
        height: v?.height ?? null,
        frameRate: v?.r_frame_rate ?? null,
        hasAudio: !!a,
        audioCodec: a?.codec_name ?? null,
      })
    } catch (e) {
      return `ERROR: probe failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const transcribe_video = tool({
  description:
    'Transcribe the video\'s narration with the local Whisper service. Extracts the ' +
    'audio, posts it to TRANSCRIPTION_SERVICE_URL, saves the full transcript to ' +
    'recordings/transcript.json, and returns it with timestamps. Call once, after ' +
    'probe_video. If the service is unreachable you can still continue with ' +
    'detect_key_moments (visual-only candidates).',
  args: {
    videoPath: tool.schema.string().describe('Path to the uploaded video file.'),
  },
  async execute(args, context) {
    try {
      const base = baseDir(context)
      const video = resolveVideo(base, args.videoPath)
      if (!fs.existsSync(video)) return `ERROR: video not found: ${video}`
      ensureSessionForVideo(base, video)
      const wav = path.join(recordingsDir(base), 'upload_audio.wav')
      await execAsync(`ffmpeg -y -i ${q(video)} -vn -ac 1 -ar 16000 ${q(wav)}`, {
        maxBuffer: BIG_BUFFER,
      })
      const form = new FormData()
      form.append('file', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'audio.wav')
      let res: Response
      try {
        res = await fetch(TRANSCRIPTION_URL, { method: 'POST', body: form })
      } catch (e) {
        return (
          `ERROR: transcription service unreachable at ${TRANSCRIPTION_URL} — is the local ` +
          `Whisper service running? (${e instanceof Error ? e.message : String(e)})`
        )
      }
      if (!res.ok) return `ERROR: transcription service returned ${res.status}: ${await res.text()}`
      const data = await res.json()
      const segments: TranscriptSegment[] = (data.segments || []).map((s: any) => ({
        start: +Number(s.start).toFixed(3),
        end: +Number(s.end).toFixed(3),
        text: String(s.text ?? '').trim(),
        words: Array.isArray(s.words)
          ? s.words.map((w: any) => ({
              word: String(w.word ?? ''),
              start: +Number(w.start).toFixed(3),
              end: +Number(w.end).toFixed(3),
            }))
          : undefined,
      }))
      fs.writeFileSync(
        transcriptPath(base),
        JSON.stringify({ source: video, segments }, null, 2),
      )
      const lines = segments.map(s => `[${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s] ${s.text}`)
      let body = lines.join('\n')
      let truncated = false
      if (body.length > 20000) {
        body = body.slice(0, 20000)
        truncated = true
      }
      return (
        `Transcript: ${segments.length} segments (saved to recordings/transcript.json)` +
        `${truncated ? ' — TRUNCATED below, read the file for the rest' : ''}\n\n${body}`
      )
    } catch (e) {
      return `ERROR: transcription failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const detect_key_moments = tool({
  description:
    'Find visual key moments — hard scene cuts — via ffmpeg scene detection. These are ' +
    'the VISUAL prior: moments where something changed on screen, independent of the ' +
    'narration. Correlate them with the transcript yourself (a cut with no narration ' +
    'can still be an un-narrated action worth verifying). Saves to ' +
    'recordings/key-moments.json and returns the list.',
  args: {
    videoPath: tool.schema.string().describe('Path to the uploaded video file.'),
    threshold: tool.schema
      .number()
      .min(0.1)
      .max(0.9)
      .optional()
      .describe(`Scene-cut sensitivity (0.1-0.9, default ${SCENE_THRESHOLD}). Lower = more candidates.`),
  },
  async execute(args, context) {
    try {
      const base = baseDir(context)
      const video = resolveVideo(base, args.videoPath)
      if (!fs.existsSync(video)) return `ERROR: video not found: ${video}`
      ensureSessionForVideo(base, video)
      const threshold = args.threshold ?? SCENE_THRESHOLD
      // 2>&1 merges showinfo output into stdout, so parse stdout (stderr too on failure).
      const { stdout } = await execAsync(
        `ffmpeg -i ${q(video)} -vf "select='gt(scene,${threshold})',showinfo" -vsync vfr -an -f null - 2>&1`,
        { maxBuffer: BIG_BUFFER },
      ).catch(e => ({ stdout: `${e.stdout || ''}\n${e.stderr || e.message}` }))
      const lines = stdout.split('\n').filter(l => l.includes('pts_time:'))
      const raw = lines
        .map(l => {
          const t = l.match(/pts_time:([\d.]+)/)
          if (!t) return null
          const s = l.match(/lavfi\.scene_score=([\d.]+)/)
          return { timeSec: parseFloat(t[1]!), score: s ? parseFloat(s[1]!) : null }
        })
        .filter((m): m is { timeSec: number; score: number | null } => m !== null)
      // Dedupe bursts closer than DEDUPE_WINDOW_SEC (fade-through-black shows as
      // two cuts); keep the higher-scoring one.
      const moments: { timeSec: number; score: number | null }[] = []
      for (const m of raw) {
        const prev = moments[moments.length - 1]
        if (prev && m.timeSec - prev.timeSec < DEDUPE_WINDOW_SEC) {
          if ((m.score ?? 0) > (prev.score ?? 0)) moments[moments.length - 1] = m
          continue
        }
        moments.push(m)
      }
      const capped = moments.slice(0, MAX_KEY_MOMENTS)
      fs.writeFileSync(
        path.join(recordingsDir(base), 'key-moments.json'),
        JSON.stringify(capped, null, 2),
      )
      const linesOut = capped.map(
        m => `${m.timeSec.toFixed(2)}s${m.score != null ? ` (score ${m.score.toFixed(2)})` : ''}`,
      )
      return (
        `${capped.length} key moments (threshold ${threshold}, saved to recordings/key-moments.json):\n` +
        linesOut.join('\n')
      )
    } catch (e) {
      return `ERROR: key-moment detection failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const grab_frames = tool({
  description:
    'Extract frames around a timestamp (default: one before, one at, one after — a ' +
    'click is a temporal event, so a single frame cannot show it). Returns the frame ' +
    'file paths. Use inspect_frames instead when you want Gemini to analyse them; ' +
    'this tool is for grabbing frames without a vision call.',
  args: {
    videoPath: tool.schema.string().describe('Path to the uploaded video file.'),
    timeSec: tool.schema.number().describe('Centre timestamp, in video seconds.'),
    beforeSec: tool.schema.number().optional().describe('Look-back span (default 0.3s).'),
    afterSec: tool.schema.number().optional().describe('Look-ahead span (default 0.5s).'),
    frameCount: tool.schema.number().min(1).max(8).optional().describe('Frames to grab (default 3).'),
  },
  async execute(args, context) {
    try {
      const base = baseDir(context)
      const video = resolveVideo(base, args.videoPath)
      if (!fs.existsSync(video)) return `ERROR: video not found: ${video}`
      const before = args.beforeSec ?? 0.3
      const after = args.afterSec ?? 0.5
      const count = args.frameCount ?? 3
      const times = linspace(args.timeSec - before, args.timeSec + after, count)
      const frames = await extractFrames(video, times, path.join(recordingsDir(base), 'frames'))
      if (!frames.length) return 'ERROR: no frames could be extracted (timestamps past EOF?)'
      return JSON.stringify(frames, null, 2)
    } catch (e) {
      return `ERROR: frame extraction failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const inspect_frames = tool({
  description:
    'Ask Gemini 3 Flash (Agentic Vision, code execution enabled) to verify a candidate ' +
    'action window. Grabs frames across the window, attaches the matching transcript ' +
    'excerpt (plus one sentence of context on each side), and asks WHERE on screen the ' +
    'action happens — the element clicked/filled, or the region showing the result the ' +
    'narration refers to (NOT the mouse cursor) — and WHEN. Returns structured JSON: ' +
    '{ actionFound, actionTimeSec, eventType, bbox, confidence, label }. bbox is in ' +
    'full-frame 1920x1080 pixels and feeds record_zoom_in directly. If actionFound is ' +
    'false, skip the window or widen it and retry once.',
  args: {
    videoPath: tool.schema.string().describe('Path to the uploaded video file.'),
    windowStartSec: tool.schema
      .number()
      .describe('Window start in video seconds (pad ~2s before the narrated phrase).'),
    windowEndSec: tool.schema
      .number()
      .describe('Window end in video seconds (pad ~3s after the narrated phrase).'),
    frameCount: tool.schema
      .number()
      .min(2)
      .max(8)
      .optional()
      .describe('Frames sampled across the window (default 3).'),
    question: tool.schema
      .string()
      .optional()
      .describe("Optional steer, e.g. 'find where the create-project modal appears'."),
  },
  async execute(args, context) {
    try {
      const base = baseDir(context)
      const video = resolveVideo(base, args.videoPath)
      if (!fs.existsSync(video)) return `ERROR: video not found: ${video}`
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) return 'ERROR: GEMINI_API_KEY is not set'
      if (args.windowEndSec <= args.windowStartSec)
        return 'ERROR: windowEndSec must be greater than windowStartSec'

      const count = args.frameCount ?? 3
      const times = linspace(args.windowStartSec, args.windowEndSec, count)
      const frames = await extractFrames(video, times, path.join(recordingsDir(base), 'frames'))
      if (!frames.length) return 'ERROR: no frames could be extracted for this window'
      const excerpt = transcriptExcerpt(base, args.windowStartSec, args.windowEndSec)

      const prompt =
        `You are verifying a candidate action in a narrated product-demo screen recording ` +
        `(${FRAME_W}x${FRAME_H}).\n` +
        `Attached are ${frames.length} frames taken at these timestamps (seconds into the video): ` +
        `${frames.map(f => f.timeSec).join(', ')}.\n` +
        `The narrator says around this window:\n"""\n${excerpt}\n"""\n` +
        (args.question ? `Focus: ${args.question}\n` : '') +
        `\nFind WHERE on screen the described action happens — the UI element being clicked or ` +
        `filled, or the region that visibly changes / displays the result the narration refers ` +
        `to. The target is the element or content region the action is ABOUT, not the mouse ` +
        `cursor. Use code execution to crop/zoom into frames if you need a closer look.\n` +
        `Also decide WHEN the action visually happens: pick the frame timestamp that best ` +
        `matches the visible change (button press, text appearing, page/modal transition).\n` +
        `Respond with JSON only, no prose:\n` +
        `{\n` +
        `  "actionFound": boolean,\n` +
        `  "actionTimeSec": number | null,\n` +
        `  "eventType": "click" | "fill" | "navigate" | "result" | "none",\n` +
        `  "bbox": { "x": int, "y": int, "w": int, "h": int } | null,\n` +
        `  "confidence": number,\n` +
        `  "label": string\n` +
        `}\n` +
        `bbox is in pixels of the full ${FRAME_W}x${FRAME_H} frame. If nothing actionable is ` +
        `visible, return actionFound=false.`

      const parts: any[] = [{ text: prompt }]
      for (const f of frames) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: fs.readFileSync(f.filePath).toString('base64'),
          },
        })
      }
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:` +
        `generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          tools: [{ codeExecution: {} }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      })
      if (!res.ok) return `ERROR: Gemini vision call failed: ${res.status} ${await res.text()}`
      const data = await res.json()
      const resParts = data.candidates?.[0]?.content?.parts ?? []
      const texts = resParts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text)
      const raw =
        [...texts].reverse().find((t: string) => t.includes('{')) || texts[texts.length - 1] || ''
      let parsed: any = {}
      try {
        parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, ''))
      } catch {
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) {
          try {
            parsed = JSON.parse(m[0])
          } catch {}
        }
      }
      const bboxIn = parsed.bbox
      const bbox =
        bboxIn && typeof bboxIn === 'object'
          ? {
              x: clamp(Math.round(Number(bboxIn.x) || 0), 0, FRAME_W),
              y: clamp(Math.round(Number(bboxIn.y) || 0), 0, FRAME_H),
              w: clamp(Math.round(Number(bboxIn.w) || 0), 0, FRAME_W),
              h: clamp(Math.round(Number(bboxIn.h) || 0), 0, FRAME_H),
            }
          : null
      const eventTypes = ['click', 'fill', 'navigate', 'result', 'none']
      const observation = {
        actionFound: !!parsed.actionFound,
        actionTimeSec:
          parsed.actionTimeSec == null ? null : +Number(parsed.actionTimeSec).toFixed(3),
        eventType: eventTypes.includes(parsed.eventType) ? parsed.eventType : 'none',
        bbox,
        confidence: clamp(Number(parsed.confidence) || 0, 0, 1),
        label: String(parsed.label ?? '').slice(0, 140),
      }
      // Append-only log — the raw material for a future edit-plan review UI.
      fs.appendFileSync(
        path.join(recordingsDir(base), 'vision-log.jsonl'),
        JSON.stringify({
          at: new Date().toISOString(),
          window: [args.windowStartSec, args.windowEndSec],
          frames: frames.map(f => f.filePath),
          excerpt,
          observation,
        }) + '\n',
      )
      return JSON.stringify(observation, null, 2)
    } catch (e) {
      return `ERROR: inspection failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const record_zoom_in = tool({
  description:
    'Record a camera zoom-in onto a verified action. Pass the bbox returned by ' +
    'inspect_frames — the zoom level auto-fits the element (small controls get a ' +
    'tighter zoom, large regions a looser one, clamped to 1.3-2.2) and the camera is ' +
    'clamped so the zoom window never leaves the frame. Alternatively pass explicit ' +
    'x/y (pixel centre) with an optional zoom. Call this once per verified action.',
  args: {
    videoTimeSec: tool.schema
      .number()
      .describe('When the zoom lands, in video seconds — use inspect_frames actionTimeSec.'),
    bbox: tool.schema
      .object({
        x: tool.schema.number(),
        y: tool.schema.number(),
        w: tool.schema.number(),
        h: tool.schema.number(),
      })
      .optional()
      .describe('Element bounding box from inspect_frames (full-frame pixels).'),
    x: tool.schema.number().optional().describe('Explicit pixel centre x (ignored if bbox given).'),
    y: tool.schema.number().optional().describe('Explicit pixel centre y (ignored if bbox given).'),
    zoom: tool.schema
      .number()
      .min(1.2)
      .max(2.5)
      .optional()
      .describe('Explicit zoom (1.2-2.5). With a bbox this is capped by the auto-fit zoom.'),
  },
  async execute(args, context) {
    return withStateLock(async () => {
      try {
        const base = baseDir(context)
        const state = readState(base)
        let zoom = args.zoom ?? 1.7
        let cx: number | null = null
        let cy: number | null = null
        if (args.bbox) {
          const bw = clamp(args.bbox.w, 1, FRAME_W)
          const bh = clamp(args.bbox.h, 1, FRAME_H)
          const rawCx = clamp(args.bbox.x + bw / 2, 0, FRAME_W)
          const rawCy = clamp(args.bbox.y + bh / 2, 0, FRAME_H)
          // Auto-fit: element fills ~half the frame. Mirrors fitZoomForBox() in
          // zoom-filter.ts and the live zoom_in tool.
          const fit = Math.min((FRAME_W * 0.5) / bw, (FRAME_H * 0.5) / bh)
          const fitZoom = clamp(fit, 1.3, 2.2)
          zoom = args.zoom == null ? fitZoom : Math.min(args.zoom, fitZoom)
          // Keep the zoom window fully inside the frame (same clamp as demo-tools).
          const halfW = (FRAME_W / 2) / zoom
          const halfH = (FRAME_H / 2) / zoom
          cx = clamp(rawCx, halfW, FRAME_W - halfW)
          cy = clamp(rawCy, halfH, FRAME_H - halfH)
        } else if (args.x != null && args.y != null) {
          const halfW = (FRAME_W / 2) / zoom
          const halfH = (FRAME_H / 2) / zoom
          cx = clamp(args.x, halfW, FRAME_W - halfW)
          cy = clamp(args.y, halfH, FRAME_H - halfH)
        } else {
          return 'ERROR: provide either bbox or x/y — nothing recorded.'
        }
        state.zoomEvents.push({ type: 'in', videoTimeSec: args.videoTimeSec, x: cx, y: cy, zoom })
        writeState(base, state)
        return JSON.stringify({ status: 'zoom_in_recorded', videoTimeSec: args.videoTimeSec, x: cx, y: cy, zoom: +zoom.toFixed(2) })
      } catch (e) {
        return `ERROR: ${e instanceof Error ? e.message : String(e)}`
      }
    })
  },
})

export const record_zoom_out = tool({
  description:
    'Record a camera zoom-out back to the full view. Call when the recording moves to a ' +
    'new page/section, or when a highlight is done — never leave the camera parked on a ' +
    'stale target across a navigation.',
  args: {
    videoTimeSec: tool.schema.number().describe('When the zoom-out lands, in video seconds.'),
  },
  async execute(args, context) {
    return withStateLock(async () => {
      try {
        const base = baseDir(context)
        const state = readState(base)
        state.zoomEvents.push({ type: 'out', videoTimeSec: args.videoTimeSec })
        writeState(base, state)
        return JSON.stringify({ status: 'zoom_out_recorded', videoTimeSec: args.videoTimeSec })
      } catch (e) {
        return `ERROR: ${e instanceof Error ? e.message : String(e)}`
      }
    })
  },
})

export const record_click = tool({
  description:
    'Record a cursor/click event at a verified action point (drives the gliding-cursor ' +
    'overlay and click emphasis downstream). Only call when inspect_frames confirmed a ' +
    'real click/fill (eventType click or fill) with decent confidence — a missed click ' +
    'just means no emphasis there, a phantom click adds noise.',
  args: {
    videoTimeSec: tool.schema.number().describe('Click time in video seconds (inspect_frames actionTimeSec).'),
    x: tool.schema.number().describe('Click pixel x (bbox centre).'),
    y: tool.schema.number().describe('Click pixel y (bbox centre).'),
  },
  async execute(args, context) {
    return withStateLock(async () => {
      try {
        const base = baseDir(context)
        const state = readState(base)
        state.clickEvents.push({
          videoTimeSec: args.videoTimeSec,
          x: clamp(args.x, 0, FRAME_W),
          y: clamp(args.y, 0, FRAME_H),
        })
        writeState(base, state)
        return JSON.stringify({
          status: 'click_recorded',
          videoTimeSec: args.videoTimeSec,
          x: clamp(args.x, 0, FRAME_W),
          y: clamp(args.y, 0, FRAME_H),
        })
      } catch (e) {
        return `ERROR: ${e instanceof Error ? e.message : String(e)}`
      }
    })
  },
})
