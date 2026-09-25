import { describe, expect, it } from 'vitest'
import {
  compositionPlanBody,
  musicRequestBody,
  soundRequestBody,
  voiceoverRequestBody,
} from '../apps/api/src/pipelines/elevenlabs.js'

describe('ElevenLabs launch audio requests', () => {
  it('forces a precisely timed Music v2 instrumental', () => {
    expect(
      musicRequestBody({
        prompt: 'Tight electronic launch underscore, 124 BPM, clean button ending.',
        duration: 14.25,
      }),
    ).toEqual({
      prompt: 'Tight electronic launch underscore, 124 BPM, clean button ending.',
      music_length_ms: 14250,
      model_id: 'music_v2',
      force_instrumental: true,
    })
  })

  it('rejects missing prompts and out-of-range music durations', () => {
    expect(() => musicRequestBody({ prompt: ' ', duration: 30 })).toThrow(/prompt is required/)
    expect(() => musicRequestBody({ prompt: 'A bed', duration: 2.9 })).toThrow(/3 and 600/)
    expect(() => musicRequestBody({ prompt: 'A bed', duration: 601 })).toThrow(/3 and 600/)
  })

  it('uses Sound Effects v2 controls without inventing optional values', () => {
    expect(
      soundRequestBody({
        prompt: 'One tiny dry polymer UI click, immediate onset.',
        duration: 0.8,
        influence: 0.7,
      }),
    ).toEqual({
      text: 'One tiny dry polymer UI click, immediate onset.',
      model_id: 'eleven_text_to_sound_v2',
      loop: false,
      duration_seconds: 0.8,
      prompt_influence: 0.7,
    })
    expect(soundRequestBody({ prompt: 'Soft room tone', loop: true })).toEqual({
      text: 'Soft room tone',
      model_id: 'eleven_text_to_sound_v2',
      loop: true,
    })
  })

  it('rejects invalid SFX duration, influence and oversized prompts', () => {
    expect(() => soundRequestBody({ prompt: 'Click', duration: 0.49 })).toThrow(/0.5 and 30/)
    expect(() => soundRequestBody({ prompt: 'Click', influence: 1.01 })).toThrow(/between 0 and 1/)
    expect(() => soundRequestBody({ prompt: 'x'.repeat(451) })).toThrow(/450 characters/)
  })

  it('builds one expressive voiceover request with optional voice controls', () => {
    expect(
      voiceoverRequestBody({
        text: 'The first move sets everything in motion.',
        voiceId: 'voice_123',
        stability: 0.45,
        similarity: 0.8,
        speed: 0.96,
      }),
    ).toEqual({
      text: 'The first move sets everything in motion.',
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        speed: 0.96,
      },
    })
  })

  it('validates the voice ID, supported models, model limits and settings', () => {
    expect(() => voiceoverRequestBody({ text: 'Hello', voiceId: '' })).toThrow(/voice id/)
    expect(() =>
      voiceoverRequestBody({ text: 'Hello', voiceId: 'voice_123', model: 'old_model' }),
    ).toThrow(/model must be one of/)
    expect(() => voiceoverRequestBody({ text: 'x'.repeat(5001), voiceId: 'voice_123' })).toThrow(
      /at most 5000/,
    )
    expect(() => voiceoverRequestBody({ text: 'Hello', voiceId: 'voice_123', speed: 1.3 })).toThrow(
      /speed must be between/,
    )
  })

  it('builds a music_v2 plan with each section its exact length and spare tail on the last', () => {
    const body = compositionPlanBody({
      styles: ['2020s trap-pop', '140 BPM', 'punchy 808s', 'pizzicato string riff'],
      avoid: ['guitar'],
      sections: [
        { label: 'Intro', until: 3.1, text: 'filtered drums, no bass', avoid: ['808'] },
        { label: 'Drop', until: 9.8, styles: ['full groove'] },
        { label: 'Big Drop', until: 30 },
      ],
      duration: 30,
      slack: 5,
    }) as any
    expect(body.model_id).toBe('music_v2')
    const chunks = body.composition_plan.chunks
    expect(chunks.map((c: any) => c.duration_ms)).toEqual([3100, 6700, 25200])
    // plain text is sung as lyrics: the description goes in as a {cue}
    expect(chunks.map((c: any) => c.text)).toEqual([
      '[Intro]\n{filtered drums, no bass}',
      '[Drop]',
      '[Big Drop]',
    ])
    expect(chunks[0].positive_styles).toEqual([
      'instrumental',
      '2020s trap-pop',
      '140 BPM',
      'punchy 808s',
      'pizzicato string riff',
    ])
    expect(chunks[1].positive_styles).toEqual([
      'instrumental',
      '2020s trap-pop',
      '140 BPM',
      'full groove',
    ])
    expect(chunks[0].negative_styles).toEqual([
      'vocals',
      'singing',
      'spoken word',
      'lyrics',
      'guitar',
      '808',
    ])
    expect(chunks.every((c: any) => c.context_adherence === 'high')).toBe(true)
  })

  it('refuses a section under 3s, and a plan without identity', () => {
    const sections = [
      { label: 'Hook', until: 2.4 },
      { label: 'Drop', until: 20 },
    ]
    expect(() => compositionPlanBody({ styles: ['house'], sections, duration: 20 })).toThrow(
      /Hook" is 2.40s; each must be at least 3s/,
    )
    expect(() =>
      compositionPlanBody({ styles: [], sections: [{ label: 'A', until: 10 }], duration: 10 }),
    ).toThrow(/styles are required/)
  })
})
