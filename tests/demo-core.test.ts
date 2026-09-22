/**
 * Unit tests for the pure demo-generator logic (.pi/lib/demo-core.ts).
 *
 * These import the real functions DIRECTLY — no @opencode-ai/plugin stub, no module
 * alias, no mocked playwright-cli. Every case exercises a genuine decision the demo
 * tools delegate to (zoom framing, the --raw double-encoding parse, ref parsing,
 * typing chunks, WAV/mime). If one of these breaks, a real render breaks.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGeminiTtsBody,
  chunkTypedText,
  clampToFrame,
  computeZoomFraming,
  createWavHeader,
  DEFAULT_ZOOM,
  FIT_ZOOM_MAX,
  FIT_ZOOM_MIN,
  nextTabId,
  parseClickRef,
  parseElementBoxJson,
  parseMimeType,
} from '../.pi/lib/demo-core'

describe('buildGeminiTtsBody', () => {
  it('sends only the approved narration as speech text', () => {
    const body = buildGeminiTtsBody('gemini-tts', 'Charon', 'Popper introduces a system.')

    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Popper introduces a system.' }] },
    ])
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'Charon',
    )
    expect(JSON.stringify(body)).not.toContain('Speak in')
  })
})

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
    const h = createWavHeader(dataLength, { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 })
    expect(h).toHaveLength(44)
    expect(h.toString('ascii', 0, 4)).toBe('RIFF')
    expect(h.toString('ascii', 8, 12)).toBe('WAVE')
    expect(h.toString('ascii', 12, 16)).toBe('fmt ')
    expect(h.toString('ascii', 36, 40)).toBe('data')
    expect(h.readUInt32LE(4)).toBe(36 + dataLength) // RIFF chunk size
    expect(h.readUInt32LE(40)).toBe(dataLength) // data chunk size
    expect(h.readUInt16LE(20)).toBe(1) // PCM
    expect(h.readUInt16LE(22)).toBe(1) // channels
    expect(h.readUInt32LE(24)).toBe(24000) // sample rate
    expect(h.readUInt32LE(28)).toBe(24000 * 1 * 2) // byte rate
    expect(h.readUInt16LE(32)).toBe(2) // block align
    expect(h.readUInt16LE(34)).toBe(16) // bits per sample
  })
  it('scales byte rate with channels and bit depth', () => {
    const h = createWavHeader(0, { numChannels: 2, sampleRate: 44100, bitsPerSample: 16 })
    expect(h.readUInt32LE(28)).toBe(44100 * 2 * 2)
    expect(h.readUInt16LE(32)).toBe(4) // block align = channels * bytesPerSample
  })
})

describe('parseClickRef', () => {
  it('parses a modern alphanumeric-hash ref', () => {
    expect(parseClickRef('playwright-cli click f12e1477')).toBe('f12e1477')
  })
  it('parses an old e53-style ref', () => {
    expect(parseClickRef('playwright-cli click e53')).toBe('e53')
  })
  it('strips surrounding quotes and supports dblclick', () => {
    expect(parseClickRef('playwright-cli dblclick "e88"')).toBe('e88')
    expect(parseClickRef("playwright-cli click 'abc'")).toBe('abc')
  })
  it('returns undefined when there is no click/dblclick ref', () => {
    expect(parseClickRef('playwright-cli snapshot')).toBeUndefined()
    expect(parseClickRef('playwright-cli click')).toBeUndefined() // verb with no arg
  })
})

describe('parseElementBoxJson', () => {
  const raw = { x: 100, y: 200, w: 80, h: 40, cx: 140, cy: 220, ax: 140, ay: 220, hand: true }

  it('parses a plain JSON object', () => {
    expect(parseElementBoxJson(JSON.stringify(raw))).toMatchObject({ cx: 140, cy: 220, hand: true })
  })

  it('peels a DOUBLE-encoded string (the --raw regression)', () => {
    // playwright-cli --raw JSON-encodes an already-stringified return.
    const doubled = JSON.stringify(JSON.stringify(raw))
    const box = parseElementBoxJson(doubled)
    expect(box).not.toBeNull()
    expect(box!.cx).toBe(140)
    expect(box!.hand).toBe(true)
  })

  it('falls back ax/ay to the geometric center when absent', () => {
    const noAnchor = { x: 0, y: 0, w: 10, h: 10, cx: 5, cy: 5, hand: false }
    const box = parseElementBoxJson(JSON.stringify(noAnchor))!
    expect(box.ax).toBe(5)
    expect(box.ay).toBe(5)
  })

  it('returns null for invalid / non-finite / non-JSON payloads', () => {
    expect(parseElementBoxJson('')).toBeNull()
    expect(parseElementBoxJson('not json')).toBeNull()
    expect(parseElementBoxJson('"just a string"')).toBeNull()
    expect(parseElementBoxJson(JSON.stringify({ cx: 'x', cy: 1, w: 1, h: 1 }))).toBeNull()
  })
})

describe('computeZoomFraming', () => {
  it('auto-fits a tighter zoom for a small element than for a large one', () => {
    const small = computeZoomFraming({ w: 40, h: 20, cx: 960, cy: 540 }).zoom
    const large = computeZoomFraming({ w: 1200, h: 700, cx: 960, cy: 540 }).zoom
    expect(small).toBeGreaterThan(large)
    expect(small).toBeLessThanOrEqual(FIT_ZOOM_MAX)
    expect(large).toBeGreaterThanOrEqual(FIT_ZOOM_MIN)
  })

  it('caps an explicit zoom by the fit (never tighter than framing allows)', () => {
    // Large element: fit is loose, so an explicit 2.5 is capped down.
    expect(computeZoomFraming({ w: 1200, h: 700, cx: 960, cy: 540 }, 2.5).zoom).toBeLessThan(2.5)
    // Small element: fit is large, so an explicit (smaller) zoom is honored.
    expect(computeZoomFraming({ w: 40, h: 20, cx: 960, cy: 540 }, 1.5).zoom).toBeCloseTo(1.5, 5)
  })

  it('keeps the zoom window inside the frame near an edge', () => {
    const { cx, cy, zoom } = computeZoomFraming({ w: 60, h: 30, cx: 1900, cy: 1060 }, 2)
    const halfW = 960 / zoom
    const halfH = 540 / zoom
    expect(cx).toBeLessThanOrEqual(1920 - halfW + 1e-6)
    expect(cy).toBeLessThanOrEqual(1080 - halfH + 1e-6)
    expect(cx).toBeGreaterThanOrEqual(halfW - 1e-6)
  })

  it('uses the default zoom for a degenerate (zero-size) box', () => {
    expect(computeZoomFraming({ w: 0, h: 0, cx: 960, cy: 540 }).zoom).toBe(DEFAULT_ZOOM)
  })
})

describe('nextTabId', () => {
  it('starts at 1 from the initial single tab', () => {
    expect(nextTabId({ 0: 0 })).toBe(1)
  })
  it('is one past the highest existing id', () => {
    expect(nextTabId({ 0: 0, 1: 3.2, 2: 9.5 })).toBe(3)
  })
})

describe('clampToFrame', () => {
  it('leaves in-range points unchanged', () => {
    expect(clampToFrame(500, 300)).toEqual({ x: 500, y: 300 })
  })
  it('clamps out-of-range points to the 1920x1080 frame', () => {
    expect(clampToFrame(-50, 2000)).toEqual({ x: 0, y: 1080 })
    expect(clampToFrame(3000, -10)).toEqual({ x: 1920, y: 0 })
  })
})

describe('chunkTypedText', () => {
  it('yields nothing for empty text', () => {
    expect(chunkTypedText('')).toEqual([])
  })
  it('types short text one character per step', () => {
    expect(chunkTypedText('hi', 8)).toEqual(['h', 'i'])
  })
  it('uses exactly one step per char up to maxSteps', () => {
    expect(chunkTypedText('abcdefgh', 8)).toHaveLength(8)
  })
  it('chunks long text into at most maxSteps steps that rejoin to the original', () => {
    const chunks = chunkTypedText('x'.repeat(50), 8)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThanOrEqual(8)
    expect(chunks.join('')).toBe('x'.repeat(50))
  })
  it('handles unicode by code point, not UTF-16 unit', () => {
    expect(chunkTypedText('a😀b', 8)).toEqual(['a', '😀', 'b'])
  })
})
