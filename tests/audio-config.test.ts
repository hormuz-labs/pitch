/**
 * .pi/audio.json picks which service records the narration. The file is the
 * operator's; a missing or half-written one must still leave `pitch motion
 * tts` with a working default.
 */
import { describe, expect, it } from 'vitest'
import {
  AUDIO_CONFIG_FILE,
  audioConfig,
  parseAudioConfig,
  projectAudioConfig,
} from '../.pi/lib/audio-config'

describe('the audio config', () => {
  it('uses the selected project voice over operator defaults without mutating the shared config', () => {
    const defaults = parseAudioConfig('{}')
    const selected = projectAudioConfig(
      { narrationVoice: { provider: 'elevenlabs', id: 'selected-voice' } },
      defaults,
    )
    expect(selected.tts.provider).toBe('elevenlabs')
    expect(selected.tts.elevenlabs).toEqual({ voice: 'selected-voice', model: 'eleven_v3' })
    expect(defaults.tts.provider).toBe('gemini')
    expect(projectAudioConfig({ voice: 'Puck' }, defaults)).toBe(defaults)
    expect(
      projectAudioConfig(
        { narrationVoice: { provider: 'elevenlabs', id: '../invalid' } },
        defaults,
      ),
    ).toBe(defaults)
  })
  it('defaults to Gemini with its voice and model when the file is missing or broken', () => {
    expect(audioConfig('/nowhere/audio.json').tts.provider).toBe('gemini')
    const broken = parseAudioConfig('{ not json')
    expect(broken.tts.provider).toBe('gemini')
    expect(broken.tts.gemini.voice).toBe('Aoede')
  })

  it('selects ElevenLabs and keeps the other provider’s defaults', () => {
    const c = parseAudioConfig(
      JSON.stringify({ tts: { provider: 'ElevenLabs', elevenlabs: { voice: 'abc123' } } }),
    )
    expect(c.tts.provider).toBe('elevenlabs')
    expect(c.tts.elevenlabs).toEqual({ voice: 'abc123', model: 'eleven_v3' })
    expect(c.tts.gemini.model).toBe('gemini-3.8-flash-tts')
  })

  it('refuses a provider it does not have rather than calling nothing', () => {
    expect(parseAudioConfig(JSON.stringify({ tts: { provider: 'polly' } })).tts.provider).toBe(
      'gemini',
    )
  })

  it('ships a real file in .pi that parses', () => {
    const c = audioConfig(AUDIO_CONFIG_FILE)
    expect(['gemini', 'elevenlabs']).toContain(c.tts.provider)
  })
})
