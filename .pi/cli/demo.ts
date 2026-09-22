/**
 * demo-generator — `pitch demo` commands
 *
 * Toolset for the product-demo agent (.pi/agents/demo-video). The agent
 * drives an ALREADY-OPEN browser (pitch demo record-start attaches playwright-cli and
 * starts the recording) and schedules narration alongside browser interactions.
 * Capture events go into recording/demo-state.json; video-editing owns camera
 * moves and all post-processing after the synchronized source is prepared.
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
 * Skills are handled by pi natively. read-file is retained for older callers;
 * current sessions also have the built-in workspace read tool.
 */

import { randomUUID } from 'node:crypto'
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
} from '../lib/asset-demo.ts'
import { projectAudioConfig } from '../lib/audio-config.ts'
import {
  buildGeminiTtsBody,
  chunkTypedText,
  clampToFrame,
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
import { pointerGlideCode } from '../lib/demo-pointer.ts'
import type { DemoState } from '../lib/demo-state.ts'
import { assertBrowserCommandSucceeded, waitForNarration } from '../lib/demo-timing.ts'
import {
  chooseNarratedEmphasisSource,
  type PendingNarrationEmphasis,
  resolveNarrationEmphasis,
} from '../lib/narrated-emphasis.ts'
import { ASSETS_DIR, workspaceOf } from '../lib/paths.ts'
import {
  advanceSlideshowProgress,
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

function ensureWorkspaceClickSound(base: string): string {
  const targetDir = path.join(base, 'recording', 'audio')
  const targetPath = path.join(targetDir, 'click.mp3')
  if (fs.existsSync(targetPath)) return targetPath
  const candidates = [
    path.join(ASSETS_DIR, 'sounds', 'click.mp3'),
    path.join(ASSETS_DIR, 'sfx', 'click.mp3'),
  ]
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true })
        fs.copyFileSync(src, targetPath)
        return targetPath
      } catch {}
    }
  }
  return targetPath
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

function shellDoubleQuoteEscape(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

export const PLAYWRIGHT_CLI_VERBS = new Set([
  'open',
  'attach',
  'close',
  'detach',
  'goto',
  'type',
  'click',
  'dblclick',
  'fill',
  'drag',
  'drop',
  'hover',
  'select',
  'upload',
  'check',
  'uncheck',
  'snapshot',
  'find',
  'eval',
  'dialog-accept',
  'dialog-dismiss',
  'resize',
  'delete-data',
  'go-back',
  'go-forward',
  'reload',
  'press',
  'keydown',
  'keyup',
  'mousemove',
  'mousedown',
  'mouseup',
  'mousewheel',
  'screenshot',
  'pdf',
  'tab-list',
  'tab-new',
  'tab-close',
  'tab-select',
  'state-load',
  'state-save',
  'cookie-list',
  'cookie-get',
  'cookie-set',
  'cookie-delete',
  'cookie-clear',
  'localstorage-list',
  'localstorage-get',
  'localstorage-set',
  'localstorage-delete',
  'localstorage-clear',
  'sessionstorage-list',
  'sessionstorage-get',
  'sessionstorage-set',
  'sessionstorage-delete',
  'sessionstorage-clear',
  'requests',
  'request',
  'request-headers',
  'request-body',
  'response-headers',
  'response-body',
  'route',
  'route-list',
  'unroute',
  'network-state-set',
  'console',
  'run-code',
  'tracing-start',
  'tracing-stop',
  'video-start',
  'video-stop',
  'video-chapter',
  'video-show-actions',
  'video-hide-actions',
  'show',
  'pause-at',
  'resume',
  'step-over',
  'generate-locator',
  'highlight',
])

export function normalizePlaywrightCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('playwright-cli')) return trimmed
  const firstWord = trimmed.split(/\s+/)[0]
  if (firstWord && PLAYWRIGHT_CLI_VERBS.has(firstWord)) {
    return `playwright-cli ${trimmed}`
  }
  return trimmed
}

export function scopePlaywrightCommand(sessionName: string, command: string): string {
  const session = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const norm = normalizePlaywrightCommand(command)
  if (norm.startsWith('playwright-cli ') && !norm.includes('-s=') && !norm.includes('--session=')) {
    return norm.replace(/^playwright-cli\b/, `playwright-cli -s=${session}`)
  }
  return norm
}

const QUIET_PLAYWRIGHT_VERBS = new Set([
  'click',
  'dblclick',
  'hover',
  'mousemove',
  'mousedown',
  'mouseup',
  'mousewheel',
  'press',
  'keydown',
  'keyup',
])

export function compactPlaywrightCommand(command: string): string {
  if (!command.startsWith('playwright-cli ') || command.includes(' --raw ')) return command
  const words = command.trim().split(/\s+/)
  const verb = words.find(word => PLAYWRIGHT_CLI_VERBS.has(word))
  return verb && QUIET_PLAYWRIGHT_VERBS.has(verb)
    ? command.replace(/^playwright-cli\b/, 'playwright-cli --raw')
    : command
}

// All playwright-cli commands must run from the workspace so that files like
// demo.webm, snapshots, and traces are written where the render expects them,
// not from the studio process cwd — and they must be scoped to THIS project's
// playwright-cli session (named after the workspace directory, the name
// pitch demo record-start attached with) so concurrent projects never share a browser.
const run = async (base: string, command: string) => {
  const session = path.basename(base)
  const scopedCommand = scopePlaywrightCommand(session, compactPlaywrightCommand(command))
  return assertBrowserCommandSucceeded(await runAgentCommand(scopedCommand, { cwd: base }))
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
 * Draw the callout immediately before the matching
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

// Smoothly scroll a ref into view before clicking on it, so the
// recording shows the page gliding to the element instead of it snapping into place.
// Playwright awaits the promise returned by eval, so by the time this resolves the
// animation has finished and a follow-up snapshot reads the element's settled box.
// Self-skips (returns false) when the element is already comfortably in view, so it's
// safe to call when the element is already visible.
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
    await run(base, `playwright-cli hover "${ref}"`)
    return false
  }
}

async function glideToTarget(base: string, ref: string): Promise<void> {
  await run(
    base,
    `playwright-cli --raw run-code "${shellDoubleQuoteEscape(pointerGlideCode(ref))}"`,
  )
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
    verb: 'bash',
    description:
      'Execute a bash command (e.g. playwright-cli commands). In prepared-asset slideshows, forward navigation is allowed exactly one page at a time and only after the current page has narration.',
    parameters: Type.Object({
      command: Type.String({ description: 'The bash command to execute' }),
    }),
    async execute(_id, args: any, _signal, _onUpdate, ctx: any) {
      const base = baseDir(ctx)
      return withStateLock(base, async () => {
        const cmd = normalizePlaywrightCommand(args.command)
        if (
          /^playwright-cli\s+(?:(?:--raw|-s=\S+|--session=\S+)\s+)*(?:open|close|attach|detach|video-start|video-stop)\b/.test(
            cmd,
          )
        ) {
          throw new Error(
            'Use demo record-start --url as the first browser operation for a new walkthrough. Discover the route and recover inside one take; record-stop only at its end. browser-open is for explicitly unrecorded tasks.',
          )
        }
        console.log(`[bash]: ${cmd}`)

        const state = readState(base)
        let nowSec = (Date.now() - state.startTime) / 1000
        const advanceCount = countForwardSlideAdvances(cmd)
        const slideshowProgress = readSlideshowProgress(base)
        let advancedSlideshowProgress: SlideshowProgress | null = null
        if (advanceCount > 0 && slideshowProgress) {
          await waitForNarration(state.narrationEndTime, _signal)
          nowSec = (Date.now() - state.startTime) / 1000
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

        const pointerTarget = cmd.match(
          /^playwright-cli\s+(?:(?:--raw|-s=\S+|--session=\S+)\s+)*(?:click|dblclick|hover|check|uncheck)\s+["']?([a-zA-Z0-9]+)["']?(?=\s|$)/,
        )?.[1]
        if (pointerTarget && cmd.startsWith('playwright-cli ')) {
          await smoothScrollIntoView(base, pointerTarget)
          await glideToTarget(base, pointerTarget)
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
              // The target may be below the fold. Scroll it into view so the recording shows the page
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
                filePath: ensureWorkspaceClickSound(base),
                absoluteTimestamp: clickTimestamp,
              })
            }
          }
        }

        const isClickCmd = cmd.includes('click ') || cmd.includes('dblclick ')
        // Probe the page URL before the command runs. The URL we stamp in the render
        // must flip when the *action* starts (a click/form submit/goto), not after
        // Playwright waits for the full navigation/load to finish — otherwise the
        // browser header lags far behind the on-screen content.
        const isPlaywrightCmd = cmd.startsWith('playwright-cli')
        const mayNavigate =
          isClickCmd ||
          /\b(goto|go-back|go-forward|reload|tab-new)\b/.test(cmd) ||
          /\b(fill|press)\b.*(?:--submit|Enter)\b/.test(cmd)
        const probeUrl = async (): Promise<string | null> => {
          if (!isPlaywrightCmd) return null
          try {
            const { stdout } = await run(base, `playwright-cli --raw eval "() => location.href"`)
            // playwright-cli output can be wrapped in tool/logging noise, so extract
            // the first real URL from the stdout instead of trusting the whole string.
            const urlMatch = stdout.match(/https?:\/\/[^\s"'<>]+/)
            return urlMatch ? urlMatch[0].trim() : null
          } catch {
            return null
          }
        }

        const urlBefore = mayNavigate ? await probeUrl() : null

        const result = await run(base, cmd)
        // Element coordinates are only valid for the snapshot/page state that
        // produced them. Never carry a cached target through a navigation.
        if (mayNavigate || /\bsnapshot\b/.test(cmd)) state.lastTargetCoords = null
        if (advancedSlideshowProgress) {
          writeSlideshowProgress(base, advancedSlideshowProgress)
        }

        const urlAfter = mayNavigate ? await probeUrl() : null

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

        writeState(base, state)
        return toolResult(JSON.stringify(result))
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
        if (args.focus) {
          await smoothScrollIntoView(base, args.focus)
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

        let emphasisNote = ''
        const result = await speak(
          base,
          args.text,
          state,
          async () => {
            _signal?.throwIfAborted()
            if (!emphasis) return
            try {
              const applied = await applyNarrationEmphasis(base, state, emphasis)
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
        const verb = 'command' in args.action ? 'bash' : 'fill-field'
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
      "use this for text inputs (never pitch demo bash 'playwright-cli fill') so the viewer " +
      'sees each value being entered. Keep the field visible; camera zooms belong to post-processing.',
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
      return withStateLock(base, async () => {
        const state = readState(base)
        const target = args.target
        const text = args.text ?? ''
        const shEsc = (s: string) => s.replace(/(["\\$`])/g, '\\$1')
        const clickSound = ensureWorkspaceClickSound(base)

        // Cursor target: reuse the coords from the preceding interaction if they're for
        // this field (avoids an extra lookup call); otherwise ask the browser for
        // the field's true center instead of parking the cursor in the screen center.
        let cx = 960
        let cy = 540
        if (state.lastTargetCoords && state.lastTargetCoords.ref === target) {
          cx = state.lastTargetCoords.x
          cy = state.lastTargetCoords.y
        } else {
          const box = await getElementBox(base, target)
          if (box) {
            cx = box.cx
            cy = box.cy
          }
        }

        await smoothScrollIntoView(base, target)
        await run(base, `playwright-cli fill "${target}" ""`)
        await glideToTarget(base, target)
        // Record a cursor click + click sound after the approach, then focus it.
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
        await run(base, `playwright-cli click "${target}"`)

        // Reveal the value progressively, time-bounded: short fields type char by
        // char; long ones reveal in chunks, capped so even long text finishes quickly.
        for (const chunk of chunkTypedText(text)) {
          await run(base, `playwright-cli type "${shEsc(chunk)}"`)
        }
        if (args.submit) await run(base, `playwright-cli press Enter`)

        writeState(base, state)
        return toolResult(`typed "${text}" into ${target}${args.submit ? ' and submitted' : ''}`)
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
      return withStateLock(base, async () => {
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
