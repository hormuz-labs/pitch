/**
 * demo-generator tools
 *
 * Toolset for the product-demo agent (.opencode/agents/demo-generator.md). The
 * agent drives an ALREADY-OPEN browser (the worker attaches playwright-cli and
 * starts the recording before prompting) and narrates with Gemini TTS, while
 * these tools emit the zoom/click/audio events into recordings/demo-state.json
 * that the render pipeline (cursor-fx, zoom-filter, smart_trim, intro/outro)
 * consumes unchanged.
 *
 * Tool scoping is per-agent, not global: these tools are registered for every
 * session but only the demo-generator agent has them enabled (see the `tools:`
 * blocks in .opencode/agents/*.md). Skills are handled by opencode natively now
 * (the `skill` tool), so there is no load_skill here anymore.
 *
 * Worker handoff contract — the worker writes recordings/demo-config.json
 * BEFORE prompting: { startTime, voiceName }. startTime anchors every event
 * timestamp (wall-clock ms → video seconds); voiceName selects the TTS voice.
 */

import { tool } from '@opencode-ai/plugin'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
  tabEvents: TabEvent[]
  tabCreationTimes: Record<number, number>
  currentTabId: number
  lastTargetCoords: { ref: string; x: number; y: number } | null
}

interface DemoConfig {
  startTime: number
  voiceName?: string
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
function baseDir(context: any): string {
  return context?.directory || process.cwd()
}
function configPath(base: string) {
  return path.join(base, 'recordings', 'demo-config.json')
}
function statePath(base: string) {
  return path.join(base, 'recordings', 'demo-state.json')
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
      tabEvents: [{ tabId: 0, wallSec: 0 }],
      tabCreationTimes: { 0: 0 },
      currentTabId: 0,
      lastTargetCoords: null,
    }
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function writeState(base: string, state: DemoState) {
  fs.writeFileSync(statePath(base), JSON.stringify(state, null, 2))
}

// All playwright-cli commands must run from the session directory so that
// files like demo.webm, snapshots, and traces are written where the worker
// expects them (targetDir), not from the OpenCode server's process cwd.
const run = (base: string, command: string) => execAsync(command, { cwd: base })

// Smoothly scroll a ref into the center of view BEFORE we zoom/click on it, so the
// recording shows the page gliding to the element instead of it snapping into place.
// Playwright awaits the promise returned by eval, so by the time this resolves the
// animation has finished and a follow-up snapshot reads the element's settled box.
// Self-skips (returns false) when the element is already comfortably in view, so it's
// safe to call unconditionally — e.g. right after a demo_zoom_in already scrolled it in.
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
function parseMimeType(mimeType: string): {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
} {
  const [, ...params] = mimeType.split(';').map(s => s.trim())
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim())
    if (key === 'rate' && value) options.sampleRate = parseInt(value, 10)
  }
  return options
}

function createWavHeader(
  dataLength: number,
  options: { numChannels: number; sampleRate: number; bitsPerSample: number },
) {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * bitsPerSample
  const buffer = Buffer.alloc(44)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}

interface SpeakResult {
  success: boolean
  error?: string
  durationSecs?: number
}

async function speak(base: string, text: string, state: DemoState): Promise<SpeakResult> {
  if (!text) return { success: true, durationSecs: 0 }
  console.log(`[Narrator]: ${text}`)
  const audioDir = path.join(base, 'recordings', 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })
  const clipId = state.audioClips.length
  const audioFilePath = path.join(audioDir, `clip_${clipId}.wav`)
  // Capture the start time BEFORE the TTS API call so the audio is placed at
  // the moment the narrator *would have spoken*, not after the inference delay.
  const playStartTime = Date.now()
  try {
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
    state.audioClips.push({ filePath: audioFilePath, absoluteTimestamp: playStartTime })
    if (durationSecs > 0) await new Promise(resolve => setTimeout(resolve, durationSecs * 1000))
    return { success: true, durationSecs }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error(`Error speaking: ${errMsg}`)
    return { success: false, error: errMsg }
  }
}

// ── tools ──────────────────────────────────────────────────────────────────
export const demo_bash = tool({
  description: 'Execute a bash command (e.g. playwright-cli commands).',
  args: {
    command: tool.schema.string().describe('The bash command to execute'),
  },
  async execute(args, context) {
    const base = baseDir(context)
    return withStateLock(async () => {
      const cmd = args.command
      console.log(`[bash]: ${cmd}`)

      const state = readState(base)
      const nowSec = (Date.now() - state.startTime) / 1000

      // Tab tracking must happen BEFORE exec
      if (cmd.startsWith('playwright-cli tab-new')) {
        const newTabId = Math.max(0, ...Object.keys(state.tabCreationTimes).map(Number)) + 1
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
      if (cmd.includes('click ') || cmd.includes('dblclick ')) {
        const parts = cmd.split(' ')
        const ref = parts.find(p => p.startsWith('e') && /^\d+$/.test(p.slice(1)))
        if (ref) {
          if (state.lastTargetCoords && state.lastTargetCoords.ref === ref) {
            clickCoords = { x: state.lastTargetCoords.x, y: state.lastTargetCoords.y }
          } else {
            // No matching zoom_in target — this click wasn't preceded by a zoom that
            // already framed (and scrolled to) the element, so it may be below the
            // fold. Smoothly scroll it into view so the recording shows the page
            // gliding to it, and so the box lookup below reads its settled position.
            await smoothScrollIntoView(base, ref)
            // Look up the ref's bounding box from a snapshot so every ref-based
            // click still gets a cursor overlay.
            try {
              const { stdout } = await run(base, `playwright-cli snapshot "${ref}" --boxes --json`)
              const parsed = JSON.parse(stdout)
              const text = parsed.snapshot || stdout
              const regex = new RegExp(
                `\\[ref=${ref}\\].*?\\[box=([\\d.]+),([\\d.]+),([\\d.]+),([\\d.]+)\\]`,
              )
              const m = text.match(regex)
              if (m) {
                clickCoords = {
                  x: parseFloat(m[1]!) + parseFloat(m[3]!) / 2,
                  y: parseFloat(m[2]!) + parseFloat(m[4]!) / 2,
                }
                state.lastTargetCoords = { ref, ...clickCoords }
              }
            } catch (_e) {
              // ignore lookup failure
            }
          }
          if (clickCoords) {
            clickTimestamp = Date.now()
            const videoTimeSec = (clickTimestamp - state.startTime) / 1000
            // Clamp into the visible frame so the cursor never lands off-screen.
            const cxClamped = Math.max(0, Math.min(1920, clickCoords.x))
            const cyClamped = Math.max(0, Math.min(1080, clickCoords.y))
            state.clickEvents.push({ videoTimeSec, x: cxClamped, y: cyClamped })
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

      // Only bother detecting navigation when the camera is zoomed — that's the
      // only case we act on, and the URL probe costs two extra playwright-cli
      // spawns, so we skip it otherwise.
      const isClickCmd = cmd.includes('click ') || cmd.includes('dblclick ')
      const lastZoom = state.zoomEvents[state.zoomEvents.length - 1]
      const wasZoomed = lastZoom?.type === 'in'
      const getUrl = async (): Promise<string | null> => {
        try {
          const { stdout } = await run(base, `playwright-cli eval "() => location.href"`)
          return stdout.trim()
        } catch {
          return null
        }
      }
      const urlBefore = isClickCmd && wasZoomed ? await getUrl() : null

      const result = await run(base, cmd)

      // If a click navigated to a new page/view while the camera was zoomed,
      // reset it (zoom out) so the new page is shown in full instead of the
      // camera staying parked on the old, now-meaningless click position.
      if (urlBefore !== null) {
        const urlAfter = await getUrl()
        if (urlAfter && urlAfter !== urlBefore) {
          const tSec = (Date.now() - state.startTime) / 1000
          state.zoomEvents.push({ type: 'out', videoTimeSec: tSec })
          console.log(`Navigation ${urlBefore} -> ${urlAfter}: auto zoom-out to reveal new page.`)
        }
      }

      writeState(base, state)
      return { output: JSON.stringify(result) }
    })
  },
})

export const demo_narrate = tool({
  description:
    'Speak a natural, conversational voiceover to the user. Use this tool to guide the user through the demo. ' +
    'When the line is ABOUT a specific element on the page, pass its ref as `focus`: the page smoothly ' +
    'scrolls to bring that element to the center of view (the viewer sees you travel there) BEFORE you start ' +
    'speaking, so you are always talking about something centered and visible — never about something off-screen.',
  args: {
    text: tool.schema.string().describe('The text to be spoken'),
    focus: tool.schema
      .string()
      .optional()
      .describe(
        "Optional element ref (e.g. 'e53') for the thing this line is about. The page smoothly scrolls it " +
          'to the center of view before the narration starts. ALWAYS pass this when talking about a specific ' +
          'on-page element — especially one below the current view — so the subject is centered and the ' +
          'scroll-to-it is shown. No-ops if it is already comfortably centered.',
      ),
  },
  async execute(args, context) {
    const base = baseDir(context)
    return withStateLock(async () => {
      const state = readState(base)
      // Bring the subject into the center of view (and show the scroll) before
      // speaking, so the narration always lands on something centered & visible.
      if (args.focus) {
        await smoothScrollIntoView(base, args.focus).catch(() => {})
      }
      const result = await speak(base, args.text, state)
      writeState(base, state)
      if (result.success) {
        return { output: `spoken: ${args.text} (${result.durationSecs!.toFixed(1)}s)` }
      }
      return {
        output: `TTS FAILED — audio was NOT recorded. Error: ${result.error}. Continue without narration for this clip; retry demo_narrate on the next step.`,
      }
    })
  },
})

export const demo_fill_field = tool({
  description:
    'Type text into a form field with visible character-by-character typing. ALWAYS ' +
    "use this for text inputs (never demo_bash 'playwright-cli fill') so the viewer " +
    'sees each value being entered. Zoom in on the field/form first so it is in view.',
  args: {
    target: tool.schema
      .string()
      .describe("Field ref from snapshot (e.g. 'e53'). Do NOT include [ref=...]."),
    text: tool.schema.string().describe('The text to type into the field.'),
    submit: tool.schema
      .boolean()
      .optional()
      .describe('Press Enter after typing (e.g. to submit/confirm).'),
  },
  async execute(args, context) {
    const base = baseDir(context)
    return withStateLock(async () => {
      const state = readState(base)
      const target = args.target
      const text = args.text ?? ''
      const shEsc = (s: string) => s.replace(/(["\\$`])/g, '\\$1')
      const clickSound = path.join(base, 'assets', 'sounds', 'click.mp3')

      // Cursor target: reuse the coords from the preceding zoom_in if they're for
      // this field (avoids an extra snapshot call); otherwise default to center.
      let cx = 960
      let cy = 540
      if (state.lastTargetCoords?.ref === target) {
        cx = state.lastTargetCoords.x
        cy = state.lastTargetCoords.y
      }

      // Record a cursor click + click sound on the field, then clear & focus it.
      const ts = Date.now()
      state.clickEvents.push({
        videoTimeSec: (ts - state.startTime) / 1000,
        x: Math.max(0, Math.min(1920, cx)),
        y: Math.max(0, Math.min(1080, cy)),
      })
      state.audioClips.push({ filePath: clickSound, absoluteTimestamp: ts })
      await run(base, `playwright-cli fill "${target}" ""`).catch(() => {})
      await run(base, `playwright-cli click "${target}"`).catch(() => {})

      // Reveal the value progressively, time-bounded: short fields type char by
      // char; long ones reveal in chunks, capped so even long text finishes quickly.
      const chars = [...text]
      const MAX_STEPS = 8
      const chunkSize = Math.max(1, Math.ceil(chars.length / MAX_STEPS))
      for (let i = 0; i < chars.length; i += chunkSize) {
        await run(
          base,
          `playwright-cli type "${shEsc(chars.slice(i, i + chunkSize).join(''))}"`,
        ).catch(() => {})
      }
      if (args.submit) await run(base, `playwright-cli press Enter`).catch(() => {})

      writeState(base, state)
      return {
        output: `typed "${text}" into ${target}${args.submit ? ' and submitted' : ''}`,
      }
    })
  },
})

export const demo_zoom_in = tool({
  description:
    'Move the cinematic camera to focus on a specific element. ' +
    "Pass the element's ref exactly as it appears (e.g. 'e53'). " +
    'IMPORTANT: if the camera is ALREADY zoomed in, calling this again on a ' +
    'nearby element smoothly PANS to it at the same zoom — do NOT zoom_out ' +
    'and zoom_in again for adjacent fields/buttons. ' +
    'Only call zoom_out when you are done highlighting this area entirely.',
  args: {
    target: tool.schema
      .string()
      .describe("Element ref from snapshot (e.g. 'e53'). Do NOT include [ref=...]."),
    zoom: tool.schema
      .number()
      .min(1.2)
      .max(2.5)
      .optional()
      .describe('Zoom level (1.2-2.5). Prefer ~1.7; keep it subtle, not a hard dive.'),
  },
  async execute(args, context) {
    const base = baseDir(context)
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
      const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const boxRegex = new RegExp(
        `\\[ref=${escapedTarget}\\].*?\\[box=([\\d.]+),([\\d.]+),([\\d.]+),([\\d.]+)\\]`,
      )
      const readBox = async (): Promise<RegExpMatchArray | null> => {
        const { stdout } = await run(base, `playwright-cli snapshot "${target}" --boxes --json`)
        let text = stdout
        try {
          text = JSON.parse(stdout).snapshot || stdout
        } catch {}
        return text.match(boxRegex)
      }
      try {
        // Smoothly scroll the element into view first so (a) the viewer sees the
        // page glide to it instead of it snapping into place, and (b) its bounding
        // box reflects where it will actually be when clicked. Box coords are
        // viewport-relative and NOT clamped, so an element below the fold would
        // otherwise report an off-screen position (e.g. y > 1080) and the
        // camera/cursor would land on empty space. No-ops if already in view.
        await smoothScrollIntoView(base, target)
        // Read the box; if the element is still settling (just scrolled in), give
        // it a moment and try once more before giving up.
        let m = await readBox()
        if (!m) {
          await new Promise(r => setTimeout(r, 300))
          m = await readBox()
        }
        if (m) {
          boxFound = true
          const bw = parseFloat(m[3]!)
          const bh = parseFloat(m[4]!)
          // The element's true center in the recorded frame (the page has already
          // been scrolled to bring it toward the middle where possible).
          const rawCx = parseFloat(m[1]!) + bw / 2
          const rawCy = parseFloat(m[2]!) + bh / 2
          // Auto-fit: pick a zoom so the element fills a comfortable share of the
          // frame — small controls get a tighter zoom, large cards a looser one.
          // Computed FIRST (before the clamp below needs the window size) and used
          // as a CEILING on any explicit zoom: a hard 2.2x dive into a big
          // section/container lands on the empty gap in its middle ("out of
          // place"), so never zoom tighter than what keeps the whole element
          // framed. Small precise elements have a large fit, so an explicit zoom
          // still applies to them.
          if (bw > 0 && bh > 0) {
            const FILL = 0.5 // target fraction of the frame the element occupies
            const fit = Math.min((1920 * FILL) / bw, (1080 * FILL) / bh)
            const fitZoom = Math.max(1.3, Math.min(2.2, fit))
            zoom = args.zoom == null ? fitZoom : Math.min(args.zoom, fitZoom)
          }
          // Pan the camera to the element, but keep the ZOOM WINDOW fully inside
          // the recorded 1920x1080 frame. The page is scrolled to center the
          // element when it can; near a document edge (the last/first element, a
          // short non-scrolling page) it can't be centered, so we pan as far as we
          // can while keeping the element fully visible — never cut off, never
          // parked on empty space past the page edge.
          const halfW = 960 / zoom
          const halfH = 540 / zoom
          cx = Math.max(halfW, Math.min(1920 - halfW, rawCx))
          cy = Math.max(halfH, Math.min(1080 - halfH, rawCy))
          console.log(
            `zoom_in target=${target} -> cx=${cx.toFixed(0)} cy=${cy.toFixed(0)} raw=(${rawCx.toFixed(0)},${rawCy.toFixed(0)}) zoom=${zoom.toFixed(2)}`,
          )
          // Cursor/click anchor is the ELEMENT itself (rawCx,rawCy), not the
          // clamped camera center — near an edge the camera frames a bit off the
          // element, but the cursor must still land ON it. It's a visible element
          // so its center is already inside the frame.
          state.lastTargetCoords = {
            ref: target,
            x: Math.max(0, Math.min(1920, rawCx)),
            y: Math.max(0, Math.min(1080, rawCy)),
          }
        } else {
          console.warn(`zoom_in target=${target} - no bounding box found`)
        }
      } catch (_e) {
        console.warn(`zoom_in target=${target} - snapshot failed`)
      }
      if (!boxFound) {
        // Could not locate the element's box — do NOT record a zoom to the
        // (960,540) default, which parks the camera "out of place" on empty
        // center. Leave the camera where it is and tell the agent to recover.
        console.warn(`zoom_in target=${target} - no box; skipping zoom (camera held)`)
        writeState(base, state)
        return {
          output: JSON.stringify({
            status: 'target_not_found',
            target,
            hint: 'That element had no visible box (off-screen, zero-size, or a stale ref). Take a fresh snapshot and zoom_in on a currently-visible ref — do not reuse old refs.',
          }),
        }
      }
      const videoTimeSec = (Date.now() - state.startTime) / 1000
      state.zoomEvents.push({ type: 'in', videoTimeSec, x: cx, y: cy, zoom })
      await new Promise(r => setTimeout(r, 250))
      writeState(base, state)
      return {
        output: JSON.stringify({ status: 'zoomed_in', videoTimeSec, x: cx, y: cy, zoom }),
      }
    })
  },
})

export const demo_zoom_out = tool({
  description: 'Zoom the camera back out to the full view.',
  args: {},
  async execute(_args, context) {
    const base = baseDir(context)
    return withStateLock(async () => {
      const state = readState(base)
      const videoTimeSec = (Date.now() - state.startTime) / 1000
      state.zoomEvents.push({ type: 'out', videoTimeSec })
      writeState(base, state)
      return { output: JSON.stringify({ status: 'zoomed_out', videoTimeSec }) }
    })
  },
})

export const demo_read_file = tool({
  description: 'Read a file from the filesystem',
  args: {
    path: tool.schema.string().describe('The path to the file'),
  },
  async execute(args) {
    const content = await fs.promises.readFile(args.path, 'utf-8')
    return { output: content }
  },
})
