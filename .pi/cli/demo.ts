/**
 * demo-generator — `pitch demo` commands
 *
 * Toolset for the product-demo agent (.pi/agents/demo-video). The agent
 * drives an ALREADY-OPEN browser (pitch demo record-start attaches playwright-cli and
 * starts the recording) and narrates with Gemini TTS, while these tools emit
 * the zoom/click/audio events into recording/demo-state.json that the render
 * pipeline (cursor-fx, zoom-filter, smart_trim, intro/outro) consumes unchanged.
 *
 * Every tool runs on the STUDIO HOST (not inside a sandbox) with the session's
 * cwd = the project workspace, so `recording/` and the playwright-cli session
 * directory resolve relative to it. All state lives under recording/
 * (demo-config.json, demo-state.json, slideshow-progress.json,
 * pending-grounding.json, slide-analyses.json, audio/, grounding/) — the same
 * layout apps/api/src/render/recording.ts writes.
 *
 * Several projects record at once in ONE studio process, so every
 * playwright-cli call is scoped to the session named after the workspace
 * (`-s=<basename(cwd)>`), matching the session pitch demo record-start attached.
 *
 * Handoff contract — pitch demo record-start writes recording/demo-config.json
 * BEFORE the agent drives the page: { startTime, voiceName, assetsManifestPath?,
 * storyboard? }. startTime anchors every event timestamp (wall-clock ms → video
 * seconds); voiceName selects the TTS voice; an approved storyboard supplies
 * persistent slide overlays.
 *
 * Skills are handled by pi natively, so there is no load_skill here. The agent
 * has no built-in read tool either, which is why pitch demo read-file exists.
 */

import { Type } from '@sinclair/typebox'
import fs from 'fs'
import path from 'path'
import { runAgentCommand } from '../lib/agent-command.ts'
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
  zoomEventForViewportRect,
} from '../lib/asset-demo.ts'
import { projectAudioConfig } from '../lib/audio-config.ts'
import {
  chunkTypedText,
  clampToFrame,
  computeZoomFraming,
  createWavHeader,
  ELEMENT_BOX_JS,
  type ElementBox,
  FRAME_H,
  FRAME_W,
  nextTabId,
  parseClickRef,
  parseElementBoxJson,
  parseMimeType,
} from '../lib/demo-core.ts'
import {
  chooseNarratedEmphasisSource,
  type PendingNarrationEmphasis,
  resolveNarrationEmphasis,
  runNarratedEmphasisBeat,
} from '../lib/narrated-emphasis.ts'
import { workspaceOf } from '../lib/paths.ts'
import {
  advanceSlideshowProgress,
  appendAutoZoomOut,
  assertCurrentSlideAnalyzed,
  countForwardSlideAdvances,
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

// Page-evaluated function that smoothly scrolls a target element to the vertical
// center of its scroll container (or the window), animating with requestAnimationFrame
// so the motion is CAPTURED on the recording. Playwright's own scrollIntoViewIfNeeded
// (triggered by hover/click) jumps instantly, so the viewer never sees the scroll — the
// element just pops into place. This animates over ~0.5–0.9s instead.
// Returns true if it actually scrolled, false if the element was already comfortably in view.
// Kept on a single line so it survives shell-escaping into `playwright-cli eval`.
const SMOOTH_SCROLL_JS =
  'el => new Promise(resolve => { function sa(n){let p=n.parentElement;while(p){const s=getComputedStyle(p);if(/(auto|scroll|overlay)/.test(s.overflowY)&&p.scrollHeight>p.clientHeight)return p;p=p.parentElement;}return null;} const c=sa(el); const r=el.getBoundingClientRect(); let start,target,viewH,set,topRef; if(c){const cr=c.getBoundingClientRect(); viewH=c.clientHeight; start=c.scrollTop; const center=(r.top-cr.top)+c.scrollTop+r.height/2; target=center-viewH/2; const max=c.scrollHeight-c.clientHeight; target=Math.max(0,Math.min(max,target)); set=v=>{c.scrollTop=v;}; topRef=cr.top;} else {viewH=window.innerHeight; start=window.scrollY; const center=r.top+window.scrollY+r.height/2; target=center-viewH/2; const max=document.documentElement.scrollHeight-window.innerHeight; target=Math.max(0,Math.min(max,target)); set=v=>window.scrollTo(0,v); topRef=0;} const delta=target-start; if(Math.abs(delta)<viewH*0.08){resolve(false);return;} const dur=Math.min(900,Math.max(450,Math.abs(delta)*0.9)); const t0=performance.now(); const ease=t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; function frame(now){const p=Math.min(1,(now-t0)/dur); set(start+delta*ease(p)); if(p<1)requestAnimationFrame(frame); else resolve(true);} requestAnimationFrame(frame); })'

// Simple mutex to serialize state reads/writes across concurrent tool calls.
let stateLock = Promise.resolve()
let activeSlideshowServer: RunningSlideshowServer | null = null
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

interface AudioClip {
  filePath: string
  absoluteTimestamp: number
  // Optional: clip the sound to this many seconds (used to match a keyboard sound
  // to the exact duration of the typing it accompanies).
  durationSec?: number
  // What was said (narration only). The renderer turns these into the beats the
  // studio shows as a scene strip, so the user can select a moment and edit it.
  text?: string
}

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
  // True when the target was a button/link (pressable). Drives the hand-pointer
  // cursor downstream; fields and plain content stay an arrow. See cursor-fx.ts.
  hand?: boolean
}

interface TabEvent {
  tabId: number
  wallSec: number
}

interface DemoState {
  startTime: number
  endTime?: number
  voiceName: string
  audioClips: AudioClip[]
  zoomEvents: ZoomEvent[]
  clickEvents: ClickEvent[]
  annotationEvents: { videoTimeSec: number }[]
  tabEvents: TabEvent[]
  tabCreationTimes: Record<number, number>
  currentTabId: number
  lastTargetCoords: { ref: string; x: number; y: number; hand?: boolean } | null
  pageUrl?: string
  pageUrlEvents: { videoTimeSec: number; url: string }[]
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

// Voice style descriptions — used as systemInstruction in the TTS call so the
// Gemini model produces a consistent speaking style that matches the preview
// audio the user heard when selecting the voice. These MUST stay in sync with
// the descriptions shown in CreateView.tsx and scripts/regenerate-voices.ts.
const VOICE_STYLES: Record<string, string> = {
  Orus: 'Speak in a deep, professional tone. Be calm and authoritative.',
  Charon: 'Speak in a clear, conversational tone. Be friendly and approachable.',
  Fenrir: 'Speak in a dynamic, excitable tone. Be energetic and enthusiastic.',
  Puck: 'Speak in an upbeat, energetic tone. Be lively and engaging.',
  Aoede: 'Speak in a natural, conversational tone. Be warm and relatable.',
  Kore: 'Speak in a confident, firm tone. Be direct and assured.',
}

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
  const p = configPath(base)
  if (!fs.existsSync(p)) {
    throw new Error(`Demo config not found at ${p}. The worker must write it before prompting.`)
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function readState(base: string): DemoState {
  const p = statePath(base)
  if (!fs.existsSync(p)) {
    const cfg = readConfig(base)
    return {
      startTime: cfg.startTime,
      voiceName: cfg.voiceName || 'Puck',
      audioClips: [],
      zoomEvents: [],
      clickEvents: [],
      annotationEvents: [],
      tabEvents: [{ tabId: 0, wallSec: 0 }],
      tabCreationTimes: { 0: 0 },
      currentTabId: 0,
      lastTargetCoords: null,
      pageUrlEvents: [],
    }
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeState(base: string, state: DemoState) {
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

function shellDoubleQuoteEscape(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

// All playwright-cli commands must run from the workspace so that files like
// demo.webm, snapshots, and traces are written where the render expects them,
// not from the studio process cwd — and they must be scoped to THIS project's
// playwright-cli session (named after the workspace directory, the name
// pitch demo record-start attached with) so concurrent projects never share a browser.
const run = (base: string, command: string) => {
  const session = path.basename(base)
  const scopedCommand =
    /^[a-zA-Z0-9_-]+$/.test(session) && command.startsWith('playwright-cli ')
      ? command.replace(/^playwright-cli\b/, `playwright-cli -s=${session}`)
      : command
  return runAgentCommand(scopedCommand, { cwd: base })
}

/**
 * Ask the browser for an element's bounding client rect. This is the source of
 * truth for where the element actually is in the recorded viewport, and avoids
 * the fragility of parsing `[box=...]` annotations from snapshot YAML (which can
 * match a nested child box or shift when the page reflows). The parse/validation
 * (incl. the --raw double-encoding fix) lives in parseElementBoxJson.
 */
async function getElementBox(base: string, ref: string): Promise<ElementBox | null> {
  try {
    const { stdout } = await run(base, `playwright-cli --raw eval '${ELEMENT_BOX_JS}' "${ref}"`)
    return parseElementBoxJson(stdout)
  } catch (e) {
    console.warn(`getElementBox ref=${ref} failed: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

type RectCoordinateSpace = 'page' | 'viewport'

interface NarrationEmphasisArgs {
  target?: string
  rect?: ViewportRect
  coordinateSpace?: RectCoordinateSpace
  style?: AnnotationStyle
  color?: string
  zoom?: number
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
  const { stdout } = await run(
    base,
    `playwright-cli --raw eval '() => ({width: window.innerWidth, height: window.innerHeight})'`,
  )
  let parsed: any = JSON.parse(stdout.trim())
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  if (!Number.isFinite(parsed?.width) || !Number.isFinite(parsed?.height)) {
    throw new Error('Could not measure the recorded browser viewport.')
  }
  return { width: parsed.width, height: parsed.height }
}

/** Resolve PDF/image-page percentages against the live contained slideshow page. */
async function resolveViewportRect(
  base: string,
  rect: ViewportRect,
  coordinateSpace: RectCoordinateSpace,
): Promise<ViewportRect> {
  if (coordinateSpace === 'viewport') return rect
  const page = await getElementBox(base, '.slide.active .page')
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
 * Start the camera move and draw the callout immediately before the matching
 * narration clip is timestamped. Keeping this inside pitch demo narrate makes the
 * visual and spoken statistic one atomic beat instead of sequential agent calls.
 */
async function applyNarrationEmphasis(
  base: string,
  state: DemoState,
  emphasis: NarrationEmphasisArgs,
): Promise<{ rect: ViewportRect; style: AnnotationStyle }> {
  const source = chooseNarratedEmphasisSource(emphasis)
  if (!source.target && !source.rect) {
    throw new Error('Narration emphasis requires either target or rect.')
  }

  let rect: ViewportRect
  if (source.target) {
    const box = await getElementBox(base, source.target)
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

  const zoomTimeSec = (Date.now() - state.startTime) / 1000
  state.zoomEvents.push(zoomEventForViewportRect(rect, zoomTimeSec, emphasis.zoom))
  state.lastTargetCoords = null

  const style = emphasis.style ?? 'pulse'
  const js = buildAnnotateEvalJs({
    style,
    color: emphasis.color,
    ref: source.target,
    rect: source.target ? undefined : rect,
  })
  const command = source.target
    ? `playwright-cli eval "${shellDoubleQuoteEscape(js)}" ${source.target}`
    : `playwright-cli eval "${shellDoubleQuoteEscape(js)}"`
  await run(base, command)
  state.annotationEvents.push({ videoTimeSec: (Date.now() - state.startTime) / 1000 })
  // Let the first animation frame paint before the voice clip begins.
  await new Promise(resolve => setTimeout(resolve, 100))
  return { rect, style }
}

// Smoothly scroll a ref into the center of view BEFORE we zoom/click on it, so the
// recording shows the page gliding to the element instead of it snapping into place.
// Playwright awaits the promise returned by eval, so by the time this resolves the
// animation has finished and a follow-up snapshot reads the element's settled box.
// Self-skips (returns false) when the element is already comfortably in view, so it's
// safe to call unconditionally — e.g. right after a pitch demo zoom-in already scrolled it in.
async function smoothScrollIntoView(base: string, ref: string): Promise<boolean> {
  try {
    const arg = `"${SMOOTH_SCROLL_JS.replace(/(["\\$`])/g, '\\$1')}"`
    const { stdout } = await run(base, `playwright-cli eval ${arg} ${ref}`)
    const scrolled = /true/.test(stdout)
    // Tiny settle buffer in case the CLI returns a hair before the final frame paints.
    if (scrolled) await new Promise(r => setTimeout(r, 150))
    return scrolled
  } catch (_e) {
    // Fall back to Playwright's own (instant) scroll so the element is at least in view.
    await run(base, `playwright-cli hover "${ref}"`).catch(() => {})
    return false
  }
}

// ── TTS ────────────────────────────────────────────────────────────────────
interface SpeakResult {
  success: boolean
  error?: string
  durationSecs?: number
}

async function speak(base: string, text: string, state: DemoState): Promise<SpeakResult> {
  if (!text) return { success: true, durationSecs: 0 }
  console.log(`[Narrator]: ${text}`)
  const audioDir = path.join(base, 'recording', 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })
  const clipId = state.audioClips.length
  const audioFilePath = path.join(audioDir, `clip_${clipId}.wav`)
  // Capture the start time BEFORE the TTS API call so the audio is placed at
  // the moment the narrator *would have spoken*, not after the inference delay.
  const playStartTime = Date.now()
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
      state.audioClips.push({
        filePath: path.join(base, out),
        absoluteTimestamp: playStartTime,
        text,
      })
      await new Promise(resolve => setTimeout(resolve, durationSecs * 1000))
      return { success: true, durationSecs }
    }
    const apiKey = process.env.GEMINI_TTS_API_KEY_2
    if (!apiKey) throw new Error('No Gemini API key found')
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`
    const currentVoice = state.voiceName || 'Puck'
    const styleInstruction = VOICE_STYLES[currentVoice] || ''
    // Prepend the voice style directive so the TTS model adjusts its delivery
    // to match the character the user heard in the preview. The style is baked
    // into the text content because this TTS model doesn't support systemInstruction.
    const styledText = styleInstruction ? `${styleInstruction}\n\n${text}` : text
    const ttsBody = {
      model: GEMINI_TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: styledText }] }],
      generationConfig: {
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } },
        },
      },
    }
    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsBody),
    })
    if (!ttsRes.ok) throw new Error(`TTS API failed: ${ttsRes.status} ${await ttsRes.text()}`)
    const ttsData = await ttsRes.json()
    const inlineData =
      ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData || ttsData.inlineData
    if (!inlineData?.data) throw new Error('TTS response missing inlineData')
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
    state.audioClips.push({ filePath: audioFilePath, absoluteTimestamp: playStartTime, text })
    if (durationSecs > 0) await new Promise(resolve => setTimeout(resolve, durationSecs * 1000))
    return { success: true, durationSecs }
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
    verb: 'bash',
    description:
      'Execute a bash command (e.g. playwright-cli commands). In prepared-asset slideshows, forward navigation is allowed exactly one page at a time and only after the current page has narration.',
    parameters: Type.Object({
      command: Type.String({ description: 'The bash command to execute' }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(async () => {
        const cmd = args.command
        console.log(`[bash]: ${cmd}`)

        const state = readState(base)
        const nowSec = (Date.now() - state.startTime) / 1000
        const advanceCount = countForwardSlideAdvances(cmd)
        const slideshowProgress = readSlideshowProgress(base)
        let advancedSlideshowProgress: SlideshowProgress | null = null
        if (advanceCount > 0 && slideshowProgress) {
          try {
            advancedSlideshowProgress = advanceSlideshowProgress(slideshowProgress, advanceCount)
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
          // The camera must reset before each page change. Agents sometimes forget
          // to call pitch demo zoom-out before pressing ArrowRight, which leaves the
          // video stuck zoomed in on the previous slide's highlight for the rest of
          // the demo. Inject the missing zoom-out deterministically.
          state.zoomEvents = appendAutoZoomOut(state.zoomEvents, nowSec, videoTimeSec => ({
            type: 'out',
            videoTimeSec,
          }))
          // Also clear any lingering callouts so old annotations do not persist
          // across the page transition if the agent skipped pitch demo clear-annotations.
          try {
            await run(
              base,
              `playwright-cli eval "${shellDoubleQuoteEscape(buildClearAnnotationsJs())}"`,
            )
          } catch (error) {
            console.warn(
              'Could not clear annotations before slide advance:',
              error instanceof Error ? error.message : String(error),
            )
          }
        }

        // Tab tracking must happen BEFORE exec
        if (cmd.startsWith('playwright-cli tab-new')) {
          const newTabId = nextTabId(state.tabCreationTimes)
          state.tabCreationTimes[newTabId] = nowSec
          state.tabEvents.push({ tabId: newTabId, wallSec: nowSec })
          state.currentTabId = newTabId
        } else if (cmd.startsWith('playwright-cli tab-select')) {
          const match = cmd.match(/tab-select (\d+)/)
          if (match) {
            const selectId = parseInt(match[1]!, 10)
            state.tabEvents.push({ tabId: selectId, wallSec: nowSec })
            state.currentTabId = selectId
          }
        }

        // Stamp click events/sounds when the click is dispatched, not after the
        // command returns. This keeps audio+cursor aligned with the visual click
        // even when the action triggers a slow page transition.
        let clickTimestamp: number | null = null
        let clickCoords: { x: number; y: number } | null = null
        let clickHand = false // did we click a button/link? drives the hand cursor
        if (cmd.includes('click ') || cmd.includes('dblclick ')) {
          const ref = parseClickRef(cmd)
          if (ref) {
            if (state.lastTargetCoords && state.lastTargetCoords.ref === ref) {
              clickCoords = { x: state.lastTargetCoords.x, y: state.lastTargetCoords.y }
              clickHand = !!state.lastTargetCoords.hand
            } else {
              // No matching zoom_in target — this click wasn't preceded by a zoom that
              // already framed (and scrolled to) the element, so it may be below the
              // fold. Smoothly scroll it into view so the recording shows the page
              // gliding to it, and so the box lookup below reads its settled position.
              await smoothScrollIntoView(base, ref)
              // Look up the element's true center from the browser so every ref-based
              // click gets a cursor overlay that actually lands on the target.
              const box = await getElementBox(base, ref)
              if (box) {
                // Use the cursor anchor (ax,ay): the element center for normal
                // controls, or the title/text for a large card so the cursor doesn't
                // land in an empty container gap.
                clickCoords = { x: box.ax, y: box.ay }
                clickHand = box.hand
                state.lastTargetCoords = { ref, ...clickCoords, hand: box.hand }
              }
            }
            if (clickCoords) {
              clickTimestamp = Date.now()
              const videoTimeSec = (clickTimestamp - state.startTime) / 1000
              // Clamp into the visible frame so the cursor never lands off-screen.
              const { x: cxClamped, y: cyClamped } = clampToFrame(clickCoords.x, clickCoords.y)
              state.clickEvents.push({ videoTimeSec, x: cxClamped, y: cyClamped, hand: clickHand })
              state.audioClips.push({
                filePath: path.join(base, 'assets', 'sounds', 'click.mp3'),
                absoluteTimestamp: clickTimestamp,
              })
            }
          }
        }

        // If the agent closes the browser themselves, save the video first.
        if (cmd.trim().startsWith('playwright-cli close')) {
          try {
            await run(base, 'playwright-cli video-stop')
            state.endTime = Date.now()
          } catch (_e) {}
        }

        // Only bother detecting a view change when the camera is zoomed — that's the
        // only case we act on, and the probe costs two extra playwright-cli spawns,
        // so we skip it otherwise. A "view change" is either a navigation (URL
        // change) OR a large overlay opening (a modal/drawer/filter panel that
        // covers a big share of the viewport, usually behind a full-screen backdrop).
        // Both mean the meaningful content is no longer where the click was, so the
        // camera must zoom out to reveal it in full instead of staying parked zoomed
        // on the now-stale click position.
        const isClickCmd = cmd.includes('click ') || cmd.includes('dblclick ')
        const lastZoom = state.zoomEvents[state.zoomEvents.length - 1]
        const wasZoomed = lastZoom?.type === 'in'
        // Signature = current URL + whether a large (>25% of viewport) fixed/absolute
        // overlay is visible. Compared before vs after the click, so a pre-existing
        // sticky element that's present in BOTH never triggers a false zoom-out.
        const VIEW_SIG_JS =
          "() => { let m=0; for (const e of document.querySelectorAll('div,aside,section,dialog,[role=dialog]')) { const s=getComputedStyle(e); if((s.position!=='fixed'&&s.position!=='absolute')||s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)<0.1) continue; const r=e.getBoundingClientRect(); const a=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0)); if(a>m)m=a; } return location.href+'|'+(m/(innerWidth*innerHeight)>0.25?'1':'0'); }"
        const getViewSig = async (): Promise<string | null> => {
          try {
            const { stdout } = await run(base, `playwright-cli eval "${VIEW_SIG_JS}"`)
            return stdout.trim()
          } catch {
            return null
          }
        }
        // Probe the page URL before the command runs. The URL we stamp in the render
        // must flip when the *action* starts (a click/form submit/goto), not after
        // Playwright waits for the full navigation/load to finish — otherwise the
        // browser header lags far behind the on-screen content.
        const isPlaywrightCmd = cmd.startsWith('playwright-cli')
        const shouldProbeView = isClickCmd && wasZoomed
        const extractUrlFromSig = (sig: string | null): string | null => {
          if (!sig) return null
          const pipe = sig.indexOf('|')
          return pipe >= 0 ? sig.slice(0, pipe) : null
        }
        const probeUrl = async (): Promise<string | null> => {
          if (!isPlaywrightCmd) return null
          try {
            const { stdout } = await run(base, `playwright-cli eval "() => location.href"`)
            // playwright-cli output can be wrapped in tool/logging noise, so extract
            // the first real URL from the stdout instead of trusting the whole string.
            const urlMatch = stdout.match(/https?:\/\/[^\s"'<>]+/)
            return urlMatch ? urlMatch[0].trim() : null
          } catch {
            return null
          }
        }

        let sigBefore: string | null = null
        let urlBefore: string | null = null
        if (shouldProbeView) {
          sigBefore = await getViewSig()
          urlBefore = extractUrlFromSig(sigBefore)
        } else if (isPlaywrightCmd) {
          urlBefore = await probeUrl()
        }

        const result = await run(base, cmd)
        if (advancedSlideshowProgress) {
          writeSlideshowProgress(base, advancedSlideshowProgress)
        }

        let sigAfter: string | null = null
        let urlAfter: string | null = null
        if (shouldProbeView) {
          sigAfter = await getViewSig()
          urlAfter = extractUrlFromSig(sigAfter)
        } else if (isPlaywrightCmd) {
          urlAfter = await probeUrl()
        }

        // Keep the demo state in sync with the current page URL so the final render
        // can stamp a browser header showing where the demo is taking place. Use the
        // command start time (nowSec) as the event timestamp so the header flips near
        // the moment the action begins, not after Playwright finishes waiting.
        if (urlBefore && urlBefore !== state.pageUrl) {
          state.pageUrlEvents.push({ videoTimeSec: nowSec, url: urlBefore })
          state.pageUrl = urlBefore
        }
        if (urlAfter && urlAfter !== state.pageUrl) {
          state.pageUrlEvents.push({ videoTimeSec: nowSec, url: urlAfter })
          state.pageUrl = urlAfter
        }

        // If the click changed the view (navigated OR opened a modal/drawer/filter)
        // while the camera was zoomed, zoom out so the new content shows in full
        // instead of the camera staying parked on the old click position.
        if (sigBefore !== null && sigAfter && sigAfter !== sigBefore) {
          const tSec = (Date.now() - state.startTime) / 1000
          state.zoomEvents.push({ type: 'out', videoTimeSec: tSec })
          console.log(`View changed after click (nav or overlay) — auto zoom-out to reveal it.`)
        }

        writeState(base, state)
        return toolResult(JSON.stringify(result))
      })
    },
  })

  commands.push({
    verb: 'narrate',
    description:
      'Speak one line of narration. Pass `focus` (an element ref) when the line is about a specific element: the page scrolls it to centre before speech. On a PDF/image slide pass `emphasis` (a rectangle from pitch demo analyze-slide or pitch demo ground-region) so the zoom and callout begin with the voice.',
    parameters: Type.Object({
      text: Type.String({ description: 'The text to be spoken' }),
      focus: Type.Optional(
        Type.String({
          description:
            "Optional element ref (e.g. 'e53') for the thing this line is about. The page smoothly scrolls it " +
            'to the center of view before the narration starts. ALWAYS pass this when talking about a specific ' +
            'on-page element — especially one below the current view — so the subject is centered and the ' +
            'scroll-to-it is shown. No-ops if it is already comfortably centered.',
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
            zoom: Type.Optional(Type.Number({ minimum: 1.2, maximum: 2.5 })),
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
      return withStateLock(async () => {
        const state = readState(base)
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
        if (args.focus) {
          await smoothScrollIntoView(base, args.focus).catch(() => {})
        }
        const pendingGrounding = readPendingGrounding(base)
        const emphasis = resolveNarrationEmphasis(
          args.emphasis as NarrationEmphasisArgs | undefined,
          pendingGrounding,
          slideshowProgress?.currentSlide,
        )
        // A grounding rectangle belongs to one narration opportunity on one slide.
        // Clear it before doing work so TTS retries cannot apply stale geometry later.
        if (pendingGrounding) clearPendingGrounding(base)

        let emphasisResult: { rect: ViewportRect; style: AnnotationStyle } | null = null
        let emphasisError: string | null = null
        let result: SpeakResult
        if (emphasis) {
          const beat = await runNarratedEmphasisBeat({
            emphasize: () => applyNarrationEmphasis(base, state, emphasis),
            narrate: () => speak(base, args.text, state),
          })
          emphasisResult = beat.emphasis
          emphasisError = beat.emphasisError
          result = beat.narration
        } else {
          result = await speak(base, args.text, state)
        }
        writeState(base, state)
        if (result.success) {
          const currentProgress = readSlideshowProgress(base)
          if (currentProgress) {
            writeSlideshowProgress(base, markCurrentSlideNarrated(currentProgress))
          }
          const emphasisNote = emphasisResult
            ? `; emphasis=${emphasisResult.style}`
            : emphasisError
              ? `; emphasis failed: ${emphasisError}`
              : ''
          return toolResult(
            `spoken: ${args.text} (${result.durationSecs!.toFixed(1)}s${emphasisNote})`,
          )
        }
        return toolResult(
          `TTS FAILED — audio was NOT recorded. Error: ${result.error}. Continue without narration for this clip; retry pitch demo narrate on the next step.`,
        )
      })
    },
  })

  commands.push({
    verb: 'fill-field',
    description:
      'Type text into a form field with visible character-by-character typing. ALWAYS ' +
      "use this for text inputs (never pitch demo bash 'playwright-cli fill') so the viewer " +
      'sees each value being entered. Zoom in on the field/form first so it is in view.',
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
      return withStateLock(async () => {
        const state = readState(base)
        const target = args.target
        const text = args.text ?? ''
        const shEsc = (s: string) => s.replace(/(["\\$`])/g, '\\$1')
        const clickSound = path.join(base, 'assets', 'sounds', 'click.mp3')

        // Cursor target: reuse the coords from the preceding zoom_in if they're for
        // this field (avoids an extra lookup call); otherwise ask the browser for
        // the field's true center instead of parking the cursor in the screen center.
        let cx = 960
        let cy = 540
        if (state.lastTargetCoords?.ref === target) {
          cx = state.lastTargetCoords.x
          cy = state.lastTargetCoords.y
        } else {
          const box = await getElementBox(base, target)
          if (box) {
            cx = box.cx
            cy = box.cy
          }
        }

        // Record a cursor click + click sound on the field, then clear & focus it.
        // hand:false — a text field keeps the arrow cursor, never the hand pointer.
        const ts = Date.now()
        const clamped = clampToFrame(cx, cy)
        state.clickEvents.push({
          videoTimeSec: (ts - state.startTime) / 1000,
          x: clamped.x,
          y: clamped.y,
          hand: false,
        })
        state.audioClips.push({ filePath: clickSound, absoluteTimestamp: ts })
        await run(base, `playwright-cli fill "${target}" ""`).catch(() => {})
        await run(base, `playwright-cli click "${target}"`).catch(() => {})

        // Reveal the value progressively, time-bounded: short fields type char by
        // char; long ones reveal in chunks, capped so even long text finishes quickly.
        for (const chunk of chunkTypedText(text)) {
          await run(base, `playwright-cli type "${shEsc(chunk)}"`).catch(() => {})
        }
        if (args.submit) await run(base, `playwright-cli press Enter`).catch(() => {})

        writeState(base, state)
        return toolResult(`typed "${text}" into ${target}${args.submit ? ' and submitted' : ''}`)
      })
    },
  })

  commands.push({
    verb: 'zoom-in',
    description:
      'Move the camera onto an element (ref from the snapshot). While already zoomed, calling it on a nearby element pans smoothly — do not zoom out between adjacent fields.',
    parameters: Type.Object({
      target: Type.String({
        description: "Element ref from snapshot (e.g. 'e53'). Do NOT include [ref=...].",
      }),
      zoom: Type.Optional(
        Type.Number({
          minimum: 1.2,
          maximum: 2.5,
          description: 'Zoom level (1.2-2.5). Prefer ~1.7; keep it subtle, not a hard dive.',
        }),
      ),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(async () => {
        const target = args.target
        const state = readState(base)
        let cx = 960,
          cy = 540
        // Default zoom; refined to auto-fit the element's bounding box below.
        let zoom = args.zoom || 1.7
        // Whether we actually located the element's box. If not, we must NOT zoom
        // to the (960,540) default — that lands the camera "out of place" on empty
        // center space. We leave the camera put and tell the agent to re-snapshot.
        let boxFound = false
        try {
          // Smoothly scroll the element into view first so (a) the viewer sees the
          // page glide to it instead of it snapping into place, and (b) its bounding
          // box reflects where it will actually be when clicked. Box coords are
          // viewport-relative and NOT clamped, so an element below the fold would
          // otherwise report an off-screen position (e.g. y > 1080) and the
          // camera/cursor would land on empty space. No-ops if already in view.
          await smoothScrollIntoView(base, target)
          // Read the box from the browser; if the element is still settling (just
          // scrolled in), give it a moment and try once more before giving up.
          let box = await getElementBox(base, target)
          if (!box) {
            await new Promise(r => setTimeout(r, 300))
            box = await getElementBox(base, target)
          }
          if (box) {
            boxFound = true
            const { cx: rawCx, cy: rawCy, ax, ay } = box
            // Auto-fit zoom + edge-safe camera clamp — see computeZoomFraming. Small
            // controls get a tighter zoom, large cards a looser one; an explicit zoom
            // is capped by the fit so a hard dive never lands on an empty gap.
            const framing = computeZoomFraming(box, args.zoom)
            cx = framing.cx
            cy = framing.cy
            zoom = framing.zoom
            console.log(
              `zoom_in target=${target} -> cx=${cx.toFixed(0)} cy=${cy.toFixed(0)} raw=(${rawCx.toFixed(0)},${rawCy.toFixed(0)}) zoom=${zoom.toFixed(2)}`,
            )
            // Cursor/click anchor is the ELEMENT (ax,ay), not the clamped camera
            // center — near an edge the camera frames a bit off the element, but the
            // cursor must still land ON it. (ax,ay) equals the center for normal
            // controls, or the title/text for a large card so the cursor isn't parked
            // in an empty container gap. The camera above still frames (rawCx,rawCy).
            const anchor = clampToFrame(ax, ay)
            state.lastTargetCoords = { ref: target, x: anchor.x, y: anchor.y, hand: box.hand }
          } else {
            console.warn(`zoom_in target=${target} - no bounding box found`)
          }
        } catch (_e) {
          console.warn(`zoom_in target=${target} - box lookup failed`)
        }
        if (!boxFound) {
          // Could not locate the element's box — do NOT record a zoom to the
          // (960,540) default, which parks the camera "out of place" on empty
          // center. Leave the camera where it is and tell the agent to recover.
          console.warn(`zoom_in target=${target} - no box; skipping zoom (camera held)`)
          writeState(base, state)
          return toolResult(
            JSON.stringify({
              status: 'target_not_found',
              target,
              hint: 'That element had no visible box (off-screen, zero-size, or a stale ref). Take a fresh snapshot and zoom_in on a currently-visible ref — do not reuse old refs.',
            }),
          )
        }
        const videoTimeSec = (Date.now() - state.startTime) / 1000
        state.zoomEvents.push({ type: 'in', videoTimeSec, x: cx, y: cy, zoom })
        await new Promise(r => setTimeout(r, 250))
        writeState(base, state)
        return toolResult(JSON.stringify({ status: 'zoomed_in', videoTimeSec, x: cx, y: cy, zoom }))
      })
    },
  })

  commands.push({
    verb: 'zoom-out',
    description: 'Zoom the camera back out to the full view.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(async () => {
        const state = readState(base)
        const videoTimeSec = (Date.now() - state.startTime) / 1000
        state.zoomEvents.push({ type: 'out', videoTimeSec })
        writeState(base, state)
        return toolResult(JSON.stringify({ status: 'zoomed_out', videoTimeSec }))
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
        Type.Union([Type.Literal('fade'), Type.Literal('slide'), Type.Literal('zoom')], {
          description:
            'Page transition. Use fade for calm material, slide for steps, zoom for reveals.',
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
        activeSlideshowServer = await startSlideshowServer(slides, {
          transition: reviewedStoryboard?.transition ?? args.transition,
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
            transition: reviewedStoryboard?.transition ?? args.transition ?? 'fade',
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
    description: 'Remove all explanatory callouts before advancing or highlighting another point.',
    parameters: Type.Object({}),
    async execute(_id, _args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(async () => {
        try {
          await run(
            base,
            `playwright-cli eval "${shellDoubleQuoteEscape(buildClearAnnotationsJs())}"`,
          )
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
      return withStateLock(async () => {
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
          await run(base, `playwright-cli screenshot --filename "${screenshotPath}"`)
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
      return withStateLock(async () => {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return toolResult(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }))
        const groundingDir = path.join(base, 'recording', 'grounding')
        fs.mkdirSync(groundingDir, { recursive: true })
        const screenshotPath = path.join(groundingDir, `frame-${Date.now()}.png`)
        try {
          await run(base, `playwright-cli screenshot --filename "${screenshotPath}"`)
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

  commands.push({
    verb: 'read-file',
    description: 'Read a file from the filesystem',
    parameters: Type.Object({
      path: Type.String({ description: 'The path to the file' }),
    }),
    async execute(_id, args: any) {
      const content = await fs.promises.readFile(args.path, 'utf-8')
      return toolResult(content)
    },
  })
  return commands
}
