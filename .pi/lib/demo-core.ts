/**
 * demo-core — pure logic behind the `pitch demo` commands: frame geometry,
 * typed-text chunking and the Gemini TTS request/WAV plumbing. No I/O here,
 * so tests/demo-core.test.ts calls it directly.
 */

export const FRAME_W = 1920
export const FRAME_H = 1080
// Visible typing is revealed in at most this many chunks so even long text finishes fast.
const TYPE_MAX_STEPS = 8

export function buildGeminiTtsBody(model: string, voiceName: string, text: string) {
  return {
    model,
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  }
}

export interface ElementBox {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  // Cursor anchor: the geometric center for normal controls, or (for a large card)
  // the topmost visible text so the cursor lands on content, not an empty gap.
  ax: number
  ay: number
  // True when the browser renders a pointer cursor here (effective CSS cursor:pointer).
  hand: boolean
}

/** Clamp a point into the recorded 1920×1080 frame so the cursor never lands off-screen. */
export function clampToFrame(x: number, y: number): { x: number; y: number } {
  return { x: Math.max(0, Math.min(FRAME_W, x)), y: Math.max(0, Math.min(FRAME_H, y)) }
}

/**
 * Split text into the chunks to type for visible character-by-character entry. Short text
 * (≤ maxSteps chars) types one char per step; longer text is chunked so it finishes in at
 * most `maxSteps` steps. Empty text yields no steps.
 */
export function chunkTypedText(text: string, maxSteps: number = TYPE_MAX_STEPS): string[] {
  const chars = [...text]
  if (chars.length === 0) return []
  const chunkSize = Math.max(1, Math.ceil(chars.length / maxSteps))
  const out: string[] = []
  for (let i = 0; i < chars.length; i += chunkSize) out.push(chars.slice(i, i + chunkSize).join(''))
  return out
}

/** Parse a TTS response mime type (e.g. `audio/L16;rate=24000`) into PCM parameters. */
export function parseMimeType(mimeType: string): {
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

/** Build a 44-byte WAV/RIFF header for the given PCM data length and format. */
export function createWavHeader(
  dataLength: number,
  options: { numChannels: number; sampleRate: number; bitsPerSample: number },
): Buffer {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
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
