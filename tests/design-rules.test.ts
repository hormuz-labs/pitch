/**
 * The gate's design-aware rules: a chain film and a chapters film are judged
 * by their own grammar, and a film that named none by the old numbers.
 */
import { describe, expect, it } from 'vitest'
import {
  designOf,
  designSummary,
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

describe('designOf', () => {
  it('normalises the declared design and falls back to none', () => {
    expect(designOf({ design: 'Chain' })).toBe('chain')
    expect(designOf({ design: 'chapters' })).toBe('chapters')
    expect(designOf({ design: 'montage' })).toBe('none')
    expect(designOf({})).toBe('none')
  })
})

describe('lintDesign', () => {
  it('warns when no design is named and applies the strict type-beat limit', () => {
    const out = lintDesign({ shots: many(8, { dur: 3.3 }) })
    expect(out.some(l => /No `design`/.test(l.msg))).toBe(true)
    expect(out.some(l => l.level === 'fail' && /≤ 3.2s/.test(l.msg))).toBe(true)
  })
  it('lets a chain scene run long when it has steps or actors', () => {
    const shots = many(8, { dur: 2 })
    shots[2] = shot({ id: 'words', dur: 5.2, steps: 6, actors: 1, cut: 'hard' })
    const out = lintDesign({ design: 'chain', actors: 1, motionExit: 'blur', shots })
    expect(out.some(l => l.level === 'fail')).toBe(false)
  })
  it('tells a chain film its cuts are showing', () => {
    const shots = many(10, { dur: 2, cut: 'hard' })
    const out = lintDesign({ design: 'chain', actors: 0, shots })
    const msgs = out.map(l => l.msg).join('\n')
    expect(msgs).toMatch(/no `actors`/)
    expect(msgs).toMatch(/plain cuts with nothing crossing/)
    expect(msgs).toMatch(/No `blur` exits/)
  })
  it('asks a chapters film for chapters, a typed prompt and a flood or scale cut', () => {
    const out = lintDesign({
      design: 'chapters',
      ambient: { kind: 'aurora' },
      shots: many(12, { dur: 3 }),
    })
    const msgs = out.map(l => l.msg).join('\n')
    expect(msgs).toMatch(/fewer than two `chapter`/)
    expect(msgs).toMatch(/No typed prompt/)
    expect(msgs).toMatch(/No flood and no scale cut/)
  })
  it('is quiet for a well-formed chapters film', () => {
    const shots = many(12, { dur: 3, chapter: 'a', cut: 'punch' })
    shots[0] = shot({ id: 'p', dur: 3, typing: true, chapter: 'a', breaths: 1 })
    shots[4] = shot({ id: 'f', dur: 3, cut: 'flood', chapter: 'b' })
    const out = lintDesign({ design: 'chapters', ambient: { kind: 'aurora' }, shots })
    expect(out.filter(l => l.level === 'fail')).toEqual([])
    expect(out.map(l => l.msg).join('\n')).not.toMatch(/chapter|typed prompt|flood|breath|ambient/)
  })
  it('allows a bare stage for a chain and asks for one otherwise', () => {
    const chain = lintDesign({
      design: 'chain',
      actors: 1,
      motionExit: 'blur',
      shots: many(8, { dur: 2, actors: 1, breaths: 1 }),
    })
    expect(chain.map(l => l.msg).join('\n')).not.toMatch(/ambient/)
    const none = lintDesign({ shots: many(8, { dur: 2, breaths: 1, cut: 'punch' }) })
    expect(none.map(l => l.msg).join('\n')).toMatch(/No `ambient`/)
  })
})

describe('designSummary', () => {
  it('names the design, actors, chapters and breaths', () => {
    expect(
      designSummary({ design: 'chain', actors: 2, shots: [shot({ chapter: 'x', breaths: 1 })] }),
    ).toBe('design chain · actors 2 · chapters 1 · breaths 1')
    expect(designSummary({ shots: [] })).toBe('design — · breaths 0')
  })
})
