/**
 * Tests for .opencode/tools/demo-generator.ts — the product-demo agent's toolset.
 *
 * The tools drive playwright-cli via child_process.exec and narrate via the
 * Gemini TTS HTTP API, emitting zoom/click/audio events into
 * recordings/demo-state.json. To exercise them in isolation we:
 *   - alias @opencode-ai/plugin to a stub (see vitest.config.ts),
 *   - mock child_process.exec with a controllable fake playwright-cli,
 *   - stub global fetch for the TTS call,
 *   - use a real temp dir per test for the recordings/ state files.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── controllable fake playwright-cli (child_process.exec) ────────────────────
const h = vi.hoisted(() => ({
  calls: [] as string[],
  // Per-test dispatcher: given a command string, return stdout or throw to reject.
  handler: (_cmd: string): string => '',
}))

vi.mock('child_process', () => ({
  exec: (cmd: string, optsOrCb: any, maybeCb: any) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb
    h.calls.push(cmd)
    try {
      const stdout = h.handler(cmd)
      cb(null, { stdout, stderr: '' })
    } catch (e) {
      cb(e as Error, { stdout: '', stderr: String(e) })
    }
  },
}))

// The tool objects are typed against the real @opencode-ai/plugin (ToolContext /
// ToolResult), but these tests drive them through a stub (see vitest.config.ts
// alias). Import them loosely so calling `.execute(args, { directory })` and
// reading `.output` isn't fought by the production types.
import * as demoTools from '../.opencode/tools/demo-generator'
import { createWavHeader, parseMimeType } from '../.opencode/tools/demo-generator'

const { demo_bash, demo_fill_field, demo_narrate, demo_read_file, demo_zoom_in, demo_zoom_out } =
  demoTools as any

// ── per-test session harness ─────────────────────────────────────────────────
const START_TIME = 1_000_000_000_000 // fixed wall-clock anchor
let dir: string

// Returns `any`: the tools only read `context.directory`, but the real ToolContext
// type has many required fields we don't need in these unit tests.
function makeSession(cfg: Record<string, unknown> = {}): any {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-gen-'))
  fs.mkdirSync(path.join(dir, 'recordings'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'recordings', 'demo-config.json'),
    JSON.stringify({ startTime: START_TIME, voiceName: 'Puck', ...cfg }),
  )
  return { directory: dir }
}
const readState = () =>
  JSON.parse(fs.readFileSync(path.join(dir, 'recordings', 'demo-state.json'), 'utf-8'))
/** Fake box eval response used by getElementBox / smoothScrollIntoView.
 *  `hand` mirrors the real eval's button/link detection (defaults true = pressable). */
const boxJson = (b: Partial<Record<'x' | 'y' | 'w' | 'h', number>> & { hand?: boolean }) => {
  const x = b.x ?? 0
  const y = b.y ?? 0
  const w = b.w ?? 100
  const hh = b.h ?? 40
  return JSON.stringify({ x, y, w, h: hh, cx: x + w / 2, cy: y + hh / 2, hand: b.hand ?? true })
}

beforeEach(() => {
  h.calls = []
  h.handler = () => ''
  vi.spyOn(Date, 'now').mockReturnValue(START_TIME + 5000) // t = 5s into the video
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
})

// ── pure helpers ─────────────────────────────────────────────────────────────
describe('parseMimeType', () => {
  it('reads the sample rate from the mime parameters', () => {
    expect(parseMimeType('audio/L16;rate=48000')).toEqual({
      numChannels: 1,
      sampleRate: 48000,
      bitsPerSample: 16,
    })
  })

  it('falls back to 24000 Hz when no rate is present', () => {
    expect(parseMimeType('audio/pcm').sampleRate).toBe(24000)
  })
})

describe('createWavHeader', () => {
  it('writes a valid 44-byte RIFF/WAVE header with correct sizes', () => {
    const dataLength = 480
    const header = createWavHeader(dataLength, {
      numChannels: 1,
      sampleRate: 24000,
      bitsPerSample: 16,
    })
    expect(header).toHaveLength(44)
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.toString('ascii', 8, 12)).toBe('WAVE')
    expect(header.toString('ascii', 12, 16)).toBe('fmt ')
    expect(header.toString('ascii', 36, 40)).toBe('data')
    expect(header.readUInt32LE(4)).toBe(36 + dataLength) // RIFF chunk size
    expect(header.readUInt32LE(40)).toBe(dataLength) // data chunk size
    expect(header.readUInt16LE(20)).toBe(1) // PCM format
    expect(header.readUInt16LE(22)).toBe(1) // channels
    expect(header.readUInt32LE(24)).toBe(24000) // sample rate
    expect(header.readUInt32LE(28)).toBe(24000 * 1 * 2) // byte rate
    expect(header.readUInt16LE(32)).toBe(2) // block align
    expect(header.readUInt16LE(34)).toBe(16) // bits per sample
  })
})

// ── demo_read_file ───────────────────────────────────────────────────────────
describe('demo_read_file', () => {
  it('returns the file contents', async () => {
    const ctx = makeSession()
    const f = path.join(dir, 'note.txt')
    fs.writeFileSync(f, 'hello world')
    const res = await demo_read_file.execute({ path: f }, ctx)
    expect(res.output).toBe('hello world')
  })

  it('rejects when the file does not exist', async () => {
    const ctx = makeSession()
    await expect(
      demo_read_file.execute({ path: path.join(dir, 'nope.txt') }, ctx),
    ).rejects.toThrow()
  })
})

// ── demo_zoom_out ────────────────────────────────────────────────────────────
describe('demo_zoom_out', () => {
  it('appends a zoom-out event at the current video time and seeds state from config', async () => {
    const ctx = makeSession()
    const res = await demo_zoom_out.execute({}, ctx)
    const state = readState()
    expect(state.zoomEvents).toEqual([{ type: 'out', videoTimeSec: 5 }])
    expect(state.startTime).toBe(START_TIME)
    expect(state.voiceName).toBe('Puck')
    expect(JSON.parse(res.output).status).toBe('zoomed_out')
  })
})

// ── demo_zoom_in ─────────────────────────────────────────────────────────────
describe('demo_zoom_in', () => {
  it('records a zoom-in on the element and remembers the target coords', async () => {
    const ctx = makeSession()
    // scroll eval returns "false" (already in view); box eval returns a small control.
    h.handler = cmd => {
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 900, y: 500, w: 120, h: 40 })
      return 'false'
    }
    const res = await demo_zoom_in.execute({ target: 'e53' }, ctx)
    const out = JSON.parse(res.output)
    expect(out.status).toBe('zoomed_in')
    const state = readState()
    expect(state.zoomEvents).toHaveLength(1)
    expect(state.zoomEvents[0].type).toBe('in')
    expect(state.zoomEvents[0].zoom).toBeGreaterThan(1) // auto-fit produced a zoom
    expect(state.lastTargetCoords.ref).toBe('e53')
    // element center (900+60, 500+20) = (960, 520)
    expect(state.lastTargetCoords.x).toBeCloseTo(960, 5)
    expect(state.lastTargetCoords.y).toBeCloseTo(520, 5)
  })

  it('auto-fits a tighter zoom for a small element than for a large one', async () => {
    const ctx = makeSession()
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 950, y: 530, w: 40, h: 20 }) : 'false'
    await demo_zoom_in.execute({ target: 'e1' }, ctx)
    const small = readState().zoomEvents[0].zoom

    const ctx2 = makeSession()
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 200, y: 100, w: 1200, h: 700 }) : 'false'
    await demo_zoom_in.execute({ target: 'e1' }, ctx2)
    const large = readState().zoomEvents[0].zoom

    expect(small).toBeGreaterThan(large)
    expect(large).toBeGreaterThanOrEqual(1.3)
    expect(small).toBeLessThanOrEqual(2.2)
  })

  it('treats an explicit zoom as a ceiling, never tighter than the fit', async () => {
    const ctx = makeSession()
    // Large element: fit is loose (~<1.5), so an explicit 2.5 must be capped down.
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 200, y: 100, w: 1200, h: 700 }) : 'false'
    await demo_zoom_in.execute({ target: 'e1', zoom: 2.5 }, ctx)
    expect(readState().zoomEvents[0].zoom).toBeLessThan(2.5)
  })

  it('keeps the zoom window inside the frame near a page edge', async () => {
    const ctx = makeSession()
    // Element hard against the right/bottom edge.
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 1850, y: 1040, w: 60, h: 30 }) : 'false'
    await demo_zoom_in.execute({ target: 'e9', zoom: 2 }, ctx)
    const z = readState().zoomEvents[0]
    const halfW = 960 / z.zoom
    const halfH = 540 / z.zoom
    // camera center clamped so the window [cx±halfW, cy±halfH] stays in 1920x1080
    expect(z.x).toBeLessThanOrEqual(1920 - halfW + 1e-6)
    expect(z.y).toBeLessThanOrEqual(1080 - halfH + 1e-6)
  })

  it('does NOT record a zoom when the element box cannot be found', async () => {
    const ctx = makeSession()
    h.handler = () => '' // every eval returns empty → getElementBox yields null
    const res = await demo_zoom_in.execute({ target: 'e404' }, ctx)
    expect(JSON.parse(res.output).status).toBe('target_not_found')
    expect(readState().zoomEvents).toHaveLength(0)
  })

  it('tolerates a double-encoded box string from playwright-cli --raw (regression)', async () => {
    const ctx = makeSession()
    // Reproduce the real CLI failure mode: `--raw eval` JSON-encodes an already
    // JSON.stringify'd return, so the box comes back double-encoded. getElementBox
    // must peel both layers or every zoom silently records nothing.
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect')
        ? JSON.stringify(boxJson({ x: 900, y: 500, w: 120, h: 40 }))
        : 'false'
    await demo_zoom_in.execute({ target: 'e53' }, ctx)
    const state = readState()
    expect(state.zoomEvents).toHaveLength(1)
    expect(state.lastTargetCoords.x).toBeCloseTo(960, 5) // 900 + 120/2
  })
})

// ── demo_fill_field ──────────────────────────────────────────────────────────
describe('demo_fill_field', () => {
  it('records a click on the field then clears, focuses, and types the value', async () => {
    const ctx = makeSession()
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 800, y: 300, w: 200, h: 40 }) : ''
    await demo_fill_field.execute({ target: 'e7', text: 'Acme' }, ctx)

    const state = readState()
    expect(state.clickEvents).toHaveLength(1)
    expect(state.clickEvents[0].x).toBeCloseTo(900, 5) // 800 + 200/2
    expect(state.clickEvents[0].y).toBeCloseTo(320, 5) // 300 + 40/2
    // a text field keeps the arrow cursor, never the hand pointer
    expect(state.clickEvents[0].hand).toBe(false)
    // a click sound was queued
    expect(state.audioClips.some((c: any) => c.filePath.endsWith('click.mp3'))).toBe(true)
    // command order: fill "" → click → type
    const cmds = h.calls
    expect(cmds.some(c => /playwright-cli fill "e7" ""/.test(c))).toBe(true)
    expect(cmds.some(c => /playwright-cli click "e7"/.test(c))).toBe(true)
    expect(cmds.some(c => /playwright-cli type /.test(c))).toBe(true)
  })

  it('types short text char-by-char and chunks long text to at most 8 steps', async () => {
    // ≤8 chars: one visible-typing step per character.
    const ctx = makeSession()
    h.handler = cmd => (cmd.includes('getBoundingClientRect') ? boxJson({}) : '')
    await demo_fill_field.execute({ target: 'e1', text: 'hi' }, ctx)
    expect(h.calls.filter(c => /playwright-cli type /.test(c))).toHaveLength(2)

    // Long text: capped so even 50 chars finishes in ≤8 chunks.
    h.calls = []
    const ctx2 = makeSession()
    await demo_fill_field.execute({ target: 'e1', text: 'x'.repeat(50) }, ctx2)
    const typeCalls = h.calls.filter(c => /playwright-cli type /.test(c)).length
    expect(typeCalls).toBeGreaterThan(1)
    expect(typeCalls).toBeLessThanOrEqual(8)
  })

  it('presses Enter when submit is set', async () => {
    const ctx = makeSession()
    h.handler = cmd => (cmd.includes('getBoundingClientRect') ? boxJson({}) : '')
    await demo_fill_field.execute({ target: 'e1', text: 'go', submit: true }, ctx)
    expect(h.calls.some(c => /playwright-cli press Enter/.test(c))).toBe(true)
  })

  it('reuses the preceding zoom_in target coords without a fresh box lookup', async () => {
    const ctx = makeSession()
    // Seed lastTargetCoords via a zoom_in on e5.
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 500, y: 200, w: 100, h: 40 }) : 'false'
    await demo_zoom_in.execute({ target: 'e5' }, ctx)
    h.calls = []
    // Now fill e5 — should NOT issue another getBoundingClientRect eval.
    await demo_fill_field.execute({ target: 'e5', text: 'z' }, ctx)
    expect(h.calls.some(c => c.includes('getBoundingClientRect'))).toBe(false)
    const clicks = readState().clickEvents
    expect(clicks.at(-1).x).toBeCloseTo(550, 5) // reused element center 500+50
  })
})

// ── demo_bash ────────────────────────────────────────────────────────────────
describe('demo_bash', () => {
  it('allocates a new tab id and tracks selection', async () => {
    const ctx = makeSession()
    await demo_bash.execute({ command: 'playwright-cli tab-new' }, ctx)
    let state = readState()
    expect(state.currentTabId).toBe(1)
    expect(state.tabCreationTimes['1']).toBe(5) // t = 5s
    await demo_bash.execute({ command: 'playwright-cli tab-select 0' }, ctx)
    state = readState()
    expect(state.currentTabId).toBe(0)
    expect(state.tabEvents.some((e: any) => e.tabId === 0 && e.wallSec === 5)).toBe(true)
  })

  it('stamps a click event + click sound when clicking a ref', async () => {
    const ctx = makeSession()
    h.handler = cmd => {
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 600, y: 400, w: 80, h: 40 })
      if (cmd.includes('location.href')) return 'https://a.test/'
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click e12' }, ctx)
    const state = readState()
    expect(state.clickEvents).toHaveLength(1)
    expect(state.clickEvents[0].x).toBeCloseTo(640, 5) // 600 + 80/2
    expect(state.clickEvents[0].hand).toBe(true) // a pressable target → hand cursor
    expect(state.audioClips.some((c: any) => c.filePath.endsWith('click.mp3'))).toBe(true)
  })

  it('marks a non-pressable click (plain content) as arrow, not hand', async () => {
    const ctx = makeSession()
    h.handler = cmd => {
      if (cmd.includes('getBoundingClientRect'))
        return boxJson({ x: 600, y: 400, w: 80, h: 40, hand: false })
      if (cmd.includes('location.href')) return 'https://a.test/'
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click e12' }, ctx)
    expect(readState().clickEvents[0].hand).toBe(false)
  })

  it('does not stamp a click when the command has no valid element ref', async () => {
    const ctx = makeSession()
    await demo_bash.execute({ command: 'playwright-cli snapshot' }, ctx)
    expect(readState().clickEvents).toHaveLength(0)
  })

  it('parses a modern alphanumeric-hash ref (not just e53-style)', async () => {
    const ctx = makeSession()
    h.handler = cmd => {
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 400, y: 200, w: 60, h: 30 })
      if (cmd.includes('location.href')) return 'https://a.test/'
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click f12e1477' }, ctx)
    const state = readState()
    expect(state.clickEvents).toHaveLength(1)
    expect(state.clickEvents[0].x).toBeCloseTo(430, 5) // 400 + 60/2
  })

  it('strips surrounding quotes from a ref and handles dblclick', async () => {
    const ctx = makeSession()
    h.handler = cmd => {
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 100, y: 100, w: 40, h: 40 })
      if (cmd.includes('location.href')) return 'https://a.test/'
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli dblclick "e88"' }, ctx)
    const state = readState()
    expect(state.clickEvents).toHaveLength(1)
    // the box lookup must have used the unquoted ref e88, not "e88"
    expect(h.calls.some(c => c.includes('getBoundingClientRect') && c.includes('"e88"'))).toBe(true)
    expect(state.clickEvents[0].x).toBeCloseTo(120, 5) // 100 + 40/2
  })

  // The view-signature eval (nav OR overlay) is uniquely identified by `innerWidth`
  // and must be matched BEFORE getBoundingClientRect, since it also uses that.
  it('auto zooms out when a click changes the view (nav) while zoomed in', async () => {
    const ctx = makeSession()
    // Pre-existing zoom-in so the view-change probe runs.
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 900, y: 500, w: 100, h: 40 }) : 'false'
    await demo_zoom_in.execute({ target: 'e3' }, ctx)

    // View signature differs before→after the click (URL changed).
    let sigCall = 0
    h.handler = cmd => {
      if (cmd.includes('innerWidth')) return sigCall++ === 0 ? 'https://a.test/|0' : 'https://a.test/next|0'
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 100, y: 100, w: 50, h: 20 })
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click e4' }, ctx)
    expect(readState().zoomEvents.at(-1)).toMatchObject({ type: 'out' })
  })

  it('auto zooms out when a click opens a large overlay (modal/drawer) while zoomed', async () => {
    const ctx = makeSession()
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 900, y: 500, w: 100, h: 40 }) : 'false'
    await demo_zoom_in.execute({ target: 'e3' }, ctx)

    // Same URL, but a big overlay appears (0 → 1) — the filter-panel case.
    let sigCall = 0
    h.handler = cmd => {
      if (cmd.includes('innerWidth')) return sigCall++ === 0 ? 'https://a.test/|0' : 'https://a.test/|1'
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 100, y: 100, w: 50, h: 20 })
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click e4' }, ctx)
    expect(readState().zoomEvents.at(-1)).toMatchObject({ type: 'out' })
  })

  it('does NOT auto zoom out when the view is unchanged', async () => {
    const ctx = makeSession()
    h.handler = cmd =>
      cmd.includes('getBoundingClientRect') ? boxJson({ x: 900, y: 500, w: 100, h: 40 }) : 'false'
    await demo_zoom_in.execute({ target: 'e3' }, ctx)
    const before = readState().zoomEvents.length

    h.handler = cmd => {
      if (cmd.includes('innerWidth')) return 'https://a.test/|0' // same both times
      if (cmd.includes('getBoundingClientRect')) return boxJson({ x: 100, y: 100, w: 50, h: 20 })
      return 'false'
    }
    await demo_bash.execute({ command: 'playwright-cli click e4' }, ctx)
    // only the click's own events were added, no extra zoom-out
    expect(readState().zoomEvents.length).toBe(before)
  })

  it('stops the video and stamps endTime on playwright-cli close', async () => {
    const ctx = makeSession()
    await demo_bash.execute({ command: 'playwright-cli close' }, ctx)
    expect(h.calls.some(c => /playwright-cli video-stop/.test(c))).toBe(true)
    expect(readState().endTime).toBe(START_TIME + 5000)
  })
})

// ── demo_narrate (TTS) ───────────────────────────────────────────────────────
describe('demo_narrate', () => {
  const stubTTS = (ok: boolean, rate = 24000) => {
    const pcm = Buffer.alloc(96).toString('base64') // tiny → ~0s playback sleep
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok,
        status: ok ? 200 : 500,
        text: async () => (ok ? '' : 'boom'),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: `audio/pcm;rate=${rate}`, data: pcm } }],
              },
            },
          ],
        }),
      })),
    )
  }

  it('writes a WAV clip, records an audio clip, and reports success', async () => {
    process.env.GEMINI_TTS_API_KEY_2 = 'test-key'
    stubTTS(true)
    const ctx = makeSession()
    const res = await demo_narrate.execute({ text: 'Welcome to the demo' }, ctx)
    expect(res.output).toMatch(/^spoken:/)

    const state = readState()
    expect(state.audioClips).toHaveLength(1)
    const wav = state.audioClips[0].filePath
    expect(wav.endsWith('.wav')).toBe(true)
    const header = fs.readFileSync(wav)
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.toString('ascii', 8, 12)).toBe('WAVE')
    expect(header.readUInt32LE(24)).toBe(24000) // sample rate from mime
  })

  it('injects the selected voice style into the TTS request', async () => {
    process.env.GEMINI_TTS_API_KEY_2 = 'test-key'
    stubTTS(true)
    const ctx = makeSession({ voiceName: 'Orus' })
    await demo_narrate.execute({ text: 'Numbers up.' }, ctx)
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.contents[0].parts[0].text).toContain('deep, professional')
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'Orus',
    )
  })

  it('reports failure and records no audio clip when the TTS API errors', async () => {
    process.env.GEMINI_TTS_API_KEY_2 = 'test-key'
    stubTTS(false)
    const ctx = makeSession()
    const res = await demo_narrate.execute({ text: 'nope' }, ctx)
    expect(res.output).toMatch(/TTS FAILED/)
    expect(readState().audioClips).toHaveLength(0)
  })

  it('scrolls the focus element into view before speaking', async () => {
    process.env.GEMINI_TTS_API_KEY_2 = 'test-key'
    stubTTS(true)
    const ctx = makeSession()
    h.handler = () => 'false' // scroll eval
    await demo_narrate.execute({ text: 'See this', focus: 'e88' }, ctx)
    // the smooth-scroll eval was issued against the focus ref
    expect(h.calls.some(c => c.includes('playwright-cli eval') && c.includes('e88'))).toBe(true)
  })
})
