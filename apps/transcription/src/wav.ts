/**
 * Minimal WAV (RIFF/WAVE) decoder.
 *
 * The recording-editor tools always send 16 kHz mono PCM16 WAV produced by
 * ffmpeg, but this accepts any PCM (8/16/24/32-bit int) or float (32/64-bit)
 * file and downmixes to mono. Whisper expects a 16 kHz Float32Array, so we
 * also linear-resample when the source rate differs.
 */

export interface DecodedAudio {
  samples: Float32Array
  sampleRate: number
}

function readString(buf: DataView, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(buf.getUint8(offset + i))
  return out
}

export function decodeWav(input: ArrayBuffer): DecodedAudio {
  const buf = new DataView(input)
  if (buf.byteLength < 44) throw new Error('file too small to be a WAV')
  if (readString(buf, 0, 4) !== 'RIFF' || readString(buf, 8, 4) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }

  let audioFormat = 0
  let numChannels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataSize = 0

  let offset = 12
  while (offset + 8 <= buf.byteLength) {
    const id = readString(buf, offset, 4)
    const size = buf.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      audioFormat = buf.getUint16(body, true)
      numChannels = buf.getUint16(body + 2, true)
      sampleRate = buf.getUint32(body + 4, true)
      bitsPerSample = buf.getUint16(body + 14, true)
    } else if (id === 'data') {
      dataOffset = body
      dataSize = Math.min(size, buf.byteLength - body)
    }
    offset = body + size + (size % 2) // chunks are word-aligned
  }

  if (dataOffset < 0) throw new Error('WAV has no data chunk')
  if (numChannels < 1) throw new Error('WAV has no channels')
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`unsupported WAV format ${audioFormat} (only PCM and float are supported)`)
  }

  const bytesPerSample = bitsPerSample / 8
  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels))
  const mono = new Float32Array(frameCount)

  const readSample = (byteOffset: number): number => {
    if (audioFormat === 3) {
      return bitsPerSample === 64
        ? buf.getFloat64(byteOffset, true)
        : buf.getFloat32(byteOffset, true)
    }
    switch (bitsPerSample) {
      case 8:
        return (buf.getUint8(byteOffset) - 128) / 128
      case 16:
        return buf.getInt16(byteOffset, true) / 32768
      case 24: {
        const b0 = buf.getUint8(byteOffset)
        const b1 = buf.getUint8(byteOffset + 1)
        let v = b0 | (b1 << 8) | (buf.getUint8(byteOffset + 2) << 16)
        if (v & 0x800000) v |= ~0xffffff // sign-extend
        return v / 8388608
      }
      case 32:
        return buf.getInt32(byteOffset, true) / 2147483648
      default:
        throw new Error(`unsupported bit depth ${bitsPerSample}`)
    }
  }

  for (let frame = 0; frame < frameCount; frame++) {
    const frameOffset = dataOffset + frame * bytesPerSample * numChannels
    if (numChannels === 1) {
      mono[frame] = readSample(frameOffset)
    } else {
      let sum = 0
      for (let ch = 0; ch < numChannels; ch++) sum += readSample(frameOffset + ch * bytesPerSample)
      mono[frame] = sum / numChannels
    }
  }

  return { samples: mono, sampleRate }
}

/** Linear resample to 16 kHz — plenty for speech, no dependencies needed. */
export function resampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  const target = 16000
  if (sampleRate === target) return samples
  if (sampleRate <= 0) throw new Error(`invalid sample rate ${sampleRate}`)
  const ratio = sampleRate / target
  const outLength = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio
    const idx = Math.floor(srcPos)
    const frac = srcPos - idx
    const a = samples[idx]
    const b = idx + 1 < samples.length ? samples[idx + 1] : a
    out[i] = a + (b - a) * frac
  }
  return out
}
