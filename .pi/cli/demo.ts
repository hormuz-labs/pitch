/**
 * `pitch demo` — driving and narrating the recorded browser.
 *
 * The agent drives an ALREADY-OPEN browser (pitch demo record-start opens it
 * and starts the capture) and schedules narration alongside its steps. Browser
 * steps go to the host as typed operations (`pitch demo browser click e53`);
 * the host runs them on its Playwright page over CDP. Nothing here starts a
 * process or a shell. Capture events go into recording/demo-state.json;
 * video-editing owns camera moves and all post-processing after the
 * synchronized source is prepared.
 *
 * These commands run in the studio process with the session's workspace as
 * authority. All state lives under recording/ (demo-config.json,
 * demo-state.json, slideshow-progress.json, pending-grounding.json,
 * slide-analyses.json, audio/, grounding/) — the same layout
 * apps/api/src/render/recording.ts writes.
 *
 * Handoff contract — pitch demo record-start writes recording/demo-config.json
 * BEFORE the agent drives the page: { startTime, voiceName, assetsManifestPath?,
 * storyboard? }. startTime anchors every event timestamp (wall-clock ms → video
 * seconds); voiceName selects the TTS voice; an approved storyboard supplies
 * persistent slide overlays.
 */

import { randomUUID } from 'node:crypto'
import { Type } from '@sinclair/typebox'
import fs from 'fs'
import path from 'path'
import {
  ANNOTATION_STYLES,
  type AnnotationStyle,
  buildAnnotateEvalJs,
  buildClearAnnotationsJs,
} from '../lib/annotations.ts'
import {
  type AssetManifestLike,
  applyStoryboardToSlides,
  pageRectToViewportRect,
  resolveManifestSlides,
  type StoryboardOverlaySceneLike,
} from '../lib/asset-demo.ts'
import { projectAudioConfig } from '../lib/audio-config.ts'
import {
  type BrowserOp,
  isSlideAdvance,
  parseBrowserCommand,
  parseRef,
} from '../lib/browser-command.ts'
import {
  buildGeminiTtsBody,
  clampToFrame,
  createWavHeader,
  type ElementBox,
  FRAME_H,
  FRAME_W,
  parseMimeType,
} from '../lib/demo-core.ts'
import type { DemoState } from '../lib/demo-state.ts'
import { waitForNarration } from '../lib/demo-timing.ts'
import {
  chooseNarratedEmphasisSource,
  type PendingNarrationEmphasis,
  resolveNarrationEmphasis,
} from '../lib/narrated-emphasis.ts'
import { workspaceOf } from '../lib/paths.ts'
import {
  advanceSlideshowProgress,
  assertCurrentSlideAnalyzed,
  createSlideshowProgress,
  markCurrentSlideAnalyzed,
  markCurrentSlideNarrated,
  type SlideshowProgress,
} from '../lib/slideshow-progress.ts'
import { type RunningSlideshowServer, startSlideshowServer } from '../lib/slideshow-server.ts'
import { hostAction } from '../lib/studio-host.ts'
import {
  analyzeVisualSlide,
  groundVisualRegion,
  type SlideAnalysis,
  type ViewportRect,
} from '../lib/visual-grounding.ts'
import type { CommandSpec } from './registry.ts'

// Serialize state updates within a recording, without one slow browser blocking
// every other project hosted by this worker.
const stateLocks = new Map<string, Promise<void>>()
let activeSlideshowServer: RunningSlideshowServer | null = null
async function withStateLock<T>(base: string, fn: () => Promise<T>): Promise<T> {
  const previous = stateLocks.get(base) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  const tail = previous.then(() => current)
  stateLocks.set(base, tail)
  await previous
  try {
    return await fn()
  } finally {
    release()
    if (stateLocks.get(base) === tail) stateLocks.delete(base)
  }
}

interface DemoConfig {
  startTime: number
  voiceName?: string
  assetsManifestPath?: string
  storyboard?: {
    status?: string
    transition?: 'fade' | 'slide' | 'zoom'
    scenes?: StoryboardOverlaySceneLike[]
  }
}

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview'

// ── path / state helpers ───────────────────────────────────────────────────
/** Session working directory: pi's ctx.cwd (what OpenCode called context.directory). */
const baseDir = workspaceOf
function configPath(base: string) {
  return path.join(base, 'recording', 'demo-config.json')
}
function statePath(base: string) {
  return path.join(base, 'recording', 'demo-state.json')
}
function slideshowProgressPath(base: string) {
  return path.join(base, 'recording', 'slideshow-progress.json')
}
function pendingGroundingPath(base: string) {
  return path.join(base, 'recording', 'pending-grounding.json')
}
function slideAnalysisPath(base: string) {
  return path.join(base, 'recording', 'slide-analyses.json')
}
function readSlideshowProgress(base: string): SlideshowProgress | null {
  if (fs.existsSync(path.join(base, 'recording', 'browser.json'))) return null
  const progressPath = slideshowProgressPath(base)
  if (!fs.existsSync(progressPath)) return null
  return JSON.parse(fs.readFileSync(progressPath, 'utf-8'))
}
function writeSlideshowProgress(base: string, progress: SlideshowProgress) {
  fs.writeFileSync(slideshowProgressPath(base), JSON.stringify(progress, null, 2))
}
interface CachedSlideAnalysis {
  screenshotPath: string
  analysis: SlideAnalysis
}
function readSlideAnalyses(base: string): Record<string, CachedSlideAnalysis> {
  const analysisPath = slideAnalysisPath(base)
  if (!fs.existsSync(analysisPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(analysisPath, 'utf-8'))
  } catch {
    return {}
  }
}
function writeSlideAnalyses(base: string, analyses: Record<string, CachedSlideAnalysis>) {
  fs.writeFileSync(slideAnalysisPath(base), JSON.stringify(analyses, null, 2))
}
function readConfig(base: string): DemoConfig {
  const browser = path.join(base, 'recording', 'browser.json')
  if (fs.existsSync(browser)) return JSON.parse(fs.readFileSync(browser, 'utf8'))
  const p = configPath(base)
  if (!fs.existsSync(p)) {
    throw new Error(`Demo config not found at ${p}. The worker must write it before prompting.`)
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function readState(base: string): DemoState {
  const p = statePath(base)
  if (!fs.existsSync(p) || fs.existsSync(path.join(base, 'recording', 'browser.json'))) {
    const cfg = readConfig(base)
    return {
      startTime: cfg.startTime,
      voiceName: cfg.voiceName || 'Charon',
      audioClips: [],
      clickEvents: [],
    }
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeState(base: string, state: DemoState) {
  // Rehearsal must never overwrite a previous take's events.
  if (fs.existsSync(path.join(base, 'recording', 'browser.json'))) return
  fs.writeFileSync(statePath(base), JSON.stringify(state, null, 2))
}

function readAssetManifest(base: string): { path: string; manifest: AssetManifestLike } {
  const manifestPath = readConfig(base).assetsManifestPath
  if (!manifestPath) {
    throw new Error('This job has no prepared PDF/image asset manifest.')
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Asset manifest not found at ${manifestPath}`)
  }
  return {
    path: manifestPath,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf-8')),
  }
}

// ── the browser ────────────────────────────────────────────────────────────
// The page lives in the studio process and is driven over CDP by the host
// (apps/api/src/render/utils/browser-driver.ts). These are the only ways in:
// no subprocess, no shell.

interface BrowserStepResult {
  text: string
  box?: ElementBox
  url: string
}

async function browser(base: string, op: BrowserOp): Promise<BrowserStepResult> {
  return JSON.parse(await hostAction(base, 'demo_browser', { kind: 'run', op }))
}

async function elementBox(
  base: string,
  target: { ref?: string; selector?: string },
): Promise<ElementBox | null> {
  return JSON.parse(await hostAction(base, 'demo_browser', { kind: 'box', ...target }))
}

/** Run page JS (a function's source) on the page, or on the element a ref names. */
async function pageEval(base: string, fn: string, ref?: string): Promise<unknown> {
  return JSON.parse(await hostAction(base, 'demo_browser', { kind: 'evaluate', fn, ref }))
}

/** A click on the capture timeline; demo source checks the cursor saw one. */
function recordClick(state: DemoState, box: ElementBox) {
  const { x, y } = clampToFrame(box.ax, box.ay)
  state.clickEvents.push({
    videoTimeSec: (Date.now() - state.startTime) / 1000,
    x,
    y,
    hand: box.hand,
  })
}

interface NarrationEmphasisArgs {
  target?: string
  rect?: ViewportRect
  coordinateSpace?: RectCoordinateSpace
  style?: AnnotationStyle
  color?: string
}

interface PendingGrounding extends PendingNarrationEmphasis<NarrationEmphasisArgs> {
  query: string
  label: string
  confidence: number
}

function readPendingGrounding(base: string): PendingGrounding | null {
  const pendingPath = pendingGroundingPath(base)
  if (!fs.existsSync(pendingPath)) return null
  return JSON.parse(fs.readFileSync(pendingPath, 'utf-8'))
}

function writePendingGrounding(base: string, grounding: PendingGrounding) {
  fs.writeFileSync(pendingGroundingPath(base), JSON.stringify(grounding, null, 2))
}

function clearPendingGrounding(base: string) {
  fs.rmSync(pendingGroundingPath(base), { force: true })
}

function defaultGroundingStyle(rect: ViewportRect): AnnotationStyle {
  return rect.widthPct / rect.heightPct >= 3 ? 'highlighter' : 'pulse'
}

async function getLiveViewportSize(base: string): Promise<{ width: number; height: number }> {
  const size = JSON.parse(await hostAction(base, 'demo_browser', { kind: 'viewport' }))
  if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) {
    throw new Error('Could not measure the recorded browser viewport.')
  }
  return size
}

/** Resolve PDF/image-page percentages against the live contained slideshow page. */
async function resolveViewportRect(
  base: string,
  rect: ViewportRect,
  coordinateSpace: RectCoordinateSpace,
): Promise<ViewportRect> {
  if (coordinateSpace === 'viewport') return rect
  const page = await elementBox(base, { selector: '.slide.active .page' })
  if (!page) {
    throw new Error('Could not measure the active slideshow page for an OCR rectangle.')
  }
  const viewport = await getLiveViewportSize(base)
  return pageRectToViewportRect(
    rect,
    { left: page.x, top: page.y, width: page.w, height: page.h },
    viewport,
  )
}

/**
 * Draw the callout immediately before the matching
 * narration clip is timestamped. Keeping this inside pitch demo narrate makes the
 * visual and spoken statistic one atomic beat instead of sequential agent calls.
 */
async function applyNarrationEmphasis(
  base: string,
  emphasis: NarrationEmphasisArgs,
): Promise<{ rect: ViewportRect; style: AnnotationStyle }> {
  const source = chooseNarratedEmphasisSource(emphasis)
  if (!source.target && !source.rect) {
    throw new Error('Narration emphasis requires either target or rect.')
  }
  const target = source.target ? parseRef(source.target, 'emphasis') : undefined

  let rect: ViewportRect
  if (target) {
    const box = await elementBox(base, { ref: target })
    if (!box) throw new Error('Narration emphasis target has no visible bounding box.')
    rect = {
      leftPct: (box.x / FRAME_W) * 100,
      topPct: (box.y / FRAME_H) * 100,
      widthPct: (box.w / FRAME_W) * 100,
      heightPct: (box.h / FRAME_H) * 100,
    }
  } else {
    rect = await resolveViewportRect(base, source.rect!, emphasis.coordinateSpace ?? 'page')
  }

  const style = emphasis.style ?? 'pulse'
  const js = buildAnnotateEvalJs({
    style,
    color: emphasis.color,
    ref: target,
    rect: target ? undefined : rect,
  })
  await pageEval(base, js, target)
  // Let the callout paint before the voice clip begins.
  await pageEval(
    base,
    '() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
  )
  return { rect, style }
}

// ── TTS ────────────────────────────────────────────────────────────────────
interface SpeakResult {
  success: boolean
  error?: string
  durationSecs?: number
  startTime?: number
}

async function speak(
  base: string,
  text: string,
  state: DemoState,
  beforeStart: () => Promise<void>,
  signal?: AbortSignal,
): Promise<SpeakResult> {
  if (!text.trim()) return { success: false, error: 'Narration text is empty' }
  console.log(`[Narrator]: ${text}`)
  const audioDir = path.join(base, 'recording', 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })
  const clipId = randomUUID()
  const audioFilePath = path.join(audioDir, `clip_${clipId}.wav`)
  const schedule = async (filePath: string, durationSecs: number): Promise<SpeakResult> => {
    if (!Number.isFinite(durationSecs) || durationSecs <= 0)
      throw new Error('Narration has no playable duration')
    // Generate first, then align speech and actions. Backdating before inference
    // puts speech over a static page and leaves the actual interaction silent.
    await beforeStart()
    const startTime = Date.now()
    state.audioClips.push({
      filePath,
      absoluteTimestamp: startTime,
      durationSec: durationSecs,
      text,
    })
    state.narrationEndTime = startTime + durationSecs * 1000
    return { success: true, durationSecs, startTime }
  }
  try {
    let projectOptions = {}
    try {
      projectOptions =
        JSON.parse(fs.readFileSync(path.join(base, 'project.json'), 'utf8')).options ?? {}
    } catch {
      /* Standalone recordings use the operator's audio defaults. */
    }
    const config = projectAudioConfig(projectOptions).tts
    if (config.provider === 'elevenlabs') {
      const out = `recording/audio/clip_${clipId}.mp3`
      const result = JSON.parse(
        await hostAction(base, 'elevenlabs_voiceover', {
          text,
          voiceId: config.elevenlabs.voice,
          model: config.elevenlabs.model,
          out,
          resultFormat: 'json',
        }),
      )
      const durationSecs = Number(result.durationSeconds)
      if (!Number.isFinite(durationSecs) || durationSecs <= 0)
        throw new Error('Narration has no playable duration')
      return await schedule(path.join(base, out), durationSecs)
    }
    const apiKey = process.env.GEMINI_TTS_API_KEY_2
    if (!apiKey) throw new Error('No Gemini API key found')
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`
    const currentVoice = state.voiceName || 'Charon'
    const ttsBody = buildGeminiTtsBody(GEMINI_TTS_MODEL, currentVoice, text)
    const request = () =>
      fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsBody),
        signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]),
      })
    let ttsRes = await request()
    if (ttsRes.status === 429 || ttsRes.status >= 500) {
      // One bounded host retry, keeping the exact script and scheduling nothing
      // until synthesis succeeds. Do not let the model repeatedly rewrite it.
      const header = ttsRes.headers?.get('retry-after')
      const seconds = header ? Number(header) : 1
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header!) - Date.now()
      if (Number.isFinite(delay) && delay >= 0 && delay <= 30_000) {
        await ttsRes.body?.cancel()
        await waitForNarration(Date.now() + delay, signal)
        ttsRes = await request()
      }
    }
    if (!ttsRes.ok) throw new Error(`TTS API failed: ${ttsRes.status} ${await ttsRes.text()}`)
    const ttsData = await ttsRes.json()
    const parts = ttsData.candidates?.[0]?.content?.parts ?? []
    const inlineData =
      parts.find(
        (part: any) =>
          part.inlineData?.data &&
          (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith('audio/')),
      )?.inlineData || ttsData.inlineData
    if (!inlineData?.data) {
      const reason =
        ttsData.promptFeedback?.blockReason ||
        ttsData.candidates?.[0]?.finishReason ||
        'unspecified'
      const kinds = parts.map((part: any) =>
        part.text ? 'text' : part.inlineData ? 'inlineData' : 'other',
      )
      throw new Error(
        `TTS returned no audio (finish/block reason: ${reason}; parts: ${kinds.join(',') || 'none'}). Preserve the script; do not substitute test phrases.`,
      )
    }
    const rawPcmBuffer = Buffer.from(inlineData.data, 'base64')
    const responseMimeType = inlineData.mimeType || 'audio/pcm;rate=24000'
    const options = parseMimeType(responseMimeType)
    const finalAudioBuffer = Buffer.concat([
      createWavHeader(rawPcmBuffer.length, options),
      rawPcmBuffer,
    ])
    const byteRate = options.sampleRate * options.numChannels * (options.bitsPerSample / 8)
    const durationSecs = rawPcmBuffer.length / byteRate
    fs.writeFileSync(audioFilePath, finalAudioBuffer)
    return await schedule(audioFilePath, durationSecs)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`Error speaking: ${errMsg}`)
    return { success: false, error: errMsg }
  }
}

// ── pi tool plumbing ───────────────────────────────────────────────────────
/** Wrap a command's string output in the result shape the CLI reads. */
function toolResult(out: unknown) {
  const value = typeof out === 'string' ? out : JSON.stringify(out)
  return { content: [{ type: 'text' as const, text: value }], details: {} }
}

const AnnotationStyleSchema = Type.Union(ANNOTATION_STYLES.map(style => Type.Literal(style)))

// ── tools ──────────────────────────────────────────────────────────────────
export default function demoCommands(): CommandSpec[] {
  const commands: CommandSpec[] = []
  commands.push({
    verb: 'browser',
    description:
      'Act on the open browser page, one step per call: snapshot, click e53, fill e7 "text", press ArrowRight, goto <url>, scroll 600, focus e12, eval "() => document.title", screenshot --filename recording/x.png, tab-new/tab-select/tab-list, wait 1000. Refs come from the latest snapshot. It drives the page only — it is not a shell. In prepared-asset slideshows, advance exactly one page at a time and only after the current page has narration.',
    parameters: Type.Object({
      command: Type.String({
        description:
          'One browser step, e.g. "click e53". An unknown verb lists the supported ones.',
      }),
    }),
    async execute(_id, args: any, signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      const op = parseBrowserCommand(String(args.command ?? ''))
      return withStateLock(base, async () => {
        console.log(`[browser]: ${args.command}`)
        const state = readState(base)
        const slideshowProgress = isSlideAdvance(op) ? readSlideshowProgress(base) : null
        let advanced: SlideshowProgress | null = null
        if (slideshowProgress) {
          await waitForNarration(state.narrationEndTime, signal)
          try {
            advanced = advanceSlideshowProgress(slideshowProgress, 1)
          } catch (error) {
            return toolResult(
              JSON.stringify({
                status: 'slide_advance_blocked',
                error: error instanceof Error ? error.message : String(error),
                currentSlide: slideshowProgress.currentSlide + 1,
                totalSlides: slideshowProgress.totalSlides,
                next: 'Narrate the current slide, then advance exactly once.',
              }),
            )
          }
          // Old callouts must not ride across the page transition.
          await pageEval(base, buildClearAnnotationsJs()).catch(error =>
            console.warn('Could not clear annotations before slide advance:', error),
          )
        }
        const result = await browser(base, op)
        if (advanced) writeSlideshowProgress(base, advanced)
        if (result.box && (op.op === 'click' || op.op === 'dblclick'))
          recordClick(state, result.box)
        else if (result.box && op.op === 'fill') recordClick(state, { ...result.box, hand: false })
        writeState(base, state)
        return toolResult(result.text)
      })
    },
  })

  commands.push({
    verb: 'narrate',
    description:
      'Schedule one complete spoken thought on the capture timeline and immediately continue interacting while it plays. Pass action to click or type as the line starts, without another model turn. Speech is muxed into demo source; this does not play live browser audio. Subsequent narration and record-stop wait for the line to finish.',
    parameters: Type.Object({
      text: Type.String({
        minLength: 1,
        description:
          'A complete spoken thought explaining intent or consequence; preserve approved script content',
      }),
      action: Type.Optional(
        Type.Union(
          [
            Type.Object({
              command: Type.String({
                description:
                  'One browser command using a fresh ref, e.g. click e53. Verify the resulting state afterward.',
              }),
            }),
            Type.Object({
              target: Type.String(),
              text: Type.String(),
              submit: Type.Optional(Type.Boolean()),
            }),
          ],
          {
            description:
              'Execute this click/navigation or visible field entry as speech begins. Only use refs from the current snapshot.',
          },
        ),
      ),
      focus: Type.Optional(
        Type.String({
          description:
            "Optional current ref (e.g. 'e53') for an offscreen subject. Smoothly scrolls it into view before speech; omit when the subject is already visible.",
        }),
      ),
      emphasis: Type.Optional(
        Type.Object(
          {
            target: Type.Optional(Type.String({ description: 'Current visible hotspot ref.' })),
            rect: Type.Optional(
              Type.Object({
                leftPct: Type.Number({ minimum: 0, maximum: 100 }),
                topPct: Type.Number({ minimum: 0, maximum: 100 }),
                widthPct: Type.Number({ minimum: 0.1, maximum: 100 }),
                heightPct: Type.Number({ minimum: 0.1, maximum: 100 }),
              }),
            ),
            coordinateSpace: Type.Optional(
              Type.Union([Type.Literal('page'), Type.Literal('viewport')], {
                description: 'page for OCR/manifest rectangles; viewport for Gemini grounding.',
              }),
            ),
            style: Type.Optional(AnnotationStyleSchema),
            color: Type.Optional(Type.String()),
          },
          {
            description:
              'Atomic visual emphasis shown as this line begins. Put the highlighted statistic near the start of text.',
          },
        ),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      if (fs.existsSync(path.join(base, 'recording', 'browser.json')) || readState(base).endTime) {
        throw new Error('Start the continuous take with demo record-start before narrating.')
      }
      const output = await withStateLock(base, async () => {
        const state = readState(base)
        await waitForNarration(state.narrationEndTime, _signal)
        const slideshowProgress = readSlideshowProgress(base)
        if (slideshowProgress) {
          try {
            assertCurrentSlideAnalyzed(slideshowProgress)
          } catch (error) {
            return toolResult(
              JSON.stringify({
                status: 'slide_analysis_required',
                error: error instanceof Error ? error.message : String(error),
                next: 'Call pitch demo analyze-slide, then narrate its summary or a returned point.',
              }),
            )
          }
        }
        // Bring the subject into the center of view (and show the scroll) before
        // speaking, so the narration always lands on something centered & visible.
        if (args.focus) await browser(base, { op: 'focus', ref: parseRef(args.focus, 'focus') })
        const pendingGrounding = readPendingGrounding(base)
        const emphasis = resolveNarrationEmphasis(
          args.emphasis as NarrationEmphasisArgs | undefined,
          pendingGrounding,
          slideshowProgress?.currentSlide,
        )
        // A grounding rectangle belongs to one narration opportunity on one slide.
        // Clear it before doing work so TTS retries cannot apply stale geometry later.
        if (pendingGrounding) clearPendingGrounding(base)

        let emphasisNote = ''
        const result = await speak(
          base,
          args.text,
          state,
          async () => {
            _signal?.throwIfAborted()
            if (!emphasis) return
            try {
              const applied = await applyNarrationEmphasis(base, emphasis)
              emphasisNote = `; emphasis=${applied.style}`
            } catch (error) {
              emphasisNote = `; emphasis failed: ${error instanceof Error ? error.message : String(error)}`
            }
          },
          _signal,
        )
        writeState(base, state)
        if (result.success) {
          const currentProgress = readSlideshowProgress(base)
          if (currentProgress) {
            writeSlideshowProgress(base, markCurrentSlideNarrated(currentProgress))
          }
          return toolResult(
            JSON.stringify({
              status: 'narration_started',
              text: args.text,
              durationSeconds: result.durationSecs,
              startTime: result.startTime,
              endTime: state.narrationEndTime,
              note: `Continue the demonstrated action now; speech is active on the source timeline${emphasisNote}.`,
            }),
          )
        }
        throw new Error(
          `TTS failed; no narration was scheduled: ${result.error}. Keep the take open and recover this beat.`,
        )
      })
      if (args.action && output.content[0]?.text.includes('"narration_started"')) {
        const verb = 'command' in args.action ? 'browser' : 'fill-field'
        const action = commands.find(command => command.verb === verb)!
        const result = await action.execute(_id, args.action, _signal, _onUpdate, ctx)
        return toolResult(`${output.content[0].text}\nAction result: ${JSON.stringify(result)}`)
      }
      return output
    },
  })

  commands.push({
    verb: 'narration-wait',
    description:
      'Hold the current view until its scheduled speech finishes. Use before clearing a slide callout or leaving its subject; clicks and typing that illustrate the line should happen before this. record-stop waits automatically.',
    parameters: Type.Object({}),
    async execute(_id, _args, signal, _onUpdate, ctx) {
      await waitForNarration(readState(baseDir(ctx)).narrationEndTime, signal)
      return toolResult('Narration finished. Continue to the next beat.')
    },
  })

  commands.push({
    verb: 'fill-field',
    description:
      'Type text into a form field with visible character-by-character typing. ALWAYS ' +
      'use this (or pitch demo browser fill) for text inputs so the viewer sees each value ' +
      'being entered. Keep the field visible; camera zooms belong to post-processing.',
    parameters: Type.Object({
      target: Type.String({
        description: "Field ref from snapshot (e.g. 'e53'). Do NOT include [ref=...].",
      }),
      text: Type.String({ description: 'The text to type into the field.' }),
      submit: Type.Optional(
        Type.Boolean({ description: 'Press Enter after typing (e.g. to submit/confirm).' }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      const op: BrowserOp = {
        op: 'fill',
        ref: parseRef(args.target, 'fill-field'),
        text: String(args.text ?? ''),
        submit: !!args.submit,
      }
      return withStateLock(base, async () => {
        const state = readState(base)
        const result = await browser(base, op)
        // A text field keeps the arrow cursor, never the hand.
        if (result.box) recordClick(state, { ...result.box, hand: false })
        writeState(base, state)
        return toolResult(result.text)
      })
    },
  })

  commands.push({
    verb: 'list-assets',
    description:
      'List the PDFs/images prepared for this video, including rendered PDF page paths, extracted text, and OCR hotspot regions.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      try {
        const { path: manifestPath, manifest } = readAssetManifest(baseDir(ctx))
        return toolResult(JSON.stringify({ manifestPath, ...manifest }, null, 2))
      } catch (error) {
        return toolResult(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    },
  })

  commands.push({
    verb: 'build-slideshow',
    description:
      'Build a full-screen explanatory slideshow from every prepared PDF page/image in manifest order. OCR regions become labelled hotspot refs for precise fallback emphasis.',
    parameters: Type.Object({
      transition: Type.Optional(
        Type.Union([Type.Literal('fade'), Type.Literal('slide')], {
          description:
            'Page navigation transition: fade or slide. Camera effects belong to post-processing.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      try {
        const config = readConfig(base)
        const { manifest } = readAssetManifest(base)
        const reviewedStoryboard =
          config.storyboard?.status === 'approved' ? config.storyboard : null
        const slides = applyStoryboardToSlides(
          resolveManifestSlides(manifest),
          reviewedStoryboard?.scenes,
        )
        if (slides.length === 0) {
          return toolResult(
            JSON.stringify({
              error: 'No slides exist in the prepared asset manifest.',
            }),
          )
        }
        await activeSlideshowServer?.close()
        const requestedTransition = reviewedStoryboard?.transition ?? args.transition ?? 'fade'
        const transition = requestedTransition === 'zoom' ? 'fade' : requestedTransition
        activeSlideshowServer = await startSlideshowServer(slides, {
          transition,
        })
        const outputPath = path.join(base, 'recording', 'slideshow.html')
        fs.writeFileSync(outputPath, activeSlideshowServer.html)
        writeSlideshowProgress(base, createSlideshowProgress(slides.length))
        fs.rmSync(slideAnalysisPath(base), { force: true })
        const url = activeSlideshowServer.url
        return toolResult(
          JSON.stringify({
            status: 'slideshow_ready',
            url,
            path: outputPath,
            slideCount: slides.length,
            regionCount: slides.reduce((count, slide) => count + (slide.regions?.length ?? 0), 0),
            overlayCount: slides.reduce((count, slide) => count + (slide.overlays?.length ?? 0), 0),
            transition,
            ...(requestedTransition === 'zoom'
              ? {
                  editingNote:
                    'The storyboard requested a zoom transition. Capture uses fade; carry the zoom intention to video-editing.',
                }
              : {}),
            next: `Open ${url}, then call pitch demo analyze-slide on the current rendered page before narration.`,
          }),
        )
      } catch (error) {
        return toolResult(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    },
  })

  commands.push({
    verb: 'clear-annotations',
    description:
      'Remove transient callouts between points on the same page after narration-wait. Slideshow page advance clears these automatically.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(base, async () => {
        try {
          await pageEval(base, buildClearAnnotationsJs())
          return toolResult(JSON.stringify({ status: 'annotations_cleared' }))
        } catch (error) {
          return toolResult(
            JSON.stringify({
              status: 'clear_failed',
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      })
    },
  })

  commands.push({
    verb: 'analyze-slide',
    description:
      'Use Gemini to understand the actual rendered pixels on the current PDF/image slide. Returns a factual page summary and confidence-gated narration points with viewport rectangles, even when PDF text and OCR are empty. Call once on every slide before narration; results are cached by slide index.',
    parameters: Type.Object({
      refresh: Type.Optional(
        Type.Boolean({
          description: 'Ignore the per-slide cache and analyze the current pixels again.',
        }),
      ),
      minPointConfidence: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 1,
          description: 'Minimum confidence for a specific narrated visual fact; default 0.6.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(base, async () => {
        const progress = readSlideshowProgress(base)
        if (!progress) {
          return toolResult(
            JSON.stringify({ error: 'Slide analysis requires an active asset slideshow.' }),
          )
        }

        const slideIndex = progress.currentSlide
        const cache = readSlideAnalyses(base)
        const cached = cache[String(slideIndex)]
        if (cached && !args.refresh) {
          writeSlideshowProgress(base, markCurrentSlideAnalyzed(progress))
          return toolResult(
            JSON.stringify({
              status: 'slide_analyzed',
              slideIndex,
              cached: true,
              source: 'gemini_rendered_pixels',
              ...cached,
            }),
          )
        }

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return toolResult(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }))
        const analysisDir = path.join(base, 'recording', 'grounding')
        fs.mkdirSync(analysisDir, { recursive: true })
        const screenshotPath = path.join(analysisDir, `analysis-slide-${slideIndex + 1}.png`)
        try {
          await browser(base, { op: 'screenshot', file: path.relative(base, screenshotPath) })
          const analysis = await analyzeVisualSlide({
            apiKey,
            model:
              process.env.GEMINI_GROUNDING_MODEL ||
              process.env.GEMINI_VISION_MODEL ||
              'gemini-3.5-flash',
            imageBase64: fs.readFileSync(screenshotPath).toString('base64'),
            minPointConfidence: args.minPointConfidence,
          })
          cache[String(slideIndex)] = { screenshotPath, analysis }
          writeSlideAnalyses(base, cache)
          writeSlideshowProgress(base, markCurrentSlideAnalyzed(progress))
          return toolResult(
            JSON.stringify({
              status: 'slide_analyzed',
              slideIndex,
              cached: false,
              source: 'gemini_rendered_pixels',
              screenshotPath,
              analysis,
              next:
                analysis.narrationPoints.length > 0
                  ? 'Narrate a returned point with its rect as viewport emphasis; use pitch demo ground-region only to retry or locate another target.'
                  : 'Narrate only the cautious page summary without a guessed highlight.',
            }),
          )
        } catch (error) {
          return toolResult(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              slideIndex,
              screenshotPath,
            }),
          )
        }
      })
    },
  })

  commands.push({
    verb: 'ground-region',
    description:
      'Gemini grounding on the current 1920×1080 slide pixels: a confidence-gated viewport rect for a described target, even with no text layer. Use after pitch demo analyze-slide to correct a box or find another target; a found rect is staged for the next narration.',
    parameters: Type.Object({
      query: Type.String({
        description: 'A precise visual target, e.g. "the blue revenue bar for Q4".',
      }),
      minConfidence: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 1,
          description: 'Minimum accepted confidence, default 0.6.',
        }),
      ),
      style: Type.Optional(
        Type.Union(
          ANNOTATION_STYLES.map(style => Type.Literal(style)),
          {
            description:
              'Annotation style staged for the next narration; otherwise chosen from shape.',
          },
        ),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(base, async () => {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return toolResult(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }))
        const groundingDir = path.join(base, 'recording', 'grounding')
        fs.mkdirSync(groundingDir, { recursive: true })
        const screenshotPath = path.join(groundingDir, `frame-${Date.now()}.png`)
        try {
          await browser(base, { op: 'screenshot', file: path.relative(base, screenshotPath) })
          const result = await groundVisualRegion({
            apiKey,
            model:
              process.env.GEMINI_GROUNDING_MODEL ||
              process.env.GEMINI_VISION_MODEL ||
              'gemini-3.5-flash',
            imageBase64: fs.readFileSync(screenshotPath).toString('base64'),
            query: args.query,
          })
          const minConfidence = args.minConfidence ?? 0.6
          if (!result.found || result.confidence < minConfidence) {
            clearPendingGrounding(base)
            return toolResult(
              JSON.stringify({
                ...result,
                found: false,
                rect: null,
                screenshotPath,
                reason: result.found ? 'confidence_below_threshold' : 'target_not_found',
              }),
            )
          }
          const progress = readSlideshowProgress(base)
          if (!progress) throw new Error('Visual grounding requires an active asset slideshow.')
          writePendingGrounding(base, {
            slideIndex: progress.currentSlide,
            query: args.query,
            label: result.label,
            confidence: result.confidence,
            emphasis: {
              rect: result.rect!,
              coordinateSpace: 'viewport',
              style: args.style ?? defaultGroundingStyle(result.rect!),
            },
          })
          return toolResult(
            JSON.stringify({
              ...result,
              coordinateSpace: 'viewport',
              screenshotPath,
              stagedForNextNarration: true,
            }),
          )
        } catch (error) {
          clearPendingGrounding(base)
          return toolResult(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              screenshotPath,
            }),
          )
        }
      })
    },
  })
  return commands
}
