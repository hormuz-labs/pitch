/**
 * The shot-list rules: what any launch film is held to, whatever its
 * structure. cues.mjs --check says them while the film is built; audit.mjs
 * repeats them at the gate.
 */
import { describe, expect, it } from 'vitest'
import {
  designSummary,
  joinsOf,
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
  actorNames: [],
  actorOut: [],
  actorHold: [],
  cut: 'hard',
  breaths: 0,
  rippleBeats: 0,
  ...o,
})
// Every boundary joined: the shape of a film that reads as one piece.
const joined = { cut: 'flood' }
const film = (shots: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  ambient: { kind: 'aurora' },
  actors: 1,
  shots: shots.map((s, i) => shot({ id: `s${i + 1}`, ...(i ? joined : {}), ...s })),
  ...extra,
})
const codes = (spec: ReturnType<typeof film>) => lintDesign(spec).map(l => l.code)

describe('lintDesign', () => {
  it('passes an ordinary film and fails a shot over the limit', () => {
    expect(codes(film([{ dur: 2 }, { dur: 3 }, { dur: 1 }, { dur: 2, breaths: 1 }]))).toEqual([])
    expect(codes(film([{ dur: 7 }, { dur: 3 }, { dur: 1 }, { dur: 2 }]))).toContain('long')
  })

  it('warns when over a third of the boundaries carry nothing across', () => {
    const plain = { cut: 'hard' }
    const four = film([{}, plain, plain, plain])
    const l = lintDesign(four).find(x => x.code === 'join')
    expect(l?.level).toBe('warn')
    expect(l?.msg).toMatch(/3 of 3 boundaries/)
    expect(l?.msg).toMatch(/s1→s2, s2→s3, s3→s4/)
    // One plain cut in three is the punch you keep.
    expect(codes(film([{}, plain, {}, {}]))).not.toContain('join')
    expect(codes(film([{}, { cut: 'punch' }, {}, {}]))).not.toContain('join')
    // Under four shots nothing is judged yet.
    expect(codes(film([{}, plain, plain]))).not.toContain('join')
  })

  it('counts what actually crosses a boundary', () => {
    const kinds = (shots: Record<string, unknown>[]) =>
      joinsOf(film(shots.map(s => ({ cut: 'hard', ...s })))).map(j => j.kind)
    // an actor posed in s1 and s3 is on screen through s2 and crosses both cuts
    expect(kinds([{ actorNames: ['mark'] }, {}, { actorNames: ['mark'] }, {}])).toEqual([
      'actor mark',
      'actor mark',
      null,
    ])
    // one that leaves with s1 (`out`) does not
    expect(
      kinds([{ actorNames: ['mark'], actorOut: ['mark'] }, {}, { actorNames: ['mark'] }, {}]),
    ).toEqual([null, null, null])
    // a held actor stays on after its last pose
    expect(kinds([{ actorNames: ['mark'], actorHold: ['mark'] }, {}, {}, {}])).toEqual([
      'actor mark held',
      null,
      null,
    ])
    // carry and the joining cuts, on the incoming shot
    expect(kinds([{}, { carry: true }, { cut: 'zoom' }, { cut: 'dissolve' }])).toEqual([
      'carry',
      'zoom',
      null,
    ])
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

  it('asks for a stage unless there are actors', () => {
    expect(codes(film([{}, {}, {}, {}], { ambient: null, actors: 0 }))).toContain('stage')
    expect(codes(film([{}, {}, {}, {}], { ambient: null, actors: 2 }))).not.toContain('stage')
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
    expect(designSummary(spec)).toBe('actors 2 · joins 3/3 · chapters 1 · lab moves 1 · breaths 1')
    expect(designSummary({ shots: [] })).toBe('lab moves 0 · breaths 0')
  })
})
