import { describe, expect, it } from 'vitest'
import {
  durationOptionFromText,
  normalizeCreationOptions,
  videoTypeOptionFromText,
} from '../apps/api/src/projects/creation-options.js'

describe('normalizeCreationOptions', () => {
  it('stores a narration preference without provider metadata or a preview URL', () => {
    expect(
      normalizeCreationOptions({
        narrationVoice: {
          provider: 'elevenlabs',
          id: 'voice-123',
          name: ' Ada ',
          previewUrl: 'https://example.com/sample.mp3',
        },
        voice: 'Puck',
      }),
    ).toEqual({
      narrationVoice: { provider: 'elevenlabs', id: 'voice-123', name: 'Ada' },
      voice: 'Puck',
    })
    expect(
      normalizeCreationOptions({ narrationVoice: { provider: 'elevenlabs', id: '../voice' } }),
    ).toEqual({})
  })
  it('keeps supported composer preferences and normalizes their values', () => {
    expect(
      normalizeCreationOptions({
        aspectRatio: '9:16',
        durationSeconds: '29.6',
        referenceVideoFiles: ['uploads/reference.mov', '../second.mp4'],
        template: 'launch',
      }),
    ).toEqual({
      aspectRatio: '9:16',
      durationSeconds: 30,
      referenceVideoFiles: ['reference.mov', 'second.mp4'],
      template: 'launch',
    })
  })

  it('preserves the asset-demo outcome hint and rejects unknown skill names', () => {
    expect(normalizeCreationOptions({ skill: 'asset-demo' })).toEqual({ skill: 'asset-demo' })
    expect(normalizeCreationOptions({ skill: 'invented-flow' })).toEqual({})
  })

  it('drops invalid constrained preferences without discarding other options', () => {
    expect(
      normalizeCreationOptions({
        aspectRatio: 'wide',
        durationSeconds: 900,
        referenceVideoFiles: 'reference.mp4',
        topic: 'Product launch',
      }),
    ).toEqual({ referenceVideoFiles: [], topic: 'Product launch' })
  })
})

describe('durationOptionFromText', () => {
  it('extracts a duration from a questionnaire answer', () => {
    expect(
      durationOptionFromText(
        'What style of launch film should we create? → Product walkthrough\nWhat length works best? → ~45s deep dive',
      ),
    ).toEqual({ durationSeconds: 45 })
  })

  it('extracts an explicit duration from a normal video brief', () => {
    expect(durationOptionFromText('Make a 60 second product video')).toEqual({
      durationSeconds: 60,
    })
  })

  it('does not mistake unrelated numbers for duration', () => {
    expect(durationOptionFromText('Use these 3 features in the launch')).toBeUndefined()
  })
})

describe('videoTypeOptionFromText', () => {
  it('extracts the stable type from a questionnaire label', () => {
    expect(videoTypeOptionFromText('What style should we create? → Product walkthrough')).toEqual({
      videoType: 'product-walkthrough',
    })
  })

  it('reads the plain label the card now shows', () => {
    expect(videoTypeOptionFromText('What kind of video? → Build hype')).toEqual({
      videoType: 'teaser',
    })
  })

  it('stores nothing for "Let Pitch choose"', () => {
    expect(videoTypeOptionFromText('What kind of video? → Let Pitch choose')).toBeUndefined()
  })
})
