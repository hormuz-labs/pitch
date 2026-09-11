import { describe, expect, it } from 'vitest'
import { hasViewablePreview } from '../apps/web/src/solid/studio/helpers'
import type { Description, Preview } from '../apps/web/src/solid/studio/types'

const description = (preview: Preview, rest: Partial<Description> = {}): Description => ({
  preview,
  outputs: [],
  ...rest,
})

describe('studio preview readiness', () => {
  it('keeps the editor hidden without a preview', () => {
    expect(hasViewablePreview(undefined)).toBe(false)
    expect(hasViewablePreview(description(null))).toBe(false)
  })

  it('waits for HTML scenes and deck slides', () => {
    expect(hasViewablePreview(description({ kind: 'html', url: '/preview' }))).toBe(false)
    expect(
      hasViewablePreview(
        description(
          { kind: 'html', url: '/preview' },
          { scenes: [{ id: 'scene-1', index: 0, start: 0, end: 2, dur: 2 }] },
        ),
      ),
    ).toBe(true)
    expect(hasViewablePreview(description({ kind: 'deck', url: '/slides' }))).toBe(false)
    expect(
      hasViewablePreview(description({ kind: 'deck', url: '/slides' }, { slides: [{ index: 0 }] })),
    ).toBe(true)
  })

  it.each([
    { kind: 'video', url: '/video.mp4' },
    { kind: 'pdf', url: '/file.pdf', path: 'file.pdf', pages: 1 },
    { kind: 'browser', profileId: 'profile-1' },
  ] satisfies Exclude<Preview, null>[])('shows a $kind preview without scene metadata', preview => {
    expect(hasViewablePreview(description(preview))).toBe(true)
  })
})
