import { describe, expect, it } from 'vitest'
import { normalizeCreationOptions } from '../apps/api/src/projects/creation-options.js'

describe('normalizeCreationOptions', () => {
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
