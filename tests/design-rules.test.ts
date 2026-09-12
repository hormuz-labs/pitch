/**
 * The shot-list rules: what any launch film is held to, whatever its
 * structure. cues.mjs --check says them while the film is built; audit.mjs
 * repeats them at the gate.
 */
import { describe, expect, it } from 'vitest'
import {
  designSummary,
  LIMITS,
  lintDesign,
  lintWhileBuilding,
} from '../.pi/scripts/launch-video/lib/design-rules.mjs'

const shot = (o: Record<string, unknown>) => ({
  id: 's',
  type: 'line',
  dur: 2,
  beats: 1,
  steps: 0,
  actors: 0,
  cut: 'hard',
  breaths: 0,
  rippleBeats: 0,
  ...o,
})
const film = (shots: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  ambient: { kind: 'aurora' },
  actors: 0,
  shots: shots.map((s, i) => shot({ id: `s${i + 1}`, ...s })),
  ...extra,
})
const codes = (spec: ReturnType<typeof film>) => lintDesign(spec).map(l => l.code)

describe('lintDesign', () => {
  it('passes an ordinary film and fails a shot over the limit', () => {
    expect(codes(film([{ dur: 2 }, { dur: 3 }, { dur: 1 }, { dur: 2, breaths: 1 }]))).toEqual([])
    expect(codes(film([{ dur: 7 }, { dur: 3 }, { dur: 1 }, { dur: 2 }]))).toContain('long')
  })

  it('accepts clean cuts without rewarding a film-wide continuity ornament', () => {
    const scenes = [{}, { cut: 'punch' }, {}, { breaths: 1 }, {}, {}, {}, {}]
    const clean = film(scenes, { ambient: { kind: 'none' } })
    const decorated = film(
      scenes.map(scene => ({ ...scene, actors: 1 })),
      { ambient: { kind: 'none' }, actors: 1 },
    )
    expect(lintDesign(clean)).toEqual([])
    expect(lintWhileBuilding(clean)).toEqual([])
    expect(lintDesign(decorated)).toEqual(lintDesign(clean))
  })

  it('fails too few shots and a slideshow average', () => {
    expect(codes(film([{ dur: 2 }, { dur: 2 }]))).toContain('count')
    expect(codes(film([{ dur: 4 }, { dur: 4 }, { dur: 4 }, { dur: 4 }]))).toContain('avg')
  })

  it('fails a typing opener and a ripple', () => {
    expect(codes(film([{ typing: true }, {}, {}, {}]))).toContain('typing')
    expect(codes(film([{}, { rippleBeats: 1 }, {}, {}]))).toContain('ripple')
  })

  it('leaves a project type alone: its factory timeline is its own acts', () => {
    // A lab port with no `beats` is not a hold — the audit measures what moves. Telling it to add
    // beats is what put a pulse on every headline.
    expect(codes(film([{}, { dur: 3, beats: 0, type: 'problem-pile' }, {}, {}]))).not.toContain(
      'hold',
    )
    expect(
      codes(
        film([{}, { dur: 5, beats: 0, type: 'hook-snap', lab: 'text/bold-text-snap' }, {}, {}]),
      ),
    ).not.toContain('hold')
  })

  it('warns about a built-in shot that enters and then holds — before the audit measures it', () => {
    const hold = film([{}, { dur: 3, beats: 0 }, {}, {}])
    const l = lintDesign(hold).find(x => x.code === 'hold')
    expect(l?.level).toBe('warn')
    expect(l?.msg).toMatch(new RegExp(`over ${LIMITS.hold}s`))
    // Anything that gives the shot a second act clears it.
    for (const fix of [
      { beats: 1 },
      { steps: 2 },
      { actors: 1 },
      { focus: true },
      { cursor: true },
      { more: 2 },
    ])
      expect(codes(film([{}, { dur: 3, beats: 0, ...fix }, {}, {}]))).not.toContain('hold')
    expect(codes(film([{}, { dur: 1.4, beats: 0 }, {}, {}]))).not.toContain('hold')
  })

  it('warns about type that only enters, unless a lab move is behind it', () => {
    expect(codes(film([{}, { type: 'word-cut' }, {}, {}]))).toContain('plain-type')
    expect(
      codes(film([{}, { type: 'type-wipe', lab: 'text/bold-text-snap' }, {}, {}])),
    ).not.toContain('plain-type')
    expect(codes(film([{}, { type: 'line' }, {}, {}]))).not.toContain('plain-type')
  })

  it('warns about a whole desktop as the subject', () => {
    const desk = { type: 'ui-frame', frame: 'browser', capturedSrc: true }
    expect(codes(film([{}, desk, {}, {}]))).toContain('desktop')
    for (const fix of [
      { focus: true },
      { clickZoom: true },
      { layers: true },
      { html: true },
      { frame: 'phone' },
    ])
      expect(codes(film([{}, { ...desk, ...fix }, {}, {}]))).not.toContain('desktop')
  })

  it('allows a bare stage while still checking the actual shot content', () => {
    const bare = film([{}, {}, {}, {}], { ambient: null, actors: 0 })
    expect(lintDesign(bare)).toEqual([])
    const still = film([{}, { dur: 3, beats: 0 }, {}, {}], { ambient: null, actors: 0 })
    expect(codes(still)).toContain('hold')
  })
})

describe('lintWhileBuilding', () => {
  it('keeps quiet about whole-film rules until there is a whole film', () => {
    const two = film([{ dur: 3, beats: 0 }, { type: 'word-cut' }], { ambient: null, actors: 0 })
    const c = lintWhileBuilding(two).map(l => l.code)
    expect(c).not.toContain('count')
    expect(c).not.toContain('stage')
    expect(c).not.toContain('breath')
    expect(c).toContain('hold')
    expect(c).toContain('plain-type')
  })
})

describe('designSummary', () => {
  it('names actors, chapters, lab moves and breaths — a custom type without a lab id is not a lab move', () => {
    const spec = film(
      [
        { chapter: 'a', breaths: 1, lab: 'text/bold-text-snap' },
        { type: 'my-port' },
        { chapter: 'a' },
        {},
      ],
      { actors: 2 },
    )
    expect(designSummary(spec)).toBe('actors 2 · chapters 1 · lab moves 1 · breaths 1')
    expect(designSummary({ shots: [] })).toBe('lab moves 0 · breaths 0')
  })
})
