import { describe, expect, it } from 'vitest'
import {
  chooseNarratedEmphasisSource,
  resolveNarrationEmphasis,
  runNarratedEmphasisBeat,
} from '../.opencode/lib/narrated-emphasis'

describe('runNarratedEmphasisBeat', () => {
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

  it('finishes visual emphasis before timestamping the narration clip', async () => {
    const order: string[] = []

    const result = await runNarratedEmphasisBeat({
      emphasize: async () => {
        order.push('zoom')
        order.push('annotate')
        return { style: 'pulse' }
      },
      narrate: async () => {
        order.push('narrate')
        return { durationSecs: 2.4 }
      },
    })

    expect(order).toEqual(['zoom', 'annotate', 'narrate'])
    expect(result.emphasis).toEqual({ style: 'pulse' })
    expect(result.narration).toEqual({ durationSecs: 2.4 })
    expect(result.emphasisError).toBeNull()
  })

  it('still narrates when optional emphasis cannot be drawn', async () => {
    const order: string[] = []
    const result = await runNarratedEmphasisBeat({
      emphasize: async () => {
        order.push('emphasis-failed')
        throw new Error('stale target')
      },
      narrate: async () => {
        order.push('narrate')
        return 'spoken'
      },
    })

    expect(order).toEqual(['emphasis-failed', 'narrate'])
    expect(result.emphasis).toBeNull()
    expect(result.emphasisError).toBe('stale target')
    expect(result.narration).toBe('spoken')
  })
})
