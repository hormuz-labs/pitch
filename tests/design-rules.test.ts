/**
 * The checker must catch broken timelines without prescribing a house style.
 * cues.mjs --check and audit.mjs share these rules.
 */
import { describe, expect, it } from 'vitest'
import {
  designSummary,
  lintAd,
  lintDesign,
  lintEffectSources,
  lintWhileBuilding,
  paceStats,
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
  it('accepts both a short sequence and a single sustained shot', () => {
    expect(codes(film([{ dur: 2 }, { dur: 3 }, { dur: 1 }, { dur: 2, breaths: 1 }]))).toEqual([])
    expect(lintDesign(film([{ dur: 30, beats: 0 }]))).toEqual([])
  })

  it('accepts clean cuts without rewarding a film-wide continuity ornament', () => {
    const scenes = Array.from({ length: 8 }, () => ({ cut: 'hard', breaths: 0, beats: 0 }))
    const clean = film(scenes, { ambient: { kind: 'none' } })
    const decorated = film(
      scenes.map(scene => ({ ...scene, actors: 1 })),
      { ambient: { kind: 'none' }, actors: 1 },
    )
    expect(lintDesign(clean)).toEqual([])
    expect(lintWhileBuilding(clean)).toEqual([])
    expect(lintDesign(decorated)).toEqual(lintDesign(clean))
  })

  it('rejects an empty timeline, not a low or high shot count', () => {
    expect(lintDesign(film([]))).toEqual([
      expect.objectContaining({ level: 'fail', code: 'count' }),
    ])
    expect(lintDesign(film([{ dur: 2 }, { dur: 2 }]))).toEqual([])
    expect(lintDesign(film(Array.from({ length: 45 }, () => ({ dur: 0.5 }))))).toEqual([])
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    'rejects invalid duration %s even when a shot has a lab citation',
    dur => {
      expect(lintDesign(film([{ dur, lab: 'text/example' }]))).toEqual([
        expect.objectContaining({ level: 'fail', code: 'duration' }),
      ])
    },
  )

  it('allows a chosen motion vocabulary without mandatory substitutions', () => {
    expect(lintDesign(film([{ typing: true }, { rippleBeats: 1 }]))).toEqual([])
  })

  it('treats built-in, bespoke and lab-derived shots equally', () => {
    for (const source of [
      { type: 'word-cut' },
      { type: 'line' },
      { type: 'product-portrait' },
      { type: 'adapted-reveal', lab: 'brand/example' },
    ]) {
      expect(lintDesign(film([{ ...source, dur: 12, beats: 0 }]))).toEqual([])
    }
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

  it('allows a bare stage and intentional stillness', () => {
    const bare = film([{}, {}, {}, {}], { ambient: null, actors: 0 })
    expect(lintDesign(bare)).toEqual([])
    const still = film([{}, { dur: 3, beats: 0 }, {}, {}], { ambient: null, actors: 0 })
    expect(lintDesign(still)).toEqual([])
  })
})

describe('lintWhileBuilding', () => {
  it('allows the empty scaffold but keeps technical errors visible while building', () => {
    expect(lintWhileBuilding(film([]))).toEqual([])
    const two = film([{ dur: 3, beats: 0 }, { type: 'word-cut' }], { ambient: null, actors: 0 })
    expect(lintWhileBuilding(two)).toEqual([])
    expect(lintWhileBuilding(film([{ dur: -1 }]))).toEqual([
      expect.objectContaining({ level: 'fail', code: 'duration' }),
    ])
  })
})

describe('lintEffectSources', () => {
  it('rejects a repeated effect even when its source was inspected and its factory was renamed', () => {
    const spec = film([
      { lab: 'text/bold-text-snap', type: 'opener', chapter: 'intro' },
      { lab: 'brand/apple-news-plus', type: 'cards' },
      { lab: 'text/bold-text-snap', type: 'renamed-payoff', chapter: 'outro' },
    ])
    expect(lintEffectSources(spec, ['text/bold-text-snap', 'brand/apple-news-plus'])).toEqual([
      expect.objectContaining({
        level: 'fail',
        code: 'lab-repeat',
        msg: expect.stringMatching(/#s3:.*text\/bold-text-snap.*#s1/),
      }),
    ])
  })

  it('allows distinct effects from the same family and reuse in a separate film', () => {
    const inspected = ['text/bold-text-snap', 'text/elastic-text']
    expect(lintEffectSources(film(inspected.map(lab => ({ lab }))), inspected)).toEqual([])
    expect(lintEffectSources(film([{ lab: inspected[0] }]), inspected)).toEqual([])
  })

  it('requires source inspection for every cited lab implementation', () => {
    const spec = film([{ lab: 'text/inspected' }, { lab: 'brand/card-only' }, { type: 'bespoke' }])
    expect(lintEffectSources(spec, ['text/inspected'])).toEqual([
      expect.objectContaining({
        level: 'fail',
        code: 'lab-source',
        msg: expect.stringContaining('pitch effects show brand/card-only --source'),
      }),
    ])
    expect(lintEffectSources(spec, ['text/inspected', 'brand/card-only'])).toEqual([])
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

describe('ad pace lint', () => {
  const shot = (id: string, type: string, dur: number, extra: object = {}) => ({
    id,
    type,
    dur,
    ...extra,
  })
  const ad = (shots: object[], extra: object = {}) => ({ audio: { pace: 'ad' }, shots, ...extra })

  it('only speaks for ads', () => {
    expect(lintAd({ audio: {}, shots: [shot('a', 'card', 5)] })).toEqual([])
  })

  it('counts montage clips, and the last clip holding to the end', async () => {
    const st = paceStats({
      shots: [shot('burst', 'footage', 3, { every: 0.5, clipDurs: [null, null, null] })],
    })
    expect(st.changes).toBe(3)
    expect(st.holds[0].hold).toBeCloseTo(2, 5)
  })

  it('flags slow pace, long holds past the two allowed, reuse and subtitles', () => {
    const codes = lintAd(
      ad(
        [
          shot('hook', 'footage', 3, { srcs: ['a.mp4'] }),
          shot('card', 'card', 2),
          shot('proof', 'footage', 2.2, { srcs: ['b.mp4'] }),
          shot('again', 'footage', 1, { srcs: ['a.mp4'] }),
          shot('close', 'logo-cta', 6),
        ],
        { captions: { subtitles: true } },
      ),
    ).map(l => l.code)
    expect(codes).toContain('pace')
    expect(codes.filter(c => c === 'hold')).toHaveLength(1) // the 3s hook; the 2s card and 2.2s proof are allowed
    expect(codes).toContain('reuse')
    expect(codes).toContain('subtitles')
  })

  it('passes a fast film', () => {
    const shots = Array.from({ length: 10 }, (_, i) =>
      shot(`s${i}`, 'footage', 2, {
        every: 0.4,
        clipDurs: [null, null, null, null, null],
        srcs: [`c${i}.mp4`],
      }),
    )
    expect(lintAd(ad(shots))).toEqual([])
  })
})
