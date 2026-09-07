/**
 * The gate's shot-list rules: the limits every launch film shares, and the
 * tells (a fade-in opener, a ripple, a still screenshot, no stage).
 */
import { describe, expect, it } from 'vitest'
import {
  designSummary,
  LIMITS,
  lintDesign,
} from '../.pi/skills/launch-video/scripts/lib/design-rules.mjs'

const shot = (o: Record<string, unknown>) => ({
  id: 's',
  type: 'line',
  dur: 2,
  cut: 'hard',
  beats: 0,
  steps: 0,
  actors: 0,
  breaths: 0,
  ...o,
})
const many = (n: number, o: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => shot({ id: `s${i}`, ...o }))

describe('lintDesign', () => {
  it('passes an ordinary film and fails a shot over the limit', () => {
    const out = lintDesign({
      ambient: { kind: 'aurora' },
      shots: many(8, { dur: 3.3, breaths: 1, cut: 'punch' }),
    })
    expect(out.filter(l => l.level === 'fail')).toEqual([])
    const long = lintDesign({ shots: many(8, { dur: LIMITS.shotMax + 0.5 }) })
    expect(long.some(l => l.level === 'fail' && /≤ 6s/.test(l.msg))).toBe(true)
  })
  it('fails too few shots and a slideshow average', () => {
    expect(lintDesign({ shots: many(3, { dur: 2 }) }).some(l => /Only 3 shots/.test(l.msg))).toBe(
      true,
    )
    expect(
      lintDesign({ shots: many(8, { dur: 4 }) }).some(l => /reads as slides/.test(l.msg)),
    ).toBe(true)
  })
  it('fails a typing opener and a ripple beat', () => {
    const shots = many(8, { dur: 2 })
    shots[0] = shot({ id: 'p', typing: true })
    shots[3] = shot({ id: 'r', rippleBeats: 1 })
    const msgs = lintDesign({ shots })
      .filter(l => l.level === 'fail')
      .map(l => l.msg)
      .join('\n')
    expect(msgs).toMatch(/caret typing/)
    expect(msgs).toMatch(/ripple/)
  })
  it('asks for a stage unless actors carry the film', () => {
    const none = lintDesign({ shots: many(8, { dur: 2, breaths: 1, cut: 'punch' }) })
    expect(none.map(l => l.msg).join('\n')).toMatch(/No `ambient`/)
    const actors = lintDesign({
      actors: 1,
      shots: many(8, { dur: 2, actors: 1, breaths: 1, cut: 'punch' }),
    })
    expect(actors.map(l => l.msg).join('\n')).not.toMatch(/ambient/)
  })
})

describe('designSummary', () => {
  it('names actors, chapters and breaths', () => {
    expect(designSummary({ actors: 2, shots: [shot({ chapter: 'x', breaths: 1 })] })).toBe(
      'actors 2 · chapters 1 · breaths 1',
    )
    expect(designSummary({ shots: [] })).toBe('breaths 0')
  })
})
