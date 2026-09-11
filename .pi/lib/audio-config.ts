/**
 * `.pi/audio.json` — which service records the narration.
 *
 * Two providers can read a script: Gemini TTS (the original, a WAV through
 * .pi/scripts/launch-video/tts.mjs) and ElevenLabs (an MP3 through the API's
 * pipelines/elevenlabs.ts). The choice is the operator's, not the agent's —
 * it is a matter of keys, cost and taste — so it lives in a file next to
 * models.json, outside the sandbox, and `pitch motion tts` reads it on every
 * call. Project narration preferences override these operator defaults;
 * explicit `--provider` and `--voice` arguments override them for one read.
 *
 * Each provider block holds the defaults a call may leave out: the voice
 * (a Gemini voice name; an ElevenLabs voice id, see `pitch motion voices`)
 * and the model.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PI_DIR } from './paths.ts'

export type TtsProvider = 'gemini' | 'elevenlabs'
export const TTS_PROVIDERS: readonly TtsProvider[] = ['gemini', 'elevenlabs']

export interface ProviderDefaults {
  voice?: string
  model?: string
}

export interface AudioConfig {
  tts: { provider: TtsProvider } & Record<TtsProvider, ProviderDefaults>
}

export const AUDIO_CONFIG_FILE = path.join(PI_DIR, 'audio.json')

const DEFAULTS: AudioConfig = {
  tts: {
    provider: 'gemini',
    gemini: { voice: 'Aoede', model: 'gemini-2.5-flash-preview-tts' },
    elevenlabs: { voice: '', model: 'eleven_v3' },
  },
}

/** Parse the file's contents; anything missing or malformed falls back to the defaults. */
export function parseAudioConfig(json: string): AudioConfig {
  let raw: any = {}
  try {
    raw = JSON.parse(json) ?? {}
  } catch {
    raw = {}
  }
  const tts = raw?.tts ?? {}
  const provider = String(tts.provider ?? DEFAULTS.tts.provider).toLowerCase() as TtsProvider
  const block = (name: TtsProvider): ProviderDefaults => ({
    ...DEFAULTS.tts[name],
    ...(tts[name] && typeof tts[name] === 'object' ? tts[name] : {}),
  })
  return {
    tts: {
      provider: TTS_PROVIDERS.includes(provider) ? provider : DEFAULTS.tts.provider,
      gemini: block('gemini'),
      elevenlabs: block('elevenlabs'),
    },
  }
}

/** The config as it is on disk right now — read per call, so an edit needs no restart. */
export function audioConfig(file = AUDIO_CONFIG_FILE): AudioConfig {
  if (!existsSync(file)) return DEFAULTS
  return parseAudioConfig(readFileSync(file, 'utf8'))
}

/** A project voice wins over operator defaults; explicit tool arguments can still override it. */
export function projectAudioConfig(
  options: Record<string, any>,
  config = audioConfig(),
): AudioConfig {
  const voice = options.narrationVoice
  if (
    voice?.provider !== 'elevenlabs' ||
    typeof voice.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(voice.id)
  )
    return config
  return {
    tts: {
      ...config.tts,
      provider: 'elevenlabs',
      elevenlabs: { ...config.tts.elevenlabs, voice: voice.id },
    },
  }
}
