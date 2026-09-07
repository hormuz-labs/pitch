/**
 * The encoder side of a launch render: a real shutter (temporal supersampling
 * averaged with tmix), an explicit BT.709 conversion, 10-bit output and a
 * validated grade. These are the decisions the studio's Export button and
 * motion_render must agree on, so they live in one pure module.
 */
import { describe, expect, it } from 'vitest'
import {
  codecArgs,
  escapeFilterPath,
  normalizeGrade,
  normalizeRender,
  renderFilter,
  reviewFilter,
  sampleTimes,
} from '../.pi/scripts/launch-video/lib/encode.mjs'

describe('normalizeRender', () => {
  it('is a plain 8-bit H.264 capture when the film says nothing', () => {
    expect(normalizeRender(null, {})).toEqual({
      samples: 1,
      shutter: 0,
      depth: 8,
      codec: 'h264',
      crf: 16,
    })
  })
  it('takes the film block and lets flags override it', () => {
    const r = normalizeRender(
      { samples: 4, shutter: 0.5, depth: 10, codec: 'hevc' },
      { samples: '2' },
    )
    expect(r).toEqual({ samples: 2, shutter: 0.5, depth: 10, codec: 'hevc', crf: 18 })
  })
  it('a shutter with one sample, or samples with no shutter, is no shutter', () => {
    expect(normalizeRender({ samples: 1, shutter: 0.5 }).shutter).toBe(0)
    expect(normalizeRender({ samples: 4, shutter: 0 }).samples).toBe(1)
    // samples alone opens a 180° shutter
    expect(normalizeRender({ samples: 4 })).toMatchObject({ samples: 4, shutter: 0.5 })
  })
  it('clamps absurd values', () => {
    expect(normalizeRender({ samples: 99, shutter: 3, depth: 12, crf: 200 })).toMatchObject({
      samples: 16,
      shutter: 1,
      depth: 8,
      crf: 40,
    })
  })
})

describe('sampleTimes', () => {
  it('opens the shutter at the frame time for a fraction of the interval', () => {
    const t = sampleTimes(1, 60, { samples: 4, shutter: 0.5 })
    expect(t).toHaveLength(4)
    expect(t[0]).toBe(1)
    // 0.5 of a 60fps interval is 1/120 s, sampled at 0, 1/4, 2/4, 3/4 of it
    expect(t[3]).toBeCloseTo(1 + (3 / 4) * (1 / 120), 9)
  })
  it('is the frame time alone without a shutter', () => {
    expect(sampleTimes(2.5, 30, { samples: 1, shutter: 0 })).toEqual([2.5])
    expect(sampleTimes(2.5, 30, {})).toEqual([2.5])
  })
})

describe('normalizeGrade', () => {
  it('returns null and no warnings for no grade', () => {
    expect(normalizeGrade(undefined)).toEqual({ grade: null, warnings: [] })
  })
  it('keeps valid fields and warns on the rest', () => {
    const { grade, warnings } = normalizeGrade(
      {
        temperature: 5200,
        curves: 'vintage',
        vignette: 0.4,
        grain: 12,
        saturation: 9,
        bloom: 1,
        lut: 'assets/luts/x.cube',
      },
      { lutExists: () => false },
    )
    expect(grade).toEqual({ temperature: 5200, curves: 'vintage', vignette: 0.4, grain: 12 })
    expect(warnings.join('\n')).toMatch(/saturation=9/)
    expect(warnings.join('\n')).toMatch(/bloom/)
    expect(warnings.join('\n')).toMatch(/x\.cube not found/)
  })
  it('accepts a LUT that exists and point curves', () => {
    const { grade, warnings } = normalizeGrade(
      { lut: 'assets/luts/teal.cube', curves: { master: '0/0 0.5/0.58 1/1', r: 'bad,points' } },
      { lutExists: () => true },
    )
    expect(grade).toEqual({ lut: 'assets/luts/teal.cube', curves: { master: '0/0 0.5/0.58 1/1' } })
    expect(warnings).toHaveLength(1)
  })
})

describe('renderFilter', () => {
  const plain = normalizeRender(null, {})
  it('always works in RGB, converts to BT.709 limited range explicitly and tags the frames', () => {
    const vf = renderFilter({ fps: 60, render: plain })
    expect(vf.startsWith('format=gbrp,')).toBe(true)
    expect(vf).toContain('out_color_matrix=bt709:out_range=tv')
    expect(
      vf.endsWith(
        'format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      ),
    ).toBe(true)
    expect(vf).not.toContain('tmix')
  })
  it('averages the shutter window and renumbers to the output rate', () => {
    const render = normalizeRender({ samples: 4, shutter: 0.5 })
    const vf = renderFilter({ fps: 30, render })
    expect(vf).toContain('tmix=frames=4')
    expect(vf).toContain("select='eq(mod(n\\,4)\\,3)'")
    expect(vf).toContain('setpts=N/(30*TB)')
  })
  it('works in 10-bit RGB when the output is 10-bit, and restores 10-bit after an 8-bit vignette', () => {
    const vf = renderFilter({
      fps: 60,
      render: normalizeRender({ depth: 10 }),
      grade: normalizeGrade({ vignette: 0.4 }).grade,
    })
    expect(vf.startsWith('format=gbrp10le,')).toBe(true)
    expect(vf).toContain('vignette=angle=0.3142,format=yuv420p10le,setparams=')
  })
  it('orders the grade: RGB ops, shutter, downscale, grain, watermark, video, YUV ops', () => {
    const render = normalizeRender({ samples: 2 })
    const grade = normalizeGrade({
      temperature: 4800,
      lut: 'l.cube',
      grain: 8,
      contrast: 1.1,
      vignette: 0.5,
    }).grade
    const vf = renderFilter({
      fps: 60,
      render,
      grade,
      downscale: 'scale=-2:720',
      watermark: 'drawtext=x',
    })
    const order = [
      'colortemperature',
      'lut3d',
      'tmix',
      'scale=-2:720',
      'noise=',
      'drawtext',
      'out_color_matrix',
      'eq=contrast=1.1',
      'vignette',
    ]
    const idx = order.map(k => vf.indexOf(k))
    expect(idx.every(i => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })
})

describe('reviewFilter', () => {
  it('grades the frames the same way and ends in the tile', () => {
    const grade = normalizeGrade({ curves: 'darker', saturation: 1.2 }).grade
    const vf = reviewFilter({ grade, tile: 'tile=4x3' })
    expect(vf).toContain('curves=preset=darker')
    expect(vf).toContain('eq=saturation=1.2')
    expect(vf.endsWith('tile=4x3')).toBe(true)
  })
})

describe('codecArgs', () => {
  it("signals BT.709 through the encoder's own VUI parameters", () => {
    const a = codecArgs(normalizeRender(null, {}))
    expect(a).toContain('libx264')
    expect(a.join(' ')).toContain('-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709')
    expect(a.join(' ')).toContain('-profile:v high ')
  })
  it('uses High 10 for 10-bit H.264 and hvc1-tagged x265 for HEVC', () => {
    expect(codecArgs(normalizeRender({ depth: 10 })).join(' ')).toContain('-profile:v high10')
    const h = codecArgs(normalizeRender({ codec: 'hevc', depth: 10 }))
    expect(h).toContain('libx265')
    expect(h.join(' ')).toContain('-tag:v hvc1')
    expect(h.join(' ')).toContain('colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited')
  })
})

describe('escapeFilterPath', () => {
  it('escapes what ffmpeg option parsing eats', () => {
    expect(escapeFilterPath("C:\\luts\\it's.cube")).toBe("C\\:/luts/it'\\''s.cube")
  })
})
