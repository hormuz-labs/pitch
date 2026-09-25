import { describe, expect, it } from 'vitest'
import {
  chooseNarratedEmphasisSource,
  resolveNarrationEmphasis,
} from '../.pi/lib/narrated-emphasis'

describe('narrated emphasis', () => {
  it('prefers a validated rectangle over an accidental manifest-ID target', () => {
    const rect = { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 5 }
    expect(chooseNarratedEmphasisSource({ target: 'p3r4', rect })).toEqual({
      target: undefined,
      rect,
    })
  })

  it('automatically consumes a successful Gemini grounding on the next narration beat', () => {
    const grounded = {
      slideIndex: 3,
      emphasis: {
        rect: { leftPct: 10, topPct: 20, widthPct: 30, heightPct: 5 },
        coordinateSpace: 'viewport' as const,
        style: 'pulse',
      },
    }

    expect(resolveNarrationEmphasis(undefined, grounded, 3)).toEqual(grounded.emphasis)
    expect(resolveNarrationEmphasis(undefined, grounded, 4)).toBeUndefined()
    expect(resolveNarrationEmphasis({ target: 'e12' }, grounded, 3)).toEqual({ target: 'e12' })
  })
})
