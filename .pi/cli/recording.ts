/**
 * recording-editor — `pitch recording` commands.
 *
 * Runs on the worker host (cwd = repo root). Given an UPLOADED narrated screen
 * recording, these tools reconstruct the same recording/demo-state.json that
 * the live demo-generator agent emits — so the existing render engine
 * (zoom-filter, smart_trim, intro/outro) consumes it unchanged. Only
 * the EVENT SOURCE differs:
 *
 *   live flow:   playwright agent drives browser ──────────────→ demo-state.json
 *   upload flow: whisper transcript + ffmpeg scene cuts ──→ agent proposes windows
 *                     ──→ Agentic Vision verifies ──→ demo-state.json   (these tools)
 *
 * Tools:
 *   pitch recording probe-video        duration / resolution / fps / has-audio
 *   pitch recording transcribe-video   segment/word-level transcript via the local Whisper service
 *   pitch recording detect-key-moments scene-cut candidates (ffmpeg) — the visual prior
 *   pitch recording grab-frames        before/during/after frames at a timestamp
 *   pitch recording inspect-frames     Gemini 3 Flash + code execution (Agentic Vision) verifies an
 *                      action window → { bbox, actionTimeSec, eventType, confidence, label }
 *   pitch recording record-zoom-in     camera zoom event (auto-fit zoom derived from the verified bbox)
 *   pitch recording record-zoom-out    camera zoom-out event
 *   pitch recording record-click       cursor/click event (drives cursor fx downstream)
 *
 * External contracts:
 *   • whisper-cli + a ggml model (see ../lib/whisper.ts) — pitch recording transcribe-video:
 *     POST multipart form, field "file" (audio/wav) → whisper verbose_json shape:
 *     { segments: [{ start, end, text, words?: [{ word, start, end }] }] }
 *   • GEMINI_API_KEY — Gemini 3 Flash, called with code execution enabled
 *     (Agentic Vision). Override the model id via GEMINI_VISION_MODEL.
 *
 * Timeline rule: every *Sec value is seconds into the UPLOADED video's own
 * timeline. Nothing here trims; the render stage owns trimming.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Type } from '@sinclair/typebox'
import { workspaceOf } from '../lib/paths.ts'
import { hostAction } from '../lib/studio-host.ts'
import type { CommandSpec } from './registry.ts'

const execFileAsync = promisify(execFile)

// ── constants ────────────────────────────────────────────────────────────────
const FRAME_W = 1920
const FRAME_H = 1080
// Agentic Vision requires a Gemini 3 Flash variant with code execution enabled.
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3-flash-preview'
const SCENE_THRESHOLD = 0.3
const DEDUPE_WINDOW_SEC = 1.0
const MAX_KEY_MOMENTS = 80
const BIG_BUFFER = 64 * 1024 * 1024

// ── demo-state (same shape as demo-generator.ts) ────────────────────────────
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
  pageUrl?: string
  pageUrlEvents: { videoTimeSec: number; url: string }[]
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
    pageUrlEvents: [],
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

// ── tool result plumbing ─────────────────────────────────────────────────────
function text(out: string) {
  return { content: [{ type: 'text' as const, text: out }], details: {} }
}

// ── path helpers ─────────────────────────────────────────────────────────────
const baseDir = workspaceOf
function recordingsDir(base: string): string {
  const dir = path.join(base, 'recording')
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
      // Letterbox-scale to the same 1920x1080 space the render uses, so a box
      // normalized to this frame maps 1:1 onto the final camera coordinates.
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        String(t),
        '-i',
        video,
        '-frames:v',
        '1',
        '-vf',
        `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=decrease,` +
          `pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-q:v',
        '2',
        filePath,
      ])
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
  if (!segs.length)
    return '(no transcript available — pitch recording transcribe-video has not run)'
  const hits = segs.map((s, i) => (s.end >= start && s.start <= end ? i : -1)).filter(i => i >= 0)
  if (!hits.length) return '(no narration inside this window)'
  const lo = Math.max(0, hits[0]! - 1)
  const hi = Math.min(segs.length - 1, hits[hits.length - 1]! + 1)
  return segs
    .slice(lo, hi + 1)
    .map(s => `[${s.start.toFixed(1)}s] ${s.text.trim()}`)
    .join('\n')
}

// ── tools ────────────────────────────────────────────────────────────────────

export default function recordingCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'probe-video',
    description:
      'Probe an uploaded video: duration, resolution, frame rate, and whether it has an ' +
      'audio track. ALWAYS call this first — it also resets the edit session for a new ' +
      'upload so no stale events leak in.',
    parameters: Type.Object({
      videoPath: Type.String({ description: 'Path to the uploaded video file.' }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      try {
        const base = baseDir(ctx)
        const video = resolveVideo(base, args.videoPath)
        if (!fs.existsSync(video)) return text(`ERROR: video not found: ${video}`)
        ensureSessionForVideo(base, video)
        const { stdout } = await execFileAsync('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate',
          '-of',
          'json',
          video,
        ])
        const info = JSON.parse(stdout)
        const v = (info.streams || []).find((s: any) => s.codec_type === 'video')
        const a = (info.streams || []).find((s: any) => s.codec_type === 'audio')
        const duration = Number.parseFloat(info.format?.duration || '0')
        return text(
          JSON.stringify({
            videoPath: video,
            durationSec: +duration.toFixed(2),
            width: v?.width ?? null,
            height: v?.height ?? null,
            frameRate: v?.r_frame_rate ?? null,
            hasAudio: !!a,
            audioCodec: a?.codec_name ?? null,
          }),
        )
      } catch (e) {
        return text(`ERROR: probe failed — ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  })

  commands.push({
    verb: 'transcribe-video',
    description:
      "Transcribe the video's narration with whisper.cpp on the host: extracts the audio, " +
      'saves the full transcript with word timestamps to recording/transcript.json, and returns ' +
      'it with segment timestamps. Call once, after pitch recording probe-video. If it fails (a host problem) you ' +
      'can still continue with pitch recording detect-key-moments (visual-only candidates).',
    parameters: Type.Object({
      videoPath: Type.String({ description: 'Path to the uploaded video file.' }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      try {
        const base = baseDir(ctx)
        const video = resolveVideo(base, args.videoPath)
        if (!fs.existsSync(video)) return text(`ERROR: video not found: ${video}`)
        ensureSessionForVideo(base, video)
        // whisper runs where the render tier says (a render pod on a fleet,
        // here on a single box); the transcript comes back into recording/.
        recordingsDir(base)
        try {
          await hostAction(base, 'media_transcribe', {
            file: path.relative(base, video),
            out: path.relative(base, transcriptPath(base)),
          })
        } catch (e) {
          return text(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
        const segments: TranscriptSegment[] = readTranscript(base)
        const lines = segments.map(s => `[${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s] ${s.text}`)
        let body = lines.join('\n')
        let truncated = false
        if (body.length > 20000) {
          body = body.slice(0, 20000)
          truncated = true
        }
        return text(
          `Transcript: ${segments.length} segments (saved to recording/transcript.json)` +
            `${truncated ? ' — TRUNCATED below, read the file for the rest' : ''}\n\n${body}`,
        )
      } catch (e) {
        return text(`ERROR: transcription failed — ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  })

  commands.push({
    verb: 'detect-key-moments',
    description:
      'Find visual key moments — hard scene cuts — via ffmpeg scene detection. These are ' +
      'the VISUAL prior: moments where something changed on screen, independent of the ' +
      'narration. Correlate them with the transcript yourself (a cut with no narration ' +
      'can still be an un-narrated action worth verifying). Saves to ' +
      'recording/key-moments.json and returns the list.',
    parameters: Type.Object({
      videoPath: Type.String({ description: 'Path to the uploaded video file.' }),
      threshold: Type.Optional(
        Type.Number({
          minimum: 0.1,
          maximum: 0.9,
          description: `Scene-cut sensitivity (0.1-0.9, default ${SCENE_THRESHOLD}). Lower = more candidates.`,
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      try {
        const base = baseDir(ctx)
        const video = resolveVideo(base, args.videoPath)
        if (!fs.existsSync(video)) return text(`ERROR: video not found: ${video}`)
        ensureSessionForVideo(base, video)
        const threshold = Number(args.threshold ?? SCENE_THRESHOLD)
        if (!Number.isFinite(threshold)) return text('ERROR: threshold must be a number')
        // showinfo writes to stderr; parse it (and whatever a failure left behind).
        const { stdout } = await execFileAsync(
          'ffmpeg',
          [
            '-i',
            video,
            '-vf',
            `select='gt(scene,${threshold})',showinfo`,
            '-vsync',
            'vfr',
            '-an',
            '-f',
            'null',
            '-',
          ],
          { maxBuffer: BIG_BUFFER },
        )
          .then(r => ({ stdout: `${r.stdout}\n${r.stderr}` }))
          .catch(e => ({ stdout: `${e.stdout || ''}\n${e.stderr || e.message}` }))
        const lines = stdout.split('\n').filter(l => l.includes('pts_time:'))
        const raw = lines
          .map(l => {
            const t = l.match(/pts_time:([\d.]+)/)
            if (!t) return null
            const s = l.match(/lavfi\.scene_score=([\d.]+)/)
            return {
              timeSec: Number.parseFloat(t[1]!),
              score: s ? Number.parseFloat(s[1]!) : null,
            }
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
        return text(
          `${capped.length} key moments (threshold ${threshold}, saved to recording/key-moments.json):\n` +
            linesOut.join('\n'),
        )
      } catch (e) {
        return text(
          `ERROR: key-moment detection failed — ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    },
  })

  commands.push({
    verb: 'grab-frames',
    description:
      'Extract frames around a timestamp (default: one before, one at, one after — a ' +
      'click is a temporal event, so a single frame cannot show it). Returns the frame ' +
      'file paths. Use pitch recording inspect-frames instead when you want Gemini to analyse them; ' +
      'this command is for grabbing frames without a vision call.',
    parameters: Type.Object({
      videoPath: Type.String({ description: 'Path to the uploaded video file.' }),
      timeSec: Type.Number({ description: 'Centre timestamp, in video seconds.' }),
      beforeSec: Type.Optional(Type.Number({ description: 'Look-back span (default 0.3s).' })),
      afterSec: Type.Optional(Type.Number({ description: 'Look-ahead span (default 0.5s).' })),
      frameCount: Type.Optional(
        Type.Number({ minimum: 1, maximum: 8, description: 'Frames to grab (default 3).' }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      try {
        const base = baseDir(ctx)
        const video = resolveVideo(base, args.videoPath)
        if (!fs.existsSync(video)) return text(`ERROR: video not found: ${video}`)
        const before = args.beforeSec ?? 0.3
        const after = args.afterSec ?? 0.5
        const count = args.frameCount ?? 3
        const times = linspace(args.timeSec - before, args.timeSec + after, count)
        const frames = await extractFrames(video, times, path.join(recordingsDir(base), 'frames'))
        if (!frames.length)
          return text('ERROR: no frames could be extracted (timestamps past EOF?)')
        return text(JSON.stringify(frames, null, 2))
      } catch (e) {
        return text(
          `ERROR: frame extraction failed — ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    },
  })

  commands.push({
    verb: 'inspect-frames',
    description:
      'Verify a candidate action window with Gemini vision: samples frames across it, attaches the matching transcript excerpt, and returns { actionFound, actionTimeSec, eventType, bbox, confidence, label } — where on screen the action or its result happens (not the cursor) and when. bbox is full-frame 1920×1080 pixels, ready for pitch recording record-zoom-in. If actionFound is false, skip or widen once.',
    parameters: Type.Object({
      videoPath: Type.String({ description: 'Path to the uploaded video file.' }),
      windowStartSec: Type.Number({
        description: 'Window start in video seconds (pad ~2s before the narrated phrase).',
      }),
      windowEndSec: Type.Number({
        description: 'Window end in video seconds (pad ~3s after the narrated phrase).',
      }),
      frameCount: Type.Optional(
        Type.Number({
          minimum: 2,
          maximum: 8,
          description: 'Frames sampled across the window (default 3).',
        }),
      ),
      question: Type.Optional(
        Type.String({
          description: "Optional steer, e.g. 'find where the create-project modal appears'.",
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      try {
        const base = baseDir(ctx)
        const video = resolveVideo(base, args.videoPath)
        if (!fs.existsSync(video)) return text(`ERROR: video not found: ${video}`)
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return text('ERROR: GEMINI_API_KEY is not set')
        if (args.windowEndSec <= args.windowStartSec)
          return text('ERROR: windowEndSec must be greater than windowStartSec')

        const count = args.frameCount ?? 3
        const times = linspace(args.windowStartSec, args.windowEndSec, count)
        const frames = await extractFrames(video, times, path.join(recordingsDir(base), 'frames'))
        if (!frames.length) return text('ERROR: no frames could be extracted for this window')
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
          `  "box_2d": [ymin, xmin, ymax, xmax] | null,\n` +
          `  "confidence": number,\n` +
          `  "label": string\n` +
          `}\n` +
          `box_2d is the bounding box of the target element in Gemini's standard object-detection ` +
          `format: [ymin, xmin, ymax, xmax] with EVERY value normalized to 0-1000 relative to the ` +
          `image (y/vertical first, then x/horizontal). Do NOT return raw pixels and do NOT use ` +
          `x,y,w,h. If nothing actionable is visible, return actionFound=false and box_2d=null.`

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
        if (!res.ok)
          return text(`ERROR: Gemini vision call failed: ${res.status} ${await res.text()}`)
        const data = await res.json()
        const resParts = data.candidates?.[0]?.content?.parts ?? []
        const texts = resParts
          .filter((p: any) => typeof p.text === 'string')
          .map((p: any) => p.text)
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
        // Gemini object detection returns box_2d = [ymin, xmin, ymax, xmax]
        // normalized to 0-1000 (vertical axis first). Convert to full-frame pixel
        // {x, y, w, h} (top-left + size) which pitch recording record-zoom-in consumes.
        const rawBox = Array.isArray(parsed.box_2d) ? parsed.box_2d : parsed.bbox
        let bbox: { x: number; y: number; w: number; h: number } | null = null
        if (Array.isArray(rawBox) && rawBox.length >= 4) {
          const [ymin, xmin, ymax, xmax] = rawBox.map(Number)
          const x0 = clamp((Math.min(xmin, xmax) / 1000) * FRAME_W, 0, FRAME_W)
          const y0 = clamp((Math.min(ymin, ymax) / 1000) * FRAME_H, 0, FRAME_H)
          const x1 = clamp((Math.max(xmin, xmax) / 1000) * FRAME_W, 0, FRAME_W)
          const y1 = clamp((Math.max(ymin, ymax) / 1000) * FRAME_H, 0, FRAME_H)
          bbox = {
            x: Math.round(x0),
            y: Math.round(y0),
            w: Math.max(1, Math.round(x1 - x0)),
            h: Math.max(1, Math.round(y1 - y0)),
          }
        }
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
          `${JSON.stringify({
            at: new Date().toISOString(),
            window: [args.windowStartSec, args.windowEndSec],
            frames: frames.map(f => f.filePath),
            excerpt,
            observation,
          })}\n`,
        )
        return text(JSON.stringify(observation, null, 2))
      } catch (e) {
        return text(`ERROR: inspection failed — ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  })

  commands.push({
    verb: 'record-zoom-in',
    description:
      'Record a camera zoom-in at a verified action. Pass the bbox from pitch recording inspect-frames (the zoom auto-fits, 1.3–2.2, clamped to the frame) or explicit x/y with an optional zoom. Once per verified action.',
    parameters: Type.Object({
      videoTimeSec: Type.Number({
        description:
          'When the zoom lands, in video seconds — use pitch recording inspect-frames actionTimeSec.',
      }),
      bbox: Type.Optional(
        Type.Object(
          {
            x: Type.Number(),
            y: Type.Number(),
            w: Type.Number(),
            h: Type.Number(),
          },
          {
            description:
              'Element bounding box from pitch recording inspect-frames (full-frame pixels).',
          },
        ),
      ),
      x: Type.Optional(
        Type.Number({ description: 'Explicit pixel centre x (ignored if bbox given).' }),
      ),
      y: Type.Optional(
        Type.Number({ description: 'Explicit pixel centre y (ignored if bbox given).' }),
      ),
      zoom: Type.Optional(
        Type.Number({
          minimum: 1.2,
          maximum: 2.5,
          description: 'Explicit zoom (1.2-2.5). With a bbox this is capped by the auto-fit zoom.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      return withStateLock(async () => {
        try {
          const base = baseDir(ctx)
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
            // Keep the zoom window fully inside the frame (same clamp as the demo tools).
            const halfW = FRAME_W / 2 / zoom
            const halfH = FRAME_H / 2 / zoom
            cx = clamp(rawCx, halfW, FRAME_W - halfW)
            cy = clamp(rawCy, halfH, FRAME_H - halfH)
          } else if (args.x != null && args.y != null) {
            const halfW = FRAME_W / 2 / zoom
            const halfH = FRAME_H / 2 / zoom
            cx = clamp(args.x, halfW, FRAME_W - halfW)
            cy = clamp(args.y, halfH, FRAME_H - halfH)
          } else {
            return text('ERROR: provide either bbox or x/y — nothing recorded.')
          }
          state.zoomEvents.push({
            type: 'in',
            videoTimeSec: args.videoTimeSec,
            x: cx,
            y: cy,
            zoom,
          })
          writeState(base, state)
          return text(
            JSON.stringify({
              status: 'zoom_in_recorded',
              videoTimeSec: args.videoTimeSec,
              x: cx,
              y: cy,
              zoom: +zoom.toFixed(2),
            }),
          )
        } catch (e) {
          return text(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    },
  })

  commands.push({
    verb: 'record-zoom-out',
    description:
      'Record a camera zoom-out back to the full view. Call when the recording moves to a ' +
      'new page/section, or when a highlight is done — never leave the camera parked on a ' +
      'stale target across a navigation.',
    parameters: Type.Object({
      videoTimeSec: Type.Number({
        description: 'When the zoom-out lands, in video seconds.',
      }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      return withStateLock(async () => {
        try {
          const base = baseDir(ctx)
          const state = readState(base)
          state.zoomEvents.push({ type: 'out', videoTimeSec: args.videoTimeSec })
          writeState(base, state)
          return text(
            JSON.stringify({ status: 'zoom_out_recorded', videoTimeSec: args.videoTimeSec }),
          )
        } catch (e) {
          return text(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    },
  })

  commands.push({
    verb: 'record-click',
    description:
      'Record a click at a verified action point (drives the cursor overlay and click emphasis). Only when pitch recording inspect-frames confirmed a click or fill with decent confidence.',
    parameters: Type.Object({
      videoTimeSec: Type.Number({
        description: 'Click time in video seconds (pitch recording inspect-frames actionTimeSec).',
      }),
      x: Type.Number({ description: 'Click pixel x (bbox centre).' }),
      y: Type.Number({ description: 'Click pixel y (bbox centre).' }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      return withStateLock(async () => {
        try {
          const base = baseDir(ctx)
          const state = readState(base)
          state.clickEvents.push({
            videoTimeSec: args.videoTimeSec,
            x: clamp(args.x, 0, FRAME_W),
            y: clamp(args.y, 0, FRAME_H),
          })
          writeState(base, state)
          return text(
            JSON.stringify({
              status: 'click_recorded',
              videoTimeSec: args.videoTimeSec,
              x: clamp(args.x, 0, FRAME_W),
              y: clamp(args.y, 0, FRAME_H),
            }),
          )
        } catch (e) {
          return text(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    },
  })
  return commands
}
