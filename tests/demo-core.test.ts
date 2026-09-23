/** The pure logic behind `pitch demo` (.pi/lib/demo-core.ts): typing chunks, frame clamps, WAV/mime. */
import { describe, expect, it } from 'vitest'
import {
  buildGeminiTtsBody,
  chunkTypedText,
  clampToFrame,
  createWavHeader,
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
