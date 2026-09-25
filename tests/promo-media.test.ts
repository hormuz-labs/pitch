/**
 * The promo/ad pipeline's pure pieces: mix automation from shots.js
 * `audio.fx`, the stock file chosen for download, the narration pace
 * profiles and the scaffold's frame.
 */
import { describe, expect, it } from 'vitest'
import { starterShots } from '../.pi/lib/starter-shots'
import {
  muffleGraph,
  muffleStages,
  resolveAudioFx,
  ringArgs,
} from '../.pi/scripts/launch-video/lib/audio-fx.mjs'
import { paceOf } from '../.pi/scripts/launch-video/lib/pace.mjs'
import { bestVideoFile, shapeVideo } from '../.pi/scripts/launch-video/lib/stock.mjs'

const words = [
  { w: 'They', n: 'they', s: 10.0, e: 10.2 },
  { w: 'make', n: 'make', s: 10.2, e: 10.4 },
  { w: 'music', n: 'music', s: 10.4, e: 10.7 },
  { w: 'muffled', n: 'muffled', s: 10.7, e: 11.2 },
  { w: 'and', n: 'and', s: 11.2, e: 11.3 },
  { w: 'conversations.', n: 'conversations', s: 11.4, e: 12.4 },
]

describe('resolveAudioFx', () => {
  it('times a muffle from its cue and until phrases, offset by voStart', () => {
    const spec = {
      audio: {
        vo: 'audio/vo.wav',
        voStart: 0.5,
        fx: [{ kind: 'muffle', cue: 'they make music muffled', until: 'conversations' }],
      },
    }
    const { muffles, rings, problems } = resolveAudioFx(spec, words, 30)
    expect(problems).toEqual([])
    expect(rings).toEqual([])
    expect(muffles).toHaveLength(1)
    expect(muffles[0]).toMatchObject({ from: 10.5, to: 12.9, cutoff: 800, voCutoff: 3200 })
    expect(muffles[0].targets).toEqual(['bed', 'sfx', 'vo'])
  })

  it('spans a cue alone from its first onset to its last word end', () => {
    const spec = { audio: { voStart: 0, fx: [{ kind: 'ring', cue: 'muffled' }] } }
    const { rings } = resolveAudioFx(spec, words)
    expect(rings[0]).toMatchObject({ from: 10.7, to: 11.2, freq: 3600, level: -30 })
  })

  it('accepts seconds, clamps levels and cutoffs, and leaves a clear voice when asked', () => {
    const spec = {
      audio: {
        fx: [
          { kind: 'ring', from: 1, to: 3, level: 0, freq: 99999 },
          { kind: 'muffle', from: 4, to: 6, cutoff: 20, voCutoff: null },
        ],
      },
    }
    const { rings, muffles, problems } = resolveAudioFx(spec, null, 30)
    expect(problems).toEqual([])
    expect(rings[0]).toMatchObject({ level: -12, freq: 12000 })
    expect(muffles[0]).toMatchObject({ cutoff: 150, voCutoff: null })
  })

  it('reports cues it cannot place instead of guessing', () => {
    const noWords = resolveAudioFx({ audio: { fx: [{ kind: 'muffle', cue: 'hello' }] } }, null)
    expect(noWords.problems[0]).toMatch(/aligned narration/)
    const missing = resolveAudioFx({ audio: { fx: [{ kind: 'ring', cue: 'sunglasses' }] } }, words)
    expect(missing.problems[0]).toMatch(/not in the narration/)
    const bad = resolveAudioFx({ audio: { fx: [{ kind: 'echo', from: 1, to: 2 }] } }, words)
    expect(bad.problems[0]).toMatch(/kind must be/)
  })

  it('clamps windows to the film and rejects ones that vanish', () => {
    const { muffles, problems } = resolveAudioFx(
      {
        audio: {
          fx: [
            { kind: 'muffle', from: 9, to: 20 },
            { kind: 'muffle', from: 12, to: 14 },
          ],
        },
      },
      null,
      10,
    )
    expect(muffles).toEqual([expect.objectContaining({ from: 9, to: 10 })])
    expect(problems[0]).toMatch(/shorter than 0.1s/)
  })
})

describe('thin (the bass breakdown before a drop)', () => {
  it('pulls the bass from the bed only, until the word the film turns on', () => {
    const spec = { audio: { voStart: 0, fx: [{ kind: 'thin', from: 2, until: 'muffled' }] } }
    const { thins, problems } = resolveAudioFx(spec, words, 30)
    expect(problems).toEqual([])
    expect(thins).toEqual([
      expect.objectContaining({ from: 2, to: 11.2, cutoff: 300, targets: ['bed'], release: 0.05 }),
    ])
    const [stage] = muffleStages(thins, 'bed')
    expect(muffleStages(thins, 'vo')).toEqual([])
    const graph = muffleGraph(stage.windows, stage.cutoff, 'highpass') as string
    expect(graph).toContain('highpass=f=300:p=2,highpass=f=300:p=2')
    expect(graph).not.toContain('lowpass')
  })
})

describe('muffle filters', () => {
  const muffles = [
    {
      from: 2,
      to: 4,
      attack: 0.12,
      release: 0.25,
      cutoff: 800,
      voCutoff: 3200,
      targets: ['bed', 'sfx', 'vo'],
    },
    {
      from: 8,
      to: 9,
      attack: 0.12,
      release: 0.25,
      cutoff: 600,
      voCutoff: null,
      targets: ['bed', 'vo'],
    },
  ]

  it('groups windows per stem and cutoff, skipping stems a window leaves clear', () => {
    expect(muffleStages(muffles, 'bed').map(s => s.cutoff)).toEqual([800, 600])
    expect(muffleStages(muffles, 'sfx').map(s => s.cutoff)).toEqual([800])
    const vo = muffleStages(muffles, 'vo')
    expect(vo).toHaveLength(1)
    expect(vo[0]).toMatchObject({ cutoff: 3200 })
    expect(vo[0].windows).toHaveLength(1)
  })

  it('crossfades a dry and a low-passed copy with one eased envelope', () => {
    const graph = muffleGraph(muffles.slice(0, 1), 800) as string
    expect(graph).toContain('lowpass=f=800:p=2,lowpass=f=800:p=2')
    expect(graph).toContain('[d][w]amix=inputs=2:normalize=0')
    expect(graph).toContain("volume=volume='1-(")
    expect(graph.match(/cos\(PI\*clip/g)).toHaveLength(4)
    expect(muffleGraph([], 800)).toBeNull()
  })

  it('writes a ring as a delayed, faded, full-length stem', () => {
    const args = ringArgs(
      { from: 1.5, to: 3.5, attack: 0.3, release: 0.15, freq: 3600, level: -30 },
      20,
      'x.wav',
    )
    const af = args[args.indexOf('-af') + 1]
    expect(args[3]).toBe('sine=frequency=3600:sample_rate=48000:duration=2.000')
    expect(af).toContain('volume=-30dB')
    expect(af).toContain('adelay=1500|1500')
    expect(af).toContain('afade=t=out:st=1.850:d=0.150')
    expect(af).toContain('apad=whole_dur=20.000')
    expect(args.at(-1)).toBe('x.wav')
  })
})

describe('stock', () => {
  const files = [
    { quality: 'uhd', file_type: 'video/mp4', width: 2160, height: 3840, link: 'u' },
    { quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: 'h' },
    { quality: 'sd', file_type: 'video/mp4', width: 540, height: 960, link: 's' },
  ]

  it('downloads the first file that reaches 1080 on its short side, not the 4K master', () => {
    expect(bestVideoFile(files)?.link).toBe('h')
  })

  it('falls back to the largest file, and to nothing without an mp4', () => {
    expect(
      bestVideoFile([files[2], { ...files[2], width: 720, height: 1280, link: 'm' }])?.link,
    ).toBe('m')
    expect(
      bestVideoFile([{ file_type: 'video/webm', width: 1080, height: 1920, link: 'w' }]),
    ).toBeNull()
    expect(bestVideoFile(undefined)).toBeNull()
  })

  it('keeps the author and the source page with every result', () => {
    const v = shapeVideo({
      id: 7,
      width: 1080,
      height: 1920,
      duration: 9,
      url: 'p',
      image: 't',
      user: { name: 'A', url: 'au' },
    })
    expect(v).toEqual({
      kind: 'video',
      id: 7,
      width: 1080,
      height: 1920,
      duration: 9,
      author: 'A',
      authorUrl: 'au',
      page: 'p',
      thumb: 't',
    })
  })
})

describe('narration pace', () => {
  it('lets a short-form ad read faster than launch narration, still with a ceiling', () => {
    const narration = paceOf(undefined)
    const ad = paceOf('ad')
    expect(narration.rushed).toBe(2.7)
    // The five reference ads read at 2.75–3.68 words/s.
    expect(ad.rushed).toBeGreaterThan(3.68)
    expect(ad.brisk).toBeGreaterThan(3.68)
    expect(ad.aim[1]).toBeGreaterThan(narration.aim[1])
    expect(paceOf('unknown')).toBe(narration)
  })
})

describe('scaffold format', () => {
  const evaluate = (src: string) => {
    const w: any = {}
    new Function('window', src)(w)
    return w.SHOTS
  }

  it('writes the delivery frame into a portrait starter', () => {
    expect(evaluate(starterShots(null, '9:16')).format).toBe('9:16')
  })

  it('leaves the landscape default implicit', () => {
    expect(evaluate(starterShots(null)).format).toBeUndefined()
    expect(evaluate(starterShots(null, '16:9')).format).toBeUndefined()
  })
})
